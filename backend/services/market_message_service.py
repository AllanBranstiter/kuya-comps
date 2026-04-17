# backend/services/market_message_service.py
"""
Market Message Service - Selects and formats tier-specific market messages.

This module handles loading tier-specific message templates from JSON and
selecting appropriate messages based on market conditions and price tier.
"""
import json
from typing import Optional, Dict, Any
from pathlib import Path


# Cache for loaded message content
_MESSAGE_CONTENT_CACHE = None

# Mapping from internal snake_case message types to camelCase JSON keys
_MESSAGE_TYPE_TO_JSON_KEY = {
    "data_quality_warning": "dataQualityWarning",
    "two_tier_market": "twoTierMarket",
    "high_pressure_low_liquidity": "highRiskConditions",
    "overpriced_active_market": "overpricedActiveMarket",
    "fair_price_low_liquidity": "fairPricingLimitedDemand",
    "strong_buy_opportunity": "strongBuyOpportunity",
    "healthy_market_conditions": "healthyMarketConditions",
    "normal_market": "balancedMarket",
}


def load_message_content() -> Dict:
    """
    Load tier-specific message content from JSON file.

    Returns:
        dict: Message content structure with all tiers and message types

    Raises:
        FileNotFoundError: If market_messages_content.json doesn't exist
        json.JSONDecodeError: If JSON is malformed
    """
    global _MESSAGE_CONTENT_CACHE

    # Return cached content if already loaded
    if _MESSAGE_CONTENT_CACHE is not None:
        return _MESSAGE_CONTENT_CACHE

    # Find the JSON file relative to project root
    current_dir = Path(__file__).parent
    project_root = current_dir.parent.parent
    json_path = project_root / "market_messages_content.json"

    if not json_path.exists():
        raise FileNotFoundError(f"Message content file not found: {json_path}")

    with open(json_path, 'r', encoding='utf-8') as f:
        _MESSAGE_CONTENT_CACHE = json.load(f)

    return _MESSAGE_CONTENT_CACHE


def determine_message_type(
    market_pressure: float,
    liquidity_score: float,
    market_confidence: float,
    absorption_below: Optional[float] = None,
    absorption_above: Optional[float] = None,
    below_fmv_count: int = 0,
    above_fmv_count: int = 0
) -> str:
    """
    Determine which message type to display based on market conditions.

    This follows the same logic as the frontend analysis.js renderMarketAssessment()
    function to ensure consistency.

    Args:
        market_pressure: Market pressure percentage (can be negative)
        liquidity_score: Liquidity score (0-100)
        market_confidence: Market confidence score (0-100)
        absorption_below: Absorption ratio for below FMV
        absorption_above: Absorption ratio for above FMV
        below_fmv_count: Count of listings below FMV
        above_fmv_count: Count of listings above FMV

    Returns:
        str: Message type key (e.g., "high_pressure_low_liquidity")
    """
    abs_market_pressure = abs(market_pressure)

    # 1. Data Quality Warning
    if market_confidence < 30 and abs_market_pressure > 20:
        return "data_quality_warning"

    # 2. Two-Tier Market Detection
    if (absorption_below is not None and absorption_above is not None and
        absorption_below >= 1.5 and absorption_above < 0.3 and
        below_fmv_count > 0 and above_fmv_count > 0):
        return "two_tier_market"

    # 3. High Risk: High pressure + Low liquidity
    if market_pressure > 30 and liquidity_score < 50:
        return "high_pressure_low_liquidity"

    # 4. Overpriced but Active: High pressure + Good liquidity
    if market_pressure > 30 and liquidity_score >= 50:
        return "overpriced_active_market"

    # 5. Fair Price but Low Liquidity
    if market_pressure <= 15 and liquidity_score < 50:
        return "fair_price_low_liquidity"

    # 6. Strong Buy Opportunity: Negative pressure + High liquidity
    if market_pressure < 0 and liquidity_score >= 70:
        return "strong_buy_opportunity"

    # 7. Healthy Market: Fair pressure + High liquidity
    if 0 <= market_pressure <= 15 and liquidity_score >= 70:
        return "healthy_market_conditions"

    # 8. Default: Normal/Balanced Market
    return "normal_market"


def format_message_placeholders(content: str, placeholders: Dict[str, Any]) -> str:
    """
    Replace placeholders in message content with actual values.

    Args:
        content: Message text with {placeholder} markers
        placeholders: Dictionary of placeholder values

    Returns:
        str: Formatted message with placeholders replaced
    """
    formatted = content

    for key, value in placeholders.items():
        placeholder = f"{{{key}}}"
        if placeholder in formatted:
            # Format numbers appropriately
            if isinstance(value, float):
                # Round to 1 decimal place for percentages and scores
                formatted_value = f"{value:.1f}"
            else:
                formatted_value = str(value)

            formatted = formatted.replace(placeholder, formatted_value)

    return formatted


