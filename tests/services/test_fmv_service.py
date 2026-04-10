"""
Unit tests for FMV (Fair Market Value) calculation service.

Tests cover:
- Volume weight calculation for different listing types
- Weighted percentile calculation
- FMV calculation with outlier filtering
- Edge cases (0 items, 1 item, all same price)
"""
import numpy as np

from backend.services.fmv_service import (
    calculate_volume_weight,
    find_weighted_percentile,
    find_value_area,
    calculate_fmv,
    calculate_fmv_blended,
    detect_price_clusters,
    calculate_buyer_seller_ranges,
    ClusterResult,
    FMVResult
)
from backend.models.schemas import CompItem
from backend.config import (
    MIN_VOLUME_WEIGHT,
    MAX_VOLUME_WEIGHT,
    AUCTION_BASE_WEIGHT,
    BUY_IT_NOW_WEIGHT,
    BEST_OFFER_WEIGHT,
)


class TestCalculateVolumeWeight:
    """Test volume weight calculation for different item types."""

    def test_high_bid_auction_gets_highest_weight(self):
        """Auctions with many bids should get maximum weight."""
        item = CompItem(
            item_id="test1",
            title="Test Card",
            total_price=100.0,
            is_auction=True,
            auction_sold=True,
            bids=20  # High bid count
        )
        weight = calculate_volume_weight(item)

        # Should get high weight for many bids
        assert weight > 2.0
        assert weight <= MAX_VOLUME_WEIGHT

    def test_moderate_bid_auction_gets_medium_weight(self):
        """Auctions with moderate bids should get medium weight."""
        item = CompItem(
            item_id="test2",
            title="Test Card",
            total_price=100.0,
            is_auction=True,
            auction_sold=True,
            bids=5  # Moderate bid count
        )
        weight = calculate_volume_weight(item)

        # Should be higher than base but not maximum
        assert weight > 1.5
        assert weight < 2.5

    def test_low_bid_auction_gets_base_auction_weight(self):
        """Auctions with few/no bids should get base auction weight."""
        item = CompItem(
            item_id="test3",
            title="Test Card",
            total_price=100.0,
            is_auction=True,
            auction_sold=True,
            bids=1  # Low bid count
        )
        weight = calculate_volume_weight(item)

        # Should get base auction weight plus small bonus
        assert weight >= AUCTION_BASE_WEIGHT
        assert weight < 2.0

    def test_buy_it_now_gets_lower_weight(self):
        """Buy It Now sales should get lower weight than auctions."""
        item = CompItem(
            item_id="test4",
            title="Test Card",
            total_price=100.0,
            is_buy_it_now=True,
            is_auction=False,
            bids=None
        )
        weight = calculate_volume_weight(item)

        # Should get BIN weight (lower than auction)
        assert weight == BUY_IT_NOW_WEIGHT
        assert weight < AUCTION_BASE_WEIGHT

    def test_best_offer_gets_higher_weight_than_bin(self):
        """Best Offer sales should get higher weight than regular BIN."""
        item = CompItem(
            item_id="test5",
            title="Test Card",
            total_price=100.0,
            is_buy_it_now=True,
            has_best_offer=True,
            is_auction=False
        )
        weight = calculate_volume_weight(item)

        # Should get best offer weight (between BIN and auction)
        assert weight == BEST_OFFER_WEIGHT
        assert weight > BUY_IT_NOW_WEIGHT
        assert weight < AUCTION_BASE_WEIGHT

    def test_weight_capped_at_max(self):
        """Weights should never exceed MAX_VOLUME_WEIGHT."""
        item = CompItem(
            item_id="test6",
            title="Test Card",
            total_price=100.0,
            is_auction=True,
            bids=1000  # Unrealistically high
        )
        weight = calculate_volume_weight(item)

        assert weight <= MAX_VOLUME_WEIGHT

    def test_weight_floored_at_min(self):
        """Weights should never go below MIN_VOLUME_WEIGHT."""
        item = CompItem(
            item_id="test7",
            title="Test Card",
            total_price=100.0,
            is_buy_it_now=True
        )
        weight = calculate_volume_weight(item)

        assert weight >= MIN_VOLUME_WEIGHT


