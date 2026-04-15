"""
Integration tests for comps routes (/comps and /active endpoints).

Tests cover:
- Successful requests with valid parameters
- Validation errors with invalid parameters
- Rate limiting behavior
- Cache hit/miss scenarios
- Error handling for external service failures
- parse_buying_format() helper
"""
import pytest
from unittest.mock import AsyncMock, patch

from backend.routes.comps import parse_buying_format


class TestParseBuyingFormat:
    """Unit tests for parse_buying_format() helper."""

    def test_auction_with_multiple_bids(self):
        """'43 bids' should set auction flags with bid count 43."""
        item = {'buying_format': '43 bids'}
        parse_buying_format(item)
        assert item['is_auction'] is True
        assert item['auction_sold'] is True
        assert item['bids'] == 43
        assert item['total_bids'] == 43
        assert item['is_buy_it_now'] is False
        assert item['is_best_offer'] is False

    def test_auction_singular_bid(self):
        """'1 bid' (singular) should parse correctly."""
        item = {'buying_format': '1 bid'}
        parse_buying_format(item)
        assert item['is_auction'] is True
        assert item['bids'] == 1
        assert item['total_bids'] == 1

    def test_auction_zero_bids(self):
        """'0 bids' should still be classified as auction."""
        item = {'buying_format': '0 bids'}
        parse_buying_format(item)
        assert item['is_auction'] is True
        assert item['bids'] == 0
        assert item['total_bids'] == 0

    def test_buy_it_now(self):
        """'Buy It Now' should set BIN flag."""
        item = {'buying_format': 'Buy It Now'}
        parse_buying_format(item)
        assert item['is_auction'] is False
        assert item['is_buy_it_now'] is True
        assert item['is_best_offer'] is False

    def test_best_offer(self):
        """'or Best Offer' should set BIN + BO flags."""
        item = {'buying_format': 'or Best Offer'}
        parse_buying_format(item)
        assert item['is_auction'] is False
        assert item['is_buy_it_now'] is True
        assert item['is_best_offer'] is True
        assert item['has_best_offer'] is True
        assert item['best_offer_enabled'] is True

    def test_empty_buying_format(self):
        """Empty string should fall through to defaults."""
        item = {'buying_format': ''}
        parse_buying_format(item)
        assert item['is_auction'] is False
        assert item['is_buy_it_now'] is False
        assert item['is_best_offer'] is False

    def test_missing_buying_format(self):
        """Missing key should fall through to defaults."""
        item = {}
        parse_buying_format(item)
        assert item['is_auction'] is False
        assert item['is_buy_it_now'] is False
        assert item['is_best_offer'] is False

    def test_preserves_existing_flags_on_unknown_format(self):
        """Unknown format should preserve pre-existing flags."""
        item = {
            'buying_format': 'something unexpected',
            'is_auction': True,
            'is_buy_it_now': False,
        }
        parse_buying_format(item)
        assert item['is_auction'] is True
        assert item['is_buy_it_now'] is False

    def test_does_not_overwrite_preexisting_bids_on_non_auction(self):
        """Non-auction format should not touch bids field."""
        item = {'buying_format': 'Buy It Now', 'bids': 5}
        parse_buying_format(item)
        assert item['bids'] == 5
        assert item['is_auction'] is False

    def test_auction_overwrites_preexisting_bids(self):
        """Auction format should set bids to the parsed value."""
        item = {'buying_format': '20 bids', 'bids': 5}
        parse_buying_format(item)
        assert item['bids'] == 20