def get_market_message(
    tier_id: str,
    market_pressure: float,
    liquidity_score: float,
    market_confidence: float,
    absorption_below: Optional[float] = None,
    absorption_above: Optional[float] = None,
    below_fmv_count: int = 0,
    above_fmv_count: int = 0,
    sales_below: int = 0,
    sales_above: int = 0,
    **extra_placeholders
) -> Dict:
    """
    Get tier-specific market message based on conditions.

    Args:
        tier_id: Price tier identifier (e.g., "tier_1", "tier_2")
        market_pressure: Market pressure percentage
        liquidity_score: Liquidity score (0-100)
        market_confidence: Market confidence score (0-100)
        absorption_below: Absorption ratio below FMV
        absorption_above: Absorption ratio above FMV
        below_fmv_count: Count of active listings below FMV
        above_fmv_count: Count of active listings above FMV
        sales_below: Sales count below FMV
        sales_above: Sales count above FMV
        **extra_placeholders: Additional placeholders to substitute

    Returns:
        dict: Formatted message object containing:
            - message_type: Message type key
            - title: Message title
            - icon: Message icon emoji
            - content: Formatted message content
            - advice: Dictionary with seller/buyer/collector advice arrays
            - color: Message color code

    Raises:
        ValueError: If tier_id is invalid or message type not found
    """
    # Load message content
    content_data = load_message_content()
    messages = content_data["messages"]

    # Determine which message type to use
    message_type = determine_message_type(
        market_pressure=market_pressure,
        liquidity_score=liquidity_score,
        market_confidence=market_confidence,
        absorption_below=absorption_below,
        absorption_above=absorption_above,
        below_fmv_count=below_fmv_count,
        above_fmv_count=above_fmv_count
    )

    # Map internal message type to JSON key
    json_key = _MESSAGE_TYPE_TO_JSON_KEY.get(message_type, message_type)

    if json_key not in messages:
        raise ValueError(f"Message type '{message_type}' not found in content")

    message_config = messages[json_key]

    # Prepare placeholders for substitution
    placeholders = {
        "marketPressure": f"{market_pressure:+.1f}" if market_pressure != 0 else "0.0",
        "absMarketPressure": abs(market_pressure),
        "liquidityScore": liquidity_score,
        "confidence": market_confidence,
        "absorptionBelow": absorption_below if absorption_below is not None else 0,
        "absorptionAbove": absorption_above if absorption_above is not None else 0,
        "belowFMV": below_fmv_count,
        "aboveFMV": above_fmv_count,
        "salesBelow": sales_below,
        "salesAbove": sales_above,
        **extra_placeholders
    }

    # Format the message content (JSON uses "message" field)
    raw_content = message_config.get("message", "")
    formatted_content = format_message_placeholders(raw_content, placeholders)

    # Build advice object from personaAdvice
    advice = {}
    persona_advice = message_config.get("personaAdvice", {})
    if persona_advice.get("seller"):
        advice["seller"] = persona_advice["seller"]
    if persona_advice.get("flipper"):
        advice["buyer"] = persona_advice["flipper"]
    if persona_advice.get("collector"):
        advice["collector"] = persona_advice["collector"]

    return {
        "message_type": message_type,
        "title": message_config["title"],
        "icon": message_config["icon"],
        "content": formatted_content,
        "advice": advice,
        "color": message_config["color"]
    }


def get_liquidity_popup_content(tier_id: str) -> Dict:
    """
    Get content for the liquidity risk popup.

    The popup content is shared across all tiers (not tier-specific).

    Args:
        tier_id: Price tier identifier (e.g., "tier_1")

    Returns:
        dict: Popup content with title and content string
    """
    content_data = load_message_content()
    liquidity_popup = content_data["popups"]["liquidityRisk"]

    # Flatten sections into a content string for API consumers
    sections = liquidity_popup.get("sections", [])
    content_parts = []
    for section in sections:
        section_type = section.get("type")
        if section_type in ("text", "formula"):
            content_parts.append(section.get("content", ""))
        elif section_type == "header":
            content_parts.append(section.get("content", ""))
        elif section_type == "bands":
            for band in section.get("items", []):
                content_parts.append(
                    f"{band.get('title', '')}: {band.get('meaning', '')}"
                )
        elif section_type == "list":
            for item in section.get("items", []):
                content_parts.append(f"- {item}")

    return {
        "title": liquidity_popup["title"],
        "content": "\n\n".join(content_parts)
    }
