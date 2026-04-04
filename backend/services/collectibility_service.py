# backend/services/collectibility_service.py
"""
Collectibility Score service.

Scores a card's collectibility on a 1-10 scale based on three components:

  Price Tier Score (1-4 pts)
    Bulk  (≤ $5)       = 1  — common base/junk wax, little hobby interest
    Low   ($5–$100)    = 2  — starter cards, moderate interest
    Mid   ($100–$1000) = 3  — premium singles, graded vintage
    Grail (> $1000)    = 4  — high-end rarities

  Volume Score (0-3 pts)  — proven market depth from sold comps
    ≥ 50 sold  = 3  (deep, liquid market)
    ≥ 20 sold  = 2  (solid comp history)
    ≥ 5 sold   = 1  (thin but existent)
    < 5 sold   = 0  (near-no data)

  Scarcity Score (0-3 pts)  — active/sold ratio (lower = tighter supply)
    ratio ≤ 0.25  = 3  (very scarce)
    ratio ≤ 0.75  = 2  (scarce)
    ratio ≤ 1.50  = 1  (balanced)
    ratio > 1.50  = 0  (oversupplied)

Final score = clamp(price + volume + scarcity, 1, 10)

Tier labels and the 6-scenario signal are defined here so they can be
shared between the backend (search logs, collection valuation) and used
as a reference when the frontend computes the score directly.
"""
from __future__ import annotations
from typing import Optional


# ---------------------------------------------------------------------------
# Score tiers
# ---------------------------------------------------------------------------

SCORE_TIERS = [
    {"min": 1, "max": 2, "label": "Bulk",               "description": "Minimal collector interest"},
    {"min": 3, "max": 4, "label": "Common",             "description": "General hobby circulation"},
    {"min": 5, "max": 6, "label": "Sought After",       "description": "Growing or sustained collector demand"},
    {"min": 7, "max": 8, "label": "Highly Collectible", "description": "Strong demand and proven market depth"},
    {"min": 9, "max": 10, "label": "Blue Chip",         "description": "Exceptional demand — trophy-level card"},
]


def get_tier(score: int) -> dict:
    for tier in SCORE_TIERS:
        if tier["min"] <= score <= tier["max"]:
            return tier
    return SCORE_TIERS[0]


# ---------------------------------------------------------------------------
# Scenario signal (mirrors the 6-cell matrix from the product spec)
# ---------------------------------------------------------------------------

def get_scenario_signal(market_value: float, sold_count: int, active_count: int) -> str:
    """
    Return a plain-English market signal based on the bid/ask/volume matrix.

    Thresholds:
      High FMV    : market_value > $100
      High Volume : sold_count >= 20
      High Supply : active_count >= 15
    """
    high_fmv    = market_value > 100
    high_volume = sold_count >= 20
    high_supply = active_count >= 15

    if not high_fmv and not high_volume and not high_supply:
        return "Minimal collector interest"
    if not high_fmv and not high_volume and high_supply:
        return "Common card — low hobby interest"
    if not high_fmv and high_volume and high_supply:
        return "Common card — high turnover"
    if high_fmv and not high_volume and not high_supply:
        return "Rare and scarce — strong desirability"
    if high_fmv and high_volume and not high_supply:
        return "Blue chip — exceptional collector demand"
    if high_fmv and not high_volume and high_supply:
        return "Possible declining demand"
    # high_fmv + high_volume + high_supply
    return "Active market — sustained collector interest"


# ---------------------------------------------------------------------------
# Core calculation
# ---------------------------------------------------------------------------

def calculate_collectibility(
    market_value: float,
    sold_count: int,
    active_count: int,
) -> dict:
    """
    Calculate collectibility score and return a full result dict.

    Args:
        market_value:  FMV market value (from sold listings)
        sold_count:    Number of sold comps found
        active_count:  Number of active listings found (0 if not searched)

    Returns:
        {
          "score":    int (1-10),
          "label":    str,
          "scenario": str,
          "components": {
              "price_tier_score": int,
              "volume_score":     int,
              "scarcity_score":   int,
              "supply_demand_ratio": float | None,
          }
        }
    """
    # Price tier component
    if market_value <= 5:
        price_score = 1
    elif market_value <= 100:
        price_score = 2
    elif market_value <= 1000:
        price_score = 3
    else:
        price_score = 4

    # Volume component
    if sold_count >= 50:
        volume_score = 3
    elif sold_count >= 20:
        volume_score = 2
    elif sold_count >= 5:
        volume_score = 1
    else:
        volume_score = 0

    # Scarcity component
    if sold_count > 0:
        ratio: Optional[float] = active_count / sold_count
    else:
        ratio = None  # no sold data — can't compute ratio

    if ratio is None or ratio > 1.5:
        scarcity_score = 0
    elif ratio > 0.75:
        scarcity_score = 1
    elif ratio > 0.25:
        scarcity_score = 2
    else:
        scarcity_score = 3

    raw = price_score + volume_score + scarcity_score
    score = max(1, min(10, raw))
    tier = get_tier(score)

    return {
        "score": score,
        "label": tier["label"],
        "scenario": get_scenario_signal(market_value, sold_count, active_count),
        "components": {
            "price_tier_score": price_score,
            "volume_score": volume_score,
            "scarcity_score": scarcity_score,
            "supply_demand_ratio": round(ratio, 3) if ratio is not None else None,
        },
    }
