# backend/services/player_score_service.py
"""
Player collectibility score orchestrator.

Combines 7 sub-factors into a single 0-5 player score:
    1. Position        (0-0.40)
    2. Market Size/TAM (0-0.50)
    3. Pedigree        (0-1.25)
    4. Statistics       (0-1.10)
    5. Liquidity       (0-0.50)
    6. Flipping Signal (0-0.50)
    7. Popularity      (0-0.75)
"""
import json
import math
from pathlib import Path
from typing import Dict, Optional

from backend.config import (
    PLAYER_SCORE_ENABLED,
    PLAYER_WEIGHT_FLIPPING,
    PLAYER_WEIGHT_LIQUIDITY,
    PLAYER_WEIGHT_PEDIGREE,
    PLAYER_WEIGHT_POPULARITY,
    PLAYER_WEIGHT_POSITION,
    PLAYER_WEIGHT_STATISTICS,
    PLAYER_WEIGHT_TAM,
)
from backend.logging_config import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Static Data Caches
# ---------------------------------------------------------------------------

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

_team_market_sizes: Optional[dict] = None
_position_weights: Optional[dict] = None
_hof_members: Optional[set] = None


def _load_json(filename: str) -> dict:
    path = _DATA_DIR / filename
    if path.is_file():
        return json.loads(path.read_text())
    logger.warning(f"[player_score] Missing data file: {path}")
    return {}


def _get_team_market_sizes() -> dict:
    global _team_market_sizes
    if _team_market_sizes is None:
        _team_market_sizes = _load_json("team_market_sizes.json")
    return _team_market_sizes


def _get_position_weights() -> dict:
    global _position_weights
    if _position_weights is None:
        _position_weights = _load_json("position_weights.json")
    return _position_weights


def _get_hof_members() -> set:
    global _hof_members
    if _hof_members is None:
        data = _load_json("hof_members.json")
        _hof_members = {int(k) for k in data.get("members", {}).keys()}
    return _hof_members


# ---------------------------------------------------------------------------
# Sub-Factor 1: Position (0.0-1.0)
# ---------------------------------------------------------------------------

def score_position(position: str) -> float:
    """Score position collectibility (0.0-1.0). Batters > pitchers."""
    weights = _get_position_weights()
    if not position:
        return 0.50  # neutral fallback

    # Normalize: take first position if multi-position ("SS/2B" -> "SS")
    pos = position.split("/")[0].strip().upper()
    # Map common FanGraphs position names
    pos_map = {"LF": "LF", "CF": "CF", "RF": "RF"}
    pos = pos_map.get(pos, pos)

    return weights.get(pos, 0.50)


# ---------------------------------------------------------------------------
# Sub-Factor 2: Market Size / TAM (0.0-1.0)
# ---------------------------------------------------------------------------

# ln(1.5M) ≈ 14.22, ln(19.8M) ≈ 16.80
_LN_POP_MIN = 14.22
_LN_POP_MAX = 16.80
_LN_POP_RANGE = _LN_POP_MAX - _LN_POP_MIN


def score_tam(team: str) -> float:
    """Score team market size (0.0-1.0) on a log scale."""
    sizes = _get_team_market_sizes()
    if not team:
        return 0.50  # neutral

    # Normalize team abbreviation
    team_upper = team.strip().upper()
    # Handle common FanGraphs abbreviations that differ from our keys
    alias = {
        "KC": "KCR", "TB": "TBR", "SD": "SDP", "SF": "SFG",
        "CWS": "CHW", "WSH": "WSN", "WAS": "WSN",
    }
    team_key = alias.get(team_upper, team_upper)

    entry = sizes.get(team_key)
    if not entry:
        return 0.50

    pop = entry.get("metro_pop", 0)
    if pop <= 0:
        return 0.50

    normalized = (math.log(pop) - _LN_POP_MIN) / _LN_POP_RANGE
    return max(0.0, min(1.0, normalized))


