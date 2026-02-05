# backend/routes/collection.py
"""
API routes for Collections & Binders (Phase 2).

Provides endpoints for:
- Creating cards in collections
- Creating binders
- Managing user collections
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database.connection import get_db
from backend.services.collection_service import create_card, create_binder
from backend.models.collection_schemas import (
    CardCreate, CardResponse, BinderCreate, BinderResponse
)
from backend.middleware.supabase_auth import get_current_user_required
from backend.logging_config import get_logger

logger = get_logger(__name__)
router = APIRouter()


@router.post("/api/v1/cards", response_model=CardResponse, status_code=status.HTTP_201_CREATED)
async def create_card_endpoint(
    card_data: CardCreate,
    current_user: dict = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """
    Create a new card in a binder.
    
    **Authentication Required:** Yes (user must own the binder)
    
    **Request Body:**
    - binder_id: ID of the binder to add card to
    - athlete: Athlete name (required)
    - year: Card year (optional) - THIS WAS THE BUG
    - set_name: Card set name (optional)
    - card_number: Card number (optional)
    - variation: Variation/parallel (optional)
    - grading_company: Grading company (optional)
    - grade: Grade (optional)
    - purchase_price: Purchase price (optional)
    - purchase_date: Date purchased (optional) - THIS WAS THE BUG
    - search_query_string: Search query for automated updates (required)
    - auto_update: Enable automatic FMV updates (default: true)
    - tags: Comma-separated tags (optional)
    - notes: User notes (optional)
    
    **Returns:**
    - Created card with all fields populated
    - Includes computed fields: roi_percentage, days_since_update
    
    **Errors:**
    - 401: Not authenticated
    - 404: Binder not found or access denied
    - 422: Validation error (missing required fields)
    """
    logger.info(f"[API] Creating card for user {current_user.get('id')} in binder {card_data.binder_id}")
    logger.info(f"[API] Card data: athlete={card_data.athlete}, year={card_data.year}, purchase_date={card_data.purchase_date}")
    
    # Extract user_id from JWT token
    user_id = current_user.get('sub')
    if not user_id:
        logger.error("[API] No user ID found in JWT token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )
    
    try:
        # Create card via service layer
        # Service layer validates binder ownership and handles price history
        card = create_card(
            db=db,
            user_id=user_id,
            card_data=card_data,
            current_fmv=None  # TODO: Add current_fmv handling if needed
        )
        
        if not card:
            logger.warning(f"[API] Binder {card_data.binder_id} not found for user {user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Binder not found or access denied"
            )
        
        logger.info(f"[API] Card created successfully: id={card.id}, athlete={card.athlete}, year={card.year}")
        
        # Convert to response model
        return CardResponse.model_validate(card)
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"[API] Error creating card: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create card"
        )


@router.post("/api/v1/binders", response_model=BinderResponse, status_code=status.HTTP_201_CREATED)
async def create_binder_endpoint(
    binder_data: BinderCreate,
    current_user: dict = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """
    Create a new binder.
    
    **Authentication Required:** Yes
    
    **Request Body:**
    - name: Binder name (required)
    
    **Returns:**
    - Created binder with ID
    
    **Errors:**
    - 401: Not authenticated
    - 422: Validation error (missing name)
    - 500: Database error
    """
    logger.info(f"[API] Creating binder for user {current_user.get('id')}: {binder_data.name}")
    
    user_id = current_user.get('sub')
    if not user_id:
        logger.error("[API] No user ID found in JWT token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )
    
    try:
        binder = create_binder(db=db, user_id=user_id, binder_data=binder_data)
        
        logger.info(f"[API] Binder created successfully: id={binder.id}, name={binder.name}")
        
        return BinderResponse.model_validate(binder)
        
    except Exception as e:
        logger.error(f"[API] Error creating binder: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create binder"
        )
