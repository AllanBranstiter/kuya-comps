# backend/routes/fmv.py
"""
FMV (Fair Market Value) router - handles FMV calculation and testing endpoints.

This module contains endpoints for calculating fair market value
from comp data and testing external API connectivity.
"""
from typing import List
from fastapi import APIRouter, HTTPException
from backend.services.fmv_service import calculate_fmv
from backend.models.schemas import CompItem, FmvResponse


# Initialize router
router = APIRouter()


@router.post("/fmv", response_model=FmvResponse)
def get_fmv(items: List[CompItem]):
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
    
    Args:
        items: List of CompItem objects with pricing and auction data
    
    Returns:
        FmvResponse: FMV calculations and confidence metrics
    """
    try:
        result = calculate_fmv(items)
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
