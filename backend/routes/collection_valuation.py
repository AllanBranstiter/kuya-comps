# backend/routes/collection_valuation.py
"""
API routes for automated card valuation (Phase 4).

Provides endpoints for:
- Manual card valuation updates
- Batch valuation updates (admin/cron)
- Valuation statistics
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from backend.database.connection import get_db
from backend.services.valuation_service import (
    manually_update_card,
    update_stale_cards
)
from backend.services.collection_service import get_card_by_id
from backend.middleware.supabase_auth import get_current_user_required
from backend.middleware.admin_auth import require_admin
from backend.config import get_search_api_key
from backend.logging_config import get_logger

# Import scraper
from scraper import scrape_sold_comps

logger = get_logger(__name__)
router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class ManualUpdateRequest(BaseModel):
    """Request to manually update a card's valuation."""
    card_id: int


class ManualUpdateResponse(BaseModel):
    """Response from manual valuation update."""
    success: bool
    updated: bool
    flagged_for_review: bool
    reason: Optional[str] = None
    previous_fmv: Optional[float] = None
    new_fmv: Optional[float] = None
    num_sales: int
    num_filtered: int
    num_outliers: int
    error: Optional[str] = None


class BatchUpdateRequest(BaseModel):
    """Request to update multiple stale cards."""
    days_threshold: int = 30
    max_cards: Optional[int] = None
    delay_between_cards: float = 2.0


class BatchUpdateResponse(BaseModel):
    """Response from batch valuation update."""
    total_cards: int
    updated: int
    flagged: int
    errors: int
    message: str


# ============================================================================
# User Endpoints
# ============================================================================

