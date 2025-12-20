# backend/services/fmv_service.py
"""
Fair Market Value (FMV) calculation service.

This module contains all logic for calculating volume-weighted FMV
and related statistics for card valuations.
"""
from typing import List, Optional, Tuple, Dict
import numpy as np
from scipy.stats import skew
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


def detect_price_concentration(prices: np.ndarray) -> Optional[float]:
    """
    Find if prices cluster around a specific value using histogram analysis.
    
    Returns cluster center if 25%+ of sales fall within a tight range ($0.50 bins).
    This helps identify markets where most sales happen at a consistent price point.
    
    Args:
        prices: Array of prices to analyze
    
    Returns:
        float: Cluster center price if concentration detected, None otherwise
    
    Example:
        If 8 out of 30 sales are between $8.00-$8.50, that's 26.7% concentration
        at the $8.25 center point.
    """
    if len(prices) < 4:
        return None
    
    # Define bin size for price clustering ($0.50 bins)
    bin_size = 0.50
    
    # Create histogram with $0.50 bins
    min_price = np.min(prices)
    max_price = np.max(prices)
    bins = np.arange(min_price, max_price + bin_size, bin_size)
    
    if len(bins) < 2:
        return None
    
    counts, edges = np.histogram(prices, bins=bins)
    
    # Find the bin with the most sales
    max_count = np.max(counts)
    max_bin_idx = np.argmax(counts)
    
    # Check if this bin represents 25%+ of all sales
    concentration_ratio = max_count / len(prices)
    min_concentration = 0.25  # 25% threshold
    
    if concentration_ratio >= min_concentration:
        # Return the center of the dominant bin
        bin_center = (edges[max_bin_idx] + edges[max_bin_idx + 1]) / 2
        print(f"[FMV] Price concentration detected: {max_count}/{len(prices)} sales "
              f"({concentration_ratio:.1%}) in ${edges[max_bin_idx]:.2f}-${edges[max_bin_idx+1]:.2f} range "
              f"(center: ${bin_center:.2f})")
        return bin_center
    
    return None


def is_representative_sale(item: object, q1: float, q3: float, iqr: float) -> bool:
    """
    Determine if an outlier sale represents the typical card variant.
    
    Excludes rare numbered parallels (<= /50), PSA/BGS 10s, and autos which
    are not representative of the base variant's market.
    
    Args:
        item: CompItem object with title and variant information
        q1: First quartile price
        q3: Third quartile price
        iqr: Interquartile range
    
    Returns:
        bool: True if the sale is representative of the typical variant
    
    Example:
        A $399.99 sale of "/25 AUTO PSA 10" would return False (not representative)
        A $15 sale of "BASE AUTO" would return True (representative auto variant)
    """
    # If we don't have a title, can't classify - assume not representative
    if not hasattr(item, 'title') or not item.title:
        return False
    
    title_lower = item.title.lower()
    
    # Check for rare numbered parallels (/50 or lower)
    # Look for patterns like "/50", "/25", "/10", etc.
    import re
    parallel_match = re.search(r'/(\d+)', title_lower)
    if parallel_match:
        parallel_number = int(parallel_match.group(1))
        if parallel_number <= 50:
            print(f"[FMV] Excluding rare parallel: /{parallel_number} - {item.title[:60]}")
            return False
    
    # Check for gem mint grades (PSA 10, BGS 10)
    if ('psa 10' in title_lower or 'bgs 10' in title_lower or
        'gem mint 10' in title_lower or 'pristine 10' in title_lower):
        print(f"[FMV] Excluding gem mint 10: {item.title[:60]}")
        return False
    
    # If it has an auto keyword AND is an extreme outlier, it might be special
    # (like a rare auto variant vs. common auto)
    auto_keywords = ['auto', 'au ', '/au', 'autograph', 'signature', 'signed']
    has_auto = any(keyword in title_lower for keyword in auto_keywords)
    
    if has_auto and hasattr(item, 'total_price') and item.total_price:
        # If it's more than 3x the IQR above Q3, it's likely a special auto variant
        extreme_upper = q3 + 3 * iqr
        if item.total_price > extreme_upper:
            print(f"[FMV] Excluding extreme auto outlier: ${item.total_price:.2f} - {item.title[:60]}")
            return False
    
    # Otherwise, consider it representative
    return True


