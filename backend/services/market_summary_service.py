# backend/services/market_summary_service.py
"""
AI-powered market summary generation using OpenRouter.

Generates a 2-3 sentence plain-English description of market conditions
after FMV calculation. Uses Llama 3.3 70B Instruct for all users.
"""
import os
from typing import Optional

import httpx

from backend.logging_config import get_logger
from backend.config import AI_MODEL_SUMMARY

logger = get_logger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
SUMMARY_TIMEOUT = 10  # seconds

MODEL_BY_TIER = {}
MODEL_DEFAULT = AI_MODEL_SUMMARY


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


def _get_rarity_label(print_run) -> str:
    """Map a print run number to a collector-friendly rarity label."""
    try:
        pr = int(print_run)
    except (TypeError, ValueError):
        return ""
    if pr <= 50:
        return "extremely rare"
    if pr <= 100:
        return "very rare"
    if pr <= 999:
        return "rare"
    if pr <= 5000:
        return "a little rare"
    return "common"


def _format_print_run_line(print_run_info: Optional[dict]) -> str:
    """Format print run data as a prompt line, or return empty string if not reliable.

    Only includes print run data when confidence is 'confirmed' (from listing /N data)
    or 'checklist' (from verified checklist data). Broad 'estimated' ranges from the
    reference table are too vague and cause the AI to hallucinate specific numbers.
    """
    if not print_run_info:
        return ""

    confidence = print_run_info.get("confidence")
    if confidence not in ("confirmed", "checklist"):
        return ""

    pr = print_run_info["print_run"]

    if pr == "print-to-order":
        return (
            f"- Print run: Print-to-order (exact count published by manufacturer). "
            f"If you know the typical order volume for this set, mention it briefly.\n"
        )

    rarity = _get_rarity_label(pr)
    rarity_note = f" This is considered {rarity} among collectors." if rarity else ""

    if confidence == "confirmed":
        return (
            f"- Print run: /{pr} (confirmed).{rarity_note} "
            f"Mention this briefly to give the collector context on scarcity.\n"
        )

    if confidence == "checklist":
        return (
            f"- Print run: {pr:,} copies ({print_run_info.get('source', 'checklist data')}).{rarity_note} "
            f"Mention this briefly to give the collector context on scarcity.\n"
        )

    # estimated
    return (
        f"- Estimated print run: ~{pr} ({print_run_info.get('source', 'reference data')}). "
        f"Mention this briefly to give the collector context on scarcity.\n"
    )


def _build_prompt(card_name: str, fmv_result, sold_count: int, active_count: int,
                  below_fmv_listings: list, print_run_info: Optional[dict] = None) -> str:
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
        f"Write 2-3 sentences. You are a warm, approachable mentor in the card collecting hobby. "
        f"Think of a friend who really knows his stuff and loves breaking things down simply. "
        f"You get excited about great cards and you highlight what makes them worth owning. "
        f"Tell the collector what a fair price looks like, whether it is easy or hard to buy or sell right now, "
        f"and anything that makes this card stand out. "
        f"Never be negative about someone's card. Stick to the facts and let the collector decide. "
        f"If prices are steady and the print run is under 2,000, that is a desirable card. "
        f"Keep it conversational and natural. No stiff language, no robotic lists. "
        f"Write like you are explaining it to an 11-year-old who collects cards. "
        f"Never use terms like 'liquidity', 'price agreement', 'market activity', 'seller pressure', "
        f"'staleness', 'competitive zone', or 'confidence score'. Translate everything into plain English. "
        f"For example, say 'prices have been pretty steady' instead of 'excellent price agreement'. "
        f"Say 'lots of people are buying and selling' instead of 'high liquidity'. "
        f"Only call something a 'steal' or 'great deal' if it is 25% or more below market value. "
        f"A small discount of 5-10% is just 'a little below market value'. "
        f"If a card has very few listings and none are much cheaper than recent sales, "
        f"that means people want this card and are not letting it go cheap. "
        f"Never use the word 'interesting'. Be friendly and casual, but write with clarity and precision. "
        f"Prefer short words over long ones. Omit needless words. Every sentence should earn its place. "
        f"Do not use em-dashes, hyphens as dashes, jargon, filler phrases, or cliches like 'at the end of the day'.\n\n"
        f"Market data:\n"
        f"- Market Value: ${market_value} | Quick Sale: ${quick_sale} | Patient Sale: ${patient_sale}\n"
        f"- Sold comps: {sold_count} | Active listings: {active_count}\n"
        f"- How steady are prices: {conf_band} ({conf_score}/100)\n"
        f"- How much buying/selling is happening: {liq_label} ({liq_score}/100)\n"
        f"- Collectibility: {coll_label} ({coll_score}/10)\n"
        f"- Are sellers asking more or less than what cards actually sell for: {raw_gap_pct}% gap\n"
        f"- How competitive is the market for sellers: "
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
            f"Mention the lowest price. Only call it a 'steal' or 'great deal' if it is 25%+ below market value.\n"
            if below_fmv_listings else ""
        )
        + _format_print_run_line(print_run_info)
        + (
            "- Do not mention print runs, production numbers, or scarcity estimates.\n"
            if not print_run_info or print_run_info.get("confidence") not in ("confirmed", "checklist")
            else ""
        )
        + f"\nWrite only the summary. No headers, no bullets, no extra text."
    )


def generate_market_summary(
    fmv_result,
    sold_count: int,
    active_count: int,
    card_name: str,
    user_tier: str = "free",
    below_fmv_listings: Optional[list] = None,
    print_run_info: Optional[dict] = None,
    api_key: Optional[str] = None,
) -> tuple[Optional[str], Optional[dict]]:
    """
    Generate a plain-English market summary for the given FMV result.

    Returns (summary_text, token_usage) on success, (None, None) on skip or failure.
    token_usage dict has keys: prompt_tokens, completion_tokens, total_tokens, model.
    Never raises.
    """
    try:
        should_gen, reason = should_generate_summary(fmv_result, sold_count, active_count)
        if not should_gen:
            logger.info(f"[summary] skipped -- {reason}")
            return None, None

        key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not key:
            logger.warning("[summary] skipped -- no OPENROUTER_API_KEY")
            return None, None

        model = MODEL_BY_TIER.get(user_tier, MODEL_DEFAULT)
        prompt = _build_prompt(card_name or "this card", fmv_result, sold_count, active_count,
                               below_fmv_listings or [], print_run_info)

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
            return None, None

        data = response.json()
        text = data["choices"][0]["message"]["content"].strip()

        # Extract token usage from OpenRouter response
        usage_raw = data.get("usage", {})
        token_usage = {
            "prompt_tokens": usage_raw.get("prompt_tokens"),
            "completion_tokens": usage_raw.get("completion_tokens"),
            "total_tokens": usage_raw.get("total_tokens"),
            "model": model,
        }

        logger.info(
            f"[summary] generated ({model}, {len(text)} chars, "
            f"{token_usage.get('total_tokens', '?')} tokens)"
        )
        return text, token_usage

    except Exception as e:
        logger.warning(f"[summary] skipped -- {type(e).__name__}: {e}")
        return None, None
