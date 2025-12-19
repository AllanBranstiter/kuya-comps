# backend/services/price_tier_service.py
"""
Price Tier Service - Determines price tier based on FMV or average listing price.

This module provides centralized tier determination logic for dynamic content
selection based on card price ranges.
"""
from typing import Optional, Dict


# Tier configuration
PRICE_TIERS = [
    {
        "max_price": 100,
        "tier_id": "tier_1",
        "tier_emoji": "🟢",
        "tier_name": "Under $100",
        "tier_range": "Under $100",
        "tier_color": "#34c759"
    },
    {
        "max_price": 500,
        "tier_id": "tier_2",
        "tier_emoji": "🔵",
        "tier_name": "$100-$499",
        "tier_range": "$100-$499",
        "tier_color": "#007aff"
    },
    {
        "max_price": 2000,
        "tier_id": "tier_3",
        "tier_emoji": "🟣",
        "tier_name": "$500-$2,000",
        "tier_range": "$500-$2,000",
        "tier_color": "#5856d6"
    },
    {
        "max_price": 10000,
        "tier_id": "tier_4",
        "tier_emoji": "🟠",
        "tier_name": "$2,000-$10,000",
        "tier_range": "$2,000-$10,000",
        "tier_color": "#ff9500"
    },
    {
        "max_price": float('inf'),
        "tier_id": "tier_5",
        "tier_emoji": "🔴",
        "tier_name": "$10,000+",
        "tier_range": "$10,000+",
        "tier_color": "#ff3b30"
    }
]


def get_price_tier(fmv: Optional[float] = None, avg_listing_price: Optional[float] = None) -> Dict:
    """
    Determine price tier based on FMV with fallback to average listing price.
    
    Priority:
    1. Use FMV if available and > 0
    2. Fall back to avg_listing_price if FMV unavailable
    3. Return None tier if neither available
    
    Args:
        fmv: Fair Market Value calculated from sold listings
        avg_listing_price: Average price from active listings
    
    Returns:
        dict: Tier information containing:
            - tier_id: Tier identifier (e.g., "tier_1")
            - tier_emoji: Visual indicator emoji
            - tier_name: Display name
            - tier_range: Price range description
            - tier_color: Color code for UI
            - price_used: The price used for tier calculation
            - price_source: Which price was used ("fmv" or "avg_listing")
    
    Examples:
        >>> get_price_tier(fmv=50.00)
        {'tier_id': 'tier_1', 'tier_emoji': '🟢', ...}
        
        >>> get_price_tier(fmv=None, avg_listing_price=250.00)
        {'tier_id': 'tier_2', 'tier_emoji': '🔵', ...}
        
        >>> get_price_tier(fmv=1500.00, avg_listing_price=250.00)
        {'tier_id': 'tier_3', 'tier_emoji': '🟣', ...}  # FMV takes priority
    """
    # Determine which price to use (FMV has priority)
    price = fmv if fmv and fmv > 0 else avg_listing_price
    
    # If no valid price available, return null tier
    if not price or price <= 0:
        return {
            "tier_id": None,
            "tier_emoji": None,
            "tier_name": None,
            "tier_range": None,
            "tier_color": None,
            "price_used": None,
            "price_source": None
        }
    
    # Find the appropriate tier
    for tier in PRICE_TIERS:
        if price < tier["max_price"]:
            return {
                "tier_id": tier["tier_id"],
                "tier_emoji": tier["tier_emoji"],
                "tier_name": tier["tier_name"],
                "tier_range": tier["tier_range"],
                "tier_color": tier["tier_color"],
                "price_used": price,
                "price_source": "fmv" if fmv and fmv > 0 else "avg_listing"
            }
    
    # Fallback (should never reach here due to inf in tier_5)
    return {
        "tier_id": None,
        "tier_emoji": None,
        "tier_name": None,
        "tier_range": None,
        "tier_color": None,
        "price_used": price,
        "price_source": "fmv" if fmv and fmv > 0 else "avg_listing"
    }


def get_tier_boundaries() -> Dict[str, Dict]:
    """
    Get all tier boundaries for reference.
    
    Returns:
        dict: Mapping of tier_id to tier configuration
    """
    return {tier["tier_id"]: tier for tier in PRICE_TIERS}
