"""
eBay Finding API Client
Fetches sold/completed listings via the eBay Finding API (findCompletedItems).
Documentation: https://developer.ebay.com/Devzone/finding/Concepts/FindingAPIGuide.html

This is a stepping stone until Marketplace Insights API access is granted.
The Finding API uses App ID authentication (no OAuth required).
"""
import os
from datetime import datetime, date
from typing import Optional, Dict, List
from dotenv import load_dotenv
import httpx
import logging

load_dotenv()
logger = logging.getLogger(__name__)


class eBayFindingClient:
    """
    eBay Finding API client for searching completed/sold listings.

    Uses SECURITY-APPNAME (App ID) authentication — no OAuth token required.
    Supports findCompletedItems with JSON response format.
    """

    def __init__(self):
        self.app_id = os.getenv('EBAY_APP_ID')
        self.environment = os.getenv('EBAY_ENVIRONMENT', 'production')

        if not self.app_id:
            raise ValueError(
                "EBAY_APP_ID not found. Please set it in .env"
            )

        if self.environment == 'production':
            self.base_url = "https://svcs.ebay.com/services/search/FindingService/v1"
        else:
            self.base_url = "https://svcs.sandbox.ebay.com/services/search/FindingService/v1"

        logger.info(f"[Finding API] Initialized in {self.environment} mode")

    async def find_completed_items(
        self,
        query: str,
        entries_per_page: int = 100,
        page_number: int = 1,
        sort_order: str = "BestMatch",
        item_filters: Optional[List[Dict[str, str]]] = None,
        category_id: Optional[str] = None,
    ) -> Dict:
        """
        Search completed/sold eBay listings.

        API Operation: findCompletedItems
        Docs: https://developer.ebay.com/Devzone/finding/CallRef/findCompletedItems.html

        Args:
            query: Search keywords
            entries_per_page: Results per page (max 100)
            page_number: Page number (1-100)
            sort_order: BestMatch, EndTimeSoonest, PricePlusShippingLowest, etc.
            item_filters: List of filter dicts, e.g. [{"name": "SoldItemsOnly", "value": "true"}]
            category_id: Optional eBay category ID

        Returns:
            Dict with findCompletedItemsResponse
        """
        params = {
            'OPERATION-NAME': 'findCompletedItems',
            'SERVICE-VERSION': '1.13.0',
            'SECURITY-APPNAME': self.app_id,
            'RESPONSE-DATA-FORMAT': 'JSON',
            'REST-PAYLOAD': '',
            'keywords': query,
            'paginationInput.entriesPerPage': str(min(entries_per_page, 100)),
            'paginationInput.pageNumber': str(page_number),
            'sortOrder': sort_order,
        }

        if category_id:
            params['categoryId'] = category_id

        # Build item filters
        filters = item_filters or []

        # Always include SoldItemsOnly unless caller explicitly provides it
        has_sold_filter = any(f.get('name') == 'SoldItemsOnly' for f in filters)
        if not has_sold_filter:
            filters.append({'name': 'SoldItemsOnly', 'value': 'true'})

        for i, f in enumerate(filters):
            params[f'itemFilter({i}).name'] = f['name']
            if 'values' in f:
                for j, v in enumerate(f['values']):
                    params[f'itemFilter({i}).value({j})'] = v
            else:
                params[f'itemFilter({i}).value'] = f.get('value', '')

        try:
            logger.info(
                f"[Finding API] findCompletedItems: '{query}' "
                f"(page {page_number}, {entries_per_page}/page, sort={sort_order})"
            )

            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()

            data = response.json()

            # Navigate the response structure
            wrapper = data.get('findCompletedItemsResponse', [{}])
            if isinstance(wrapper, list) and len(wrapper) > 0:
                result = wrapper[0]
            else:
                result = wrapper

            # Check for API errors
            ack = result.get('ack', [None])
            ack_value = ack[0] if isinstance(ack, list) else ack
            if ack_value == 'Failure':
                error_msg = result.get('errorMessage', [{}])
                if isinstance(error_msg, list) and error_msg:
                    error_msg = error_msg[0]
                errors = error_msg.get('error', [])
                error_text = '; '.join(
                    e.get('message', ['Unknown'])[0]
                    if isinstance(e.get('message'), list)
                    else str(e.get('message', 'Unknown'))
                    for e in errors
                )
                logger.error(f"[Finding API] API error: {error_text}")
                raise RuntimeError(f"eBay Finding API error: {error_text}")

            # Extract pagination info
            pagination = result.get('paginationOutput', [{}])
            if isinstance(pagination, list) and len(pagination) > 0:
                pagination = pagination[0]

            total_entries = int(_extract(pagination, 'totalEntries', '0'))
            total_pages = int(_extract(pagination, 'totalPages', '0'))

            # Extract search results
            search_result = result.get('searchResult', [{}])
            if isinstance(search_result, list) and len(search_result) > 0:
                search_result = search_result[0]

            items = search_result.get('item', [])
            result_count = int(_extract(search_result, '@count', str(len(items))))

            logger.info(
                f"[Finding API] Got {result_count} items on page {page_number} "
                f"(total: {total_entries}, pages: {total_pages})"
            )

            return {
                'items': items,
                'total_entries': total_entries,
                'total_pages': total_pages,
                'page_number': page_number,
                'count': result_count,
            }

        except httpx.HTTPStatusError as e:
            logger.error(f"[Finding API] HTTP error: {e}")
            if e.response is not None:
                logger.error(f"[Finding API] Response: {e.response.text[:500]}")
            raise
        except httpx.RequestError as e:
            logger.error(f"[Finding API] Request failed: {e}")
            raise


