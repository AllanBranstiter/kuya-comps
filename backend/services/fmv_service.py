# backend/services/fmv_service.py
"""
Fair Market Value (FMV) calculation service.

This module contains all logic for calculating volume-weighted FMV
and related statistics for card valuations.
"""
from typing import List, Optional, Tuple, Dict
import numpy as np
from backend.services.price_tier_service import get_price_tier
from backend.config import (
    IQR_OUTLIER_MULTIPLIER,
    MIN_ITEMS_FOR_OUTLIER_DETECTION,
    MIN_ITEMS_FOR_FMV,
    AUCTION_BASE_WEIGHT,
    BUY_IT_NOW_WEIGHT,
    BEST_OFFER_WEIGHT,
    BID_COUNT_HIGH,
    BID_COUNT_MODERATE,
    BID_COUNT_LOW,
    BID_WEIGHT_HIGH,
    BID_WEIGHT_MODERATE,
    BID_WEIGHT_LOW,
    MIN_VOLUME_WEIGHT,
    MAX_VOLUME_WEIGHT,
    CONFIDENCE_HIGH_RATIO,
    CONFIDENCE_MEDIUM_RATIO,
)


class FMVResult:
    """Container for FMV calculation results."""
    
    def __init__(
        self,
        fmv_low: Optional[float] = None,
        fmv_high: Optional[float] = None,
        expected_low: Optional[float] = None,
        expected_high: Optional[float] = None,
        market_value: Optional[float] = None,
        quick_sale: Optional[float] = None,
        patient_sale: Optional[float] = None,
        volume_confidence: Optional[str] = None,
        count: int = 0,
        price_tier: Optional[Dict] = None
    ):
        self.fmv_low = fmv_low
        self.fmv_high = fmv_high
        self.expected_low = expected_low
        self.expected_high = expected_high
        self.market_value = market_value
        self.quick_sale = quick_sale
        self.patient_sale = patient_sale
        self.volume_confidence = volume_confidence
        self.count = count
        self.price_tier = price_tier
    
    def to_dict(self) -> dict:
        """Convert to dictionary format for API response."""
        return {
            'fmv_low': self.fmv_low,
            'fmv_high': self.fmv_high,
            'expected_low': self.expected_low,
            'expected_high': self.expected_high,
            'market_value': self.market_value,
            'quick_sale': self.quick_sale,
            'patient_sale': self.patient_sale,
            'volume_confidence': self.volume_confidence,
            'count': self.count,
            'price_tier': self.price_tier,
        }


def calculate_volume_weight(item: object) -> float:
    """
    Calculate volume weight for an item based on auction activity and listing type.
    
    Items with more market validation (auctions with multiple bids) receive
    higher weights in FMV calculation, as they represent truer price discovery.
    
    Args:
        item: CompItem object with pricing and auction data
    
    Returns:
        float: Volume weight between MIN_VOLUME_WEIGHT and MAX_VOLUME_WEIGHT
    
    Examples:
        - Auction with 15 bids: weight ≈ 2.5 (very reliable)
        - Auction with 3 bids: weight ≈ 1.75 (reliable)
        - Buy It Now with Best Offer: weight ≈ 1.1 (somewhat reliable)
        - Buy It Now: weight ≈ 0.8 (less reliable)
    """
    base_weight = 1.0
    
    # Check if it's an auction vs buy-it-now
    is_auction_listing = (
        item.is_auction or
        item.auction_sold or
        (item.bids is not None and item.bids > 0) or
        (item.total_bids is not None and item.total_bids > 0)
    )
    
    if is_auction_listing:
        # Auction sales get higher weight (more price discovery)
        weight_multiplier = AUCTION_BASE_WEIGHT
        
        # Add extra weight based on bid count
        bid_count = item.bids or item.total_bids or 0
        if bid_count >= BID_COUNT_HIGH:
            weight_multiplier += BID_WEIGHT_HIGH  # High competition = very reliable price
        elif bid_count >= BID_COUNT_MODERATE:
            weight_multiplier += BID_WEIGHT_MODERATE  # Moderate competition
        elif bid_count >= BID_COUNT_LOW:
            weight_multiplier += BID_WEIGHT_LOW  # Some competition
        
    else:
        # Buy-it-now sales get lower weight (less price discovery)
        weight_multiplier = BUY_IT_NOW_WEIGHT
        
        # But if it has best offer accepted, it's more like an auction
        if item.has_best_offer or item.best_offer_enabled:
            weight_multiplier = BEST_OFFER_WEIGHT
    
    final_weight = base_weight * weight_multiplier
    
    # Cap weights to reasonable range
    return min(max(final_weight, MIN_VOLUME_WEIGHT), MAX_VOLUME_WEIGHT)