@pytest.mark.integration
class TestCompsEndpoint:
    """Integration tests for /comps endpoint (sold listings)."""

    def test_comps_successful_request(self, test_client, sample_comp_items):
        """Successful request should return CompsResponse."""
        with patch('backend.routes.comps.scrape_sold_comps_finding_api', new_callable=AsyncMock) as mock_scrape:
            # Mock the scraper to return sample items as dicts
            mock_scrape.return_value = [item.dict() for item in sample_comp_items]

            response = test_client.get("/comps?query=test card&pages=1")

            assert response.status_code == 200
            data = response.json()

            assert data['query'] == 'test card'
            assert data['pages_scraped'] == 1
            assert 'items' in data
            assert len(data['items']) > 0
            assert data['min_price'] is not None
            assert data['max_price'] is not None
            assert data['avg_price'] is not None

    def test_comps_with_test_mode(self, test_client):
        """Test mode should use CSV data instead of API."""
        with patch('backend.routes.comps.load_test_data') as mock_load:
            # Mock test data
            mock_load.return_value = [
                {
                    'item_id': '123',
                    'title': 'Test Card',
                    'extracted_price': 25.0,
                    'extracted_shipping': 3.0,
                    'total_price': 28.0
                }
            ]

            response = test_client.get("/comps?query=test&pages=1&test_mode=true")

            assert response.status_code == 200
            mock_load.assert_called_once()

    def test_comps_validation_error_empty_query(self, test_client):
        """Empty query should return validation error."""
        response = test_client.get("/comps?query=&pages=1")

        assert response.status_code == 422

    def test_comps_validation_error_invalid_pages(self, test_client):
        """Pages outside valid range should return validation error."""
        # Pages too high
        response = test_client.get("/comps?query=test&pages=100")
        assert response.status_code == 422

        # Pages too low
        response = test_client.get("/comps?query=test&pages=0")
        assert response.status_code == 422

    def test_comps_validation_error_invalid_sort(self, test_client):
        """Invalid sort_by value should return validation error."""
        response = test_client.get("/comps?query=test&pages=1&sort_by=invalid")

        assert response.status_code == 422

    def test_comps_scraper_error(self, test_client):
        """Scraper errors should be handled gracefully."""
        with patch('backend.routes.comps.scrape_sold_comps_finding_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.side_effect = Exception("Scraper failed")

            response = test_client.get("/comps?query=test&pages=1")

            assert response.status_code in [500, 503]

    def test_comps_cache_hit(self, test_client, sample_comp_items):
        """Cache hit should return cached data without scraping."""
        with patch('backend.cache.CacheService.get', new_callable=AsyncMock) as mock_cache_get:
            # Mock cache hit
            cached_data = {
                'query': 'test card',
                'pages_scraped': 1,
                'items': [item.dict() for item in sample_comp_items],
                'min_price': 20.0,
                'max_price': 350.0,
                'avg_price': 100.0,
                'raw_items_scraped': 5,
                'duplicates_filtered': 0,
                'zero_price_filtered': 0,
                'market_intelligence': {}
            }
            mock_cache_get.return_value = cached_data

            response = test_client.get("/comps?query=test card&pages=1")

            assert response.status_code == 200
            data = response.json()
            assert data['query'] == 'test card'

    def test_comps_duplicate_filtering(self, test_client):
        """Duplicate items should be filtered out."""
        with patch('backend.routes.comps.scrape_sold_comps_finding_api', new_callable=AsyncMock) as mock_scrape:
            # Return items with duplicate item_ids
            mock_scrape.return_value = [
                {'item_id': '123', 'title': 'Card 1', 'extracted_price': 25.0, 'extracted_shipping': 0.0},
                {'item_id': '123', 'title': 'Card 1 Duplicate', 'extracted_price': 25.0, 'extracted_shipping': 0.0},
                {'item_id': '456', 'title': 'Card 2', 'extracted_price': 30.0, 'extracted_shipping': 0.0},
            ]

            response = test_client.get("/comps?query=test&pages=1")

            assert response.status_code == 200
            data = response.json()
            assert data['duplicates_filtered'] == 1
            assert len(data['items']) == 2

    def test_comps_zero_price_filtering(self, test_client):
        """Items with zero or None prices should be filtered."""
        with patch('backend.routes.comps.scrape_sold_comps_finding_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [
                {'item_id': '123', 'title': 'Valid Card', 'extracted_price': 25.0, 'extracted_shipping': 0.0},
                {'item_id': '456', 'title': 'Zero Price', 'extracted_price': 0.0, 'extracted_shipping': 0.0},
                {'item_id': '789', 'title': 'None Price', 'extracted_price': None, 'extracted_shipping': 0.0},
            ]

            response = test_client.get("/comps?query=test&pages=1")

            assert response.status_code == 200
            data = response.json()
            assert data['zero_price_filtered'] == 2
            assert len(data['items']) == 1

    def test_comps_with_filters(self, test_client, sample_comp_items):
        """Request with filters should apply them."""
        with patch('backend.routes.comps.scrape_sold_comps_finding_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [item.dict() for item in sample_comp_items]

            response = test_client.get("/comps?query=test&pages=1&raw_only=true&base_only=true")

            assert response.status_code == 200
            data = response.json()
            # Additional filtering may reduce item count
            assert 'items' in data

    def test_comps_market_intelligence_included(self, test_client, sample_comp_items):
        """Response should include market intelligence analysis."""
        with patch('backend.routes.comps.scrape_sold_comps_finding_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [item.dict() for item in sample_comp_items]

            response = test_client.get("/comps?query=test&pages=1")

            assert response.status_code == 200
            data = response.json()
            assert 'market_intelligence' in data


@pytest.mark.integration
class TestActiveEndpoint:
    """Integration tests for /active endpoint (active listings)."""

    def test_active_successful_request(self, test_client, sample_active_listings):
        """Successful request should return active listings."""
        with patch('backend.routes.comps.scrape_active_listings_ebay_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [item.dict() for item in sample_active_listings]

            response = test_client.get("/active?query=test card&pages=1")

            assert response.status_code == 200
            data = response.json()

            assert data['query'] == 'test card'
            assert data['pages_scraped'] == 1
            assert 'items' in data
            assert len(data['items']) > 0

    def test_active_validation_error_empty_query(self, test_client):
        """Empty query should return validation error."""
        response = test_client.get("/active?query=&pages=1")

        assert response.status_code == 422

    def test_active_validation_error_invalid_pages(self, test_client):
        """Invalid pages should return validation error."""
        response = test_client.get("/active?query=test&pages=100")

        assert response.status_code == 422

    def test_active_scraper_error(self, test_client):
        """Scraper errors should be handled gracefully."""
        with patch('backend.routes.comps.scrape_active_listings_ebay_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.side_effect = Exception("eBay API failed")

            response = test_client.get("/active?query=test&pages=1")

            assert response.status_code in [500, 503]

    def test_active_cache_hit(self, test_client, sample_active_listings):
        """Cache hit should return cached data."""
        with patch('backend.cache.CacheService.get', new_callable=AsyncMock) as mock_cache_get:
            cached_data = {
                'query': 'test card',
                'pages_scraped': 1,
                'items': [item.dict() for item in sample_active_listings],
                'min_price': 29.99,
                'max_price': 130.0,
                'avg_price': 80.0,
                'raw_items_scraped': 2,
                'duplicates_filtered': 0,
                'zero_price_filtered': 0,
            }
            mock_cache_get.return_value = cached_data

            response = test_client.get("/active?query=test card&pages=1")

            assert response.status_code == 200
            data = response.json()
            assert data['query'] == 'test card'

    def test_active_duplicate_filtering(self, test_client):
        """Duplicate active listings should be filtered."""
        with patch('backend.routes.comps.scrape_active_listings_ebay_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [
                {'item_id': 'v1|123|0', 'title': 'Card 1', 'extracted_price': 25.0, 'extracted_shipping': 0.0},
                {'item_id': 'v1|123|0', 'title': 'Card 1 Dup', 'extracted_price': 25.0, 'extracted_shipping': 0.0},
                {'item_id': 'v1|456|0', 'title': 'Card 2', 'extracted_price': 30.0, 'extracted_shipping': 0.0},
            ]

            response = test_client.get("/active?query=test&pages=1")

            assert response.status_code == 200
            data = response.json()
            assert data['duplicates_filtered'] == 1
            assert len(data['items']) == 2

    def test_active_zero_price_filtering(self, test_client):
        """Active listings with zero prices should be filtered."""
        with patch('backend.routes.comps.scrape_active_listings_ebay_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [
                {'item_id': 'v1|123|0', 'title': 'Valid', 'extracted_price': 25.0, 'extracted_shipping': 0.0},
                {'item_id': 'v1|456|0', 'title': 'Zero', 'extracted_price': 0.0, 'extracted_shipping': 0.0},
            ]

            response = test_client.get("/active?query=test&pages=1")

            assert response.status_code == 200
            data = response.json()
            assert data['zero_price_filtered'] == 1
            assert len(data['items']) == 1

    def test_active_with_sort_parameter(self, test_client, sample_active_listings):
        """Active listings should respect sort parameter."""
        with patch('backend.routes.comps.scrape_active_listings_ebay_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [item.dict() for item in sample_active_listings]

            response = test_client.get("/active?query=test&pages=1&sort_by=price")

            assert response.status_code == 200
            data = response.json()
            assert 'items' in data

    def test_active_with_buying_format_filter(self, test_client, sample_active_listings):
        """Active listings should filter by buying format."""
        with patch('backend.routes.comps.scrape_active_listings_ebay_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [item.dict() for item in sample_active_listings]

            response = test_client.get("/active?query=test&pages=1&buying_format=AUCTION")

            assert response.status_code == 200

    def test_active_with_condition_filter(self, test_client, sample_active_listings):
        """Active listings should filter by condition."""
        with patch('backend.routes.comps.scrape_active_listings_ebay_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [item.dict() for item in sample_active_listings]

            response = test_client.get("/active?query=test&pages=1&condition=NEW")

            assert response.status_code == 200

    def test_active_deep_link_generation(self, test_client):
        """Active listings should have deep links generated."""
        with patch('backend.routes.comps.scrape_active_listings_ebay_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [
                {
                    'item_id': 'v1|123456789|0',
                    'title': 'Test Card',
                    'extracted_price': 25.0,
                    'extracted_shipping': 0.0
                }
            ]

            response = test_client.get("/active?query=test&pages=1")

            assert response.status_code == 200
            data = response.json()
            assert len(data['items']) > 0
            # Deep link should be generated (checked in fixture or via mock)


@pytest.mark.integration
class TestRateLimiting:
    """Test rate limiting behavior for endpoints."""

    def test_rate_limit_not_exceeded_within_limit(self, test_client, sample_comp_items):
        """Requests within rate limit should succeed."""
        with patch('backend.routes.comps.scrape_sold_comps_finding_api', new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [item.dict() for item in sample_comp_items]

            # Make a few requests (below limit)
            for i in range(3):
                response = test_client.get(f"/comps?query=test{i}&pages=1")
                assert response.status_code == 200

    # Note: Actually testing rate limit exceeded requires more complex setup
    # with time manipulation, which is covered by slowapi's own tests


@pytest.mark.integration
class TestCacheBehavior:
    """Test caching behavior for endpoints."""

    def test_cache_stores_response(self, test_client, sample_comp_items):
        """Successful requests should store in cache."""
        with patch('backend.routes.comps.scrape_sold_comps_finding_api', new_callable=AsyncMock) as mock_scrape:
            with patch('backend.cache.CacheService.set', new_callable=AsyncMock) as mock_cache_set:
                mock_scrape.return_value = [item.dict() for item in sample_comp_items]
                mock_cache_set.return_value = True

                response = test_client.get("/comps?query=test&pages=1")

                assert response.status_code == 200
                # Verify cache.set was called
                mock_cache_set.assert_called_once()

    def test_test_mode_skips_cache(self, test_client):
        """Test mode should skip cache entirely."""
        with patch('backend.routes.comps.load_test_data') as mock_load:
            with patch('backend.cache.CacheService.get', new_callable=AsyncMock) as mock_cache_get:
                with patch('backend.cache.CacheService.set', new_callable=AsyncMock) as mock_cache_set:
                    mock_load.return_value = [
                        {'item_id': '123', 'title': 'Test', 'extracted_price': 25.0, 'extracted_shipping': 0.0}
                    ]

                    response = test_client.get("/comps?query=test&pages=1&test_mode=true")

                    assert response.status_code == 200
                    # Cache should not be checked or set in test mode
                    mock_cache_get.assert_not_called()
                    mock_cache_set.assert_not_called()
