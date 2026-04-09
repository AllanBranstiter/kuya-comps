# backend/services/print_run_service.py
"""
Print run estimation service.

Combines three data sources to estimate card print runs:
1. Confirmed /N numbering extracted from eBay listing titles
2. Detailed per-set checklist data (backend/data/print_runs_detailed/*.json)
3. Broad reference table (backend/data/print_runs.json) as fallback
"""
import json
import re
from pathlib import Path
from typing import Optional

from backend.services.intelligence_service import detect_parallel_type
from backend.logging_config import get_logger

logger = get_logger(__name__)

_DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "print_runs.json"
_DETAILED_DIR = Path(__file__).resolve().parents[1] / "data" / "print_runs_detailed"
_CACHE: list[dict] | None = None
_DETAILED_CACHE: dict[str, dict] | None = None


def load_print_runs() -> list[dict]:
    """Load and cache the print runs reference table."""
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    try:
        _CACHE = json.loads(_DATA_FILE.read_text())
        logger.info(f"[print_run] Loaded {len(_CACHE)} entries from {_DATA_FILE.name}")
    except Exception as e:
        logger.warning(f"[print_run] Failed to load {_DATA_FILE}: {e}")
        _CACHE = []
    return _CACHE


def load_detailed_print_runs() -> dict[str, dict]:
    """Load and cache all detailed print run JSON files."""
    global _DETAILED_CACHE
    if _DETAILED_CACHE is not None:
        return _DETAILED_CACHE
    _DETAILED_CACHE = {}
    if not _DETAILED_DIR.exists():
        return _DETAILED_CACHE
    for path in _DETAILED_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text())
            key = f"{data['set'].lower()}_{data['year']}"
            _DETAILED_CACHE[key] = data
            variant_count = len(data.get("variants", []))
            insert_count = len(data.get("inserts", []))
            logger.info(
                f"[print_run] Loaded detailed: {path.name} "
                f"({variant_count} variants, {insert_count} inserts)"
            )
        except Exception as e:
            logger.warning(f"[print_run] Failed to load {path}: {e}")
    return _DETAILED_CACHE


def _extract_year(text: str) -> Optional[int]:
    """Extract a 4-digit year (1900-2099) from a string."""
    match = re.search(r'\b(19\d{2}|20\d{2})\b', text)
    return int(match.group(1)) if match else None


# Mapping of set name patterns to canonical names used in print_runs.json
_SET_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"bowman'?s?\s+best", re.I), "Bowman's Best"),
    (re.compile(r"bowman\s+chrome", re.I), "Bowman Chrome"),
    (re.compile(r"bowman", re.I), "Bowman"),
    (re.compile(r"topps\s+cosmic\s+chrome", re.I), "Topps Cosmic Chrome"),
    (re.compile(r"topps\s+sapphire", re.I), "Topps Sapphire"),
    (re.compile(r"topps\s+chrome", re.I), "Topps Chrome"),
    (re.compile(r"topps\s+heritage", re.I), "Topps Heritage"),
    (re.compile(r"topps\s+finest", re.I), "Topps Finest"),
    (re.compile(r"topps\s+living", re.I), "Topps Living"),
    (re.compile(r"topps\s+archives", re.I), "Topps Archives"),
    (re.compile(r"topps\s+allen\s*[&and]*\s*ginter", re.I), "Topps Allen & Ginter"),
    (re.compile(r"topps\s+complete", re.I), "Topps Complete Set"),
    (re.compile(r"stadium\s+club\s+chrome", re.I), "Stadium Club"),
    (re.compile(r"stadium\s+club", re.I), "Stadium Club"),
    (re.compile(r"brooklyn\s+collection", re.I), "Brooklyn Collection"),
    (re.compile(r"upper\s+deck\s+ionix", re.I), "Upper Deck Ionix"),
    (re.compile(r"upper\s+deck", re.I), "Upper Deck"),
    (re.compile(r"new\s+pinnacle", re.I), "New Pinnacle"),
    (re.compile(r"pinnacle", re.I), "Pinnacle"),
    (re.compile(r"leaf\s+studio", re.I), "Leaf Studio"),
    (re.compile(r"studio", re.I), "Studio"),
    (re.compile(r"donruss", re.I), "Donruss"),
    (re.compile(r"fleer", re.I), "Fleer"),
    (re.compile(r"score", re.I), "Score"),
    # Topps flagship last — it's the broadest match
    (re.compile(r"topps", re.I), "Topps"),
]


def _detect_set(text: str) -> Optional[str]:
    """Match text against known set name patterns."""
    for pattern, canonical in _SET_PATTERNS:
        if pattern.search(text):
            return canonical
    return None


