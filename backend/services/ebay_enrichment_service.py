"""
eBay Browse API Enrichment Service

Enriches Finding API results with detailed item data from Browse API.
Provides item aspects (player, team, year, etc.), full descriptions, and more.
"""
import asyncio
import logging
from typing import List, Dict, Optional
from ebay_browse_client import eBayBrowseClient, normalize_ebay_browse_item

logger = logging.getLogger(__name__)


async def enrich_items_with_browse_api(
    items: List[Dict],
    max_enrich: int = 20,
    enrich_threshold: float = 0.8,
    max_concurrent: int = 3
) -> List[Dict]:
    """
    Enrich top items from Finding API with Browse API details.
    
    This function takes items from the Finding API (which provides basic data)
    and enriches them with detailed information from the Browse API including:
    - Item aspects (player, team, year, card number, manufacturer, etc.)
    - Full item descriptions
    - Detailed shipping options
    - Authenticity guarantee details
    - Additional images
    - Product information
    
    Strategy:
    1. Prioritize high-value items by sorting by price
    2. Only enrich items in the top X% of the price range (enrich_threshold)
    3. Limit total enrichment count to control API costs (max_enrich)
    4. Run enrichment requests in parallel with semaphore to control concurrency
    5. Merge Browse API data with existing Finding API data
    6. Fail gracefully - if enrichment fails for an item, keep original data
    
    Args:
        items: List of items from Finding API in normalized format
        max_enrich: Maximum number of items to enrich (default: 20)
        enrich_threshold: Only enrich items in top X% of price range (default: 0.8 = top 80%)
        max_concurrent: Maximum concurrent Browse API requests (default: 3)
    
    Returns:
        List of items with enriched data merged in. Items that fail enrichment
        are returned unchanged.
    
    Example:
        >>> items = await finding_client.find_completed_items(query="PSA 10 card")
        >>> enriched = await enrich_items_with_browse_api(items, max_enrich=10)
        >>> # enriched items now have additional Browse API data
    """
    if not items:
        logger.info("[Enrichment] No items to enrich")
        return items
    
    # Calculate price range to determine enrichment threshold
    prices = [item.get('extracted_price', 0) for item in items if item.get('extracted_price', 0) > 0]
    
    if not prices:
        logger.warning("[Enrichment] No valid prices found, skipping enrichment")
        return items
    
    min_price = min(prices)
    max_price = max(prices)
    price_range = max_price - min_price
    
    # Calculate minimum price for enrichment based on threshold
    # enrich_threshold of 0.8 means we only enrich items in the top 80% of the price range
    enrichment_min_price = min_price + (price_range * (1 - enrich_threshold))
    
    logger.info(f"[Enrichment] Price range: ${min_price:.2f} - ${max_price:.2f}")
    logger.info(f"[Enrichment] Enrichment threshold: ${enrichment_min_price:.2f} (top {enrich_threshold*100:.0f}%)")
    
    # Filter and sort items by price (highest first)
    items_to_enrich = [
        item for item in items 
        if item.get('extracted_price', 0) >= enrichment_min_price
    ]
    items_to_enrich.sort(key=lambda x: x.get('extracted_price', 0), reverse=True)
    
    # Limit to max_enrich count
    items_to_enrich = items_to_enrich[:max_enrich]
    
    logger.info(f"[Enrichment] Enriching {len(items_to_enrich)} of {len(items)} items (max: {max_enrich})")
    
    if not items_to_enrich:
        logger.info("[Enrichment] No items meet enrichment criteria")
        return items
    
    # Create Browse API client
    try:
        browse_client = eBayBrowseClient()
    except Exception as e:
        logger.error(f"[Enrichment] Failed to initialize Browse API client: {e}")
        return items
    
    # Enrich items in parallel with semaphore to control concurrency
    semaphore = asyncio.Semaphore(max_concurrent)
    enrichment_tasks = []
    
    for item in items_to_enrich:
        task = _enrich_single_item(item, browse_client, semaphore)
        enrichment_tasks.append(task)
    
    # Execute all enrichment tasks
    logger.info(f"[Enrichment] Starting parallel enrichment (max {max_concurrent} concurrent)")
    enriched_items = await asyncio.gather(*enrichment_tasks, return_exceptions=True)
    
    # Count successes and failures
    success_count = 0
    failure_count = 0
    
    # Build mapping of item_id to enriched data
    enrichment_map = {}
    for i, result in enumerate(enriched_items):
        if isinstance(result, Exception):
            logger.warning(f"[Enrichment] Task {i} failed with exception: {result}")
            failure_count += 1
        elif result is not None:
            enrichment_map[result['item_id']] = result
            success_count += 1
        else:
            failure_count += 1
    
    logger.info(f"[Enrichment] Completed: {success_count} successful, {failure_count} failed")
    
    # Merge enriched data back into original items list
    enriched_items_list = []
    for item in items:
        item_id = item.get('item_id')
        if item_id in enrichment_map:
            # Merge enriched data with original, preferring enriched data
            enriched_items_list.append(enrichment_map[item_id])
        else:
            # Keep original item if not enriched
            enriched_items_list.append(item)
    
    return enriched_items_list


