# backend/services/analytics_score_service.py
"""
Analytics score calculations for market analysis.

Computes Market Confidence, Liquidity, Collectibility, and Market Pressure
scores that feed back into FMV range adjustments.
"""
import math
from datetime import date
from typing import List, Optional, Dict
from collections import defaultdict

import numpy as np

from backend.logging_config import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Market Confidence
# ---------------------------------------------------------------------------

def calculate_market_confidence(prices: np.ndarray, weights: np.ndarray) -> Dict:
    """
    Market confidence from volume-weighted coefficient of variation.

    Uses the same IQR-filtered prices and volume weights that FMV uses,
    producing a score consistent with the FMV's view of the data.

    Args:
        prices: IQR-filtered price array (same as FMV calculation uses)
        weights: Volume weights corresponding to prices

    Returns:
        {"score": 0-100, "band": str, "cov": float}
    """
    if len(prices) < 2:
        return {"score": None, "band": "Insufficient Data", "cov": None}

    weighted_mean = np.average(prices, weights=weights)
    if weighted_mean <= 0:
        return {"score": None, "band": "Insufficient Data", "cov": None}

    weighted_var = np.average((prices - weighted_mean) ** 2, weights=weights)
    weighted_std = np.sqrt(weighted_var)

    cov = (weighted_std / weighted_mean) * 100
    score = round(100 / (1 + cov / 100))

    if score >= 85:
        band = "Excellent"
    elif score >= 70:
        band = "Good"
    elif score >= 55:
        band = "Moderate"
    elif score >= 40:
        band = "High Variation"
    else:
        band = "Chaotic"

    return {"score": score, "band": band, "cov": round(cov, 1)}


# ---------------------------------------------------------------------------
# Liquidity Score
# ---------------------------------------------------------------------------

def calculate_liquidity(
    sold_items: List,
    active_items: Optional[List] = None,
    reference_date: Optional[date] = None,
) -> Dict:
    """
    Liquidity score with recency-weighted absorption ratio.

    Recent sales count more than older sales via exponential decay
    (14-day half-life). Absorption is weighted_sold / BIN_active_count.

    Args:
        sold_items: List of CompItem sold listings
        active_items: List of CompItem active listings
        reference_date: Date to measure recency from (default: today)

    Returns:
        {"score": 0-100, "label": str, "absorption_ratio": float}
    """
    if reference_date is None:
        reference_date = date.today()

    # Recency-weighted sold count
    # When all items share the same date_scraped (typical: all from one search),
    # per-item decay is uniform and doesn't differentiate. Detect this case and
    # use simple count to avoid false precision.
    weighted_sold = 0.0
    all_dates = set()
    valid_sold_count = 0
    for item in sold_items:
        price = getattr(item, "total_price", None)
        if not price or price <= 0:
            continue
        valid_sold_count += 1
        item_date = getattr(item, "date_scraped", None)
        if item_date:
            if isinstance(item_date, str):
                try:
                    item_date = date.fromisoformat(item_date)
                except ValueError:
                    item_date = reference_date
            all_dates.add(item_date)
            days_ago = max(0, (reference_date - item_date).days)
        else:
            days_ago = 30  # assume ~1 month old if unknown
        decay = 2 ** (-days_ago / 14)
        weighted_sold += decay

    # If all items share the same date, recency decay is uniform —
    # just use the raw count scaled by the common decay factor
    if len(all_dates) <= 1 and valid_sold_count > 0 and weighted_sold > 0:
        # All items got the same decay, so weighted_sold is just count * decay.
        # Use it as-is (it's numerically correct), but log the limitation.
        logger.debug(f"Liquidity: all {valid_sold_count} sold items share same date "
                     f"(no per-item recency differentiation)")

    # BIN-only active listings
    bin_active = 0
    if active_items:
        for item in active_items:
            price = getattr(item, "total_price", None)
            if not price or price <= 0:
                continue
            fmt = (getattr(item, "buying_format", "") or "").lower()
            if "buy it now" in fmt:
                bin_active += 1

    if bin_active == 0:
        return {
            "score": None,
            "label": "Insufficient Data",
            "absorption_ratio": None,
            "weighted_sold": round(weighted_sold, 2),
            "bin_active": 0,
        }

    absorption = weighted_sold / bin_active

    if absorption >= 1.0:
        score = min(100, 80 + (absorption - 1.0) * 20)
        label = "High Liquidity"
    elif absorption >= 0.5:
        score = 50 + (absorption - 0.5) * 60
        label = "Moderate Liquidity"
    elif absorption >= 0.2:
        score = 25 + (absorption - 0.2) * 83
        label = "Low Liquidity"
    else:
        score = max(10, absorption * 125)
        label = "Very Low Liquidity"

    return {
        "score": round(score),
        "label": label,
        "absorption_ratio": round(absorption, 2),
        "weighted_sold": round(weighted_sold, 2),
        "bin_active": bin_active,
    }


