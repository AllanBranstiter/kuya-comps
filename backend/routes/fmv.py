# backend/routes/fmv.py
"""
FMV (Fair Market Value) router - handles FMV calculation and testing endpoints.

This module contains endpoints for calculating fair market value
from comp data and testing external API connectivity.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from backend.services.fmv_service import calculate_fmv, get_active_market_floor
from backend.models.schemas import CompItem, FmvResponse


# Initialize router
router = APIRouter()


@router.post("/fmv", response_model=FmvResponse)
def get_fmv(items: List[CompItem], active_items: Optional[List[CompItem]] = None):
    """
    Calculate the Fair Market Value (FMV) using volume weighting.
    
    This endpoint takes a list of comparable sales and calculates:
    - Volume-weighted market value (auctions with more bids weighted higher)
    - Quick sale price (25th percentile - sell fast)
    - Patient sale price (75th percentile - wait for top dollar)
    - FMV range based on weighted standard deviation
    - Confidence level based on proportion of high-validation sales
    
    Outliers are automatically filtered using IQR method to focus on
    the core cluster of sales where most market activity occurs.
    
    Phase 4 Enhancement: If active_items are provided, validates FMV against
    current market floor to prevent outdated quick_sale estimates.
    
    Args:
        items: List of CompItem objects with pricing and auction data from sold listings
        active_items: Optional list of CompItem objects from active listings for floor validation
    
    Returns:
        FmvResponse: FMV calculations and confidence metrics
    """
    print(f"[FMV ENDPOINT] Received request with {len(items)} items")
    if len(items) > 0:
        print(f"[FMV ENDPOINT] First item sample:")
        print(f"  - item_id: {items[0].item_id}")
        print(f"  - title: {items[0].title[:50] if items[0].title else 'None'}")
        print(f"  - total_price: {items[0].total_price}")
        print(f"  - date_scraped: {items[0].date_scraped} (type: {type(items[0].date_scraped)})")
    
    try:
        # Calculate base FMV from sold listings
        result = calculate_fmv(items)
        
        # Phase 4: Apply active market floor validation
        if active_items:
            active_floor = get_active_market_floor(active_items)
            if active_floor and active_floor > result.quick_sale * 1.2:
                # Active floor is 20%+ higher than quick_sale - adjust upward
                result.quick_sale = active_floor
                result.market_value = max(result.market_value, active_floor * 1.15)
                print(f"[FMV] Adjusted quick_sale to ${active_floor:.2f} based on active market floor")
                print(f"[FMV] Adjusted market_value to ${result.market_value:.2f} (115% of active floor)")
        
        return FmvResponse(**result.to_dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test-ebay-api")
def test_ebay_api():
    """
    Test eBay Browse API connectivity and credentials.
    
    This endpoint verifies that:
    1. eBay API credentials are properly configured
    2. Authentication is working
    3. Search functionality is operational
    
    Useful for troubleshooting integration issues and verifying
    environment variable configuration.
    
    Returns:
        dict: Test results including status, items found, and environment info
    """
    try:
        from ebay_browse_client import eBayBrowseClient
        
        print("[TEST] Initializing eBay Browse API client...")
        client = eBayBrowseClient()
        
        print("[TEST] Testing authentication...")
        token = client.get_access_token()
        
        print("[TEST] Testing search...")
        results = client.search_items(
            query="baseball card",
            limit=5
        )
        
        items_count = len(results.get('itemSummaries', []))
        
        return {
            "status": "success",
            "message": "eBay Browse API is working correctly",
            "items_found": items_count,
            "total_matches": results.get('total', 0),
            "environment": client.environment
        }
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[TEST] eBay API test failed: {e}")
        print(f"[TEST] Traceback: {error_trace}")
        
        return {
            "status": "error",
            "message": str(e),
            "traceback": error_trace
        }
