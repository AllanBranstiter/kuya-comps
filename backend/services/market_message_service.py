# backend/services/market_message_service.py
"""
Market Message Service - Selects and formats tier-specific market messages.

This module handles loading tier-specific message templates from JSON and
selecting appropriate messages based on market conditions and price tier.
"""
import json
import os
from typing import Optional, Dict, Any
from pathlib import Path


# Cache for loaded message content
_MESSAGE_CONTENT_CACHE = None


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
        return "dataQualityWarning"
    
    # 2. Two-Tier Market Detection
    if (absorption_below is not None and absorption_above is not None and
        absorption_below >= 1.5 and absorption_above < 0.3 and
        below_fmv_count > 0 and above_fmv_count > 0):
        return "twoTierMarket"
    
    # 3. High Risk: High pressure + Low liquidity
    if market_pressure > 30 and liquidity_score < 50:
        return "highRiskConditions"
    
    # 4. Overpriced but Active: High pressure + Good liquidity
    if market_pressure > 30 and liquidity_score >= 50:
        return "overpricedActiveMarket"
    
    # 5. Fair Price but Low Liquidity
    if market_pressure <= 15 and liquidity_score < 50:
        return "fairPricingLimitedDemand"
    
    # 6. Strong Buy Opportunity: Negative pressure + High liquidity
    if market_pressure < 0 and liquidity_score >= 70:
        return "strongBuyOpportunity"
    
    # 7. Healthy Market: Fair pressure + High liquidity
    if 0 <= market_pressure <= 15 and liquidity_score >= 70:
        return "healthyMarketConditions"
    
    # 8. Default: Normal/Balanced Market
    return "balancedMarket"


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
    
    # DEBUG: Log what we're looking for and what's available
    print(f"[DEBUG] Message type determined: '{message_type}'")
    print(f"[DEBUG] Available message types in JSON: {list(messages.keys())}")
    
    if message_type not in messages:
        raise ValueError(f"Message type '{message_type}' not found in content")
    
    message_config = messages[message_type]
    
    # Get tier-specific content (fallback to tier_1 if tier not defined)
    tier_content = message_config.get(tier_id)
    if tier_content is None:
        # Some messages only have tier_1 (like data_quality_warning)
        tier_content = message_config.get("tier_1")
        if tier_content is None:
            raise ValueError(f"No content found for {message_type} in {tier_id}")
    
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
    
    # Format the message content
    formatted_content = format_message_placeholders(tier_content["content"], placeholders)
    
    # Build advice object
    advice = {}
    if tier_content.get("advice_seller"):
        advice["seller"] = tier_content["advice_seller"]
    if tier_content.get("advice_buyer"):
        advice["buyer"] = tier_content["advice_buyer"]
    if tier_content.get("advice_collector"):
        advice["collector"] = tier_content["advice_collector"]
    
    return {
        "message_type": message_type,
        "title": message_config["title"],
        "icon": message_config["icon"],
        "content": formatted_content,
        "advice": advice,
        "color": message_config["base_color"]
    }


def get_liquidity_popup_content(tier_id: str) -> Dict:
    """
    Get tier-specific content for the liquidity risk popup.
    
    Args:
        tier_id: Price tier identifier (e.g., "tier_1")
    
    Returns:
        dict: Popup content with title and tier-specific explanation
    """
    content_data = load_message_content()
    liquidity_popup = content_data["liquidity_popup"]
    
    tier_content = liquidity_popup.get(tier_id)
    if tier_content is None:
        # Fallback to tier_1 if specific tier not found
        tier_content = liquidity_popup.get("tier_1", {})
    
    return {
        "title": liquidity_popup["title"],
        "content": tier_content.get("content", "")
    }
