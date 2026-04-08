# backend/services/print_run_service.py
"""
Print run estimation service.

Combines two data sources to estimate card print runs:
1. Confirmed /N numbering extracted from eBay listing titles
2. Static reference table (backend/data/print_runs.json) for unnumbered cards
"""
import json
import re
from pathlib import Path
from typing import Optional

from backend.services.intelligence_service import detect_parallel_type
from backend.logging_config import get_logger

logger = get_logger(__name__)

_DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "print_runs.json"
_CACHE: list[dict] | None = None


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

    Strategy:
    1. Check listing titles for confirmed /N numbering
    2. If no /N found, match against the static reference table

    Args:
        query: The user's search query string
        titles: List of listing titles (sold + active)

    Returns:
        dict with keys:
        - print_run: int, str range, or None
        - confidence: "confirmed" | "estimated" | "unknown"
        - source: description of where the data came from
    """
    unknown = {"print_run": None, "confidence": "unknown", "source": None}

    # --- Step 1: Check listing titles for confirmed /N numbering ---
    numbered_values = []
    for title in titles:
        _, numbered = detect_parallel_type(title or "")
        if numbered is not None:
            numbered_values.append(numbered)

    if numbered_values:
        # Use the most common /N value (handles mixed listings)
        from collections import Counter
        most_common_n = Counter(numbered_values).most_common(1)[0][0]
        pct = numbered_values.count(most_common_n) / len(numbered_values)
        if pct >= 0.3:  # At least 30% of listings agree
            return {
                "print_run": most_common_n,
                "confidence": "confirmed",
                "source": "listing data",
            }

    # --- Step 2: Match against the static reference table ---
    year = _extract_year(query)
    set_name = _detect_set(query)
    if not year or not set_name:
        return unknown

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
