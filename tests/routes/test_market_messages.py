"""
Integration tests for Market Messages routes.

Tests cover:
- POST /market-message endpoint
- GET /liquidity-popup/{tier_id} endpoint
- Error handling and edge cases
"""
import pytest
from unittest.mock import patch, Mock
from fastapi.testclient import TestClient

from main import app
from backend.models.schemas import MarketMessageRequest


@pytest.mark.integration
class TestMarketMessageEndpoint:
    """Integration tests for POST /market-message endpoint."""
    
    def test_market_message_with_valid_data(self, test_client):
        """Valid market data should return tier and message."""
        request_data = {
            "fmv": 150.0,
            "avg_listing_price": 165.0,
            "market_pressure": 12.5,
            "liquidity_score": 65,
            "market_confidence": 72,
            "absorption_below": 1.2,
            "absorption_above": 0.4,
            "below_fmv_count": 5,
            "above_fmv_count": 8,
            "sales_below": 6,
            "sales_above": 3
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have tier and message objects
        assert "tier" in data
        assert "message" in data
        
        # Tier should have required fields
        tier = data["tier"]
        assert "tier_id" in tier
        assert "tier_emoji" in tier
        assert "tier_name" in tier
        assert "tier_range" in tier
        assert "tier_color" in tier
        assert "price_used" in tier
        assert "price_source" in tier
        
        # Message should have required fields
        message = data["message"]
        assert "message_type" in message
        assert "title" in message
        assert "icon" in message
        assert "content" in message
        assert "advice" in message
        assert "color" in message
    
    def test_market_message_tier_1(self, test_client):
        """FMV under $100 should return tier_1."""
        request_data = {
            "fmv": 50.0,
            "avg_listing_price": None,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["tier"]["tier_id"] == "tier_1"
    
    def test_market_message_tier_2(self, test_client):
        """FMV $100-$499 should return tier_2."""
        request_data = {
            "fmv": 250.0,
            "avg_listing_price": None,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["tier"]["tier_id"] == "tier_2"
    
    def test_market_message_tier_3(self, test_client):
        """FMV $500-$2K should return tier_3."""
        request_data = {
            "fmv": 1000.0,
            "avg_listing_price": None,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["tier"]["tier_id"] == "tier_3"
    
    def test_market_message_tier_4(self, test_client):
        """FMV $2K-$10K should return tier_4."""
        request_data = {
            "fmv": 5000.0,
            "avg_listing_price": None,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["tier"]["tier_id"] == "tier_4"
    
    def test_market_message_tier_5(self, test_client):
        """FMV over $10K should return tier_5."""
        request_data = {
            "fmv": 25000.0,
            "avg_listing_price": None,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["tier"]["tier_id"] == "tier_5"
    
    def test_market_message_high_pressure_low_liquidity(self, test_client):
        """High pressure + low liquidity should trigger specific message type."""
        request_data = {
            "fmv": 150.0,
            "avg_listing_price": None,
            "market_pressure": 35.0,  # High pressure
            "liquidity_score": 40,    # Low liquidity
            "market_confidence": 60
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"]["message_type"] == "high_pressure_low_liquidity"
    
    def test_market_message_normal_market(self, test_client):
        """Normal conditions should return normal_market message."""
        request_data = {
            "fmv": 150.0,
            "avg_listing_price": None,
            "market_pressure": 10.0,  # Fair pressure
            "liquidity_score": 60,
            "market_confidence": 70
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"]["message_type"] == "normal_market"
    
    def test_market_message_uses_avg_listing_when_no_fmv(self, test_client):
        """Should use avg_listing_price when FMV is None."""
        request_data = {
            "fmv": None,
            "avg_listing_price": 350.0,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["tier"]["tier_id"] == "tier_2"
        assert data["tier"]["price_source"] == "avg_listing_price"
    
    def test_market_message_no_prices_available(self, test_client):
        """Should handle case when both prices are None."""
        request_data = {
            "fmv": None,
            "avg_listing_price": None,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return insufficient data message
        assert data["message"]["message_type"] == "no_data"
        assert data["message"]["title"] == "Insufficient Data"
    
    def test_market_message_with_optional_params(self, test_client):
        """Optional parameters should be handled correctly."""
        request_data = {
            "fmv": 150.0,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
            # Missing optional params
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert "tier" in data
        assert "message" in data
    
    def test_market_message_invalid_json(self, test_client):
        """Invalid JSON should return 422 error."""
        response = test_client.post("/market-message", json="not a dict")
        
        assert response.status_code == 422
    
    def test_market_message_missing_required_fields(self, test_client):
        """Missing required fields should return 422 error."""
        request_data = {
            "fmv": 150.0
            # Missing required fields
        }
        
        response = test_client.post("/market-message", json=request_data)
        
        assert response.status_code == 422


@pytest.mark.integration
class TestLiquidityPopupEndpoint:
    """Integration tests for GET /liquidity-popup/{tier_id} endpoint."""
    
    def test_liquidity_popup_tier_1(self, test_client):
        """Should return tier_1 liquidity content."""
        response = test_client.get("/liquidity-popup/tier_1")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "title" in data
        assert "content" in data
        assert isinstance(data["title"], str)
        assert isinstance(data["content"], str)
    
    def test_liquidity_popup_tier_2(self, test_client):
        """Should return tier_2 liquidity content."""
        response = test_client.get("/liquidity-popup/tier_2")
        
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "content" in data
    
    def test_liquidity_popup_tier_3(self, test_client):
        """Should return tier_3 liquidity content."""
        response = test_client.get("/liquidity-popup/tier_3")
        
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "content" in data
    
    def test_liquidity_popup_tier_4(self, test_client):
        """Should return tier_4 liquidity content."""
        response = test_client.get("/liquidity-popup/tier_4")
        
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "content" in data
    
    def test_liquidity_popup_tier_5(self, test_client):
        """Should return tier_5 liquidity content."""
        response = test_client.get("/liquidity-popup/tier_5")
        
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "content" in data
    
    def test_liquidity_popup_invalid_tier(self, test_client):
        """Invalid tier_id should return 400 error."""
        response = test_client.get("/liquidity-popup/tier_99")
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "Invalid tier_id" in data["detail"]
    
    def test_liquidity_popup_non_standard_format(self, test_client):
        """Non-standard tier format should return 400 error."""
        response = test_client.get("/liquidity-popup/invalid")
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
    
    def test_liquidity_popup_all_tiers_have_content(self, test_client):
        """All valid tiers should return non-empty content."""
        tiers = ["tier_1", "tier_2", "tier_3", "tier_4", "tier_5"]
        
        for tier_id in tiers:
            response = test_client.get(f"/liquidity-popup/{tier_id}")
            assert response.status_code == 200
            data = response.json()
            
            # Title should be consistent across tiers
            assert data["title"] != ""
            # Content should exist (may vary by tier)
            assert "content" in data


@pytest.mark.integration
class TestMarketMessagesIntegration:
    """Integration tests combining multiple endpoints."""
    
    def test_full_workflow(self, test_client):
        """Test complete workflow: get message then get liquidity popup."""
        # Step 1: Get market message
        message_request = {
            "fmv": 500.0,
            "avg_listing_price": None,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        
        message_response = test_client.post("/market-message", json=message_request)
        assert message_response.status_code == 200
        message_data = message_response.json()
        
        tier_id = message_data["tier"]["tier_id"]
        
        # Step 2: Get liquidity popup for same tier
        popup_response = test_client.get(f"/liquidity-popup/{tier_id}")
        assert popup_response.status_code == 200
        popup_data = popup_response.json()
        
        # Both should succeed
        assert message_data["tier"]["tier_id"] == tier_id
        assert "content" in popup_data
    
    def test_different_tiers_have_different_content(self, test_client):
        """Different price tiers should potentially have different content."""
        # Get tier_1 message
        request_tier_1 = {
            "fmv": 50.0,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        response_1 = test_client.post("/market-message", json=request_tier_1)
        
        # Get tier_5 message
        request_tier_5 = {
            "fmv": 25000.0,
            "market_pressure": 10.0,
            "liquidity_score": 60,
            "market_confidence": 70
        }
        response_5 = test_client.post("/market-message", json=request_tier_5)
        
        assert response_1.status_code == 200
        assert response_5.status_code == 200
        
        data_1 = response_1.json()
        data_5 = response_5.json()
        
        # Tiers should be different
        assert data_1["tier"]["tier_id"] == "tier_1"
        assert data_5["tier"]["tier_id"] == "tier_5"
        
        # Tier metadata should be different
        assert data_1["tier"]["tier_emoji"] != data_5["tier"]["tier_emoji"]
        assert data_1["tier"]["tier_color"] != data_5["tier"]["tier_color"]