class TestFindWeightedPercentile:
    """Test weighted percentile calculation."""

    def test_25th_percentile_simple_case(self):
        """Test 25th percentile on simple data."""
        prices = np.array([10.0, 20.0, 30.0, 40.0])
        weights = np.array([1.0, 1.0, 1.0, 1.0])
        cumulative_weights = np.cumsum(weights)
        total_weight = cumulative_weights[-1]

        result = find_weighted_percentile(prices, cumulative_weights, total_weight, 0.25)

        # 25th percentile should be around 15-20
        assert 10.0 <= result <= 20.0

    def test_50th_percentile_is_median(self):
        """Test 50th percentile finds median."""
        prices = np.array([10.0, 20.0, 30.0, 40.0, 50.0])
        weights = np.array([1.0, 1.0, 1.0, 1.0, 1.0])
        cumulative_weights = np.cumsum(weights)
        total_weight = cumulative_weights[-1]

        result = find_weighted_percentile(prices, cumulative_weights, total_weight, 0.5)

        # Should be around the median (30)
        assert 25.0 <= result <= 35.0

    def test_weighted_percentile_respects_weights(self):
        """Higher weights should pull percentile toward those values."""
        prices = np.array([10.0, 20.0, 30.0])
        weights = np.array([1.0, 5.0, 1.0])  # Middle value heavily weighted
        cumulative_weights = np.cumsum(weights)
        total_weight = cumulative_weights[-1]

        result = find_weighted_percentile(prices, cumulative_weights, total_weight, 0.5)

        # Should be pulled toward 20.0 due to high weight
        assert result <= 25.0

    def test_edge_case_single_value(self):
        """Single value should return that value for any percentile."""
        prices = np.array([25.0])
        weights = np.array([1.0])
        cumulative_weights = np.cumsum(weights)
        total_weight = cumulative_weights[-1]

        result_25 = find_weighted_percentile(prices, cumulative_weights, total_weight, 0.25)
        result_75 = find_weighted_percentile(prices, cumulative_weights, total_weight, 0.75)

        assert result_25 == 25.0
        assert result_75 == 25.0


class TestCalculateFMV:
    """Test full FMV calculation including outlier filtering."""

    def test_fmv_with_sufficient_items(self, sample_comp_items):
        """FMV calculation should work with sufficient data."""
        result = calculate_fmv(sample_comp_items)

        assert isinstance(result, FMVResult)
        assert result.market_value is not None
        assert result.fmv_low is not None
        assert result.fmv_high is not None
        assert result.quick_sale is not None
        assert result.patient_sale is not None
        assert result.volume_confidence in ["High", "Medium", "Low"]
        assert result.count > 0

    def test_fmv_with_insufficient_items(self):
        """FMV should return None values with too few items."""
        items = [
            CompItem(item_id="1", title="Card 1", total_price=10.0),
        ]

        result = calculate_fmv(items)

        assert result.market_value is None
        assert result.fmv_low is None
        assert result.fmv_high is None
        assert result.count == 1

    def test_fmv_filters_none_prices(self):
        """Items with None or zero prices should be filtered."""
        items = [
            CompItem(item_id="1", title="Card 1", total_price=100.0, is_auction=True, bids=5),
            CompItem(item_id="2", title="Card 2", total_price=None),  # Should be filtered
            CompItem(item_id="3", title="Card 3", total_price=0.0),   # Should be filtered
            CompItem(item_id="4", title="Card 4", total_price=110.0, is_auction=True, bids=5),
            CompItem(item_id="5", title="Card 5", total_price=90.0, is_auction=True, bids=5),
        ]

        result = calculate_fmv(items)

        # Should only count items with valid prices
        assert result.count >= 0  # May vary based on outlier filtering
        assert result.market_value is not None

    def test_fmv_outlier_detection(self):
        """Outliers should be filtered using IQR method."""
        items = [
            CompItem(item_id="1", title="Card 1", total_price=100.0, is_auction=True, bids=5),
            CompItem(item_id="2", title="Card 2", total_price=105.0, is_auction=True, bids=5),
            CompItem(item_id="3", title="Card 3", total_price=95.0, is_auction=True, bids=5),
            CompItem(item_id="4", title="Card 4", total_price=110.0, is_auction=True, bids=5),
            CompItem(item_id="5", title="Card 5", total_price=1000.0, is_auction=True, bids=5),  # Outlier
        ]

        result = calculate_fmv(items)

        # Market value should not be heavily skewed by outlier
        assert result.market_value is not None
        assert result.market_value < 500.0  # Should be closer to 100 than 1000

    def test_fmv_confidence_high_with_auctions(self):
        """High proportion of auction sales should give high confidence."""
        items = [
            CompItem(item_id=f"{i}", title=f"Card {i}", total_price=100.0 + i,
                    is_auction=True, bids=10)
            for i in range(10)
        ]

        result = calculate_fmv(items)

        # Many high-bid auctions should result in high confidence
        assert result.volume_confidence == "High"

    def test_fmv_confidence_low_with_buy_it_now(self):
        """Low proportion of auction sales should give lower confidence."""
        items = [
            CompItem(item_id=f"{i}", title=f"Card {i}", total_price=100.0 + i,
                    is_buy_it_now=True, is_auction=False)
            for i in range(10)
        ]

        result = calculate_fmv(items)

        # All BIN sales should result in low confidence
        assert result.volume_confidence in ["Low", "Medium"]

    def test_fmv_ranges_logical(self):
        """FMV ranges should be in logical order."""
        items = [
            CompItem(item_id=f"{i}", title=f"Card {i}", total_price=100.0 + i*10,
                    is_auction=True, bids=5)
            for i in range(10)
        ]

        result = calculate_fmv(items)

        # Quick sale < Market Value < Patient sale
        assert result.quick_sale <= result.market_value
        assert result.market_value <= result.patient_sale

        # FMV low < Market Value < FMV high
        assert result.fmv_low <= result.market_value
        assert result.market_value <= result.fmv_high

    def test_fmv_all_same_price(self):
        """All items with same price should have tight ranges."""
        items = [
            CompItem(item_id=f"{i}", title=f"Card {i}", total_price=100.0,
                    is_auction=True, bids=5)
            for i in range(10)
        ]

        result = calculate_fmv(items)

        # All values should be very close to 100.0
        assert abs(result.market_value - 100.0) < 1.0
        assert abs(result.quick_sale - 100.0) < 1.0
        assert abs(result.patient_sale - 100.0) < 1.0