# ---------------------------------------------------------------------------
# Sub-Factor 3: Pedigree (0.0-1.0)
# ---------------------------------------------------------------------------

_WAR_RATE_THRESHOLDS = [
    (5.0, 1.00),
    (3.0, 0.75),
    (1.0, 0.50),
    (0.0, 0.25),
]


def _war_rate_score(career_war: float, seasons: float) -> float:
    """Score career WAR rate (WAR per season) on a 0-1 scale."""
    if seasons <= 0:
        return 0.10
    rate = career_war / seasons
    for threshold, score in _WAR_RATE_THRESHOLDS:
        if rate >= threshold:
            return score
    return 0.10  # negative WAR


def _adp_score(adp: Optional[float]) -> float:
    """
    Convert ADP (Average Draft Position) to a 0-1 pedigree signal.

    ADP reflects market-consensus player value from fantasy auction
    calculators. Lower ADP = higher perceived pedigree.

    Scale: ADP 1 = 0.95, ADP 10 = 0.80, ADP 50 = 0.55,
           ADP 150 = 0.30, ADP 300+ = 0.15, no ADP = 0.20
    """
    if adp is None:
        return 0.20  # no ADP data (undrafted/unranked)
    if adp <= 1:
        return 0.95
    if adp <= 5:
        return 0.90
    if adp <= 15:
        return 0.80
    if adp <= 50:
        return 0.65
    if adp <= 100:
        return 0.50
    if adp <= 200:
        return 0.35
    if adp <= 300:
        return 0.25
    return 0.15


def score_pedigree(
    mlbam_id: int,
    career_stats: Optional[dict],
    season_stats: Optional[dict],
    adp: Optional[float] = None,
) -> float:
    """
    Score player pedigree (0.0-1.0) using career stage state machine.

    Uses ADP (Average Draft Position) as a market-consensus proxy for
    player value instead of MLB draft round data.

    Stages:
        - Hall of Famer: flat 1.0
        - Pre-debut prospect (0 career PA/IP): ADP score
        - Early career (<1000 career AB): ADP * 0.4 + WAR rate * 0.6
        - Established (>=1000 career AB): WAR rate * 0.8 + recent WAR * 0.2
    """
    # HOF check
    if mlbam_id in _get_hof_members():
        return 1.0

    # Determine career stage from career stats
    career_ab = 0
    career_ip = 0
    career_war = 0.0
    is_pitcher = False

    if career_stats:
        career_ab = career_stats.get("career_ab", 0) or 0
        career_ip = career_stats.get("career_ip", 0) or 0
        career_war = career_stats.get("career_war", 0) or 0
        is_pitcher = career_stats.get("is_pitcher", False)

    # Estimate seasons played (rough: 550 AB ~ 1 season batter, 162 IP ~ 1 season pitcher)
    if is_pitcher:
        seasons = max(1, career_ip / 162) if career_ip > 0 else 0
        career_threshold = career_ip > 0
        established = career_ip >= 800  # ~5 full seasons
    else:
        seasons = max(1, career_ab / 550) if career_ab > 0 else 0
        career_threshold = career_ab > 0
        established = career_ab >= 1000

    # ADP-based market pedigree score
    market_score = _adp_score(adp)

    # Stage 1: Pre-debut prospect
    if not career_threshold:
        return market_score

    # Stage 2: Early career (< 1000 AB or equivalent)
    if not established:
        war_score = _war_rate_score(career_war, seasons)
        return market_score * 0.4 + war_score * 0.6

    # Stage 3: Established
    war_score = _war_rate_score(career_war, seasons)
    recent_war = 0.0
    if season_stats:
        recent_war = season_stats.get("WAR", 0) or 0
    # Normalize recent WAR: 5+ = 1.0, 0 = 0.0
    recent_normalized = min(1.0, max(0.0, recent_war / 5.0))
    return war_score * 0.8 + recent_normalized * 0.2


# ---------------------------------------------------------------------------
# Sub-Factor 5: Liquidity (0.0-1.0)
# ---------------------------------------------------------------------------