# ---------------------------------------------------------------------------
# Collectibility Score
# ---------------------------------------------------------------------------

def _calculate_rarity_score(print_run_info: Optional[Dict]) -> Optional[float]:
    """
    Calculate a rarity bonus (0-2) from print run data.

    Only uses confirmed or checklist-confidence data with a numeric print run.
    Returns None when print run data is absent or unreliable.

    The score uses a continuous log curve: /1 = 2.0, /5000 = 0.0.
    (Rescaled from original 0-4 range to fit rebalanced formula.)
    """
    if not print_run_info:
        return None

    confidence = print_run_info.get("confidence")
    if confidence not in ("confirmed", "checklist"):
        return None

    pr = print_run_info.get("print_run")
    if not isinstance(pr, int) or pr <= 0:
        return None

    RARITY_CEILING = 5000
    if pr >= RARITY_CEILING:
        return 0.0

    return max(0.0, min(2.0,
        (math.log2(RARITY_CEILING) - math.log2(pr)) / math.log2(RARITY_CEILING) * 2.5
    ))


def calculate_collectibility(
    market_value: float,
    sold_count: int,
    print_run_info: Optional[Dict] = None,
    player_score: Optional[Dict] = None,
) -> Dict:
    """
    Collectibility score with continuous log-scaled components.

    Measures sustained market desirability using price, sales volume,
    rarity (when print run data is available), and player-level
    collectibility (when the player can be identified).

    Formula: price (0-3) + volume (0-2) + player (0-5) = 0-10, clamped 1-10.
    Without player data, max score is 5 ("Sought After").

    Rarity sets a floor on the volume component so that scarce cards with
    few sales are not penalized for expected low volume.

    Supply/demand balance is captured separately by the liquidity score.

    Args:
        market_value: FMV market value
        sold_count: Number of sold comps found
        print_run_info: Optional dict with print_run, confidence, source keys
        player_score: Optional dict from player_score_service with score (0-5)

    Returns:
        {"score": 1-10, "label": str, "components": {...}}
    """
    # Continuous price component (0-3)
    if market_value <= 0:
        price_score = 0.0
    else:
        price_score = max(0.0, min(3.0, math.log2(market_value / 5.0)))

    # Continuous volume component (0-2)
    if sold_count <= 0:
        volume_score = 0.0
    else:
        volume_score = min(2.0, math.log2(max(1, sold_count)) / math.log2(100) * 2)

    # Rarity component — sets a floor on volume for rare cards (0-2)
    rarity_score = _calculate_rarity_score(print_run_info)
    if rarity_score is not None and rarity_score > volume_score:
        effective_volume = rarity_score
    else:
        effective_volume = volume_score

    # Player component (0-5)
    player_value = 0.0
    if player_score and player_score.get("score") is not None:
        player_value = max(0.0, min(5.0, player_score["score"]))

    raw = price_score + effective_volume + player_value
    score = max(1, min(10, round(raw)))

    # Label tiers
    if score <= 2:
        label = "Bulk"
    elif score <= 4:
        label = "Common"
    elif score <= 6:
        label = "Sought After"
    elif score <= 8:
        label = "Highly Collectible"
    else:
        label = "Blue Chip"

    components = {
        "price": round(price_score, 2),
        "volume": round(volume_score, 2),
        "rarity": round(rarity_score, 2) if rarity_score is not None else None,
        "player": round(player_value, 2) if player_value > 0 else None,
    }
    if player_score and player_score.get("components"):
        components["player_details"] = player_score["components"]

    return {
        "score": score,
        "label": label,
        "components": components,
    }


# ---------------------------------------------------------------------------
# Market Pressure
# ---------------------------------------------------------------------------