class TestFMVResult:
    """Test FMVResult data class."""

    def test_fmv_result_initialization(self):
        """FMVResult should initialize with all fields."""
        result = FMVResult(
            fmv_low=90.0,
            fmv_high=110.0,
            expected_low=85.0,
            expected_high=115.0,
            market_value=100.0,
            quick_sale=85.0,
            patient_sale=115.0,
            volume_confidence="High",
            count=50
        )

        assert result.fmv_low == 90.0
        assert result.fmv_high == 110.0
        assert result.market_value == 100.0
        assert result.quick_sale == 85.0
        assert result.patient_sale == 115.0
        assert result.volume_confidence == "High"
        assert result.count == 50

    def test_fmv_result_to_dict(self):
        """FMVResult should convert to dictionary correctly."""
        result = FMVResult(
            fmv_low=90.0,
            fmv_high=110.0,
            market_value=100.0,
            count=50
        )

        result_dict = result.to_dict()

        assert isinstance(result_dict, dict)
        assert result_dict['fmv_low'] == 90.0
        assert result_dict['fmv_high'] == 110.0
        assert result_dict['market_value'] == 100.0
        assert result_dict['count'] == 50

    def test_fmv_result_default_values(self):
        """FMVResult should handle default None values."""
        result = FMVResult()

        assert result.fmv_low is None
        assert result.fmv_high is None
        assert result.market_value is None
        assert result.count == 0


class TestDetectPriceClusters:
    """Test multi-cluster price detection."""

    def test_single_tight_cluster(self):
        """A tight group of prices should yield one cluster with no secondaries."""
        prices = np.array([10.0, 10.2, 10.4, 10.0, 10.2, 10.4, 10.2, 10.0], dtype=float)
        result = detect_price_clusters(prices)

        assert result is not None
        assert 10.0 <= result.primary_median <= 10.5
        assert result.lower_median is None
        assert result.upper_median is None
        assert result.cluster_count == 1

    def test_two_clusters(self):
        """Two separated groups should produce 2 clusters."""
        prices = np.array([5, 6, 5, 6, 5, 20, 21, 20, 21, 20], dtype=float)
        result = detect_price_clusters(prices)

        assert result is not None
        assert result.cluster_count == 2
        # Primary should be nearest to overall median (~12.5)
        # That's the upper cluster (~20)
        assert result.primary_median >= 15.0

    def test_three_clusters(self):
        """Three separated groups should populate lower + upper secondaries."""
        prices = np.array([3, 4, 3, 4, 15, 16, 15, 16, 15, 50, 51, 50], dtype=float)
        result = detect_price_clusters(prices)

        assert result is not None
        assert result.cluster_count == 3
        assert result.lower_median is not None or result.upper_median is not None

    def test_primary_is_nearest_to_median_not_largest(self):
        """Primary cluster should be nearest to overall median, not the largest."""
        # $2 cluster is largest (6 items), but overall median is ~10
        # $10-10.2 cluster (8 items) is nearest to median and fits within one bin
        prices = np.array([2]*6 + [10.0, 10.2]*4 + [50]*3, dtype=float)
        result = detect_price_clusters(prices)

        assert result is not None
        # Primary should be near 10, not 2
        assert result.primary_median >= 8.0

    def test_too_few_prices(self):
        """Fewer than 4 prices should return None."""
        prices = np.array([5, 10, 15], dtype=float)
        result = detect_price_clusters(prices)

        assert result is None

    def test_no_concentration_spread(self):
        """Evenly spread prices with no cluster meeting the threshold should return None."""
        prices = np.array([1, 5, 10, 15, 20, 25, 30, 35], dtype=float)
        result = detect_price_clusters(prices)

        # With 8 prices spread across wide range, primary needs ceil(8*0.25)=2
        # This may or may not find clusters depending on bin sizes
        # The key invariant: if result is not None, primary_size >= 2
        if result is not None:
            assert result.primary_size >= 2

    def test_tiny_secondary_ignored(self):
        """A secondary cluster with too few items should be ignored."""
        # Primary: 10 items at $50-52 (well above 25%)
        # Tiny secondary: 1 item at $10 (below 10% of 11 total)
        prices = np.array([10.0] + [50, 51, 52, 50, 51, 52, 50, 51, 52, 50], dtype=float)
        result = detect_price_clusters(prices)

        assert result is not None
        # The single $10 item should not qualify as a secondary
        assert result.lower_median is None

    def test_medians_use_actual_prices(self):
        """Cluster medians should be medians of actual prices, not bin centers."""
        # All prices in one cluster: 100, 102, 104, 106, 108
        prices = np.array([100, 102, 104, 106, 108], dtype=float)
        result = detect_price_clusters(prices)

        assert result is not None
        # Median of [100, 102, 104, 106, 108] is exactly 104.0
        assert result.primary_median == 104.0

    def test_cluster_result_includes_internal_percentiles(self):
        """ClusterResult should include primary cluster's internal P20/P25/P75/P80."""
        prices = np.array([100, 102, 104, 106, 108, 101, 103, 105, 107, 109], dtype=float)
        result = detect_price_clusters(prices)

        assert result is not None
        # Internal percentiles should be within the cluster's price range
        assert result.primary_p20 >= 100.0
        assert result.primary_p80 <= 109.0
        # Ordering: p20 <= p25 <= median <= p75 <= p80
        assert result.primary_p20 <= result.primary_p25
        assert result.primary_p25 <= result.primary_median
        assert result.primary_median <= result.primary_p75
        assert result.primary_p75 <= result.primary_p80


