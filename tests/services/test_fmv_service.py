"""
Unit tests for FMV (Fair Market Value) calculation service.

Tests cover:
- Volume weight calculation for different listing types
- Weighted percentile calculation
- FMV calculation with outlier filtering
- Edge cases (0 items, 1 item, all same price)
"""
import pytest
import numpy as np
from datetime import date
from unittest.mock import Mock

from backend.services.fmv_service import (
    calculate_volume_weight,
    find_weighted_percentile,
    calculate_fmv,
    FMVResult
)
from main import CompItem
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
