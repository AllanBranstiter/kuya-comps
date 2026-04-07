# backend/services/market_summary_service.py
"""
AI-powered market summary generation using OpenRouter.

Generates a 2-3 sentence plain-English description of market conditions
after FMV calculation. Founders get Claude Sonnet; all others get Gemini Flash.
"""
import os
from typing import Optional

import httpx

from backend.logging_config import get_logger

logger = get_logger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
SUMMARY_TIMEOUT = 10  # seconds

MODEL_BY_TIER = {
    "founder": "anthropic/claude-sonnet-4-5",
}
MODEL_DEFAULT = "google/gemini-2.0-flash-001"


def should_generate_summary(fmv_result, sold_count: int, active_count: int) -> tuple[bool, str]:
    """
    Determine whether to generate a summary.

    Returns (should_generate, reason_if_skipped).
    """
    # Quality gate
    if fmv_result.market_value is None:
        return False, "no market_value"

    analytics = fmv_result.analytics_scores or {}
    confidence = analytics.get("confidence") or {}
    conf_band = confidence.get("band", "")
    conf_score = confidence.get("score")

    if conf_band == "Insufficient Data":
        return False, "confidence band is Insufficient Data"
    if conf_score is not None and conf_score < 30:
        return False, f"confidence score too low ({conf_score})"
    if sold_count < 3:
        return False, f"too few sold comps ({sold_count})"

    # Signal gate — at least one must fire
    liquidity = analytics.get("liquidity") or {}
    liq_score = liquidity.get("score")

    has_active = active_count > 0
    low_liquidity = liq_score is not None and liq_score < 50
    low_confidence = conf_score is not None and conf_score < 70

    if has_active or low_liquidity or low_confidence:
        return True, ""

    return False, "no meaningful signal present"


def _build_prompt(card_name: str, fmv_result, sold_count: int, active_count: int,
                  below_fmv_listings: list) -> str:
    analytics = fmv_result.analytics_scores or {}
    confidence = analytics.get("confidence") or {}
    liquidity = analytics.get("liquidity") or {}
    collectibility = analytics.get("collectibility") or {}
    staleness = analytics.get("staleness") or {}
    pressure = analytics.get("pressure") or {}
    comp_zone = analytics.get("competitive_zone") or {}

    market_value = fmv_result.market_value
    quick_sale = fmv_result.quick_sale
    patient_sale = fmv_result.patient_sale

    conf_band = confidence.get("band", "Unknown")
    conf_score = confidence.get("score", "N/A")
    liq_label = liquidity.get("label", "Unknown")
    liq_score = liquidity.get("score", "N/A")
    coll_label = collectibility.get("label", "Unknown")
    coll_score = collectibility.get("score", "N/A")
    raw_gap_pct = staleness.get("raw_gap_pct", "N/A")
    pressure_bucket = staleness.get("pressure_bucket", "N/A")
    coeff = staleness.get("coefficient", "N/A")
    suppressed = staleness.get("suppressed", False)
    pressure_pct = pressure.get("pressure_pct", "N/A")
    pressure_status = pressure.get("status", "N/A")

    # Competitive zone summary
    zone_found = comp_zone.get("found", False)
    zone_competitive = comp_zone.get("competitive_count", 0)
    zone_total = comp_zone.get("total_active_count", active_count)
    zone_center = comp_zone.get("center")

    return (
        f'You are writing a market summary for a baseball card price tool used by collectors. '
        f'The card being searched is: "{card_name}". This is an eBay search query, so it follows '
        f'eBay search syntax. For example, -word means that word is excluded from results, '
        f'and quoted terms are exact matches. Do not interpret search operators as part of the card description. '
        f'Do not name or describe the card in your summary. Refer to it only as "this card".\n\n'
        f"Write 2-3 sentences. Your tone should be like a knowledgeable card dealer talking to a "
        f"customer at a show: friendly, confident, and straight to the point. "
        f"Give information useful to both buyers and sellers: what a fair price looks like, "
        f"whether prices are going up or going down, and how easy or hard it is to buy or sell right now. "
        f"Keep sentences short and clear. Use everyday language that works for collectors of all ages. "
        f"Do not use em-dashes, hyphens as dashes, jargon, or filler phrases.\n\n"
        f"Market data:\n"
        f"- Market Value: ${market_value} | Quick Sale: ${quick_sale} | Patient Sale: ${patient_sale}\n"
        f"- Sold comps: {sold_count} | Active listings: {active_count}\n"
        f"- Price agreement (confidence): {conf_band} ({conf_score}/100)\n"
        f"- Market activity (liquidity): {liq_label} ({liq_score}/100)\n"
        f"- Collectibility: {coll_label} ({coll_score}/10)\n"
        f"- Asking vs. sold gap: {raw_gap_pct}% ({pressure_bucket})\n"
        f"- Staleness signal: coefficient={coeff}, suppressed={suppressed}\n"
        f"- Seller pressure: {pressure_pct}% ({pressure_status})\n"
        f"- Competitive active zone: "
        + (
            f"{zone_competitive} of {zone_total} active listings are priced near recent sales "
            f"(around ${zone_center:.2f}). The rest are priced well above. "
            f"This is useful context for sellers: to move this card, you'd need to price near ${zone_center:.2f}.\n"
            if zone_found and zone_center is not None
            else f"No active listings are priced near recent sales. Most sellers are asking well above what this card has sold for.\n"
        )
        + (
            f"- Active listings BELOW market value: {len(below_fmv_listings)} listing(s) "
            f"at prices {', '.join(f'${p:.2f}' for p in below_fmv_listings)}. "
            f"Alert the collector to this opportunity and mention the lowest price available.\n"
            if below_fmv_listings else ""
        ) +
        f"\nWrite only the summary. No headers, no bullets, no extra text."
    )


def generate_market_summary(
    fmv_result,
    sold_count: int,
    active_count: int,
    card_name: str,
    user_tier: str = "free",
    below_fmv_listings: Optional[list] = None,
    api_key: Optional[str] = None,
) -> Optional[str]:
    """
    Generate a plain-English market summary for the given FMV result.

    Returns a string on success, None on skip or failure.
    Never raises.
    """
    try:
        should_gen, reason = should_generate_summary(fmv_result, sold_count, active_count)
        if not should_gen:
            logger.info(f"[summary] skipped -- {reason}")
            return None

        key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not key:
            logger.warning("[summary] skipped -- no OPENROUTER_API_KEY")
            return None

        model = MODEL_BY_TIER.get(user_tier, MODEL_DEFAULT)
        prompt = _build_prompt(card_name or "this card", fmv_result, sold_count, active_count,
                               below_fmv_listings or [])

        response = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 200,
            },
            timeout=SUMMARY_TIMEOUT,
        )

        if response.status_code != 200:
            logger.warning(f"[summary] skipped -- OpenRouter returned {response.status_code}")
            return None

        data = response.json()
        text = data["choices"][0]["message"]["content"].strip()
        logger.info(f"[summary] generated ({model}, {len(text)} chars)")
        return text

    except Exception as e:
        logger.warning(f"[summary] skipped -- {type(e).__name__}: {e}")
        return None