def score_liquidity(analytics_scores: Optional[dict]) -> float:
    """Reuse existing liquidity score (0-100) normalized to 0-1."""
    if not analytics_scores:
        return 0.50
    liq = analytics_scores.get("liquidity", {})
    if not liq:
        return 0.50
    score = liq.get("score")
    if score is None:
        return 0.50
    return min(1.0, max(0.0, score / 100.0))


# ---------------------------------------------------------------------------
# Sub-Factor 6: Flipping Signal (0.0-1.0)
# ---------------------------------------------------------------------------

def _bucket(value: float, thresholds: list) -> float:
    """Map a value to a score using descending threshold buckets."""
    for threshold, score in thresholds:
        if value >= threshold:
            return score
    return thresholds[-1][1] if thresholds else 0.0


def score_flipping_signal(
    analytics_scores: Optional[dict],
    sold_count: int,
    active_count: int,
    bid_center: Optional[float] = None,
) -> float:
    """
    Score flipping signal (0.0-1.0) from existing pipeline data.

    Sub-signals:
        - Spread compression (40%): staleness raw_gap_pct
        - Listing turnover (30%): sold/active ratio
        - Ask price trend (30%): competitive zone center vs bid center
    """
    # Spread compression (40%)
    spread_score = 0.1
    if analytics_scores:
        staleness = analytics_scores.get("staleness", {})
        if staleness:
            gap = staleness.get("raw_gap_pct")
            if gap is not None:
                abs_gap = abs(gap)
                spread_score = _bucket(abs_gap, [
                    (0, 1.0),   # will never match (gap >= 0 always true)
                ])
                # Manual mapping since we want LOWER gap = HIGHER score
                if abs_gap < 5:
                    spread_score = 1.0
                elif abs_gap < 15:
                    spread_score = 0.7
                elif abs_gap < 30:
                    spread_score = 0.4
                else:
                    spread_score = 0.1

    # Listing turnover (30%)
    turnover_score = 0.1
    if active_count > 0:
        ratio = sold_count / active_count
        if ratio > 2:
            turnover_score = 1.0
        elif ratio > 1:
            turnover_score = 0.7
        elif ratio > 0.5:
            turnover_score = 0.4
        else:
            turnover_score = 0.1
    elif sold_count > 0:
        turnover_score = 0.8  # sales with no active listings = strong signal

    # Ask price trend (30%)
    ask_trend_score = 0.5  # neutral default
    if analytics_scores and bid_center and bid_center > 0:
        cz = analytics_scores.get("competitive_zone", {})
        if cz and cz.get("center"):
            ratio = cz["center"] / bid_center
            if 0.95 <= ratio <= 1.05:
                ask_trend_score = 1.0
            elif ratio < 0.95:
                ask_trend_score = 0.8  # asks below sold = strong demand
            elif ratio <= 1.20:
                ask_trend_score = 0.6
            else:
                ask_trend_score = 0.2

    return spread_score * 0.4 + turnover_score * 0.3 + ask_trend_score * 0.3


# ---------------------------------------------------------------------------
# Sub-Factor 7: Popularity (0.0-1.0) via Wikipedia Pageviews
# ---------------------------------------------------------------------------

# Wikipedia projects to query (covers US, Japan, Korea, Latin America)
_WIKI_PROJECTS = ["en.wikipedia", "ja.wikipedia", "ko.wikipedia", "es.wikipedia"]

_WIKI_API_BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
_WIKI_USER_AGENT = "KuyaComps/1.0 (baseball card market analysis; contact: kuya-comps)"


def _wiki_article_title(player_name: str) -> str:
    """Convert a player name to a Wikipedia article title (spaces -> underscores)."""
    return player_name.strip().replace(" ", "_")