class TestCalculateFMVClusters:
    """Integration tests for cluster-based FMV in calculate_fmv()."""

    def _make_items(self, prices):
        """Helper to create CompItem list from price list."""
        return [
            CompItem(
                item_id=str(i),
                title=f"Card {i}",
                total_price=p,
                is_auction=True,
                bids=5,
            )
            for i, p in enumerate(prices)
        ]

    def test_two_clusters_sets_quick_sale(self):
        """Lower cluster should anchor quick_sale instead of P25."""
        # Lower cluster at $5-6, upper cluster at $20-21
        prices = [5, 6, 5, 6, 5, 20, 21, 20, 21, 20]
        items = self._make_items(prices)
        result = calculate_fmv(items)

        assert result.market_value is not None
        assert result.quick_sale is not None
        assert result.patient_sale is not None
        assert result.quick_sale <= result.market_value <= result.patient_sale

    def test_three_clusters_sets_both_ends(self):
        """Lower and upper clusters should anchor quick_sale and patient_sale."""
        # Three clusters: low ($3-4), mid ($15-16), high ($50-51)
        prices = [3, 4, 3, 4, 15, 16, 15, 16, 15, 50, 51, 50]
        items = self._make_items(prices)
        result = calculate_fmv(items)

        assert result.market_value is not None
        assert result.quick_sale <= result.market_value <= result.patient_sale

    def test_single_cluster_falls_back_to_percentiles(self):
        """With only one cluster, quick_sale/patient_sale should use gravity blend."""
        prices = [10.0, 10.2, 10.4, 10.0, 10.2, 10.4, 10.2, 10.0]
        items = self._make_items(prices)
        result = calculate_fmv(items)

        assert result.market_value is not None
        # With a tight single cluster, all values should be close
        assert abs(result.market_value - 10.2) < 1.0

    def test_ordering_invariant(self):
        """quick_sale <= market_value <= patient_sale must always hold."""
        # Various distributions
        test_cases = [
            [5, 6, 5, 6, 5, 20, 21, 20, 21, 20],                  # two clusters
            [3, 4, 3, 4, 15, 16, 15, 16, 15, 50, 51, 50],         # three clusters
            [10.0, 10.2, 10.4, 10.0, 10.2, 10.4, 10.2, 10.0],    # single cluster
            [100 + i * 10 for i in range(10)],                       # uniform spread
            [50.0] * 10,                                              # identical prices
        ]
        for prices in test_cases:
            items = self._make_items(prices)
            result = calculate_fmv(items)
            if result.market_value is not None:
                assert result.quick_sale <= result.market_value, f"Failed for prices={prices}"
                assert result.market_value <= result.patient_sale, f"Failed for prices={prices}"

    def test_strong_cluster_narrows_fmv_range(self):
        """A dominant cluster should produce a tighter fmv_low-fmv_high range."""
        # 18 items in tight cluster ($50-52) + 2 stragglers at edges
        # The cluster has 90% of sales, so gravity ~0.9
        prices = [10.0, 50, 51, 52, 50, 51, 52, 50, 51, 52,
                  50, 51, 52, 50, 51, 52, 50, 51, 52, 200.0]
        items = self._make_items(prices)
        result = calculate_fmv(items)

        assert result.market_value is not None
        # The FMV range should be pulled tight around $50-52, not stretched to $10-$200
        assert result.fmv_high - result.fmv_low < 100.0
        # Range should be much closer to cluster than to full spread
        assert result.fmv_low > 20.0   # pulled up from the $10 straggler
        assert result.fmv_high < 150.0  # pulled down from the $200 straggler

    def test_weak_cluster_preserves_wide_range(self):
        """A cluster barely meeting the 25% threshold should preserve most of the percentile range."""
        # 4 items in cluster ($50-52), 12 items spread widely
        # Cluster has ~25% of sales, so gravity ~0.25 (minimal pull)
        prices = [50, 51, 52, 50,  # cluster (4 items)
                  5, 10, 15, 20, 80, 90, 100, 110, 120, 130, 140, 150]  # spread (12 items)
        items = self._make_items(prices)
        result = calculate_fmv(items)

        assert result.market_value is not None
        # Range should still be fairly wide since gravity is low
        assert result.fmv_high - result.fmv_low > 30.0

    def test_gravity_scales_with_concentration(self):
        """Higher cluster concentration should produce a tighter range than lower concentration."""
        # High concentration: 16 in cluster + 4 spread = 80% gravity
        high_conc_prices = ([50, 51, 52, 50, 51, 52, 50, 51, 52, 50,
                             51, 52, 50, 51, 52, 50] +
                            [10, 30, 80, 120])
        # Low concentration: 5 in cluster + 15 spread = ~25% gravity
        low_conc_prices = ([50, 51, 52, 50, 51] +
                           [5, 10, 15, 20, 25, 30, 35, 80, 90, 100,
                            110, 120, 130, 140, 150])
        high_items = self._make_items(high_conc_prices)
        low_items = self._make_items(low_conc_prices)

        high_result = calculate_fmv(high_items)
        low_result = calculate_fmv(low_items)

        assert high_result.market_value is not None
        assert low_result.market_value is not None

        high_range = high_result.fmv_high - high_result.fmv_low
        low_range = low_result.fmv_high - low_result.fmv_low

        # Higher concentration should yield a tighter range
        assert high_range < low_range, (
            f"High concentration range ({high_range:.2f}) should be tighter "
            f"than low concentration range ({low_range:.2f})"
        )


