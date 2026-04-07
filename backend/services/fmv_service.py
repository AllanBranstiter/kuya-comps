# backend/services/fmv_service.py
"""
Fair Market Value (FMV) calculation service.

This module contains all logic for calculating volume-weighted FMV
and related statistics for card valuations.
"""
from dataclasses import dataclass
from math import ceil
from typing import List, Optional, Dict
import numpy as np
from scipy.stats import skew
from backend.services.price_tier_service import get_price_tier
from backend.services.analytics_score_service import (
    calculate_market_confidence,
    calculate_liquidity,
    calculate_collectibility,
    calculate_market_pressure,
    calculate_staleness_adjustment,
)
from backend.logging_config import get_logger
from backend.config import (
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
    PRICE_BIN_SIZE_BULK,
    PRICE_BIN_SIZE_LOW,
    PRICE_BIN_PCT_LOW,
    PRICE_BIN_PCT_MID,
    PRICE_BIN_PCT_GRAIL,
    MIN_CONCENTRATION_RATIO,
    MIN_SECONDARY_CLUSTER_RATIO,
    MIN_SECONDARY_CLUSTER_SIZE,
    COMPETITIVE_ZONE_IQR_MULT,
    COMPETITIVE_ZONE_MIN_MARGIN,
    MIN_COMPETITIVE_ACTIVE_COUNT,
)

logger = get_logger(__name__)


@dataclass
class ClusterResult:
    """Result of multi-cluster price detection."""
    primary_median: float           # Median of cluster nearest to overall median
    lower_median: Optional[float]   # Median of largest cluster below primary
    upper_median: Optional[float]   # Median of largest cluster above primary
    cluster_count: int
    primary_size: int
    total_prices: int
    # Internal percentiles of the primary cluster (for gravity blend)
    primary_p20: float
    primary_p25: float
    primary_p75: float
    primary_p80: float


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
        price_tier: Optional[Dict] = None,
        analytics_scores: Optional[Dict] = None,
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
        self.analytics_scores = analytics_scores
        # Internal: filtered data used in calculation (not serialized)
        self._filtered_prices = None
        self._filtered_weights = None

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
            'analytics_scores': self.analytics_scores,
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

    # Apply AI relevance score if present (0.0-1.0 multiplier)
    ai_score = getattr(item, 'ai_relevance_score', None)
    if ai_score is not None:
        final_weight = final_weight * ai_score

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


