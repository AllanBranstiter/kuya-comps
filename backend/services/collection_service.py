# backend/services/collection_service.py
"""
Service layer for Collections & Binders feature (Phase 2).
Handles business logic for managing user card collections.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import List, Optional, Tuple
from datetime import datetime, timedelta
from decimal import Decimal

from backend.database.schema import Binder, Card, PriceHistory
from backend.models.collection_schemas import (
    BinderCreate, BinderUpdate, BinderResponse, BinderStats,
    CardCreate, CardUpdate, CardResponse, CardWithHistory,
    PriceHistoryCreate, PriceHistoryResponse,
    CollectionOverview, CardFilter
)
from backend.logging_config import get_logger

logger = get_logger(__name__)


# ============================================================================
# Binder Service Functions
# ============================================================================

def create_binder(db: Session, user_id: str, binder_data: BinderCreate) -> Binder:
    """
    Create a new binder for a user.
    
    Args:
        db: Database session
        user_id: Supabase user ID
        binder_data: Binder creation data
        
    Returns:
        Created Binder object
    """
    binder = Binder(
        user_id=user_id,
        name=binder_data.name
    )
    db.add(binder)
    db.commit()
    db.refresh(binder)
    
    logger.info(f"Created binder '{binder.name}' (ID: {binder.id}) for user {user_id}")
    return binder


def get_user_binders(db: Session, user_id: str) -> List[Binder]:
    """
    Get all binders for a user.
    
    Args:
        db: Database session
        user_id: Supabase user ID
        
    Returns:
        List of Binder objects
    """
    return db.query(Binder).filter(Binder.user_id == user_id).order_by(Binder.created_at.desc()).all()


def get_binder_by_id(db: Session, binder_id: int, user_id: str) -> Optional[Binder]:
    """
    Get a specific binder by ID (with user ownership check).
    
    Args:
        db: Database session
        binder_id: Binder ID
        user_id: Supabase user ID
        
    Returns:
        Binder object or None
    """
    return db.query(Binder).filter(
        and_(Binder.id == binder_id, Binder.user_id == user_id)
    ).first()


def update_binder(db: Session, binder_id: int, user_id: str, binder_data: BinderUpdate) -> Optional[Binder]:
    """
    Update a binder.
    
    Args:
        db: Database session
        binder_id: Binder ID
        user_id: Supabase user ID
        binder_data: Update data
        
    Returns:
        Updated Binder object or None
    """
    binder = get_binder_by_id(db, binder_id, user_id)
    if not binder:
        return None
    
    if binder_data.name is not None:
        binder.name = binder_data.name
    if binder_data.cover_card_id is not None:
        # Verify the cover card belongs to this binder
        card = db.query(Card).filter(
            and_(Card.id == binder_data.cover_card_id, Card.binder_id == binder_id)
        ).first()
        if card:
            binder.cover_card_id = binder_data.cover_card_id
    
    binder.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(binder)
    
    logger.info(f"Updated binder {binder_id} for user {user_id}")
    return binder


def delete_binder(db: Session, binder_id: int, user_id: str) -> bool:
    """
    Delete a binder and all its cards.
    
    Args:
        db: Database session
        binder_id: Binder ID
        user_id: Supabase user ID
        
    Returns:
        True if deleted, False if not found
    """
    binder = get_binder_by_id(db, binder_id, user_id)
    if not binder:
        return False
    
    db.delete(binder)
    db.commit()
    
    logger.info(f"Deleted binder {binder_id} for user {user_id}")
    return True


def get_binder_stats(db: Session, binder_id: int, user_id: str) -> Optional[BinderStats]:
    """
    Get aggregated statistics for a binder.
    
    Args:
        db: Database session
        binder_id: Binder ID
        user_id: Supabase user ID
        
    Returns:
        BinderStats object or None
    """
    binder = get_binder_by_id(db, binder_id, user_id)
    if not binder:
        return None
    
    # Get all cards in binder
    cards = db.query(Card).filter(Card.binder_id == binder_id).all()
    
    total_cards = len(cards)
    total_value = sum((card.current_fmv or Decimal(0)) for card in cards)
    total_cost = sum((card.purchase_price or Decimal(0)) for card in cards)
    
    # Calculate ROI
    roi_percentage = 0.0
    if total_cost > 0:
        roi_percentage = float((total_value - total_cost) / total_cost * 100)
    
    # Count cards needing review
    cards_needing_review = sum(1 for card in cards if card.review_required)
    
    # Count cards with stale data (>30 days since update)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    cards_with_stale_data = sum(
        1 for card in cards 
        if card.auto_update and (card.last_updated_at is None or card.last_updated_at < thirty_days_ago)
    )
    
    # Get most recent update
    last_updated = max((card.last_updated_at for card in cards if card.last_updated_at), default=None)
    
    return BinderStats(
        binder_id=binder_id,
        binder_name=binder.name,
        total_cards=total_cards,
        total_value=total_value,
        total_cost=total_cost,
        roi_percentage=roi_percentage,
        cards_needing_review=cards_needing_review,
        cards_with_stale_data=cards_with_stale_data,
        last_updated=last_updated
    )


# ============================================================================
# Card Service Functions
# ============================================================================

def create_card(db: Session, user_id: str, card_data: CardCreate) -> Optional[Card]:
    """
    Create a new card in a binder.
    
    Args:
        db: Database session
        user_id: Supabase user ID
        card_data: Card creation data
        
    Returns:
        Created Card object or None if binder not found
    """
    # Verify binder ownership
    binder = get_binder_by_id(db, card_data.binder_id, user_id)
    if not binder:
        logger.warning(f"User {user_id} attempted to add card to non-existent binder {card_data.binder_id}")
        return None
    
    card = Card(
        binder_id=card_data.binder_id,
        year=card_data.year,
        set_name=card_data.set_name,
        athlete=card_data.athlete,
        card_number=card_data.card_number,
        variation=card_data.variation,
        grading_company=card_data.grading_company,
        grade=card_data.grade,
        image_url=card_data.image_url,
        search_query_string=card_data.search_query_string,
        auto_update=card_data.auto_update,
        purchase_price=card_data.purchase_price,
        purchase_date=card_data.purchase_date,
        tags=card_data.tags,
        notes=card_data.notes
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    
    logger.info(f"Created card '{card.athlete}' (ID: {card.id}) in binder {card_data.binder_id}")
    return card


def get_cards_by_binder(db: Session, binder_id: int, user_id: str) -> List[Card]:
    """
    Get all cards in a binder.
    
    Args:
        db: Database session
        binder_id: Binder ID
        user_id: Supabase user ID
        
    Returns:
        List of Card objects
    """
    # Verify binder ownership
    binder = get_binder_by_id(db, binder_id, user_id)
    if not binder:
        return []
    
    return db.query(Card).filter(Card.binder_id == binder_id).order_by(Card.created_at.desc()).all()


def get_card_by_id(db: Session, card_id: int, user_id: str) -> Optional[Card]:
    """
    Get a specific card by ID (with user ownership check).
    
    Args:
        db: Database session
        card_id: Card ID
        user_id: Supabase user ID
        
    Returns:
        Card object or None
    """
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        return None
    
    # Verify user owns the binder
    binder = get_binder_by_id(db, card.binder_id, user_id)
    if not binder:
        return None
    
    return card


def update_card(db: Session, card_id: int, user_id: str, card_data: CardUpdate) -> Optional[Card]:
    """
    Update a card.
    
    Args:
        db: Database session
        card_id: Card ID
        user_id: Supabase user ID
        card_data: Update data
        
    Returns:
        Updated Card object or None
    """
    card = get_card_by_id(db, card_id, user_id)
    if not card:
        return None
    
    # Update fields if provided
    update_fields = card_data.model_dump(exclude_unset=True)
    
    # If moving to a different binder, verify ownership
    if 'binder_id' in update_fields:
        new_binder = get_binder_by_id(db, update_fields['binder_id'], user_id)
        if not new_binder:
            logger.warning(f"User {user_id} attempted to move card to non-existent binder")
            return None
    
    for field, value in update_fields.items():
        setattr(card, field, value)
    
    card.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(card)
    
    logger.info(f"Updated card {card_id}")
    return card


def delete_card(db: Session, card_id: int, user_id: str) -> bool:
    """
    Delete a card.
    
    Args:
        db: Database session
        card_id: Card ID
        user_id: Supabase user ID
        
    Returns:
        True if deleted, False if not found
    """
    card = get_card_by_id(db, card_id, user_id)
    if not card:
        return False
    
    db.delete(card)
    db.commit()
    
    logger.info(f"Deleted card {card_id}")
    return True


def get_cards_for_auto_update(db: Session, days_threshold: int = 30) -> List[Card]:
    """
    Get cards that need automated FMV updates.
    
    Args:
        db: Database session
        days_threshold: Number of days since last update to consider stale
        
    Returns:
        List of Card objects needing updates
    """
    threshold_date = datetime.utcnow() - timedelta(days=days_threshold)
    
    return db.query(Card).filter(
        and_(
            Card.auto_update == True,
            or_(
                Card.last_updated_at == None,
                Card.last_updated_at < threshold_date
            )
        )
    ).all()


# ============================================================================
# Price History Service Functions
# ============================================================================

def add_price_history(db: Session, price_data: PriceHistoryCreate) -> PriceHistory:
    """
    Add a price history entry for a card.
    
    Args:
        db: Database session
        price_data: Price history data
        
    Returns:
        Created PriceHistory object
    """
    history = PriceHistory(
        card_id=price_data.card_id,
        value=price_data.value,
        num_sales=price_data.num_sales,
        confidence=price_data.confidence
    )
    db.add(history)
    db.commit()
    db.refresh(history)
    
    logger.debug(f"Added price history for card {price_data.card_id}: ${price_data.value}")
    return history


def get_card_price_history(db: Session, card_id: int, limit: int = 30) -> List[PriceHistory]:
    """
    Get price history for a card (for sparkline charts).
    
    Args:
        db: Database session
        card_id: Card ID
        limit: Maximum number of history entries to return
        
    Returns:
        List of PriceHistory objects
    """
    return db.query(PriceHistory).filter(
        PriceHistory.card_id == card_id
    ).order_by(PriceHistory.date_recorded.desc()).limit(limit).all()


# ============================================================================
# Collection Overview Functions
# ============================================================================

def get_collection_overview(db: Session, user_id: str) -> CollectionOverview:
    """
    Get overview statistics for user's entire collection.
    
    Args:
        db: Database session
        user_id: Supabase user ID
        
    Returns:
        CollectionOverview object
    """
    # Get all user's binders
    binders = get_user_binders(db, user_id)
    binder_ids = [b.id for b in binders]
    
    # Get all cards across all binders
    cards = db.query(Card).filter(Card.binder_id.in_(binder_ids)).all() if binder_ids else []
    
    total_value = sum((card.current_fmv or Decimal(0)) for card in cards)
    total_cost = sum((card.purchase_price or Decimal(0)) for card in cards)
    
    roi_percentage = 0.0
    if total_cost > 0:
        roi_percentage = float((total_value - total_cost) / total_cost * 100)
    
    cards_needing_review = sum(1 for card in cards if card.review_required)
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    cards_with_stale_data = sum(
        1 for card in cards 
        if card.auto_update and (card.last_updated_at is None or card.last_updated_at < thirty_days_ago)
    )
    
    # Get top performers (highest ROI)
    top_performers = sorted(
        [c for c in cards if c.purchase_price and c.current_fmv],
        key=lambda c: (c.current_fmv - c.purchase_price) / c.purchase_price,
        reverse=True
    )[:5]
    
    # Get recently updated cards
    recent_updates = sorted(
        [c for c in cards if c.last_updated_at],
        key=lambda c: c.last_updated_at,
        reverse=True
    )[:5]
    
    return CollectionOverview(
        total_binders=len(binders),
        total_cards=len(cards),
        total_value=total_value,
        total_cost=total_cost,
        roi_percentage=roi_percentage,
        cards_needing_review=cards_needing_review,
        cards_with_stale_data=cards_with_stale_data,
        top_performers=[CardResponse.model_validate(c) for c in top_performers],
        recent_updates=[CardResponse.model_validate(c) for c in recent_updates]
    )
