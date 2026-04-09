# backend/services/player_identification_service.py
"""
Player identification service for the player collectibility component.

Extracts a baseball player name from card search queries using a three-stage
cascade: regex token stripping, fuzzy matching against a name index, and
AI-based extraction as a last resort.
"""
import hashlib
import re
from typing import Optional

from backend.config import AI_MODEL_PLAYER_EXTRACTION
from backend.logging_config import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Token Stripping Patterns
# ---------------------------------------------------------------------------

# Years: 1900-2099
_YEAR_RE = re.compile(r'\b(?:19|20)\d{2}\b')

# Card numbers: #123, #T-45, No. 123
_CARD_NUM_RE = re.compile(r'#\s*[A-Za-z]*[\-]?\d+|(?:no|card)\s*\.?\s*\d+', re.I)

# Grades: PSA 10, BGS 9.5, SGC 98, CGC 9.8
_GRADE_RE = re.compile(
    r'\b(?:PSA|BGS|SGC|CGC|BVG|KSA|GMA|HGA|AGS|ISA|CSG|TAG)\s*[\-:]?\s*\d+(?:\.\d+)?\b',
    re.I,
)

# Parallel numbering: /50, /100, /numbered, #d, /999
_NUMBERED_RE = re.compile(r'/\d+\b|#d\b|\bnumbered\b', re.I)

# eBay search operators
_EBAY_OPS_RE = re.compile(r'\B-\w+', re.I)  # -lot, -reprint

# Common set names (order: specific before generic)
_SET_NAMES = [
    r"bowman'?s?\s+best", r"bowman\s+chrome\s+draft", r"bowman\s+chrome",
    r"bowman\s+draft", r"bowman\s+platinum", r"bowman\s+sterling",
    r"bowman\s+1st\s+(?:chrome\s+)?edition", r"bowman",
    r"topps\s+cosmic\s+chrome", r"topps\s+sapphire", r"topps\s+chrome",
    r"topps\s+heritage\s+high\s+number", r"topps\s+heritage",
    r"topps\s+finest", r"topps\s+living", r"topps\s+archives",
    r"topps\s+allen\s*[&and]*\s*ginter", r"topps\s+museum\s*collection",
    r"topps\s+stadium\s+club\s+chrome", r"topps\s+stadium\s+club",
    r"topps\s+luminaries", r"topps\s+fire", r"topps\s+holiday",
    r"topps\s+opening\s+day", r"topps\s+update", r"topps\s+series\s*[12]",
    r"topps\s+complete\s*set", r"topps\s+chrome",
    r"topps\s+now", r"topps\s+clearly\s+authentic",
    r"topps\s+triple\s+threads", r"topps\s+tier\s+one",
    r"topps",
    r"stadium\s+club\s+chrome", r"stadium\s+club",
    r"brooklyn\s+collection",
    r"upper\s+deck\s+sp\s+authentic", r"upper\s+deck", r"sp\s+authentic",
    r"panini\s+prizm", r"panini\s+select", r"panini\s+mosaic",
    r"panini\s+chronicles", r"panini\s+immaculate",
    r"panini\s+national\s+treasures", r"panini\s+optic", r"panini",
    r"donruss\s+optic", r"donruss\s+elite", r"donruss",
    r"fleer\s+tradition", r"fleer\s+ultra", r"fleer",
    r"pinnacle", r"score", r"leaf", r"gypsy\s+queen",
    r"archives\s+signature", r"clearly\s+authentic",
]
_SET_RE = re.compile(
    r'\b(?:' + '|'.join(_SET_NAMES) + r')\b', re.I,
)

# Parallel / insert / variation descriptors
_PARALLEL_WORDS = [
    r"refractor", r"prism", r"xfractor", r"superfractor", r"gold\s*foil",
    r"gold", r"silver", r"red", r"blue", r"green", r"orange", r"purple",
    r"pink", r"black", r"white", r"aqua", r"teal", r"magenta",
    r"sapphire", r"shimmer", r"sparkle", r"chrome", r"atomic",
    r"mojo", r"wave", r"camo", r"negative", r"sepia", r"vintage\s*stock",
    r"printing\s*plate", r"mini", r"jumbo", r"sp\b", r"ssp\b",
    r"variation", r"image\s*variation", r"photo\s*variation",
    r"parallel", r"insert", r"base", r"flagship", r"short\s*print",
    r"1st\s+bowman", r"1st\s+edition", r"1st\b",
    r"rc\b", r"rookie\s*card", r"rookie",
    r"auto(?:graph)?", r"autograph(?:ed)?", r"signed",
    r"relic", r"patch", r"jersey", r"game[\-\s]?used",
    r"lot\b", r"psa\b", r"bgs\b", r"sgc\b", r"cgc\b",
    r"graded", r"gem\s*mint", r"mint", r"near\s*mint",
    r"raw", r"ungraded",
]
_PARALLEL_RE = re.compile(
    r'\b(?:' + '|'.join(_PARALLEL_WORDS) + r')\b', re.I,
)


