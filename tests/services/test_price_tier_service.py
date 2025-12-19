"""
Unit tests for Price Tier Service.

Tests cover:
- Tier determination based on FMV
- Tier determination based on average listing price
- Edge cases (None values, zero prices, boundary values)
- Tier metadata accuracy (emoji, color, name, range)
"""
import pytest
from backend.services.price_tier_service import get_price_tier


class TestGetPriceTier:
    """Test price tier determination logic."""
    
    def test_tier_1_under_100_with_fmv(self):
        """FMV under $100 should return tier_1."""
        result = get_price_tier(fmv=50.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_1'
        assert result['tier_emoji'] == '🟢'
        assert result['tier_name'] == 'Under $100'
        assert result['tier_range'] == 'Under $100'
        assert result['tier_color'] == '#34c759'
        assert result['price_used'] == 50.0
        assert result['price_source'] == 'fmv'
    
    def test_tier_2_100_to_499_with_fmv(self):
        """FMV between $100-$499 should return tier_2."""
        result = get_price_tier(fmv=250.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_2'
        assert result['tier_emoji'] == '🔵'
        assert result['tier_name'] == '$100-$499'
        assert result['tier_range'] == '$100-$499'
        assert result['tier_color'] == '#007aff'
        assert result['price_used'] == 250.0
        assert result['price_source'] == 'fmv'
    
    def test_tier_3_500_to_2k_with_fmv(self):
        """FMV between $500-$2K should return tier_3."""
        result = get_price_tier(fmv=1000.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_3'
        assert result['tier_emoji'] == '🟣'
        assert result['tier_name'] == '$500-$2K'
        assert result['tier_range'] == '$500-$2K'
        assert result['tier_color'] == '#5856d6'
        assert result['price_used'] == 1000.0
        assert result['price_source'] == 'fmv'
    
    def test_tier_4_2k_to_10k_with_fmv(self):
        """FMV between $2K-$10K should return tier_4."""
        result = get_price_tier(fmv=5000.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_4'
        assert result['tier_emoji'] == '🟠'
        assert result['tier_name'] == '$2K-$10K'
        assert result['tier_range'] == '$2K-$10K'
        assert result['tier_color'] == '#ff9500'
        assert result['price_used'] == 5000.0
        assert result['price_source'] == 'fmv'
    
    def test_tier_5_over_10k_with_fmv(self):
        """FMV over $10K should return tier_5."""
        result = get_price_tier(fmv=25000.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_5'
        assert result['tier_emoji'] == '🔴'
        assert result['tier_name'] == '$10K+'
        assert result['tier_range'] == '$10K+'
        assert result['tier_color'] == '#ff3b30'
        assert result['price_used'] == 25000.0
        assert result['price_source'] == 'fmv'
    
    def test_tier_boundary_100_exactly(self):
        """Exactly $100 should be tier_2."""
        result = get_price_tier(fmv=100.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_2'
        assert result['tier_name'] == '$100-$499'
    
    def test_tier_boundary_500_exactly(self):
        """Exactly $500 should be tier_3."""
        result = get_price_tier(fmv=500.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_3'
        assert result['tier_name'] == '$500-$2K'
    
    def test_tier_boundary_2000_exactly(self):
        """Exactly $2000 should be tier_4."""
        result = get_price_tier(fmv=2000.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_4'
        assert result['tier_name'] == '$2K-$10K'
    
    def test_tier_boundary_10000_exactly(self):
        """Exactly $10000 should be tier_5."""
        result = get_price_tier(fmv=10000.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_5'
        assert result['tier_name'] == '$10K+'
    
    def test_uses_avg_listing_when_no_fmv(self):
        """Should use avg_listing_price when FMV is None."""
        result = get_price_tier(fmv=None, avg_listing_price=350.0)
        
        assert result['tier_id'] == 'tier_2'
        assert result['price_used'] == 350.0
        assert result['price_source'] == 'avg_listing_price'
    
    def test_prefers_fmv_over_avg_listing(self):
        """Should prefer FMV when both values are provided."""
        result = get_price_tier(fmv=150.0, avg_listing_price=600.0)
        
        assert result['tier_id'] == 'tier_2'  # Based on FMV (150), not avg (600)
        assert result['price_used'] == 150.0
        assert result['price_source'] == 'fmv'
    
    def test_returns_none_when_both_prices_none(self):
        """Should return None tier when both prices are None."""
        result = get_price_tier(fmv=None, avg_listing_price=None)
        
        assert result is None
    
    def test_zero_price_treated_as_tier_1(self):
        """Zero price should be treated as under $100 (tier_1)."""
        result = get_price_tier(fmv=0.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_1'
        assert result['tier_name'] == 'Under $100'
    
    def test_negative_price_treated_as_tier_1(self):
        """Negative price should be treated as under $100 (tier_1)."""
        result = get_price_tier(fmv=-10.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_1'
        assert result['tier_name'] == 'Under $100'
    
    def test_very_small_price(self):
        """Very small price like $0.01 should be tier_1."""
        result = get_price_tier(fmv=0.01, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_1'
        assert result['price_used'] == 0.01
    
    def test_boundary_99_99(self):
        """$99.99 should be tier_1."""
        result = get_price_tier(fmv=99.99, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_1'
        assert result['tier_name'] == 'Under $100'
    
    def test_boundary_499_99(self):
        """$499.99 should be tier_2."""
        result = get_price_tier(fmv=499.99, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_2'
        assert result['tier_name'] == '$100-$499'
    
    def test_boundary_1999_99(self):
        """$1999.99 should be tier_3."""
        result = get_price_tier(fmv=1999.99, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_3'
        assert result['tier_name'] == '$500-$2K'
    
    def test_boundary_9999_99(self):
        """$9999.99 should be tier_4."""
        result = get_price_tier(fmv=9999.99, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_4'
        assert result['tier_name'] == '$2K-$10K'
    
    def test_very_large_price(self):
        """Very large price like $1,000,000 should be tier_5."""
        result = get_price_tier(fmv=1000000.0, avg_listing_price=None)
        
        assert result['tier_id'] == 'tier_5'
        assert result['tier_name'] == '$10K+'
    
    def test_all_tier_metadata_present(self):
        """All tiers should have complete metadata."""
        test_prices = [50.0, 250.0, 1000.0, 5000.0, 25000.0]
        
        for price in test_prices:
            result = get_price_tier(fmv=price, avg_listing_price=None)
            
            # All required fields should be present
            assert 'tier_id' in result
            assert 'tier_emoji' in result
            assert 'tier_name' in result
            assert 'tier_range' in result
            assert 'tier_color' in result
            assert 'price_used' in result
            assert 'price_source' in result
            
            # Fields should not be None or empty
            assert result['tier_id'] is not None
            assert result['tier_emoji'] is not None
            assert result['tier_name'] is not None
            assert result['tier_range'] is not None
            assert result['tier_color'] is not None
            assert result['price_used'] is not None
            assert result['price_source'] is not None