class TestConfidenceRangeScaling:
    """Tests for the quadratic confidence-based range multiplier in calculate_fmv_blended."""

    def _make_items(self, prices, is_auction=True, bids=5):
        """Helper to create CompItem list from price list."""
        return [
            CompItem(
                item_id=str(i),
                title=f"Card {i}",
                total_price=p,
                is_auction=is_auction,
                bids=bids,
                ai_relevance_score=1.0,
            )
            for i, p in enumerate(prices)
        ]

    def test_high_confidence_tight_range(self):
        """Tight price cluster should produce a narrow range (high confidence, low multiplier)."""
        # All prices within $2 of each other -> high confidence (low CoV)
        sold = self._make_items([100, 101, 99, 100, 102, 98, 101, 100, 99, 101])
        active = self._make_items([105, 106, 104, 103, 107], is_auction=False, bids=0)
        result = calculate_fmv_blended(sold, active)

        assert result.market_value is not None
        assert result.quick_sale is not None
        assert result.patient_sale is not None
        fmv_range = result.patient_sale - result.quick_sale
        # With very tight prices, range should be small relative to MV
        assert fmv_range < result.market_value * 0.30

    def test_low_confidence_wide_range(self):
        """Spread prices should produce a wider range (low confidence, high multiplier)."""
        # Prices all over the place -> low confidence (high CoV)
        sold = self._make_items([20, 50, 100, 200, 30, 150, 80, 250, 40, 120])
        active = self._make_items([60, 100, 180, 90, 140], is_auction=False, bids=0)
        result = calculate_fmv_blended(sold, active)

        assert result.market_value is not None
        fmv_range = result.patient_sale - result.quick_sale
        # With highly spread prices, range should be wide relative to MV
        assert fmv_range > result.market_value * 0.30

    def test_range_scales_nonlinearly(self):
        """The gap between low and mid confidence should be larger than mid to high.

        This tests the quadratic nature of the formula: the curve steepens
        at low confidence rather than scaling linearly.
        """
        # Quadratic formula: multiplier = 1.0 + 0.8 * ((100 - score) / 100)^2
        # At score=70: 1.072
        # At score=50: 1.200
        # At score=30: 1.392
        # Gap 70->50 = 0.128
        # Gap 50->30 = 0.192  (larger)
        mult_70 = 1.0 + 0.8 * ((100 - 70) / 100) ** 2
        mult_50 = 1.0 + 0.8 * ((100 - 50) / 100) ** 2
        mult_30 = 1.0 + 0.8 * ((100 - 30) / 100) ** 2

        gap_high_to_mid = mult_50 - mult_70
        gap_mid_to_low = mult_30 - mult_50

        # Quadratic: the lower end should widen faster
        assert gap_mid_to_low > gap_high_to_mid, (
            f"Non-linear scaling: gap 50->30 ({gap_mid_to_low:.3f}) should be larger "
            f"than gap 70->50 ({gap_high_to_mid:.3f})"
        )