def find_weighted_percentile(
    sorted_prices: np.ndarray,
    cumulative_weights: np.ndarray,
    total_weight: float,
    percentile: float
) -> float:
    """
    Find the price at a given weighted percentile.
    
    Unlike standard percentiles which treat all items equally, weighted percentiles
    give more influence to items with higher weights (e.g., high-bid auctions).
    
    Args:
        sorted_prices: Array of prices sorted in ascending order
        cumulative_weights: Running sum of weights corresponding to sorted_prices
        total_weight: Sum of all weights
        percentile: Target percentile (0.0 to 1.0)
    
    Returns:
        float: Price at the weighted percentile
    
    Example:
        For percentile=0.25 (25th percentile), finds the price where 25% of
        the total weight falls below it.
    """
    target_weight = total_weight * percentile
    
    # Find the index where cumulative weight crosses the target
    idx = np.searchsorted(cumulative_weights, target_weight)
    
    # Handle edge cases
    if idx == 0:
        return sorted_prices[0]
    elif idx >= len(sorted_prices):
        return sorted_prices[-1]
    
    # Interpolate between prices if needed
    if idx < len(sorted_prices) - 1:
        weight_before = cumulative_weights[idx - 1] if idx > 0 else 0
        weight_at = cumulative_weights[idx]
        
        if weight_at > weight_before:
            ratio = (target_weight - weight_before) / (weight_at - weight_before)
            return sorted_prices[idx - 1] + ratio * (sorted_prices[idx] - sorted_prices[idx - 1])
    
    return sorted_prices[idx]