def _detect_variant_from_query(query: str) -> Optional[str]:
    """Detect variant/insert type from the search query itself."""
    q = query.lower()
    # Check for specific insert/variant names
    variant_patterns = [
        (r"museum\s*collection", "museum_collection"),
        (r"museum", "museum"),
        (r"stained[\s-]*glass", "stained_glass"),
        (r"hit\s+parade", "hit_parade"),
        (r"nucleus", "nucleus"),
        (r"rainbow[\s_]*foil", "rainbow_foil"),
        (r"chrome\s+refractor", "chrome_refractor"),
        (r"aqua.*refractor", "aqua_refractor"),
        (r"gold.*refractor", "gold_refractor"),
        (r"orange.*refractor", "orange_refractor"),
        (r"red.*refractor", "red_refractor"),
        (r"x[-\s]*fractor", "xfractor"),
        (r"refractor", "refractor"),
        (r"superfractor", "superfractor"),
        (r"chrome", "chrome"),
        (r"\bgold\b", "gold"),
    ]
    for pattern, variant in variant_patterns:
        if re.search(pattern, q):
            return variant
    return None


def _normalize_variant(text: str) -> str:
    """Normalize a variant name for matching."""
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')


def _normalize_for_matching(text: str) -> str:
    """Normalize text for fuzzy substring matching.

    Strips plurals, expands common eBay abbreviations, and removes
    eBay search syntax (quoted terms, exclusions) so that
    'real one auto' matches 'Real One Autographs' and
    '"burgundy"' matches 'Burgundy Sparkle Refractor'.
    """
    t = text.lower().strip()
    # Remove eBay exclusion terms (-word, -"phrase")
    # Only match exclusions preceded by whitespace or at start of string,
    # so hyphenated words like "x-fractor" are preserved.
    t = re.sub(r'(?:^|\s)-"[^"]*"', ' ', t)
    t = re.sub(r'(?<=\s)-\S+', ' ', t)
    t = re.sub(r'^-\S+', ' ', t)
    # Remove remaining quotes
    t = t.replace('"', ' ')
    # Remove trailing 's' from words (simple depluralize)
    t = re.sub(r'\b(\w{3,})s\b', r'\1', t)
    # 'autograph' -> 'auto' (so 'auto' in query matches 'autograph' in candidate)
    t = re.sub(r'\bautograph\b', 'auto', t)
    # Collapse whitespace
    t = re.sub(r'\s+', ' ', t).strip()
    return t


# Words that are too generic to use as standalone variant identifiers
_GENERIC_WORDS = {
    "base", "card", "cards", "the", "and", "of", "a", "an", "red", "black",
    "orange", "blue", "green", "gold", "silver", "chrome", "refractor",
    "variation", "variations", "parallel", "insert", "auto", "relic",
    "image", "edition", "special", "sparkle",
}


def _detect_variant_detailed(query: str, detailed_entry: dict) -> Optional[dict]:
    """
    Match a search query against a detailed checklist's variants and inserts.

    Uses longest-match-first to avoid partial matches (e.g., "burgundy sparkle
    refractor" should not match plain "refractor"). Falls back to matching
    distinctive single words (e.g., "burgundy" uniquely identifies
    "Burgundy Sparkle Refractor").

    Returns the matched entry dict or None.
    """
    q_norm = _normalize_for_matching(query)

    # Build candidates: (search_phrase, entry_dict) sorted by phrase length desc
    candidates = []

    for v in detailed_entry.get("variants", []):
        display = v.get("display_name", "").lower()
        normalized = v["variation"]
        if display:
            candidates.append((display, v, "variant"))
        spaced = normalized.replace("_", " ")
        if spaced != display:
            candidates.append((spaced, v, "variant"))

    for ins in detailed_entry.get("inserts", []):
        ib = ins["insert_base"].lower()
        var_display = ins.get("display_name", "").lower()
        if var_display:
            candidates.append((f"{ib} {var_display}", ins, "insert"))
            candidates.append((var_display, ins, "insert"))
        candidates.append((ib, ins, "insert"))

    # Sort by phrase length descending (longest match first)
    candidates.sort(key=lambda x: len(x[0]), reverse=True)

    # Pass 1: Full phrase matching (existing logic)
    for phrase, entry, entry_type in candidates:
        if phrase == "base" or not phrase:
            continue
        phrase_norm = _normalize_for_matching(phrase)
        if phrase_norm in q_norm:
            return entry

    # Pass 2: Distinctive single-word matching
    # For variants with multi-word names, check if any distinctive word
    # (not in _GENERIC_WORDS) appears in the query. This handles cases like
    # "burgundy" matching "Burgundy Sparkle Refractor".
    word_matches = []
    for phrase, entry, entry_type in candidates:
        if phrase == "base" or not phrase:
            continue
        words = phrase.lower().split()
        if len(words) < 2:
            continue  # Single-word variants already handled in Pass 1
        for word in words:
            if word in _GENERIC_WORDS or len(word) < 4:
                continue
            if re.search(r'\b' + re.escape(word) + r'\b', q_norm):
                word_matches.append((word, entry))
                break

    if len(word_matches) == 1:
        # Exactly one distinctive word match — unambiguous
        return word_matches[0][1]

    return None