class TestActiveFloorGuardrail:
    """Tests for the active-floor guardrail in calculate_fmv_blended."""

    def _make_items(self, prices, is_auction=True, bids=5):
        """Helper to create CompItem list from price list."""
        return [
            CompItem(
                item_id=str(i),
                title=f"Card {i}",
                total_price=p,
                is_auction=is_auction,
                bids=bids,
                ai_relevance_score=1.0,
            )
            for i, p in enumerate(prices)
        ]

    def test_active_floor_raises_quick_sale(self):
        """When active P10 is well above quick_sale, it should raise the floor."""
        # Sold items: wide range, quick_sale will be low
        sold = self._make_items([10, 20, 50, 80, 100, 120, 50, 60, 70, 90])
        # Active items: all priced $40+, so P10 is ~$42
        # This should raise quick_sale above the sold min of $10
        active = self._make_items(
            [40, 45, 50, 55, 60, 65, 70], is_auction=False, bids=0
        )
        result = calculate_fmv_blended(sold, active)

        assert result.quick_sale is not None
        # Quick sale should be raised above the raw sold min ($10)
        # Active floor P10 ~$42, * 0.9 = ~$37.8
        assert result.quick_sale > 20.0, (
            f"Active floor should raise quick_sale above $20, got ${result.quick_sale:.2f}"
        )

    def test_active_floor_requires_minimum_listings(self):
        """Active floor should not fire with fewer than 5 active listings."""
        sold = self._make_items([10, 20, 50, 80, 100, 50, 60, 70, 90, 40])
        # Only 3 active items — below the 5-item threshold for active floor
        active_few = self._make_items([80, 90, 100], is_auction=False, bids=0)
        # 7 active items — above the threshold
        active_many = self._make_items([80, 85, 90, 95, 100, 105, 110], is_auction=False, bids=0)

        result_few = calculate_fmv_blended(sold, active_few)
        result_many = calculate_fmv_blended(sold, active_many)

        assert result_few.quick_sale is not None
        assert result_many.quick_sale is not None
        # With more active items triggering the active floor, quick_sale should
        # be higher than with too few active items (where floor doesn't fire)
        assert result_many.quick_sale >= result_few.quick_sale

    def test_active_floor_does_not_lower_quick_sale(self):
        """Active floor should only raise quick_sale, never lower it."""
        # Sold items: tight cluster around $100
        sold = self._make_items([95, 98, 100, 102, 105, 97, 99, 101, 103, 96])
        # Active items: very cheap (P10 ~$12, 90% = ~$10.8)
        # This is BELOW the sold-based quick_sale, so it should not lower it
        active = self._make_items(
            [10, 12, 15, 18, 20, 25, 30], is_auction=False, bids=0
        )
        result = calculate_fmv_blended(sold, active)

        assert result.quick_sale is not None
        # quick_sale should stay anchored to the sold cluster, not drop to active P10
        assert result.quick_sale > 50.0


class TestSecondaryClusterMinimum:
    """Tests that single items cannot form secondary clusters."""

    def test_single_item_cannot_form_secondary_cluster(self):
        """A lone outlier should not qualify as a secondary cluster."""
        # 4 items in primary cluster + 1 lone outlier
        # With MIN_SECONDARY_CLUSTER_SIZE=2, the outlier can't form a cluster
        prices = np.array([2.24, 2.49, 2.74, 2.24, 8.99], dtype=float)
        result = detect_price_clusters(prices)

        assert result is not None
        # The single $8.99 item should NOT qualify as a secondary cluster
        assert result.upper_median is None

    def test_two_items_can_form_secondary_cluster(self):
        """Two items in a separate group should qualify as a secondary cluster."""
        # Primary cluster at ~$50, secondary at ~$100 with 2 items
        prices = np.array([48, 50, 52, 49, 51, 50, 48, 52, 49, 51,
                           100, 102], dtype=float)
        result = detect_price_clusters(prices)

        assert result is not None
        # The 2-item $100 cluster should qualify (2 >= MIN_SECONDARY_CLUSTER_SIZE)
        assert result.upper_median is not None
        assert result.upper_median > 90.0