def detect_price_clusters(prices: np.ndarray) -> Optional[ClusterResult]:
    """
    Detect multiple price clusters using histogram-based merging.

    Replaces single-bin concentration detection with multi-cluster detection.
    The primary cluster's median becomes market_value; secondary clusters
    anchor quick_sale/patient_sale.

    Algorithm:
    1. Build histogram with tier-scaled bins
    2. Walk bins and merge adjacent occupied bins into clusters (gap = 1+ empty bins)
    3. Primary cluster = nearest to overall median (not largest)
    4. Secondary clusters = largest cluster on each side of primary

    Args:
        prices: Array of prices to analyze

    Returns:
        ClusterResult if a valid primary cluster is found, None otherwise
    """
    if len(prices) < 4:
        return None

    # Scale bin size by price tier using config constants
    median_price = float(np.median(prices))
    if median_price <= 10:
        bin_size = PRICE_BIN_SIZE_BULK
    elif median_price <= 100:
        bin_size = median_price * PRICE_BIN_PCT_LOW
    elif median_price <= 1000:
        bin_size = median_price * PRICE_BIN_PCT_MID
    else:
        bin_size = median_price * PRICE_BIN_PCT_GRAIL

    # Build histogram
    min_price = float(np.min(prices))
    max_price = float(np.max(prices))
    bins = np.arange(min_price, max_price + bin_size, bin_size)

    if len(bins) < 2:
        return None

    counts, edges = np.histogram(prices, bins=bins)

    # Walk bins and merge adjacent occupied bins into clusters
    # A cluster boundary occurs at 1+ empty bins
    clusters = []  # list of (start_edge, end_edge)
    in_cluster = False
    cluster_start = None

    for i, count in enumerate(counts):
        if count > 0:
            if not in_cluster:
                cluster_start = edges[i]
                in_cluster = True
            cluster_end = edges[i + 1]
        else:
            if in_cluster:
                clusters.append((cluster_start, cluster_end))
                in_cluster = False

    # Close final cluster if still open
    if in_cluster:
        clusters.append((cluster_start, cluster_end))

    if not clusters:
        return None

    # For each cluster, collect actual prices and compute median
    cluster_data = []  # list of (median, prices_in_cluster, start, end)
    for start, end in clusters:
        mask = (prices >= start) & (prices <= end)
        cluster_prices = prices[mask]
        if len(cluster_prices) > 0:
            cluster_data.append((
                float(np.median(cluster_prices)),
                cluster_prices,
                start,
                end,
            ))

    if not cluster_data:
        return None

    # Primary cluster = nearest to overall median (not largest by count)
    overall_median = float(np.median(prices))
    primary_idx = min(range(len(cluster_data)),
                      key=lambda i: abs(cluster_data[i][0] - overall_median))
    primary_median, primary_prices, _, _ = cluster_data[primary_idx]
    primary_size = len(primary_prices)

    # Validate: primary must contain >= ceil(total * MIN_CONCENTRATION_RATIO)
    total = len(prices)
    if primary_size < ceil(total * MIN_CONCENTRATION_RATIO):
        return None

    # Find secondary clusters on each side of primary
    min_secondary = max(MIN_SECONDARY_CLUSTER_SIZE, ceil(total * MIN_SECONDARY_CLUSTER_RATIO))

    lower_median = None
    lower_clusters = [
        (cd[0], cd[1]) for j, cd in enumerate(cluster_data)
        if j != primary_idx and cd[0] < primary_median
    ]
    if lower_clusters:
        # Largest cluster below primary
        best = max(lower_clusters, key=lambda x: len(x[1]))
        if len(best[1]) >= min_secondary:
            lower_median = best[0]

    upper_median = None
    upper_clusters = [
        (cd[0], cd[1]) for j, cd in enumerate(cluster_data)
        if j != primary_idx and cd[0] > primary_median
    ]
    if upper_clusters:
        # Largest cluster above primary
        best = max(upper_clusters, key=lambda x: len(x[1]))
        if len(best[1]) >= min_secondary:
            upper_median = best[0]

    cluster_count = len(cluster_data)

    # Compute internal percentiles of the primary cluster (for gravity blend)
    primary_p20 = float(np.percentile(primary_prices, 20))
    primary_p25 = float(np.percentile(primary_prices, 25))
    primary_p75 = float(np.percentile(primary_prices, 75))
    primary_p80 = float(np.percentile(primary_prices, 80))

    logger.info(
        f"Price clusters detected: {cluster_count} clusters, "
        f"primary ${primary_median:.2f} ({primary_size}/{total} prices), "
        f"lower={'${:.2f}'.format(lower_median) if lower_median else 'None'}, "
        f"upper={'${:.2f}'.format(upper_median) if upper_median else 'None'}"
    )

    return ClusterResult(
        primary_median=primary_median,
        lower_median=lower_median,
        upper_median=upper_median,
        cluster_count=cluster_count,
        primary_size=primary_size,
        total_prices=total,
        primary_p20=primary_p20,
        primary_p25=primary_p25,
        primary_p75=primary_p75,
        primary_p80=primary_p80,
    )


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
            logger.debug(f"Excluding rare parallel: /{parallel_number} - {item.title[:60]}")
            return False

    # Check for gem mint grades (PSA 10, BGS 10)
    if ('psa 10' in title_lower or 'bgs 10' in title_lower or
        'gem mint 10' in title_lower or 'pristine 10' in title_lower):
        logger.debug(f"Excluding gem mint 10: {item.title[:60]}")
        return False

    # If it has an auto keyword AND is an extreme outlier, it might be special
    # (like a rare auto variant vs. common auto)
    auto_keywords = ['auto', 'au ', '/au', 'autograph', 'signature', 'signed']
    has_auto = any(keyword in title_lower for keyword in auto_keywords)

    if has_auto and hasattr(item, 'total_price') and item.total_price:
        # If it's more than 3x the IQR above Q3, it's likely a special auto variant
        extreme_upper = q3 + 3 * iqr
        if item.total_price > extreme_upper:
            logger.debug(f"Excluding extreme auto outlier: ${item.total_price:.2f} - {item.title[:60]}")
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

    logger.debug(f"Robust std: ${robust_std:.2f} (MAD: ${mad:.2f})")

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
        # Prefer total_price (numeric) over price (may be a formatted string like "$1.16")
        price = None
        if hasattr(item, 'total_price') and item.total_price:
            price = item.total_price
        elif hasattr(item, 'extracted_price') and item.extracted_price:
            price = item.extracted_price
        elif hasattr(item, 'current_price') and item.current_price:
            price = item.current_price

        if price and isinstance(price, (int, float)) and price > 0:
            active_prices.append(price)

    if len(active_prices) < 5:
        return None

    # Calculate 10th percentile as market floor
    floor_price = np.percentile(active_prices, 10)

    logger.debug(f"Active market floor (10th percentile): ${floor_price:.2f} "
                 f"from {len(active_prices)} active listings")

    return floor_price


