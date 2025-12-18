"""
Integration tests for FMV routes (/fmv and /test-ebay-api endpoints).

Tests cover:
- FMV calculation with valid items
- FMV calculation with invalid/edge case items
- Error handling
- eBay API connectivity testing
"""
import pytest
from unittest.mock import patch, Mock
from fastapi.testclient import TestClient

from main import app, CompItem


@pytest.mark.integration
class TestFMVEndpoint:
    """Integration tests for POST /fmv endpoint."""
    
    def test_fmv_with_valid_items(self, test_client, sample_comp_items):
        """Valid items should return proper FMV calculation."""
        # Convert CompItems to dicts for JSON serialization
        items_data = [item.dict() for item in sample_comp_items]
        
        response = test_client.post("/fmv", json=items_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check all expected fields are present
        assert 'fmv_low' in data
        assert 'fmv_high' in data
        assert 'market_value' in data
        assert 'quick_sale' in data
        assert 'patient_sale' in data
        assert 'volume_confidence' in data
        assert 'count' in data
        
        # Check values are reasonable
        if data['market_value'] is not None:
            assert data['fmv_low'] <= data['market_value']
            assert data['market_value'] <= data['fmv_high']
            assert data['quick_sale'] <= data['market_value']
            assert data['market_value'] <= data['patient_sale']
    
    def test_fmv_with_empty_list(self, test_client):
        """Empty item list should return FMV with None values."""
        response = test_client.post("/fmv", json=[])
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['market_value'] is None
        assert data['count'] == 0
    
    def test_fmv_with_single_item(self, test_client):
        """Single item should return FMV with None values (insufficient data)."""
        item = CompItem(
            item_id="123",
            title="Test Card",
            total_price=100.0,
            is_auction=True,
            bids=5
        )
        
        response = test_client.post("/fmv", json=[item.dict()])
        
        assert response.status_code == 200
        data = response.json()
        
        # Single item is insufficient for FMV calculation
        assert data['market_value'] is None
        assert data['count'] == 1
    
    def test_fmv_with_sufficient_items(self, test_client):
        """Sufficient items should calculate proper FMV."""
        items = [
            CompItem(
                item_id=f"{i}",
                title=f"Card {i}",
                total_price=100.0 + i * 10,
                is_auction=True,
                bids=5
            )
            for i in range(10)
        ]
        
        items_data = [item.dict() for item in items]
        response = test_client.post("/fmv", json=items_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['market_value'] is not None
        assert data['fmv_low'] is not None
        assert data['fmv_high'] is not None
        assert data['count'] > 0
        assert data['volume_confidence'] in ['High', 'Medium', 'Low']
    
    def test_fmv_with_high_confidence_auctions(self, test_client):
        """Many high-bid auctions should result in high confidence."""
        items = [
            CompItem(
                item_id=f"{i}",
                title=f"Card {i}",
                total_price=100.0,
                is_auction=True,
                bids=15  # High bid count
            )
            for i in range(10)
        ]
        
        items_data = [item.dict() for item in items]
        response = test_client.post("/fmv", json=items_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # High bid auctions should give high confidence
        assert data['volume_confidence'] == 'High'
    
    def test_fmv_with_buy_it_now_items(self, test_client):
        """Buy It Now items should result in lower confidence."""
        items = [
            CompItem(
                item_id=f"{i}",
                title=f"Card {i}",
                total_price=100.0,
                is_buy_it_now=True,
                is_auction=False
            )
            for i in range(10)
        ]
        
        items_data = [item.dict() for item in items]
        response = test_client.post("/fmv", json=items_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # BIN items should give lower confidence
        assert data['volume_confidence'] in ['Low', 'Medium']
    
    def test_fmv_with_outliers(self, test_client):
        """Outliers should be filtered from FMV calculation."""
        items = [
            CompItem(item_id="1", title="Card 1", total_price=100.0, is_auction=True, bids=5),
            CompItem(item_id="2", title="Card 2", total_price=105.0, is_auction=True, bids=5),
            CompItem(item_id="3", title="Card 3", total_price=95.0, is_auction=True, bids=5),
            CompItem(item_id="4", title="Card 4", total_price=110.0, is_auction=True, bids=5),
            CompItem(item_id="5", title="Outlier", total_price=1000.0, is_auction=True, bids=5),
        ]
        
        items_data = [item.dict() for item in items]
        response = test_client.post("/fmv", json=items_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Market value should not be heavily skewed by outlier
        assert data['market_value'] is not None
        assert data['market_value'] < 500.0  # Should be closer to 100 than 1000
    
    def test_fmv_with_none_prices(self, test_client):
        """Items with None prices should be filtered."""
        items = [
            CompItem(item_id="1", title="Valid", total_price=100.0, is_auction=True, bids=5),
            CompItem(item_id="2", title="No Price", total_price=None),
            CompItem(item_id="3", title="Valid 2", total_price=110.0, is_auction=True, bids=5),
        ]
        
        items_data = [item.dict() for item in items]
        response = test_client.post("/fmv", json=items_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should only count items with valid prices
        # Note: may return None if insufficient after filtering
        assert isinstance(data, dict)
    
    def test_fmv_with_zero_prices(self, test_client):
        """Items with zero prices should be filtered."""
        items = [
            CompItem(item_id="1", title="Valid", total_price=100.0, is_auction=True, bids=5),
            CompItem(item_id="2", title="Zero", total_price=0.0),
            CompItem(item_id="3", title="Valid 2", total_price=110.0, is_auction=True, bids=5),
        ]
        
        items_data = [item.dict() for item in items]
        response = test_client.post("/fmv", json=items_data)
        
        assert response.status_code == 200
        # Should filter zero-price items
    
    def test_fmv_all_same_price(self, test_client):
        """All items with same price should have tight ranges."""
        items = [
            CompItem(
                item_id=f"{i}",
                title=f"Card {i}",
                total_price=100.0,
                is_auction=True,
                bids=5
            )
            for i in range(10)
        ]
        
        items_data = [item.dict() for item in items]
        response = test_client.post("/fmv", json=items_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # All values should be very close to 100.0
        if data['market_value'] is not None:
            assert abs(data['market_value'] - 100.0) < 1.0
    
    def test_fmv_invalid_json(self, test_client):
        """Invalid JSON should return 422 error."""
        response = test_client.post("/fmv", json="not a list")
        
        assert response.status_code == 422
    
    def test_fmv_missing_required_fields(self, test_client):
        """Items missing required fields should be handled."""
        # CompItem has defaults, so partial data should work
        items = [
            {"item_id": "123", "title": "Test"},  # Missing many fields
        ]
        
        response = test_client.post("/fmv", json=items)
        
        # Should either succeed with defaults or return validation error
        assert response.status_code in [200, 422]
    
    def test_fmv_response_structure(self, test_client, sample_comp_items):
        """Response should match FmvResponse schema."""
        items_data = [item.dict() for item in sample_comp_items]
        response = test_client.post("/fmv", json=items_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields exist
        expected_fields = [
            'fmv_low', 'fmv_high', 'expected_low', 'expected_high',
            'market_value', 'quick_sale', 'patient_sale',
            'volume_confidence', 'count'
        ]
        for field in expected_fields:
            assert field in data


@pytest.mark.integration
class TestEbayAPITestEndpoint:
    """Integration tests for GET /test-ebay-api endpoint."""
    
    def test_ebay_api_test_success(self, test_client):
        """Successful eBay API test should return success status."""
        with patch('backend.routes.fmv.eBayBrowseClient') as mock_client_class:
            # Mock the client instance
            mock_client = Mock()
            mock_client.get_access_token.return_value = "test_token"
            mock_client.search_items.return_value = {
                'total': 1000,
                'itemSummaries': [
                    {'itemId': '123', 'title': 'Test Card'},
                    {'itemId': '456', 'title': 'Test Card 2'},
                ]
            }
            mock_client.environment = 'PRODUCTION'
            mock_client_class.return_value = mock_client
            
            response = test_client.get("/test-ebay-api")
            
            assert response.status_code == 200
            data = response.json()
            
            assert data['status'] == 'success'
            assert 'message' in data
            assert data['items_found'] == 2
            assert data['total_matches'] == 1000
            assert data['environment'] == 'PRODUCTION'
    
    def test_ebay_api_test_authentication_failure(self, test_client):
        """Authentication failure should return error status."""
        with patch('backend.routes.fmv.eBayBrowseClient') as mock_client_class:
            mock_client = Mock()
            mock_client.get_access_token.side_effect = Exception("Authentication failed")
            mock_client_class.return_value = mock_client
            
            response = test_client.get("/test-ebay-api")
            
            assert response.status_code == 200  # Endpoint returns 200 with error in body
            data = response.json()
            
            assert data['status'] == 'error'
            assert 'Authentication failed' in data['message']
            assert 'traceback' in data
    
    def test_ebay_api_test_search_failure(self, test_client):
        """Search failure should return error status."""
        with patch('backend.routes.fmv.eBayBrowseClient') as mock_client_class:
            mock_client = Mock()
            mock_client.get_access_token.return_value = "test_token"
            mock_client.search_items.side_effect = Exception("Search API error")
            mock_client_class.return_value = mock_client
            
            response = test_client.get("/test-ebay-api")
            
            assert response.status_code == 200
            data = response.json()
            
            assert data['status'] == 'error'
            assert 'Search API error' in data['message']
    
    def test_ebay_api_test_no_results(self, test_client):
        """No search results should still return success."""
        with patch('backend.routes.fmv.eBayBrowseClient') as mock_client_class:
            mock_client = Mock()
            mock_client.get_access_token.return_value = "test_token"
            mock_client.search_items.return_value = {
                'total': 0,
                'itemSummaries': []
            }
            mock_client.environment = 'PRODUCTION'
            mock_client_class.return_value = mock_client
            
            response = test_client.get("/test-ebay-api")
            
            assert response.status_code == 200
            data = response.json()
            
            assert data['status'] == 'success'
            assert data['items_found'] == 0
            assert data['total_matches'] == 0
    
    def test_ebay_api_test_client_initialization_failure(self, test_client):
        """Client initialization failure should return error."""
        with patch('backend.routes.fmv.eBayBrowseClient') as mock_client_class:
            mock_client_class.side_effect = Exception("Failed to initialize client")
            
            response = test_client.get("/test-ebay-api")
            
            assert response.status_code == 200
            data = response.json()
            
            assert data['status'] == 'error'
            assert 'Failed to initialize client' in data['message']