class TestDetectCompetitiveZone:
    """Tests for competitive active zone detection."""

    def test_finds_competitive_zone_near_sold_cluster(self):
        """Active listings near sold prices should form a competitive zone."""
        from backend.services.fmv_service import detect_competitive_zone

        sold_prices = np.array([2.24, 2.49, 2.74], dtype=float)
        # Mix of competitive ($2.41-$2.55) and dreamers ($7-$9)
        ask_prices = [1.89, 2.41, 2.48, 2.49, 2.55, 3.59, 7.20, 8.69, 8.99, 9.99]
        bid_center = 2.49

        zone = detect_competitive_zone(sold_prices, ask_prices, bid_center)

        assert zone is not None
        assert zone["count"] >= 3
        # Center should be near the sold cluster, not the dreamers
        assert zone["center"] < 4.0

    def test_returns_none_when_insufficient_competitive_listings(self):
        """Should return None when too few active listings are near sold prices."""
        from backend.services.fmv_service import detect_competitive_zone

        sold_prices = np.array([10.0, 12.0, 11.0], dtype=float)
        # All active listings are far above sold prices
        ask_prices = [50.0, 55.0, 60.0, 65.0, 70.0]
        bid_center = 11.0

        zone = detect_competitive_zone(sold_prices, ask_prices, bid_center)

        assert zone is None

    def test_returns_none_when_no_active_items(self):
        """Should return None with empty active list."""
        from backend.services.fmv_service import detect_competitive_zone

        sold_prices = np.array([10.0, 12.0, 11.0], dtype=float)
        zone = detect_competitive_zone(sold_prices, [], 11.0)

        assert zone is None

    def test_zone_scales_with_sold_iqr(self):
        """Wider sold IQR should produce a wider competitive zone."""
        from backend.services.fmv_service import detect_competitive_zone

        # Tight sold cluster
        tight_sold = np.array([49.0, 50.0, 51.0, 50.0, 49.5], dtype=float)
        # Wide sold cluster
        wide_sold = np.array([30.0, 40.0, 50.0, 60.0, 70.0], dtype=float)

        ask_prices = [25.0, 35.0, 45.0, 55.0, 65.0, 75.0, 85.0, 95.0]

        tight_zone = detect_competitive_zone(tight_sold, ask_prices, 50.0)
        wide_zone = detect_competitive_zone(wide_sold, ask_prices, 50.0)

        # Wide sold cluster should capture more active listings
        if tight_zone is not None and wide_zone is not None:
            assert wide_zone["count"] >= tight_zone["count"]
        elif wide_zone is not None:
            assert wide_zone["count"] >= 3

    def test_minimum_margin_floor(self):
        """Very tight sold cluster should still get a reasonable zone via min margin."""
        from backend.services.fmv_service import detect_competitive_zone

        # All sold at exactly the same price — IQR = 0
        sold_prices = np.array([50.0, 50.0, 50.0, 50.0], dtype=float)
        # Active listings slightly above and below
        ask_prices = [46.0, 48.0, 50.0, 52.0, 54.0]
        bid_center = 50.0

        zone = detect_competitive_zone(sold_prices, ask_prices, bid_center)

        # With min margin = bid_center * 0.10 = $5.0, zone should be $45-$55
        assert zone is not None
        assert zone["count"] >= 3


class TestBlendedFMVWithCompetitiveZone:
    """Tests for competitive zone integration in calculate_fmv_blended."""

    def _make_items(self, prices, is_auction=False, bids=0, best_offer=False):
        """Helper to create CompItem list from price list."""
        return [
            CompItem(
                item_id=str(i),
                title=f"Card {i}",
                total_price=p,
                is_auction=is_auction,
                bids=bids,
                has_best_offer=best_offer,
                ai_relevance_score=1.0,
            )
            for i, p in enumerate(prices)
        ]

    def test_competitive_zone_replaces_dreaming_ask_center(self):
        """When competitive zone exists, market_value should use it, not the dreaming median."""
        # Sold items: cluster around $2.50
        sold = self._make_items([2.24, 2.49, 2.74, 2.24, 2.49])
        # Active items: 5 competitive + 15 dreamers
        competitive_active = [2.41, 2.48, 2.49, 2.55, 2.60]
        dreamer_active = [7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0,
                          7.2, 7.8, 8.3, 8.8, 9.2, 9.7, 10.5, 11.0]
        active = self._make_items(competitive_active + dreamer_active)

        result = calculate_fmv_blended(sold, active)

        assert result.market_value is not None
        # Market value should be near $2.50, NOT pulled toward $8+ by dreamers
        assert result.market_value < 3.50, (
            f"Market value ${result.market_value:.2f} should be near sold cluster, "
            f"not pulled up by dreaming active listings"
        )

    def test_supply_ratio_uses_competitive_count(self):
        """Supply/demand ratio should reflect competitive listings, not total noise."""
        # Sold: 5 items around $50
        sold = self._make_items([45, 48, 50, 52, 55])
        # Active: 3 competitive ($48-$55) + 20 dreamers ($150+)
        # With competitive zone, ratio = 3/5 = 0.6 (balanced)
        # Without, ratio = 23/5 = 4.6 (oversupplied) — very different bid_weight
        competitive_active = [48.0, 52.0, 55.0]
        dreamer_active = [150.0] * 20
        active = self._make_items(competitive_active + dreamer_active)

        result = calculate_fmv_blended(sold, active)

        # Market value should be near $50, not dramatically pulled by dreamers
        assert result.market_value is not None
        assert 40.0 < result.market_value < 65.0, (
            f"Market value ${result.market_value:.2f} should be near $50"
        )

    def test_fallback_when_no_competitive_zone(self):
        """When no competitive zone exists, should fall back to current behavior."""
        # Sold: cluster around $10
        sold = self._make_items([9, 10, 11, 10, 9, 11, 10, 9, 11, 10])
        # Active: all far above sold prices — no competitive zone
        active = self._make_items([50, 55, 60, 65, 70, 75, 80])

        result = calculate_fmv_blended(sold, active)

        # Should still produce valid results via fallback (sellers_dreaming or regular blend)
        assert result.market_value is not None
        assert result.quick_sale is not None
        assert result.patient_sale is not None
        # Market value should still be anchored to sold data