@router.post("/api/v1/cards/{card_id}/update-value", response_model=ManualUpdateResponse)
async def update_card_value(
    card_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """
    Manually trigger a valuation update for a specific card.
    
    This endpoint allows users to force an immediate FMV update for one of their cards,
    regardless of when it was last updated.
    
    **Authentication Required:** Yes (user must own the card)
    
    **Rate Limiting:** Consider implementing rate limiting to prevent abuse
    
    **Process:**
    1. Verifies user owns the card
    2. Scrapes eBay for current sold listings
    3. Applies safety checks (keyword firewall, outlier removal, volatility)
    4. Updates FMV or flags for review
    5. Creates price history entry
    
    **Returns:**
    - `success`: Whether the operation completed without errors
    - `updated`: Whether the FMV was actually updated
    - `flagged_for_review`: Whether the card was flagged due to volatility or insufficient data
    - `reason`: Reason for flagging (if applicable)
    - `previous_fmv`: Previous FMV value
    - `new_fmv`: New calculated FMV (may not be applied if flagged)
    - `num_sales`: Number of sales used in calculation
    - `num_filtered`: Number of listings filtered by keyword firewall
    - `num_outliers`: Number of outliers removed
    """
    logger.info(f"[API] Manual valuation update requested for card {card_id} by user {current_user['id']}")
    
    # Verify card exists and user owns it
    card = get_card_by_id(db, card_id, current_user['id'])
    if not card:
        raise HTTPException(status_code=404, detail="Card not found or access denied")
    
    # Get API key from config
    api_key = get_search_api_key()
    
    if not api_key:
        raise HTTPException(status_code=500, detail="SearchAPI key not configured")
    
    # Perform valuation update
    result = await manually_update_card(
        db=db,
        card_id=card_id,
        user_id=current_user['id'],
        scraper_func=scrape_sold_comps,
        api_key=api_key
    )
    
    if 'error' in result:
        return ManualUpdateResponse(
            success=False,
            updated=False,
            flagged_for_review=False,
            num_sales=0,
            num_filtered=0,
            num_outliers=0,
            error=result['error']
        )
    
    return ManualUpdateResponse(
        success=result['success'],
        updated=result.get('updated', False),
        flagged_for_review=result.get('flagged_for_review', False),
        reason=result.get('reason'),
        previous_fmv=result.get('previous_fmv'),
        new_fmv=result.get('new_fmv'),
        num_sales=result.get('num_sales', 0),
        num_filtered=result.get('num_filtered', 0),
        num_outliers=result.get('num_outliers', 0)
    )


# ============================================================================
# Admin/Cron Endpoints
# ============================================================================

@router.post("/admin/api/valuation/batch-update", response_model=BatchUpdateResponse)
async def batch_update_valuations(
    request: BatchUpdateRequest,
    background_tasks: BackgroundTasks,
    admin_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Update all cards that need automated valuation updates.
    
    This endpoint is designed to be called by a cron job or admin user to update
    all cards with `auto_update=TRUE` that haven't been updated in the specified
    number of days.
    
    **Authentication Required:** Admin only
    
    **Parameters:**
    - `days_threshold`: Number of days since last update to consider a card stale (default: 30)
    - `max_cards`: Maximum number of cards to update in this batch (default: None = all)
    - `delay_between_cards`: Delay in seconds between card updates to avoid rate limiting (default: 2.0)
    
    **Process:**
    1. Finds all cards with `auto_update=TRUE` and `last_updated_at > days_threshold`
    2. For each card:
       - Scrapes eBay using the card's `search_query_string`
       - Applies keyword firewall to exclude reprints, digital cards, etc.
       - Removes outliers using IQR method
       - Calculates median FMV
       - Checks for excessive volatility (>50% change)
       - Updates FMV or flags for review
       - Creates price history entry
    3. Returns summary statistics
    
    **Safety Checks:**
    - **Keyword Firewall:** Excludes "reprint", "digital", "RP", "box", "pack", etc.
    - **Outlier Removal:** IQR filtering removes extreme prices
    - **Ghost Town Check:** Doesn't update to $0 if no sales found
    - **Volatility Guardrail:** Flags for review if price changes >50%
    
    **Returns:**
    - `total_cards`: Number of cards processed
    - `updated`: Number of cards successfully updated
    - `flagged`: Number of cards flagged for manual review
    - `errors`: Number of cards that encountered errors
    - `message`: Summary message
    """
    logger.info(f"[API] Batch valuation update requested by admin {admin_user['id']}")
    logger.info(f"[API] Parameters: days_threshold={request.days_threshold}, max_cards={request.max_cards}")
    
    # Get API key from settings
    settings = get_settings()
    api_key = settings.SEARCHAPI_API_KEY
    
    if not api_key:
        raise HTTPException(status_code=500, detail="SearchAPI key not configured")
    
    # Perform batch update
    summary = await update_stale_cards(
        db=db,
        scraper_func=scrape_sold_comps,
        api_key=api_key,
        days_threshold=request.days_threshold,
        max_cards=request.max_cards,
        delay_between_cards=request.delay_between_cards
    )
    
    message = (
        f"Batch update complete: {summary['updated']} cards updated, "
        f"{summary['flagged']} flagged for review, "
        f"{summary['errors']} errors"
    )
    
    return BatchUpdateResponse(
        total_cards=summary['total_cards'],
        updated=summary['updated'],
        flagged=summary['flagged'],
        errors=summary['errors'],
        message=message
    )


@router.get("/admin/api/valuation/stats")
async def get_valuation_stats(
    admin_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get statistics about cards needing valuation updates.
    
    **Authentication Required:** Admin only
    
    **Returns:**
    - `total_cards_with_auto_update`: Total cards with auto-update enabled
    - `cards_needing_update_30d`: Cards not updated in 30+ days
    - `cards_needing_update_60d`: Cards not updated in 60+ days
    - `cards_needing_update_90d`: Cards not updated in 90+ days
    - `cards_flagged_for_review`: Cards currently flagged for manual review
    - `cards_with_no_recent_sales`: Cards with no recent sales data
    """
    from backend.services.collection_service import get_cards_for_auto_update
    from backend.database.schema import Card
    
    # Get counts for different thresholds
    cards_30d = get_cards_for_auto_update(db, days_threshold=30)
    cards_60d = get_cards_for_auto_update(db, days_threshold=60)
    cards_90d = get_cards_for_auto_update(db, days_threshold=90)
    
    # Get total cards with auto-update enabled
    total_auto_update = db.query(Card).filter(Card.auto_update == True).count()
    
    # Get flagged cards
    flagged_cards = db.query(Card).filter(Card.review_required == True).count()
    
    # Get cards with no recent sales
    no_sales_cards = db.query(Card).filter(Card.no_recent_sales == True).count()
    
    return {
        'total_cards_with_auto_update': total_auto_update,
        'cards_needing_update_30d': len(cards_30d),
        'cards_needing_update_60d': len(cards_60d),
        'cards_needing_update_90d': len(cards_90d),
        'cards_flagged_for_review': flagged_cards,
        'cards_with_no_recent_sales': no_sales_cards
    }