def _strip_known_tokens(query: str) -> str:
    """Remove years, card numbers, grades, set names, parallels from a query."""
    text = query
    for pattern in [
        _YEAR_RE, _CARD_NUM_RE, _GRADE_RE, _NUMBERED_RE,
        _EBAY_OPS_RE, _SET_RE, _PARALLEL_RE,
    ]:
        text = pattern.sub(' ', text)
    # Remove stray punctuation and extra whitespace
    text = re.sub(r'[#/\-\(\)\[\]"\'\.,:;!?]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


# ---------------------------------------------------------------------------
# Fuzzy Matching
# ---------------------------------------------------------------------------

def _fuzzy_match(candidate: str, name_index: dict, threshold: int = 80) -> Optional[dict]:
    """
    Fuzzy match a candidate string against the player name index.

    Uses rapidfuzz for speed. Falls back to exact substring match if
    rapidfuzz is not installed.
    """
    if not candidate or not name_index:
        return None

    candidate_lower = candidate.strip().lower()

    # Exact match first (fastest path)
    if candidate_lower in name_index:
        entry = name_index[candidate_lower]
        return {
            "name": entry["name"],
            "mlbam_id": entry["mlbam_id"],
            "team": entry["team"],
            "position": entry["position"],
            "is_pitcher": entry["is_pitcher"],
            "confidence": "confirmed",
            "method": "exact",
        }

    try:
        from rapidfuzz import fuzz, process as rfprocess

        # Extract top match
        result = rfprocess.extractOne(
            candidate_lower,
            name_index.keys(),
            scorer=fuzz.ratio,
            score_cutoff=threshold,
        )
        if result:
            matched_key, score, _ = result
            entry = name_index[matched_key]
            return {
                "name": entry["name"],
                "mlbam_id": entry["mlbam_id"],
                "team": entry["team"],
                "position": entry["position"],
                "is_pitcher": entry["is_pitcher"],
                "confidence": "inferred" if score < 95 else "confirmed",
                "method": "fuzzy",
                "match_score": round(score, 1),
            }
    except ImportError:
        logger.warning("[player_id] rapidfuzz not installed; falling back to substring match")
        # Fallback: check if candidate is a substring of any name (or vice versa)
        for key, entry in name_index.items():
            if candidate_lower in key or key in candidate_lower:
                return {
                    "name": entry["name"],
                    "mlbam_id": entry["mlbam_id"],
                    "team": entry["team"],
                    "position": entry["position"],
                    "is_pitcher": entry["is_pitcher"],
                    "confidence": "inferred",
                    "method": "substring",
                }

    return None


# ---------------------------------------------------------------------------
# AI Extraction (Fallback)
# ---------------------------------------------------------------------------

def _ai_extract_player(query: str) -> Optional[str]:
    """
    Use OpenRouter AI to extract a player name from a card search query.

    Returns the extracted player name, or None if extraction fails.
    """
    import os
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return None

    try:
        import httpx

        prompt = (
            "Extract the baseball player name from this card listing query. "
            "Return ONLY the full player name (first and last), or the single "
            "word UNKNOWN if no player is identifiable.\n\n"
            f"Query: {query}"
        )

        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": AI_MODEL_PLAYER_EXTRACTION,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 50,
                "temperature": 0.0,
            },
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
        answer = data["choices"][0]["message"]["content"].strip()

        if answer.upper() == "UNKNOWN" or len(answer) < 3:
            return None

        # Clean up: remove quotes, periods, trailing punctuation
        answer = re.sub(r'^["\']+|["\']+$', '', answer).strip()
        return answer if answer else None

    except Exception as e:
        logger.warning(f"[player_id] AI extraction failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------

def identify_player(query: str) -> Optional[dict]:
    """
    Identify a baseball player from a card search query.

    Three-stage cascade:
        1. Regex strip known tokens -> fuzzy match residual against name index
        2. AI extraction via OpenRouter (if regex fails)
        3. Return None if all stages fail

    Args:
        query: Card search query (e.g., "2024 Topps Chrome Shohei Ohtani #123 refractor")

    Returns:
        Dict with keys: name, mlbam_id, team, position, is_pitcher, confidence, method
        Or None if no player can be identified.
    """
    if not query or not query.strip():
        return None

    from backend.services.player_stats_service import build_name_index
    name_index = build_name_index()

    if not name_index:
        logger.warning("[player_id] Empty name index; cannot identify player")
        return None

    # Stage 1: Strip known tokens and fuzzy match residual
    candidate = _strip_known_tokens(query)
    logger.debug(f"[player_id] Stripped query: '{query}' -> candidate: '{candidate}'")

    if candidate:
        result = _fuzzy_match(candidate, name_index)
        if result:
            logger.info(
                f"[player_id] Identified '{result['name']}' from '{query}' "
                f"via {result['method']} (confidence: {result['confidence']})"
            )
            return result

    # Stage 2: AI extraction fallback
    ai_name = _ai_extract_player(query)
    if ai_name:
        # Try to match AI result against our index
        result = _fuzzy_match(ai_name, name_index, threshold=75)
        if result:
            result["method"] = "ai"
            result["confidence"] = "ai"
            logger.info(
                f"[player_id] AI identified '{result['name']}' from '{query}'"
            )
            return result

        # AI returned a name we don't have in our index; return with no MLBAM ID
        logger.info(
            f"[player_id] AI extracted '{ai_name}' but not in name index"
        )
        return {
            "name": ai_name,
            "mlbam_id": None,
            "team": "",
            "position": "",
            "is_pitcher": False,
            "confidence": "ai",
            "method": "ai",
        }

    # All stages failed
    logger.info(f"[player_id] Could not identify player from '{query}'")
    return None


def query_hash(query: str) -> str:
    """Generate a stable hash for a query string (for cache keys)."""
    return hashlib.sha256(query.strip().lower().encode()).hexdigest()[:16]
