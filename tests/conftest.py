"""
Test configuration and fixtures for pytest.

This module provides shared fixtures that can be used across all test files.
"""
import pytest
from typing import List
from datetime import date
from fastapi.testclient import TestClient
from unittest.mock import Mock, AsyncMock
import sys
import os

# Add parent directory to path to import modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app
from backend.models.schemas import CompItem
from backend.cache import CacheService


@pytest.fixture
def test_client():
    """
    Fixture that provides a FastAPI test client.
    
    Usage:
        def test_endpoint(test_client):
            response = test_client.get("/health")
            assert response.status_code == 200
    """
    return TestClient(app)


@pytest.fixture
def mock_cache_service():
    """
    Fixture that provides a mocked CacheService.
    
    Returns cache misses by default - tests can override specific keys.
    """
    mock = AsyncMock(spec=CacheService)
    mock.get.return_value = None  # Cache miss by default
    mock.set.return_value = True
    mock.close.return_value = None
    return mock


@pytest.fixture
def sample_comp_items() -> List[CompItem]:
    """
    Fixture that provides sample CompItem objects for testing.
    
    Returns a realistic set of card listings with varied prices and attributes.
    """
    return [
        CompItem(
            date_scraped=date.today(),
            item_id="123456789",
            title="2024 Topps Chrome Elly De La Cruz Refractor PSA 10",
            price="$125.00",
            extracted_price=125.0,
            shipping="Free",
            extracted_shipping=0.0,
            total_price=125.0,
            bids=15,
            is_auction=True,
            auction_sold=True,
            condition="New"
        ),
        CompItem(
            date_scraped=date.today(),
            item_id="123456790",
            title="2024 Topps Chrome Elly De La Cruz Base Card",
            price="$25.00",
            extracted_price=25.0,
            shipping="$3.00",
            extracted_shipping=3.0,
            total_price=28.0,
            bids=3,
            is_auction=True,
            auction_sold=True,
            condition="New"
        ),
        CompItem(
            date_scraped=date.today(),
            item_id="123456791",
            title="2024 Topps Chrome Elly De La Cruz Base Card",
            price="$22.00",
            extracted_price=22.0,
            shipping="Free",
            extracted_shipping=0.0,
            total_price=22.0,
            bids=1,
            is_auction=True,
            auction_sold=True,
            condition="New"
        ),
        CompItem(
            date_scraped=date.today(),
            item_id="123456792",
            title="2024 Topps Chrome Elly De La Cruz Gold Refractor /50",
            price="$350.00",
            extracted_price=350.0,
            shipping="Free",
            extracted_shipping=0.0,
            total_price=350.0,
            bids=25,
            is_auction=True,
            auction_sold=True,
            condition="New"
        ),
        CompItem(
            date_scraped=date.today(),
            item_id="123456793",
            title="2024 Topps Chrome Elly De La Cruz Raw Card",
            price="$18.00",
            extracted_price=18.0,
            shipping="$4.00",
            extracted_shipping=4.0,
            total_price=22.0,
            bids=0,
            is_auction=False,
            is_buy_it_now=True,
            condition="New"
        ),
    ]


@pytest.fixture
def sample_active_listings() -> List[CompItem]:
    """
    Fixture that provides sample active listing CompItem objects.
    
    Returns active (unsold) listings for testing.
    """
    return [
        CompItem(
            date_scraped=date.today(),
            item_id="v1|223456789|0",
            title="2024 Topps Chrome Elly De La Cruz Refractor",
            price="$130.00",
            extracted_price=130.0,
            shipping="Free",
            extracted_shipping=0.0,
            total_price=130.0,
            bids=5,
            is_auction=True,
            time_left="2d 5h",
            condition="New"
        ),
        CompItem(
            date_scraped=date.today(),
            item_id="v1|223456790|0",
            title="2024 Topps Chrome Elly De La Cruz Base",
            price="$29.99",
            extracted_price=29.99,
            shipping="$3.50",
            extracted_shipping=3.50,
            total_price=33.49,
            is_buy_it_now=True,
            has_best_offer=True,
            condition="New"
        ),
    ]


@pytest.fixture
def mock_scraper_sold(monkeypatch, sample_comp_items):
    """
    Fixture that mocks the sold comps scraper.
    
    Returns sample sold items without making actual API calls.
    """
    async def mock_scrape(*args, **kwargs):
        return sample_comp_items
    
    import scraper
    monkeypatch.setattr(scraper, "scrape_sold_comps", mock_scrape)
    return mock_scrape


@pytest.fixture
def mock_scraper_active(monkeypatch, sample_active_listings):
    """
    Fixture that mocks the active listings scraper.
    
    Returns sample active items without making actual API calls.
    """
    async def mock_scrape(*args, **kwargs):
        return sample_active_listings
    
    import scraper
    monkeypatch.setattr(scraper, "scrape_active_listings_ebay_api", mock_scrape)
    return mock_scrape


@pytest.fixture
def mock_ebay_client(monkeypatch):
    """
    Fixture that mocks the eBay Browse API client.
    
    Prevents actual API calls during tests.
    """
    mock_client = Mock()
    mock_client.get_access_token = AsyncMock(return_value="mock_token")
    mock_client.search_items = AsyncMock(return_value={
        "total": 100,
        "itemSummaries": [
            {
                "itemId": "v1|123456789|0",
                "title": "Test Card",
                "price": {"value": "25.00", "currency": "USD"},
                "itemWebUrl": "https://ebay.com/itm/123456789"
            }
        ]
    })
    
    import ebay_browse_client
    monkeypatch.setattr(ebay_browse_client, "EbayBrowseClient", lambda *args, **kwargs: mock_client)
    return mock_client


@pytest.fixture(autouse=True)
def reset_cache_service():
    """
    Fixture that resets the cache service state between tests.
    
    This runs automatically before each test.
    """
    # Reset any global cache state here if needed
    yield
    # Cleanup after test


@pytest.fixture
def sample_prices():
    """
    Fixture providing simple price lists for mathematical testing.
    """
    return {
        "simple": [10.0, 20.0, 30.0, 40.0, 50.0],
        "with_outliers": [5.0, 10.0, 15.0, 20.0, 25.0, 100.0],
        "single": [25.0],
        "empty": [],
    }