def calculate_robust_std(prices: np.ndarray, weights: np.ndarray, weighted_median: float) -> float:
    """
    Calculate standard deviation using MAD (median absolute deviation) for robustness.
    
    MAD-based std is less affected by extreme values than traditional std,
    making it more reliable for price distributions with outliers.
    
    Args:
        prices: Array of prices
        weights: Array of weights corresponding to prices
        weighted_median: Pre-calculated weighted median price
    
    Returns:
        float: Robust standard deviation estimate
    
    Technical Note:
        MAD * 1.4826 approximates the standard deviation for normal distributions,
        but is much more resistant to outliers.
    """
    # Calculate absolute deviations from median
    abs_deviations = np.abs(prices - weighted_median)
    
    # Calculate weighted median of absolute deviations
    sorted_indices = np.argsort(abs_deviations)
    sorted_deviations = abs_deviations[sorted_indices]
    sorted_weights = weights[sorted_indices]
    
    cumulative_weights = np.cumsum(sorted_weights)
    total_weight = cumulative_weights[-1]
    
    # Find weighted median absolute deviation (MAD)
    target_weight = total_weight * 0.5
    idx = np.searchsorted(cumulative_weights, target_weight)
    
    if idx >= len(sorted_deviations):
        idx = len(sorted_deviations) - 1
    
    mad = sorted_deviations[idx]
    
    # Convert MAD to std equivalent (1.4826 is the conversion factor)
    robust_std = mad * 1.4826
    
    print(f"[FMV] Robust std: ${robust_std:.2f} (MAD: ${mad:.2f})")
    
    return robust_std