def detect_competitive_zone(
    sold_prices: np.ndarray,
    ask_prices: List[float],
    bid_center: float,
) -> Optional[Dict]:
    """
    Identify active listings in the "competitive zone" near sold prices.

    The competitive zone is the price band where willing sellers are pricing
    near recent sold comps — the strongest market signal. Active listings
    outside this zone (dreamers, different variants, inflated shipping) are
    excluded from the blend.

    Zone boundaries: sold Q1 - margin to sold Q3 + margin, where
    margin = max(IQR, bid_center * MIN_MARGIN) * IQR_MULT.

    Args:
        sold_prices: IQR-filtered sold prices (from bid_result._filtered_prices)
        ask_prices: Sorted list of all active listing total_prices
        bid_center: Bid-side market value

    Returns:
        Dict with {center, count, p10, p90, lower, upper} if enough competitive
        listings exist, None otherwise.
    """
    if sold_prices is None or len(sold_prices) < 2 or not ask_prices:
        return None

    sq1, sq3 = np.percentile(sold_prices, [25, 75])
    s_iqr = sq3 - sq1
    margin = max(s_iqr, bid_center * COMPETITIVE_ZONE_MIN_MARGIN) * COMPETITIVE_ZONE_IQR_MULT

    zone_lower = sq1 - margin
    zone_upper = sq3 + margin

    competitive = [p for p in ask_prices if zone_lower <= p <= zone_upper]

    if len(competitive) < MIN_COMPETITIVE_ACTIVE_COUNT:
        logger.debug(
            f"Competitive zone ${zone_lower:.2f}-${zone_upper:.2f}: "
            f"only {len(competitive)} active listings (need {MIN_COMPETITIVE_ACTIVE_COUNT}), skipping"
        )
        return None

    center = competitive[len(competitive) // 2]
    p10_idx = max(0, int(len(competitive) * 0.10))
    p90_idx = min(len(competitive) - 1, int(len(competitive) * 0.90))

    logger.info(
        f"Competitive zone ${zone_lower:.2f}-${zone_upper:.2f}: "
        f"{len(competitive)}/{len(ask_prices)} active listings, "
        f"center=${center:.2f}, p10=${competitive[p10_idx]:.2f}, p90=${competitive[p90_idx]:.2f}"
    )

    return {
        "center": center,
        "count": len(competitive),
        "p10": competitive[p10_idx],
        "p90": competitive[p90_idx],
        "lower": zone_lower,
        "upper": zone_upper,
    }


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
        - fmv_low/high: 20th/80th weighted percentiles (core price range)
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

    # Filter outliers using adaptive IQR method with smart classification
    if len(all_prices) >= MIN_ITEMS_FOR_OUTLIER_DETECTION:
        # Calculate quartiles
        q1 = np.percentile(all_prices, 25)
        q3 = np.percentile(all_prices, 75)
        iqr = q3 - q1

        # Adaptive IQR multiplier based on sample size and skewness
        from scipy.stats import skew as _skew
        raw_skewness = _skew(all_prices, axis=0)
        if len(all_prices) < 10:
            iqr_mult = 2.0    # Generous — preserve data when sample is thin
        elif abs(raw_skewness) > 1.5:
            iqr_mult = 1.5    # Standard — skewed distributions may have valid secondary clusters
        else:
            iqr_mult = 1.5    # Standard

        # Define outlier bounds
        lower_bound = q1 - iqr_mult * iqr
        upper_bound = q3 + iqr_mult * iqr

        # Smart filtering: keep items within bounds OR representative outliers
        mask = []
        excluded_items = []

        # Tighter bounds for relevance-based filtering
        relevance_lower = q1 - 1.0 * iqr
        relevance_upper = q3 + 1.0 * iqr

        for i, price in enumerate(all_prices):
            within_bounds = lower_bound <= price <= upper_bound

            # If within bounds, always keep
            if within_bounds:
                mask.append(True)
            else:
                # Relevance-aware: low-relevance items outside 1.0x IQR are removed
                # regardless of title check (catches wrong-variant items with clean titles)
                ai_score = getattr(all_items[i], 'ai_relevance_score', None)
                if ai_score is not None and ai_score < 0.3 and not (relevance_lower <= price <= relevance_upper):
                    mask.append(False)
                    title_preview = all_items[i].title[:60] if hasattr(all_items[i], 'title') else 'Unknown'
                    excluded_items.append((price, title_preview))
                else:
                    # Check if outlier is representative of the typical variant
                    is_representative = is_representative_sale(all_items[i], q1, q3, iqr)
                    mask.append(is_representative)

                    if not is_representative:
                        title_preview = all_items[i].title[:60] if hasattr(all_items[i], 'title') else 'Unknown'
                        excluded_items.append((price, title_preview))

        # Convert mask to numpy array
        mask = np.array(mask, dtype=bool)

        # Apply filter
        prices = all_prices[mask]
        weights = all_weights[mask]

        outliers_removed = len(all_prices) - len(prices)
        logger.debug(f"IQR bounds: ${lower_bound:.2f} - ${upper_bound:.2f} (Q1: ${q1:.2f}, Q3: ${q3:.2f}, mult: {iqr_mult}x)")
        logger.info(f"Removed {outliers_removed} non-representative outliers using smart classification")

        # Log details of excluded items (limit to first 3 for brevity)
        if excluded_items:
            for price, title in excluded_items[:3]:
                logger.debug(f"  Excluded: ${price:.2f} - {title}")
            if len(excluded_items) > 3:
                logger.debug(f"  ... and {len(excluded_items) - 3} more")
    else:
        # Not enough data for outlier detection
        prices = all_prices
        weights = all_weights
        logger.debug(f"Skipping outlier detection (need {MIN_ITEMS_FOR_OUTLIER_DETECTION}+ items, have {len(all_prices)})")

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
    percentile_20 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.20)
    percentile_25 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.25)
    percentile_75 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.75)
    percentile_80 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.80)

    # Weighted median for skewness-based market value selection
    weighted_median = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.5)

    # Calculate skewness to detect asymmetric distributions
    distribution_skewness = skew(prices, axis=0)

    # Check for price clusters FIRST (stronger signal than skewness)
    clusters = detect_price_clusters(prices)
    if clusters:
        gravity = clusters.primary_size / clusters.total_prices

        market_value = clusters.primary_median

        # quick_sale / patient_sale: secondary clusters anchor if present, else gravity blend
        if clusters.lower_median is not None:
            quick_sale = clusters.lower_median
        else:
            quick_sale = max(0, gravity * clusters.primary_p25 + (1 - gravity) * percentile_25)

        if clusters.upper_median is not None:
            patient_sale = clusters.upper_median
        else:
            patient_sale = gravity * clusters.primary_p75 + (1 - gravity) * percentile_75

        # fmv_low / fmv_high: always gravity-blended
        fmv_low = max(0, gravity * clusters.primary_p20 + (1 - gravity) * percentile_20)
        fmv_high = gravity * clusters.primary_p80 + (1 - gravity) * percentile_80

        logger.info(f"Using cluster-based FMV (gravity={gravity:.2f}): "
                    f"MV=${market_value:.2f}, QS=${quick_sale:.2f}, PS=${patient_sale:.2f}, "
                    f"range=${fmv_low:.2f}-${fmv_high:.2f}")
    elif abs(distribution_skewness) > 1.5:
        # Use weighted median instead of mean
        market_value = weighted_median
        quick_sale = max(0, percentile_25)
        patient_sale = percentile_75
        fmv_low = max(0, percentile_20)
        fmv_high = percentile_80
        logger.debug(f"High skewness detected ({distribution_skewness:.2f})")
        logger.debug(f"Using weighted median ${weighted_median:.2f} instead of mean ${weighted_mean:.2f}")
    else:
        market_value = weighted_mean
        quick_sale = max(0, percentile_25)
        patient_sale = percentile_75
        fmv_low = max(0, percentile_20)
        fmv_high = percentile_80

    # Enforce ordering: quick_sale <= market_value <= patient_sale
    if quick_sale > market_value:
        quick_sale = market_value
    if patient_sale < market_value:
        patient_sale = market_value

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
        logger.warning(f"High volatility (CV={price_cv:.2f}) - downgrading confidence from {base_confidence} to {volume_confidence}")
    else:
        volume_confidence = base_confidence

    # Count items within FMV range
    inliers = [price for price in prices if fmv_low <= price <= fmv_high]

    logger.info(f"Volume-weighted mean: ${weighted_mean:.2f}, FMV range: ${fmv_low:.2f}-${fmv_high:.2f} (P20-P80)")
    logger.info(f"High-weight sales: {high_weight_count}/{len(weights)} ({volume_confidence} confidence)")

    # Calculate price tier based on market_value
    tier_data = get_price_tier(fmv=market_value, avg_listing_price=None)

    result = FMVResult(
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
    result._filtered_prices = prices
    result._filtered_weights = weights
    return result


def calculate_fmv_blended(sold_items: List[object], active_items: Optional[List[object]] = None) -> "FMVResult":
    """
    Blended FMV: combines bid-side (sold comps) and ask-side (active listings).

    Blend weights are determined by two axes:

      Price tier (bid_center):
        Bulk  ≤ $5       | Low  $5-$100    | Mid  $100-$1000  | Grail  > $1000

      Supply/demand ratio (active_count / sold_count):
        Oversupplied  > 2x  |  Balanced  0.5-2x  |  Scarce  < 0.5x

      Bid weight table:
                      Oversupplied (>2x)  Balanced (0.5-2x)  Scarce (<0.5x)
        Bulk   ≤$5         0.25               0.50               0.70
        Low    $5-$100     0.40               0.65               0.80
        Mid    $100-$1k    0.55               0.75               0.90
        Grail  >$1000      0.70               0.85               0.95

      Override — sellers dreaming (ask > 2x bid):
        bid_weight = max(current_weight, 0.85)  — ignore implausible asks

    Always enforces: quick_sale ≤ market_value ≤ patient_sale.
    Returns only three price values (fmv_low / fmv_high are retired to None).

    Args:
        sold_items:   List of CompItem objects from sold listings
        active_items: List of CompItem objects from active listings (may be empty)

    Returns:
        FMVResult with blended market_value and clamped quick_sale / patient_sale
    """
    # --- Bid side (sold comps) ---
    bid_result = calculate_fmv(sold_items)
    if bid_result.market_value is None:
        bid_result.fmv_low = None
        bid_result.fmv_high = None
        return bid_result

    bid_center   = bid_result.market_value
    quick_sale   = bid_result.quick_sale
    patient_sale = bid_result.patient_sale
    sold_count   = sum(1 for i in sold_items if getattr(i, 'total_price', None) and i.total_price > 0)

    # Compute sold price bounds for guardrails (from IQR-filtered prices)
    if bid_result._filtered_prices is not None and len(bid_result._filtered_prices) > 0:
        sold_price_min = float(np.min(bid_result._filtered_prices))
        sold_price_max = float(np.max(bid_result._filtered_prices))
    else:
        sold_prices_all = [i.total_price for i in sold_items if getattr(i, 'total_price', None) and i.total_price > 0]
        sold_price_min = min(sold_prices_all) if sold_prices_all else 0
        sold_price_max = max(sold_prices_all) if sold_prices_all else 0

    # --- Compute analytics scores ---
    # Market Confidence uses a relevance-filtered price array (threshold >= 0.5)
    # so CoV reflects genuine market variation, not search noise from reprints/lots/parallels.
    # FMV is unaffected — it uses the down-weighting approach as before.
    _CONFIDENCE_RELEVANCE_THRESHOLD = 0.5
    _conf_items = [
        item for item in sold_items
        if getattr(item, "total_price", None) and item.total_price > 0
        and (getattr(item, "ai_relevance_score", None) or 1.0) >= _CONFIDENCE_RELEVANCE_THRESHOLD
    ]
    if len(_conf_items) >= 2:
        _conf_prices = np.array([item.total_price for item in _conf_items], dtype=float)
        _conf_weights = np.array([calculate_volume_weight(item) for item in _conf_items], dtype=float)
        if len(_conf_items) >= 4:
            _cq1, _cq3 = np.percentile(_conf_prices, [25, 75])
            _ciqr = _cq3 - _cq1
            _cmask = (_conf_prices >= _cq1 - 1.5 * _ciqr) & (_conf_prices <= _cq3 + 1.5 * _ciqr)
            _conf_prices = _conf_prices[_cmask]
            _conf_weights = _conf_weights[_cmask]
        confidence = calculate_market_confidence(_conf_prices, _conf_weights) if len(_conf_prices) >= 2 else {"score": None, "band": "Insufficient Data", "cov": None}
    else:
        confidence = {"score": None, "band": "Insufficient Data", "cov": None}

    liquidity = calculate_liquidity(sold_items, active_items)
    collectibility_result = calculate_collectibility(
        bid_center, sold_count,
    )
    # Market pressure computed after blending (needs final market_value)

    # --- Ask side (active listings) ---
    ask_center   = None
    active_count = 0
    ask_prices   = []
    competitive_zone = None
    if active_items:
        ask_prices = sorted(
            i.total_price for i in active_items
            if getattr(i, 'total_price', None) and i.total_price > 0
        )
        active_count = len(ask_prices)
        if active_count > 0:
            ask_center = ask_prices[active_count // 2]   # median

    # --- Competitive zone detection ---
    # Identify active listings priced near the sold cluster. When both sides
    # of the market converge on the same price zone, that convergence is the
    # strongest market signal and should drive the blend.
    blend_ask_center = ask_center
    blend_active_count = active_count
    blend_ask_p10 = None
    blend_ask_p90 = None
    if ask_prices and bid_result._filtered_prices is not None:
        competitive_zone = detect_competitive_zone(
            sold_prices=bid_result._filtered_prices,
            ask_prices=ask_prices,
            bid_center=bid_center,
        )
        if competitive_zone is not None:
            blend_ask_center = competitive_zone["center"]
            blend_active_count = competitive_zone["count"]
            blend_ask_p10 = competitive_zone["p10"]
            blend_ask_p90 = competitive_zone["p90"]

    # --- Staleness adjustment (pre-blend) ---
    # Adjust bid_center for market drift before blending, using active asks
    # as a proxy for where the market has moved since the sold comps were recorded.
    # Use competitive zone center when available for a more accurate gap measurement.
    staleness_result = {
        "coefficient": 0.0, "raw_gap_pct": None,
        "pressure_bucket": None, "liq_factor": None,
        "conf_factor": None, "suppressed": False,
    }
    if blend_ask_center is not None and blend_active_count > 0:
        staleness_result = calculate_staleness_adjustment(
            bid_center=bid_center,
            ask_center=blend_ask_center,
            liquidity_score=liquidity.get("score"),
            confidence_score=confidence.get("score"),
        )
        coeff = staleness_result["coefficient"]
        if coeff != 0.0:
            original_bid_center = bid_center
            bid_center = bid_center * (1 + coeff)
            logger.info(
                f"[staleness] gap={staleness_result['raw_gap_pct']:+.1f}% "
                f"bucket={staleness_result['pressure_bucket']} "
                f"liq_factor={staleness_result['liq_factor']} "
                f"conf_factor={staleness_result['conf_factor']} "
                f"coeff={coeff:+.4f} "
                f"bid_center ${original_bid_center:.2f} → ${bid_center:.2f}"
            )
        elif staleness_result["suppressed"]:
            logger.info(
                f"[staleness] sellers-dreaming suppressed "
                f"(ask=${ask_center:.2f} > 2x bid=${bid_center:.2f})"
            )

    # --- Blend ---
    if blend_ask_center is None or blend_active_count == 0:
        market_value = bid_center
    else:
        # Price tier
        if bid_center <= 5:
            tier = "bulk"
        elif bid_center <= 100:
            tier = "low"
        elif bid_center <= 1000:
            tier = "mid"
        else:
            tier = "grail"

        # Collectibility override: high-demand cards get more sold trust
        # A $30 Blue Chip card should blend like mid-tier, not low-tier
        c_score = collectibility_result.get("score") or 0
        if c_score >= 7 and tier in ("bulk", "low"):
            original_tier = tier
            tier = "low" if tier == "bulk" else "mid"
            logger.info(f"Collectibility override: {original_tier} -> {tier} "
                        f"(collectibility={c_score})")

        # Supply/demand ratio — use competitive count when available
        # so the weight table reflects real competition, not total noise
        ratio = blend_active_count / sold_count if sold_count > 0 else 10.0
        if ratio > 2.0:
            supply = "oversupplied"
        elif ratio < 0.5:
            supply = "scarce"
        else:
            supply = "balanced"

        # Blend weight table
        weight_table = {
            "bulk":  {"oversupplied": 0.25, "balanced": 0.50, "scarce": 0.70},
            "low":   {"oversupplied": 0.40, "balanced": 0.65, "scarce": 0.80},
            "mid":   {"oversupplied": 0.55, "balanced": 0.75, "scarce": 0.90},
            "grail": {"oversupplied": 0.70, "balanced": 0.85, "scarce": 0.95},
        }
        bid_weight = weight_table[tier][supply]

        # Override: sellers dreaming — graduated ramp starting at 1.5x
        # At 1.5x: small nudge. At 2x: strong override. At 3x+: near-total ignore of asks.
        if blend_ask_center > bid_center * 1.5:
            dream_ratio = blend_ask_center / bid_center
            dream_strength = min(1.0, (dream_ratio - 1.5) / 1.5)  # 0.0 at 1.5x, 1.0 at 3x
            target_bid_weight = 0.95 if tier in ("bulk", "low") else 0.90
            bid_weight = bid_weight + (target_bid_weight - bid_weight) * dream_strength
            supply = "sellers_dreaming"

        ask_weight   = 1.0 - bid_weight
        market_value = bid_center * bid_weight + blend_ask_center * ask_weight

        # --- Blended Discount (p25 sold + p10 active) ---
        effective_ask_p10 = blend_ask_p10 if blend_ask_p10 is not None else ask_prices[max(0, int(len(ask_prices) * 0.10))]
        discount_bid_w = bid_weight
        quick_sale = (
            (quick_sale or 0) * discount_bid_w +
            effective_ask_p10 * (1.0 - discount_bid_w)
        )

        # --- Blended Premium (p75 sold + p90 active) ---
        # Use a more conservative (higher bid) weight for the ceiling so
        # dreaming sellers don't inflate the top end
        effective_ask_p90 = blend_ask_p90 if blend_ask_p90 is not None else ask_prices[min(len(ask_prices) - 1, int(len(ask_prices) * 0.90))]
        premium_bid_w = min(bid_weight + 0.10, 0.95)
        patient_sale = (
            (patient_sale or 0) * premium_bid_w +
            effective_ask_p90 * (1.0 - premium_bid_w)
        )

        zone_label = "competitive" if competitive_zone else "all-active"
        logger.info(
            f"tier={tier} supply={supply} ratio={ratio:.1f}x zone={zone_label} "
            f"bid=${bid_center:.2f} ({bid_weight:.0%}) + "
            f"ask=${blend_ask_center:.2f} ({ask_weight:.0%}) = MV=${market_value:.2f} "
            f"discount=${quick_sale:.2f} premium=${patient_sale:.2f}"
        )

    # --- Clamp: quick_sale ≤ market_value ≤ patient_sale ---
    if quick_sale is not None and patient_sale is not None:
        if quick_sale > patient_sale:
            quick_sale, patient_sale = patient_sale, quick_sale
        market_value = max(quick_sale, min(market_value, patient_sale))

    # --- Compute market pressure (needs final market_value) ---
    pressure = calculate_market_pressure(active_items, market_value)

    # --- Analytics adjustments to FMV range ---
    if quick_sale is not None and patient_sale is not None and market_value is not None:
        # 2A: Confidence widens/narrows range (quadratic — gentle at high conf, steep at low)
        conf_score = confidence.get("score") or 70
        range_multiplier = 1.0 + 0.8 * ((100 - conf_score) / 100) ** 2
        midpoint = market_value
        half_range = (patient_sale - quick_sale) / 2
        quick_sale = midpoint - half_range * range_multiplier
        patient_sale = midpoint + half_range * range_multiplier

        # 2B: Pressure — informational only, no longer shifts ceiling
        # (removed: pressure ceiling bump was compounding with blend and overshooting)

        # --- Sold-price guardrails ---
        # FMV values must stay anchored to actual transactions
        # Market value: never above max sold price
        market_value = min(market_value, sold_price_max)
        # Patient sale: never above max sold + 10% margin
        patient_sale = min(patient_sale, sold_price_max * 1.10)
        # Quick sale: never below min sold price, never $0
        quick_sale = max(quick_sale, sold_price_min)

        # --- Active-floor guardrail ---
        # If active listings are abundant, their P10 is a better floor than
        # historical min sold. Apply at 90% of floor to avoid overcorrecting.
        active_floor = get_active_market_floor(active_items)
        if active_floor is not None:
            adjusted_floor = active_floor * 0.90
            if adjusted_floor > quick_sale:
                logger.info(f"Active floor ${active_floor:.2f} (90%=${adjusted_floor:.2f}) "
                            f"raising quick_sale from ${quick_sale:.2f}")
                quick_sale = adjusted_floor

        # Re-clamp after adjustments
        if quick_sale > patient_sale:
            quick_sale, patient_sale = patient_sale, quick_sale
        market_value = max(quick_sale, min(market_value, patient_sale))

        pressure_pct = pressure.get("pressure_pct") or 0
        logger.info(
            f"confidence={conf_score} range_mult={range_multiplier:.2f} "
            f"pressure={pressure_pct:+.1f}% → QS=${quick_sale:.2f} MV=${market_value:.2f} PS=${patient_sale:.2f}"
        )

    tier_data = get_price_tier(fmv=market_value, avg_listing_price=None)

    return FMVResult(
        fmv_low=None,
        fmv_high=None,
        expected_low=quick_sale,
        expected_high=patient_sale,
        market_value=market_value,
        quick_sale=quick_sale,
        patient_sale=patient_sale,
        volume_confidence=bid_result.volume_confidence,
        count=bid_result.count,
        price_tier=tier_data,
        analytics_scores={
            "confidence": confidence,
            "pressure": pressure,
            "liquidity": liquidity,
            "collectibility": collectibility_result,
            "staleness": staleness_result,
            "competitive_zone": {
                "found": competitive_zone is not None,
                "competitive_count": competitive_zone["count"] if competitive_zone else 0,
                "total_active_count": active_count,
                "center": competitive_zone["center"] if competitive_zone else None,
                "range_lower": competitive_zone["lower"] if competitive_zone else None,
                "range_upper": competitive_zone["upper"] if competitive_zone else None,
            },
        },
    )