async def _enrich_single_item(
    item: Dict,
    browse_client: eBayBrowseClient,
    semaphore: asyncio.Semaphore
) -> Optional[Dict]:
    """
    Enrich a single item with Browse API data.
    
    Args:
        item: Item from Finding API in normalized format
        browse_client: eBay Browse API client instance
        semaphore: Asyncio semaphore for concurrency control
    
    Returns:
        Enriched item dict or None if enrichment fails
    """
    async with semaphore:
        item_id = item.get('item_id')
        
        if not item_id:
            logger.warning("[Enrichment] Item missing item_id, skipping")
            return None
        
        try:
            logger.debug(f"[Enrichment] Fetching Browse API data for item {item_id}")
            
            # Get item details from Browse API
            # Note: Browse API uses legacy item IDs, not the v1|xxx|xxx format
            # Finding API returns the numeric item ID which can be used directly
            browse_data = await browse_client.get_item(
                item_id=item_id,
                fieldgroups="PRODUCT",  # Get product details for item aspects
                marketplace_id="EBAY_US"
            )
            
            # Normalize Browse API response
            normalized_browse = normalize_ebay_browse_item(browse_data)
            
            # Merge Browse API data with Finding API data
            # Strategy: Start with Finding API data, overlay Browse API enrichments
            enriched = item.copy()
            
            # Add Browse API specific fields
            if normalized_browse.get('shortDescription'):
                enriched['shortDescription'] = normalized_browse['shortDescription']
            
            if normalized_browse.get('images'):
                enriched['images'] = normalized_browse['images']
            
            # Add item aspects if available (this is the main enrichment value)
            # Item aspects contain structured data like player name, team, year, etc.
            if browse_data.get('localizedAspects'):
                enriched['localizedAspects'] = browse_data['localizedAspects']
                # Create a simplified aspects dict for easier access
                enriched['aspects'] = _extract_aspects(browse_data.get('localizedAspects', []))
            
            # Add product information if available
            if browse_data.get('product'):
                enriched['product'] = browse_data['product']
            
            # Add category information
            if browse_data.get('categoryPath'):
                enriched['categoryPath'] = browse_data['categoryPath']
            
            # Mark as enriched
            enriched['browse_enriched'] = True
            enriched['enrichment_timestamp'] = browse_data.get('itemCreationDate')
            
            logger.debug(f"[Enrichment] Successfully enriched item {item_id}")
            
            return enriched
            
        except Exception as e:
            logger.warning(f"[Enrichment] Failed to enrich item {item_id}: {e}")
            # Return original item on failure
            return item


def _extract_aspects(localized_aspects: List[Dict]) -> Dict[str, str]:
    """
    Extract item aspects from Browse API localizedAspects into a simple dict.
    
    Args:
        localized_aspects: List of aspect objects from Browse API
    
    Returns:
        Dict mapping aspect names to values (first value if multiple)
    
    Example:
        Input: [{"type": "Player", "value": "Paul Skenes"}, {"type": "Team", "value": "Pittsburgh Pirates"}]
        Output: {"Player": "Paul Skenes", "Team": "Pittsburgh Pirates"}
    """
    aspects = {}
    
    for aspect in localized_aspects:
        name = aspect.get('name') or aspect.get('type')
        values = aspect.get('value')
        
        if name and values:
            # If values is a list, take the first one; otherwise use as-is
            if isinstance(values, list) and values:
                aspects[name] = values[0]
            else:
                aspects[name] = str(values)
    
    return aspects


# Test function for standalone testing
async def test_enrichment():
    """
    Test the enrichment service with sample Finding API data.
    Run: python -m backend.services.ebay_enrichment_service
    """
    print("=" * 60)
    print("Testing eBay Enrichment Service")
    print("=" * 60)
    
    # Mock Finding API items for testing
    mock_items = [
        {
            'item_id': '256789012345',  # Replace with real item ID for testing
            'title': 'Test Item 1',
            'extracted_price': 150.00,
            'extracted_shipping': 5.00,
            'total_price': 155.00,
        },
        {
            'item_id': '256789012346',  # Replace with real item ID for testing
            'title': 'Test Item 2',
            'extracted_price': 100.00,
            'extracted_shipping': 3.00,
            'total_price': 103.00,
        },
        {
            'item_id': '256789012347',  # Replace with real item ID for testing
            'title': 'Test Item 3',
            'extracted_price': 50.00,
            'extracted_shipping': 2.00,
            'total_price': 52.00,
        },
    ]
    
    print(f"\n[TEST] Mock items: {len(mock_items)}")
    
    try:
        enriched = await enrich_items_with_browse_api(
            items=mock_items,
            max_enrich=2,
            enrich_threshold=0.6,
            max_concurrent=2
        )
        
        print(f"\n[TEST] Enriched items: {len(enriched)}")
        
        for item in enriched:
            print(f"\nItem: {item['title']}")
            print(f"  Price: ${item['extracted_price']:.2f}")
            print(f"  Enriched: {item.get('browse_enriched', False)}")
            if item.get('aspects'):
                print(f"  Aspects: {item['aspects']}")
        
        print("\n" + "=" * 60)
        print("✓ Test completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        print("\n" + "=" * 60)
        print(f"✗ Test failed: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_enrichment())