def calculate_fmv(items: List[object]) -> FMVResult:
    """
    Calculate Fair Market Value (FMV) using volume weighting and outlier filtering.
    
    This algorithm:
    1. Weights items by market validation (auctions with more bids = higher weight)
    2. Filters outliers using IQR method to focus on core price cluster
    3. Calculates volume-weighted percentiles for price ranges
    4. Determines confidence based on proportion of high-weight sales
    
    Args:
        items: List of CompItem objects with total_price and auction data
    
    Returns:
        FMVResult: Object containing FMV ranges and confidence metrics
    
    FMV Tiers:
        - quick_sale: 25th weighted percentile (sell fast, lower price)
        - market_value: Volume-weighted mean (true market price)
        - patient_sale: 75th weighted percentile (wait for top dollar)
        - fmv_low/high: Market value ± 1 weighted std dev
    """
    # Prepare data for volume weighting
    price_weight_pairs = []
    
    for item in items:
        if item.total_price is None or item.total_price <= 0:
            continue
            
        # Calculate volume weight based on auction activity
        weight = calculate_volume_weight(item)
        price_weight_pairs.append((item.total_price, weight))
    
    if len(price_weight_pairs) < MIN_ITEMS_FOR_FMV:
        return FMVResult(count=len(price_weight_pairs))

    # Extract prices and weights
    all_prices = np.array([pair[0] for pair in price_weight_pairs])
    all_weights = np.array([pair[1] for pair in price_weight_pairs])
    
    # Filter outliers using IQR method (need at least 4 data points)
    if len(all_prices) >= MIN_ITEMS_FOR_OUTLIER_DETECTION:
        # Calculate quartiles
        q1 = np.percentile(all_prices, 25)
        q3 = np.percentile(all_prices, 75)
        iqr = q3 - q1
        
        # Define outlier bounds (aggressive filtering focuses on core cluster)
        lower_bound = q1 - IQR_OUTLIER_MULTIPLIER * iqr
        upper_bound = q3 + IQR_OUTLIER_MULTIPLIER * iqr
        
        # Filter out outliers
        mask = (all_prices >= lower_bound) & (all_prices <= upper_bound)
        prices = all_prices[mask]
        weights = all_weights[mask]
        
        outliers_removed = len(all_prices) - len(prices)
        print(f"[FMV] Removed {outliers_removed} outliers using IQR method ({IQR_OUTLIER_MULTIPLIER}x multiplier)")
        print(f"[FMV] Price bounds: ${lower_bound:.2f} - ${upper_bound:.2f} (Q1: ${q1:.2f}, Q3: ${q3:.2f})")
    else:
        # Not enough data for outlier detection
        prices = all_prices
        weights = all_weights
        print(f"[FMV] Skipping outlier detection (need {MIN_ITEMS_FOR_OUTLIER_DETECTION}+ items, have {len(all_prices)})")
    
    # Calculate volume-weighted statistics
    weighted_mean = np.average(prices, weights=weights)
    
    # Calculate weighted percentiles for FMV range
    sorted_indices = np.argsort(prices)
    sorted_prices = prices[sorted_indices]
    sorted_weights = weights[sorted_indices]
    
    # Calculate cumulative weights
    cumulative_weights = np.cumsum(sorted_weights)
    total_weight = cumulative_weights[-1]
    
    # Find weighted percentiles
    percentile_25 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.25)
    percentile_75 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.75)
    
    # Calculate weighted standard deviation
    weighted_variance = np.average((prices - weighted_mean) ** 2, weights=weights)
    weighted_std = np.sqrt(weighted_variance)
    
    # Define FMV ranges using volume-weighted statistics
    fmv_low = max(0, weighted_mean - weighted_std)
    fmv_high = weighted_mean + weighted_std
    
    # Volume-weighted market tiers
    quick_sale = max(0, percentile_25)      # 25th percentile - quick sale price
    market_value = weighted_mean            # Volume-weighted average - true market
    patient_sale = percentile_75            # 75th percentile - patient seller price
    
    # Determine confidence based on high-weight sales
    high_weight_count = sum(1 for w in weights if w > 1.0)
    confidence_ratio = high_weight_count / len(weights)
    
    if confidence_ratio >= CONFIDENCE_HIGH_RATIO:
        volume_confidence = "High"
    elif confidence_ratio >= CONFIDENCE_MEDIUM_RATIO:
        volume_confidence = "Medium"
    else:
        volume_confidence = "Low"
    
    # Count items within FMV range
    inliers = [price for price in prices if fmv_low <= price <= fmv_high]
    
    print(f"[FMV] Volume-weighted mean: ${weighted_mean:.2f}, std: ${weighted_std:.2f}")
    print(f"[FMV] High-weight sales: {high_weight_count}/{len(weights)} ({volume_confidence} confidence)")

    # Calculate price tier based on market_value
    tier_data = get_price_tier(fmv=market_value, avg_listing_price=None)

    return FMVResult(
        fmv_low=fmv_low,
        fmv_high=fmv_high,
        expected_low=quick_sale,    # Keep for backward compatibility
        expected_high=patient_sale,  # Keep for backward compatibility
        market_value=market_value,
        quick_sale=quick_sale,
        patient_sale=patient_sale,
        volume_confidence=volume_confidence,
        count=len(inliers),
        price_tier=tier_data
    )