def _extract(obj: dict, key: str, default: str = '') -> str:
    """
    Extract a value from eBay Finding API's wrapped JSON format.

    The Finding API wraps all values in single-element lists:
        {"totalEntries": ["42"]}
    This helper unwraps them.
    """
    val = obj.get(key, default)
    if isinstance(val, list):
        return val[0] if val else default
    return str(val)


def normalize_finding_item(item: Dict) -> Optional[Dict]:
    """
    Convert an eBay Finding API item to Kuya Comps internal format.

    Maps findCompletedItems response fields to the same dict structure
    produced by SearchAPI scraper and normalize_ebay_browse_item(),
    ensuring downstream compatibility with CompItem, FMV service, and frontend.

    Args:
        item: Single item from findCompletedItemsResponse.searchResult.item

    Returns:
        Normalized dict compatible with CompItem, or None if item should be skipped
    """
    item_id = _extract(item, 'itemId')
    if not item_id:
        logger.error("[Finding API] Item missing itemId, skipping")
        return None

    title = _extract(item, 'title')

    # --- Selling status ---
    selling_status = item.get('sellingStatus', [{}])
    if isinstance(selling_status, list) and selling_status:
        selling_status = selling_status[0]

    selling_state = _extract(selling_status, 'sellingState')
    if selling_state != 'EndedWithSales':
        return None  # Skip unsold items

    # Price
    current_price = selling_status.get('currentPrice', [{}])
    if isinstance(current_price, list) and current_price:
        current_price = current_price[0]
    extracted_price = 0.0
    try:
        extracted_price = float(current_price.get('__value__', '0'))
    except (ValueError, TypeError):
        logger.warning(f"[Finding API] Could not parse price for item {item_id}")

    currency = current_price.get('@currencyId', 'USD')

    # Bid count
    bid_count = int(_extract(selling_status, 'bidCount', '0'))

    # --- Shipping ---
    shipping_info = item.get('shippingInfo', [{}])
    if isinstance(shipping_info, list) and shipping_info:
        shipping_info = shipping_info[0]

    shipping_cost_obj = shipping_info.get('shippingServiceCost', [{}])
    if isinstance(shipping_cost_obj, list) and shipping_cost_obj:
        shipping_cost_obj = shipping_cost_obj[0]

    extracted_shipping = 0.0
    shipping_type = _extract(shipping_info, 'shippingType')
    try:
        extracted_shipping = float(shipping_cost_obj.get('__value__', '0'))
    except (ValueError, TypeError):
        extracted_shipping = 0.0

    shipping_free = shipping_type == 'Free' or extracted_shipping == 0
    shipping_display = 'Free' if shipping_free else f"${extracted_shipping:.2f}"

    # --- Listing info ---
    listing_info = item.get('listingInfo', [{}])
    if isinstance(listing_info, list) and listing_info:
        listing_info = listing_info[0]

    listing_type = _extract(listing_info, 'listingType')
    buy_it_now_available = _extract(listing_info, 'buyItNowAvailable', 'false') == 'true'
    best_offer_enabled = _extract(listing_info, 'bestOfferEnabled', 'false') == 'true'
    end_time_str = _extract(listing_info, 'endTime')

    is_auction = listing_type in ('Auction', 'AuctionWithBIN')
    is_buy_it_now = listing_type in ('FixedPrice', 'StoreInventory') or (
        listing_type == 'AuctionWithBIN' and buy_it_now_available
    )
    is_best_offer = best_offer_enabled

    # Build buying format string
    buying_format_parts = []
    if is_auction:
        buying_format_parts.append('Auction')
    if is_buy_it_now and not is_auction:
        buying_format_parts.append('Buy It Now')
    if is_best_offer:
        buying_format_parts.append('Best Offer')
    buying_format = ', '.join(buying_format_parts) if buying_format_parts else 'Buy It Now'

    # Parse sale date for recency weighting
    date_scraped = date.today()
    if end_time_str:
        try:
            end_dt = datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
            date_scraped = end_dt.date()
        except (ValueError, TypeError):
            pass

    # --- Condition ---
    condition_obj = item.get('condition', [{}])
    if isinstance(condition_obj, list) and condition_obj:
        condition_obj = condition_obj[0]
    condition_display = _extract(condition_obj, 'conditionDisplayName')
    condition_id = _extract(condition_obj, 'conditionId')

    # --- Images ---
    gallery_url = _extract(item, 'galleryURL')

    # --- Location ---
    country = _extract(item, 'country')

    # --- URL ---
    view_url = _extract(item, 'viewItemURL')

    # --- Top rated ---
    top_rated = _extract(item, 'topRatedListing', 'false') == 'true'

    # --- Build normalized dict ---
    total_price = extracted_price + extracted_shipping

    result = {
        'item_id': item_id,
        'title': title,
        'subtitle': None,
        'link': view_url,
        'url': view_url,
        'thumbnail': gallery_url,
        'images': [],

        # Pricing
        'price': f"${extracted_price:.2f}",
        'extracted_price': extracted_price,
        'currency': currency,
        'shipping': shipping_display,
        'extracted_shipping': extracted_shipping,
        'shipping_free': shipping_free,
        'total_price': total_price,

        # Buying format
        'buying_format': buying_format,
        'is_auction': is_auction,
        'is_buy_it_now': is_buy_it_now,
        'is_best_offer': is_best_offer,
        'has_best_offer': is_best_offer,
        'best_offer_enabled': is_best_offer,
        'auction_sold': is_auction,

        # Condition
        'condition': condition_display,
        'condition_id': condition_id,

        # Auction data
        'bids': bid_count,
        'total_bids': bid_count,
        'bid_count': bid_count,

        # Dates
        'end_time': end_time_str,
        'time_left': end_time_str,
        'date_scraped': date_scraped,

        # Metadata
        'sold': True,
        'country': country,
        'top_rated': top_rated,
        'is_in_psa_vault': False,
        'authenticity': None,
        'extensions': [],
        'seller': None,
        'watching': None,
        'extracted_watching': None,
    }

    # Validation
    if extracted_price <= 0:
        logger.warning(
            f"[Finding API] Item {item_id} has zero/invalid price: {extracted_price}"
        )

    return result


