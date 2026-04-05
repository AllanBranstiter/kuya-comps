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
    weighted_sold = 0.0
    for item in sold_items:
        price = getattr(item, "total_price", None)
        if not price or price <= 0:
            continue
        item_date = getattr(item, "date_scraped", None)
        if item_date:
            if isinstance(item_date, str):
                try:
                    item_date = date.fromisoformat(item_date)
                except ValueError:
                    item_date = reference_date
            days_ago = max(0, (reference_date - item_date).days)
        else:
            days_ago = 30  # assume ~1 month old if unknown
        decay = 2 ** (-days_ago / 14)
        weighted_sold += decay

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

def calculate_collectibility(
    market_value: float,
    sold_count: int,
    active_count: int,
) -> Dict:
    """
    Collectibility score with continuous log-scaled components.

    Eliminates cliff effects from hard price thresholds by using
    log-scaled price, volume, and scarcity components.

    Args:
        market_value: FMV market value
        sold_count: Number of sold comps found
        active_count: Number of active listings found

    Returns:
        {"score": 1-10, "label": str, "components": {...}}
    """
    # Continuous price component (1-4)
    if market_value <= 0:
        price_score = 1.0
    else:
        price_score = max(1.0, min(4.0, math.log2(market_value / 2.5)))

    # Continuous volume component (0-3)
    if sold_count <= 0:
        volume_score = 0.0
    else:
        volume_score = min(3.0, math.log2(max(1, sold_count)) / math.log2(100) * 3)

    # Continuous scarcity component (0-3)
    if sold_count > 0:
        ratio = active_count / sold_count
        scarcity_score = max(0.0, min(3.0, 3.0 * (1 - ratio / 2.0)))
    else:
        scarcity_score = 0.0

    raw = price_score + volume_score + scarcity_score
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

    return {
        "score": score,
        "label": label,
        "components": {
            "price": round(price_score, 2),
            "volume": round(volume_score, 2),
            "scarcity": round(scarcity_score, 2),
        },
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
