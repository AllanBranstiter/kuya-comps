# backend/routes/fmv.py
"""
FMV (Fair Market Value) router - handles FMV calculation and testing endpoints.

This module contains endpoints for calculating fair market value
from comp data and testing external API connectivity.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.services.fmv_service import calculate_fmv, calculate_fmv_blended, get_active_market_floor
from backend.services.relevance_service import score_listing_relevance
from backend.services.market_summary_service import generate_market_summary
from backend.services.print_run_service import estimate_print_run
from backend.models.schemas import CompItem, FmvResponse
from backend.middleware.subscription_gate import check_search_limit
from backend.middleware.supabase_auth import get_current_user_optional
from backend.services.subscription_service import SubscriptionService
from backend.config import get_supabase_client
from backend.logging_config import get_logger

logger = get_logger(__name__)


# Initialize router
router = APIRouter()


@router.post("/fmv", response_model=FmvResponse)
def get_fmv(
    items: List[CompItem],
    active_items: Optional[List[CompItem]] = None,
    search_limit: dict = Depends(check_search_limit)
):
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
    logger.debug(f"Received request with {len(items)} items")
    if len(items) > 0:
        logger.debug("First item sample:")
        logger.debug(f"  item_id: {items[0].item_id}")
        logger.debug(f"  title: {items[0].title[:50] if items[0].title else 'None'}")
        logger.debug(f"  total_price: {items[0].total_price}")
        logger.debug(f"  date_scraped: {items[0].date_scraped} (type: {type(items[0].date_scraped)})")

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
                logger.info(f"Adjusted quick_sale to ${active_floor:.2f} based on active market floor")
                logger.info(f"Adjusted market_value to ${result.market_value:.2f} (115% of active floor)")

        return FmvResponse(**result.to_dict())
    except Exception as e:
        logger.exception("[FMV] Error calculating FMV")
        raise HTTPException(status_code=500, detail="An internal error occurred")


class FmvV2Request(BaseModel):
    sold_items: List[CompItem]
    active_items: Optional[List[CompItem]] = None
    query: Optional[str] = None  # Search query for AI relevance scoring


@router.post("/fmv/v2", response_model=FmvResponse)
async def get_fmv_v2(
    request: FmvV2Request,
    search_limit: dict = Depends(check_search_limit),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Blended FMV calculation using both sold comps (bid side) and active
    listings (ask side).

    Returns only three price values — quick_sale, market_value, patient_sale —
    with fmv_low and fmv_high retired (returned as null).

    The blend weight between bid and ask is determined by:
      - Number of sold comps (depth of comp history)
      - Number of active listings (depth of current market)
      - Bid/ask spread (how far sellers are from recent comps)
    """
    try:
        # Score listing relevance if query is provided
        sold_scores = None
        active_scores = None
        if request.query and request.sold_items:
            sold_scores = score_listing_relevance(request.query, request.sold_items)
            for item, score in zip(request.sold_items, sold_scores):
                item.ai_relevance_score = score
        if request.query and request.active_items:
            active_scores = score_listing_relevance(request.query, request.active_items)

        result = calculate_fmv_blended(
            sold_items=request.sold_items,
            active_items=request.active_items,
        )
        response_dict = result.to_dict()
        response_dict['sold_relevance_scores'] = sold_scores
        response_dict['active_relevance_scores'] = active_scores

        # --- AI Market Summary ---
        user_tier = "free"
        if user:
            supabase = get_supabase_client()
            subscription_service = SubscriptionService(supabase)
            user_tier = await subscription_service.get_user_tier(user.get("sub"))

        sold_count = sum(
            1 for i in request.sold_items
            if getattr(i, "total_price", None) and i.total_price > 0
        )
        active_count = len(request.active_items) if request.active_items else 0

        below_fmv_listings = []
        if result.market_value and request.active_items:
            below_fmv_listings = sorted([
                i.total_price
                for i in request.active_items
                if getattr(i, "total_price", None)
                and i.total_price > 0
                and i.total_price < result.market_value
            ])

        # --- Print Run Estimation ---
        all_titles = [i.title for i in request.sold_items if i.title]
        if request.active_items:
            all_titles += [i.title for i in request.active_items if i.title]
        print_run_info = estimate_print_run(request.query or "", all_titles)

        summary, token_usage = generate_market_summary(
            fmv_result=result,
            sold_count=sold_count,
            active_count=active_count,
            card_name=request.query,
            user_tier=user_tier,
            below_fmv_listings=below_fmv_listings,
            print_run_info=print_run_info,
        )
        response_dict["market_summary"] = summary
        if token_usage:
            response_dict["summary_token_usage"] = token_usage

        # Expose print run info to frontend (only if we have data)
        if print_run_info and print_run_info.get("confidence") != "unknown":
            response_dict["print_run_info"] = print_run_info

        return FmvResponse(**response_dict)
    except Exception as e:
        logger.exception("[FMV] Error calculating blended FMV")
        raise HTTPException(status_code=500, detail="An internal error occurred")


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

        logger.info("Initializing eBay Browse API client...")
        client = eBayBrowseClient()

        logger.info("Testing authentication...")
        _token = client.get_access_token()

        logger.info("Testing search...")
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
        logger.error(f"eBay API test failed: {e}")
        logger.error(f"Traceback: {error_trace}")

        return {
            "status": "error",
            "message": str(e),
            "traceback": error_trace
        }