# Test function
async def test_finding_client():
    """Test the eBay Finding API client with a sample search."""
    try:
        print("=" * 60)
        print("Testing eBay Finding API Client")
        print("=" * 60)

        client = eBayFindingClient()

        print("\n[TEST] Searching for completed sales: '2024 topps chrome paul skenes'")
        results = await client.find_completed_items(
            query="2024 topps chrome paul skenes",
            entries_per_page=10,
            sort_order="BestMatch",
        )

        items = results.get('items', [])
        total = results.get('total_entries', 0)

        print(f"\n[TEST] API returned {len(items)} items (total: {total})")
        print("\n" + "=" * 60)
        print("Sample Items:")
        print("=" * 60)

        for i, item in enumerate(items[:5], 1):
            normalized = normalize_finding_item(item)
            if normalized:
                print(f"\n{i}. {normalized['title'][:70]}...")
                print(f"   Price: {normalized['price']} + {normalized['shipping']} shipping")
                print(f"   Total: ${normalized['total_price']:.2f}")
                print(f"   Format: {normalized['buying_format']}")
                print(f"   Bids: {normalized['bids']}")
                print(f"   Condition: {normalized['condition']}")
                print(f"   Sale Date: {normalized['date_scraped']}")

        print("\n" + "=" * 60)
        print("Test completed successfully!")
        print("=" * 60)
        return True

    except Exception as e:
        print(f"\nTest failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_finding_client())