def _detailed_lookup(set_name: str, year: int, query: str) -> Optional[dict]:
    """
    Look up a print run from the detailed checklist data.

    Returns a print_run_info dict or None.
    """
    detailed = load_detailed_print_runs()
    key = f"{set_name.lower()}_{year}"
    entry = detailed.get(key)
    if not entry:
        return None

    # Try to match a specific variant/insert from the query
    match = _detect_variant_detailed(query, entry)

    if match:
        pr = match.get("print_run")
        display = match.get("display_name") or match.get("insert_base", "")
        source = f"{entry['set']} {entry['year']} checklist"
        return {
            "print_run": pr,
            "confidence": "checklist",
            "source": source,
        }

    # No specific variant matched — default to base
    for v in entry.get("variants", []):
        if v["variation"] == "base":
            return {
                "print_run": v["print_run"],
                "confidence": "checklist",
                "source": f"{entry['set']} {entry['year']} checklist",
            }

    return None


def _lookup(set_name: str, year: int, variant: str) -> Optional[dict]:
    """Find a matching entry in the print runs reference table."""
    entries = load_print_runs()
    for entry in entries:
        if entry["set"].lower() != set_name.lower():
            continue
        if entry["variant"] != variant:
            continue
        if entry["year_start"] <= year <= entry["year_end"]:
            return entry
    return None


def estimate_print_run(query: str, titles: list[str]) -> dict:
    """
    Estimate the print run for a card search.

    Three-stage cascade:
    1. Check listing titles for confirmed /N numbering
    2. Match against detailed checklist data (per-set JSON files)
    3. Fall back to broad reference table (print_runs.json)

    Args:
        query: The user's search query string
        titles: List of listing titles (sold + active)

    Returns:
        dict with keys:
        - print_run: int, str range, or None
        - confidence: "confirmed" | "checklist" | "estimated" | "unknown"
        - source: description of where the data came from
    """
    unknown = {"print_run": None, "confidence": "unknown", "source": None}

    # --- Stage 1: Check listing titles for confirmed /N numbering ---
    numbered_values = []
    for title in titles:
        _, numbered = detect_parallel_type(title or "")
        if numbered is not None:
            numbered_values.append(numbered)

    if numbered_values:
        # Use the most common /N value, but require it to appear in at least
        # 30% of ALL listings (not just numbered ones). This prevents a few
        # stray /77 "Color Of The Year" cards from overriding a base card search.
        from collections import Counter
        most_common_n = Counter(numbered_values).most_common(1)[0][0]
        pct_of_all = numbered_values.count(most_common_n) / max(len(titles), 1)
        if pct_of_all >= 0.3:
            return {
                "print_run": most_common_n,
                "confidence": "confirmed",
                "source": "listing data",
            }

    # --- Parse year and set for Stages 2 and 3 ---
    year = _extract_year(query)
    set_name = _detect_set(query)
    if not year or not set_name:
        return unknown

    # --- Stage 2: Detailed checklist lookup ---
    detailed_result = _detailed_lookup(set_name, year, query)
    if detailed_result:
        logger.info(
            f"[print_run] detailed match: {set_name} {year} -> "
            f"{detailed_result['print_run']} ({detailed_result['source']})"
        )
        return detailed_result

    # --- Stage 3: Broad reference table fallback ---
    # Try query-level variant detection first
    variant = _detect_variant_from_query(query)

    # If no variant from query, check listing titles for parallel type
    if not variant and titles:
        parallel_types = []
        for title in titles[:10]:  # Sample first 10
            ptype, _ = detect_parallel_type(title or "")
            parallel_types.append(ptype)
        if parallel_types:
            from collections import Counter
            variant = Counter(parallel_types).most_common(1)[0][0]

    if not variant:
        variant = "base"

    entry = _lookup(set_name, year, variant)
    if not entry:
        # Fall back to base variant
        if variant != "base":
            entry = _lookup(set_name, year, "base")

    if not entry:
        return unknown

    low = entry.get("print_run_low")
    high = entry.get("print_run_high")
    confidence = entry.get("confidence", "estimated")

    if low is None and high is None:
        # Special case: print-to-order sets like Topps Living
        return {
            "print_run": "print-to-order",
            "confidence": confidence,
            "source": entry.get("source", "reference table"),
        }

    if low == high:
        return {
            "print_run": low,
            "confidence": confidence,
            "source": entry.get("source", "reference table"),
        }

    return {
        "print_run": f"{low:,}-{high:,}",
        "confidence": confidence,
        "source": entry.get("source", "reference table"),
    }