async def score_popularity(player_name: str) -> float:
    """
    Score player popularity (0.0-1.0) using Wikipedia pageview counts.

    Sums pageviews across English, Japanese, Korean, and Spanish Wikipedias
    over the last 30 days. Uses a log scale for smooth scoring:
        500k+ views = 1.0 (global superstar)
        100k-500k   = 0.7-1.0
        20k-100k    = 0.5-0.7
        5k-20k      = 0.3-0.5
        1k-5k       = 0.15-0.3
        <1k         = 0.05-0.15

    Falls back to 0.5 (neutral) if the API is unreachable.
    """
    try:
        import asyncio
        total_views = await asyncio.get_event_loop().run_in_executor(
            None, _fetch_wikipedia_views, player_name
        )
    except Exception as e:
        logger.warning(f"[player_score] Wikipedia pageviews failed for '{player_name}': {e}")
        return 0.5

    if total_views is None:
        return 0.5

    return _views_to_score(total_views)


def _fetch_wikipedia_views(player_name: str) -> Optional[int]:
    """
    Fetch total Wikipedia pageviews for a player across multiple languages.

    Queries the last 30 days of daily pageviews from the Wikimedia REST API.
    No authentication required; just needs a proper User-Agent header.
    """
    import httpx
    from datetime import datetime, timedelta

    article = _wiki_article_title(player_name)
    end_date = datetime.utcnow() - timedelta(days=1)
    start_date = end_date - timedelta(days=30)
    start_str = start_date.strftime("%Y%m%d") + "00"
    end_str = end_date.strftime("%Y%m%d") + "00"

    total_views = 0
    any_success = False

    for project in _WIKI_PROJECTS:
        url = (
            f"{_WIKI_API_BASE}/{project}/all-access/all-agents"
            f"/{article}/daily/{start_str}/{end_str}"
        )
        try:
            resp = httpx.get(
                url,
                headers={"User-Agent": _WIKI_USER_AGENT},
                timeout=8.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                views = sum(item.get("views", 0) for item in data.get("items", []))
                total_views += views
                any_success = True
            elif resp.status_code == 404:
                # Article doesn't exist in this language
                continue
            else:
                logger.debug(
                    f"[player_score] Wiki {project} returned {resp.status_code} for '{article}'"
                )
        except Exception as e:
            logger.debug(f"[player_score] Wiki {project} request failed for '{article}': {e}")

    return total_views if any_success else None


def _views_to_score(total_views: int) -> float:
    """
    Convert total 30-day Wikipedia pageviews to a 0.0-1.0 score.

    Uses a log scale anchored at:
        1,000 views   -> ~0.15
        10,000 views  -> ~0.45
        100,000 views -> ~0.75
        500,000 views -> ~0.95
    """
    if total_views <= 0:
        return 0.05

    log_views = math.log10(max(1, total_views))
    # Map log10(1000)=3.0 to 0.15 and log10(500000)=5.7 to 0.95
    score = (log_views - 3.0) / (5.7 - 3.0) * 0.80 + 0.15
    return max(0.05, min(1.0, score))


# ---------------------------------------------------------------------------
# Main Orchestrator
# ---------------------------------------------------------------------------

async def calculate_player_score(
    player_info: Optional[dict],
    analytics_scores: Optional[dict] = None,
    sold_count: int = 0,
    active_count: int = 0,
    bid_center: Optional[float] = None,
) -> dict:
    """
    Calculate the player collectibility score (0.0-5.0).

    Args:
        player_info: Output of identify_player() (name, mlbam_id, etc.)
        analytics_scores: Existing analytics scores dict (for liquidity, staleness, etc.)
        sold_count: Number of sold comps
        active_count: Number of active listings
        bid_center: FMV bid center (for flipping signal)

    Returns:
        {
            "score": float (0-5),
            "confidence": str,
            "identified_player": str or None,
            "mlbam_id": int or None,
            "components": {
                "position":   {"raw": float, "weighted": float},
                "tam":        {"raw": float, "weighted": float},
                "pedigree":   {"raw": float, "weighted": float},
                "statistics": {"raw": float, "weighted": float},
                "liquidity":  {"raw": float, "weighted": float},
                "flipping":   {"raw": float, "weighted": float},
                "popularity": {"raw": float, "weighted": float},
            }
        }
    """
    if not PLAYER_SCORE_ENABLED or not player_info:
        return {
            "score": 0.0,
            "confidence": "none",
            "identified_player": None,
            "mlbam_id": None,
            "components": {},
        }

    player_name = player_info.get("name")
    mlbam_id = player_info.get("mlbam_id")
    team = player_info.get("team", "")
    position = player_info.get("position", "")
    is_pitcher = player_info.get("is_pitcher", False)

    # Gather data
    from backend.services.player_stats_service import (
        get_player_adp,
        get_player_career_stats,
        get_player_position,
        get_player_season_stats,
        score_statistics,
    )

    career_stats = get_player_career_stats(mlbam_id) if mlbam_id else None
    season_stats = get_player_season_stats(mlbam_id) if mlbam_id else None
    adp = get_player_adp(mlbam_id) if mlbam_id else None

    # Get position from auction calculator if not already set
    if not position and mlbam_id:
        position = get_player_position(mlbam_id) or ("SP" if is_pitcher else "")

    # Score each sub-factor
    pos_raw = score_position(position)
    tam_raw = score_tam(team)
    pedigree_raw = score_pedigree(mlbam_id or 0, career_stats, season_stats, adp)
    stats_raw, _ = score_statistics(mlbam_id) if mlbam_id else (0.3, False)
    liq_raw = score_liquidity(analytics_scores)
    flip_raw = score_flipping_signal(analytics_scores, sold_count, active_count, bid_center)

    # Popularity is async
    pop_raw = 0.5  # default
    if player_name:
        pop_raw = await score_popularity(player_name)

    # Build components with weighted scores
    components = {
        "position":   {"raw": round(pos_raw, 3), "weighted": round(pos_raw * PLAYER_WEIGHT_POSITION, 3)},
        "tam":        {"raw": round(tam_raw, 3), "weighted": round(tam_raw * PLAYER_WEIGHT_TAM, 3)},
        "pedigree":   {"raw": round(pedigree_raw, 3), "weighted": round(pedigree_raw * PLAYER_WEIGHT_PEDIGREE, 3)},
        "statistics": {"raw": round(stats_raw, 3), "weighted": round(stats_raw * PLAYER_WEIGHT_STATISTICS, 3)},
        "liquidity":  {"raw": round(liq_raw, 3), "weighted": round(liq_raw * PLAYER_WEIGHT_LIQUIDITY, 3)},
        "flipping":   {"raw": round(flip_raw, 3), "weighted": round(flip_raw * PLAYER_WEIGHT_FLIPPING, 3)},
        "popularity": {"raw": round(pop_raw, 3), "weighted": round(pop_raw * PLAYER_WEIGHT_POPULARITY, 3)},
    }

    # Sum weighted scores (0-5 range)
    total = sum(c["weighted"] for c in components.values())
    total = max(0.0, min(5.0, total))

    # Confidence based on data availability
    data_sources = sum([
        position != "",
        team != "",
        career_stats is not None,
        season_stats is not None,
        mlbam_id is not None,
    ])
    if data_sources >= 4:
        confidence = "high"
    elif data_sources >= 2:
        confidence = "medium"
    else:
        confidence = "low"

    logger.info(
        f"[player_score] {player_name}: score={total:.2f}/5.0 "
        f"(pos={pos_raw:.2f}, tam={tam_raw:.2f}, ped={pedigree_raw:.2f}, "
        f"stats={stats_raw:.2f}, liq={liq_raw:.2f}, flip={flip_raw:.2f}, "
        f"pop={pop_raw:.2f}) confidence={confidence}"
    )

    return {
        "score": round(total, 2),
        "confidence": confidence,
        "identified_player": player_name,
        "mlbam_id": mlbam_id,
        "components": components,
    }