def get_active_market_floor(active_items: List) -> Optional[float]:
    """
    Get realistic market floor from active listings (10th percentile).
    
    The 10th percentile of active listings represents the lowest realistic
    asking prices in the current market. If sold FMV falls below this,
    it may be outdated.
    
    Args:
        active_items: List of active listing items with prices
    
    Returns:
        float: 10th percentile price if sufficient data, None otherwise
    
    Example:
        If active listings range from $3.50 to $12.99, the 10th percentile
        might be $3.85, suggesting quick_sale shouldn't be below this.
    """
    if not active_items or len(active_items) < 5:
        return None
    
    # Extract prices from active listings
    active_prices = []
    for item in active_items:
        # Handle different possible price attributes
        price = None
        if hasattr(item, 'price') and item.price:
            price = item.price
        elif hasattr(item, 'total_price') and item.total_price:
            price = item.total_price
        elif hasattr(item, 'current_price') and item.current_price:
            price = item.current_price
        
        if price and price > 0:
            active_prices.append(price)
    
    if len(active_prices) < 5:
        return None
    
    # Calculate 10th percentile as market floor
    floor_price = np.percentile(active_prices, 10)
    
    print(f"[FMV] Active market floor (10th percentile): ${floor_price:.2f} "
          f"from {len(active_prices)} active listings")
    
    return floor_price


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
    price_weight_item_tuples = []
    
    for item in items:
        if item.total_price is None or item.total_price <= 0:
            continue
            
        # Calculate volume weight based on auction activity
        weight = calculate_volume_weight(item)
        price_weight_item_tuples.append((item.total_price, weight, item))
    
    if len(price_weight_item_tuples) < MIN_ITEMS_FOR_FMV:
        return FMVResult(count=len(price_weight_item_tuples))

    # Extract prices, weights, and items
    all_prices = np.array([t[0] for t in price_weight_item_tuples])
    all_weights = np.array([t[1] for t in price_weight_item_tuples])
    all_items = [t[2] for t in price_weight_item_tuples]
    
    # Filter outliers using IQR method with smart classification (need at least 4 data points)
    if len(all_prices) >= MIN_ITEMS_FOR_OUTLIER_DETECTION:
        # Calculate quartiles
        q1 = np.percentile(all_prices, 25)
        q3 = np.percentile(all_prices, 75)
        iqr = q3 - q1
        
        # Define outlier bounds (aggressive filtering focuses on core cluster)
        lower_bound = q1 - IQR_OUTLIER_MULTIPLIER * iqr
        upper_bound = q3 + IQR_OUTLIER_MULTIPLIER * iqr
        
        # Smart filtering: keep items within bounds OR representative outliers
        mask = []
        excluded_items = []
        
        for i, price in enumerate(all_prices):
            within_bounds = lower_bound <= price <= upper_bound
            
            # If within bounds, always keep
            if within_bounds:
                mask.append(True)
            else:
                # Check if outlier is representative of the typical variant
                is_representative = is_representative_sale(all_items[i], q1, q3, iqr)
                mask.append(is_representative)
                
                if not is_representative:
                    # Log excluded outlier for debugging
                    title_preview = all_items[i].title[:60] if hasattr(all_items[i], 'title') else 'Unknown'
                    excluded_items.append((price, title_preview))
        
        # Convert mask to numpy array
        mask = np.array(mask, dtype=bool)
        
        # Apply filter
        prices = all_prices[mask]
        weights = all_weights[mask]
        
        outliers_removed = len(all_prices) - len(prices)
        print(f"[FMV] IQR bounds: ${lower_bound:.2f} - ${upper_bound:.2f} (Q1: ${q1:.2f}, Q3: ${q3:.2f})")
        print(f"[FMV] Removed {outliers_removed} non-representative outliers using smart classification")
        
        # Log details of excluded items (limit to first 3 for brevity)
        if excluded_items:
            for price, title in excluded_items[:3]:
                print(f"[FMV]   Excluded: ${price:.2f} - {title}")
            if len(excluded_items) > 3:
                print(f"[FMV]   ... and {len(excluded_items) - 3} more")
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
    
    # Calculate robust standard deviation using MAD (more resistant to outliers)
    weighted_median = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.5)
    weighted_std = calculate_robust_std(prices, weights, weighted_median)
    
    # Calculate skewness to detect asymmetric distributions
    distribution_skewness = skew(prices, axis=0)
    
    # Check for concentration FIRST (stronger signal than skewness)
    concentration_price = detect_price_concentration(prices)
    if concentration_price:
        market_value = concentration_price
        print(f"[FMV] Using price concentration: ${concentration_price:.2f}")
    elif abs(distribution_skewness) > 1.5:
        # Use weighted median instead of mean
        median_value = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.5)
        market_value = median_value
        print(f"[FMV] High skewness detected ({distribution_skewness:.2f})")
        print(f"[FMV] Using weighted median ${median_value:.2f} instead of mean ${weighted_mean:.2f}")
    else:
        market_value = weighted_mean
    
    # Define FMV ranges using volume-weighted statistics
    fmv_low = max(0, weighted_mean - weighted_std)
    fmv_high = weighted_mean + weighted_std
    
    # Volume-weighted market tiers
    quick_sale = max(0, percentile_25)      # 25th percentile - quick sale price
    # market_value assigned above based on skewness
    patient_sale = percentile_75            # 75th percentile - patient seller price
    
    # Determine confidence based on high-weight sales and price volatility
    high_weight_count = sum(1 for w in weights if w > 1.0)
    confidence_ratio = high_weight_count / len(weights)
    
    # Calculate price volatility (coefficient of variation)
    price_cv = np.std(prices) / np.mean(prices)
    
    # Base confidence on volume
    if confidence_ratio >= CONFIDENCE_HIGH_RATIO:
        base_confidence = "High"
    elif confidence_ratio >= CONFIDENCE_MEDIUM_RATIO:
        base_confidence = "Medium"
    else:
        base_confidence = "Low"
    
    # Adjust for volatility
    if price_cv > 0.5:  # High volatility
        if base_confidence == "High":
            volume_confidence = "Medium"
        elif base_confidence == "Medium":
            volume_confidence = "Low"
        else:
            volume_confidence = base_confidence
        print(f"[FMV] High volatility (CV={price_cv:.2f}) - downgrading confidence from {base_confidence} to {volume_confidence}")
    else:
        volume_confidence = base_confidence
    
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