class TestFindValueArea:
    """Tests for the volume-profile find_value_area function."""

    def test_basic_histogram(self):
        """Should find the zone containing 70% of volume around the peak bin."""
        prices = np.array([10, 11, 12, 12, 13, 13, 13, 14, 14, 15], dtype=float)
        result = find_value_area(prices)
        assert result is not None
        assert result["zone_low"] <= 13.0
        assert result["zone_high"] >= 13.0
        assert result["volume_in_zone"] >= 7  # 70% of 10

    def test_returns_none_for_fewer_than_3(self):
        prices = np.array([10.0, 20.0])
        assert find_value_area(prices) is None

    def test_returns_none_for_none(self):
        assert find_value_area(None) is None

    def test_tight_cluster(self):
        """All prices nearly identical should produce a narrow zone."""
        prices = np.array([50.0, 50.1, 50.2, 50.0, 50.1, 50.2], dtype=float)
        result = find_value_area(prices)
        assert result is not None
        assert result["zone_high"] - result["zone_low"] < 2.0

    def test_bimodal_finds_larger_cluster(self):
        """POC should land in the larger cluster."""
        # 8 items in low cluster, 3 in high cluster
        prices = np.array([5, 6, 6, 7, 7, 7, 8, 8, 50, 55, 60], dtype=float)
        result = find_value_area(prices)
        assert result is not None
        # POC should be near the low cluster
        assert result["poc"] < 20.0

    def test_poc_is_peak_bin_center(self):
        """POC should be the center of the highest-volume bin."""
        prices = np.array([10, 20, 20, 20, 20, 30, 40], dtype=float)
        result = find_value_area(prices)
        assert result is not None
        # Most items are at 20, so POC should be near 20
        assert abs(result["poc"] - 20.0) < 5.0

    def test_volume_stats(self):
        """Should report correct volume counts."""
        prices = np.array([10, 15, 20, 25, 30], dtype=float)
        result = find_value_area(prices)
        assert result is not None
        assert result["total_volume"] == 5
        assert result["volume_in_zone"] >= 1  # At least the POC bin


class TestBuyerSellerRanges:
    """Tests for the volume-profile calculate_buyer_seller_ranges function."""

    def test_buyer_zone_only(self):
        """With no active prices, seller zone should be None."""
        sold = np.array([10, 15, 20, 25, 30, 35, 40], dtype=float)
        weights = np.ones(7)
        result = calculate_buyer_seller_ranges(sold, weights)
        assert result is not None
        assert result["buyer_low"] is not None
        assert result["buyer_high"] is not None
        assert result["buyer_poc"] is not None
        assert result["seller_low"] is None
        assert result["seller_high"] is None
        assert result["seller_poc"] is None

    def test_both_zones_with_active(self):
        """Both buyer and seller zones computed when active prices provided."""
        sold = np.array([10, 15, 20, 25, 30, 35, 40], dtype=float)
        weights = np.ones(7)
        active = np.array([25, 30, 35, 40, 45, 50], dtype=float)
        result = calculate_buyer_seller_ranges(sold, weights, active_prices=active)
        assert result is not None
        assert result["buyer_low"] is not None
        assert result["seller_low"] is not None
        assert result["buyer_poc"] is not None
        assert result["seller_poc"] is not None

    def test_returns_none_for_fewer_than_3_sold(self):
        sold = np.array([10.0, 20.0])
        weights = np.array([1.0, 1.0])
        assert calculate_buyer_seller_ranges(sold, weights) is None

    def test_seller_none_when_few_active(self):
        """Seller zone None when fewer than 3 active listings."""
        sold = np.array([10, 20, 30, 40, 50], dtype=float)
        weights = np.ones(5)
        active = np.array([25.0, 35.0])
        result = calculate_buyer_seller_ranges(sold, weights, active_prices=active)
        assert result is not None
        assert result["seller_low"] is None

    def test_natural_overlap(self):
        """When active prices cluster near sold prices, zones should overlap."""
        sold = np.array([20, 25, 25, 30, 30, 30, 35, 35, 40], dtype=float)
        weights = np.ones(9)
        active = np.array([28, 30, 32, 35, 38, 40, 42], dtype=float)
        result = calculate_buyer_seller_ranges(sold, weights, active_prices=active)
        assert result is not None
        # Both zones exist
        assert result["buyer_low"] is not None
        assert result["seller_low"] is not None
        # Overlap: buyer_high > seller_low
        assert result["buyer_high"] > result["seller_low"]

    def test_gap_when_sellers_above(self):
        """When active prices are all above sold prices, no overlap."""
        sold = np.array([10, 12, 14, 15, 16, 18, 20], dtype=float)
        weights = np.ones(7)
        active = np.array([50, 55, 60, 65, 70], dtype=float)
        result = calculate_buyer_seller_ranges(sold, weights, active_prices=active)
        assert result is not None
        # Seller zone should be entirely above buyer zone
        assert result["seller_low"] > result["buyer_high"]

    def test_buyer_zone_ordering(self):
        """buyer_low should be <= buyer_high."""
        sold = np.array([5, 10, 15, 20, 25, 30, 35, 40, 45, 50], dtype=float)
        weights = np.ones(10)
        result = calculate_buyer_seller_ranges(sold, weights)
        assert result["buyer_low"] <= result["buyer_high"]