def calculate_market_pressure(
    active_items: Optional[List],
    market_value: float,
) -> Dict:
    """
    Market pressure: how much sellers are asking above/below FMV.

    Deduplicates by seller (median per seller), applies IQR filtering,
    then computes (median_asking - FMV) / FMV * 100.

    Args:
        active_items: List of CompItem active listings
        market_value: FMV market value

    Returns:
        {"pressure_pct": float, "median_ask": float, "status": str, "sample_size": int}
    """
    if not active_items or market_value is None or market_value <= 0:
        return {"pressure_pct": None, "median_ask": None, "status": None, "sample_size": 0}

    # Deduplicate by seller, take median per seller
    seller_prices = defaultdict(list)
    for item in active_items:
        price = getattr(item, "total_price", None) or 0
        if price <= 0:
            continue
        seller = getattr(item, "seller", None)
        name = (seller.name if seller and hasattr(seller, "name") and seller.name else None) or f"unknown_{getattr(item, 'item_id', id(item))}"
        seller_prices[name].append(price)

    if not seller_prices:
        return {"pressure_pct": None, "median_ask": None, "status": None, "sample_size": 0}

    asking = []
    for prices in seller_prices.values():
        s = sorted(prices)
        asking.append(s[len(s) // 2])

    # IQR filter if 4+
    if len(asking) >= 4:
        arr = np.array(asking)
        q1, q3 = np.percentile(arr, [25, 75])
        iqr = q3 - q1
        asking = [p for p in asking if q1 - 1.5 * iqr <= p <= q3 + 1.5 * iqr]

    if not asking:
        return {"pressure_pct": None, "median_ask": None, "status": None, "sample_size": 0}

    asking_sorted = sorted(asking)
    median_ask = asking_sorted[len(asking_sorted) // 2]
    pressure = ((median_ask - market_value) / market_value) * 100

    if pressure < 0:
        status = "BELOW_FMV"
    elif pressure <= 15:
        status = "HEALTHY"
    elif pressure <= 30:
        status = "OPTIMISTIC"
    elif pressure <= 50:
        status = "RESISTANCE"
    else:
        status = "UNREALISTIC"

    return {
        "pressure_pct": round(pressure, 1),
        "median_ask": round(median_ask, 2),
        "status": status,
        "sample_size": len(asking),
    }


# ---------------------------------------------------------------------------
# Staleness Coefficient
# ---------------------------------------------------------------------------

def calculate_staleness_adjustment(
    bid_center: float,
    ask_center: float,
    liquidity_score: Optional[float],
    confidence_score: Optional[float],
) -> Dict:
    """
    Staleness coefficient for FMV adjustment.

    Uses active listing prices as a proxy for market direction when no
    sale dates are available. The coefficient is applied as:
        adjusted_bid_center = bid_center * (1 + coefficient)

    Positive → sold comps are stale-low, nudge bid center up
    Negative → sold comps are stale-high, nudge bid center down
    Zero     → no adjustment (healthy gap or sellers-dreaming suppression)

    Returns:
        {"coefficient": float, "raw_gap_pct": float, "pressure_bucket": str,
         "liq_factor": float, "conf_factor": float, "suppressed": bool}
    """
    MAX_COEFFICIENT = 0.15  # ±15% hard cap

    raw_gap_pct = (ask_center - bid_center) / bid_center * 100

    # Sellers-dreaming suppression: asks 2x+ bid are implausible
    if ask_center > bid_center * 2.0:
        return {
            "coefficient": 0.0,
            "raw_gap_pct": round(raw_gap_pct, 1),
            "pressure_bucket": "UNREALISTIC",
            "liq_factor": None,
            "conf_factor": None,
            "suppressed": True,
        }

    # Map gap to base directional signal
    # Thresholds mirror calculate_market_pressure status tiers
    if raw_gap_pct < 0:
        # -1% gap → ~-0.004 base; -25% → -0.10; capped at -0.15
        base = max(-MAX_COEFFICIENT, raw_gap_pct / 250.0)
        pressure_bucket = "BELOW_FMV"
    elif raw_gap_pct <= 15:
        base = 0.0
        pressure_bucket = "HEALTHY"
    elif raw_gap_pct <= 30:
        # 15–30% gap → base 0.0–0.04
        base = (raw_gap_pct - 15) / 375.0
        pressure_bucket = "OPTIMISTIC"
    elif raw_gap_pct <= 50:
        # 30–50% gap → base 0.04–0.08
        base = 0.04 + (raw_gap_pct - 30) / 500.0
        pressure_bucket = "RESISTANCE"
    else:
        # 50–100% (not yet 2x): treat as capped resistance
        base = 0.08
        pressure_bucket = "RESISTANCE"

    # Liquidity scaling: low liq → dampen (conservative), high liq → amplify (trust signal)
    # 0→0.50, 50→1.00, 100→1.50
    liq = liquidity_score if liquidity_score is not None else 50
    liq_factor = 0.50 + (liq / 100.0)

    # Confidence scaling: 0→0.50, 50→0.75, 100→1.00
    conf = confidence_score if confidence_score is not None else 70
    conf_factor = 0.50 + (conf / 200.0)

    coefficient = base * liq_factor * conf_factor
    coefficient = max(-MAX_COEFFICIENT, min(MAX_COEFFICIENT, coefficient))

    return {
        "coefficient": round(coefficient, 4),
        "raw_gap_pct": round(raw_gap_pct, 1),
        "pressure_bucket": pressure_bucket,
        "liq_factor": round(liq_factor, 3),
        "conf_factor": round(conf_factor, 3),
        "suppressed": False,
    }
