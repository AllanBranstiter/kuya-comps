# tests/services/test_collection_service.py
"""
Unit tests for collection service layer (Phase 2).
"""
import pytest
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.schema import Base, Binder, Card, PriceHistory
from backend.models.collection_schemas import (
    BinderCreate, BinderUpdate,
    CardCreate, CardUpdate,
    PriceHistoryCreate
)
from backend.services.collection_service import (
    create_binder, get_user_binders, get_binder_by_id, update_binder, delete_binder,
    get_binder_stats, create_card, get_cards_by_binder, get_card_by_id,
    update_card, delete_card, get_cards_for_auto_update, add_price_history,
    get_card_price_history, get_collection_overview
)


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def test_user_id():
    """Test user ID."""
    return "test-user-123"


@pytest.fixture
def test_binder(db_session, test_user_id):
    """Create a test binder."""
    binder_data = BinderCreate(name="My First Binder")
    return create_binder(db_session, test_user_id, binder_data)


@pytest.fixture
def test_card(db_session, test_user_id, test_binder):
    """Create a test card."""
    card_data = CardCreate(
        binder_id=test_binder.id,
        year="2023",
        set_name="Prizm",
        athlete="Victor Wembanyama",
        card_number="1",
        variation="Silver Prizm",
        grading_company="PSA",
        grade="10",
        search_query_string="2023 Prizm Victor Wembanyama Silver PSA 10",
        auto_update=True,
        purchase_price=Decimal("150.00"),
        purchase_date=datetime.utcnow()
    )
    return create_card(db_session, test_user_id, card_data)


# ============================================================================
# Binder Tests
# ============================================================================

def test_create_binder(db_session, test_user_id):
    """Test creating a binder."""
    binder_data = BinderCreate(name="Test Binder")
    binder = create_binder(db_session, test_user_id, binder_data)
    
    assert binder.id is not None
    assert binder.user_id == test_user_id
    assert binder.name == "Test Binder"
    assert binder.created_at is not None


def test_get_user_binders(db_session, test_user_id):
    """Test getting all binders for a user."""
    # Create multiple binders
    create_binder(db_session, test_user_id, BinderCreate(name="Binder 1"))
    create_binder(db_session, test_user_id, BinderCreate(name="Binder 2"))
    create_binder(db_session, "other-user", BinderCreate(name="Other User Binder"))
    
    binders = get_user_binders(db_session, test_user_id)
    
    assert len(binders) == 2
    assert all(b.user_id == test_user_id for b in binders)


def test_get_binder_by_id(db_session, test_user_id, test_binder):
    """Test getting a specific binder."""
    binder = get_binder_by_id(db_session, test_binder.id, test_user_id)
    
    assert binder is not None
    assert binder.id == test_binder.id
    assert binder.name == test_binder.name


def test_get_binder_by_id_wrong_user(db_session, test_binder):
    """Test that users can't access other users' binders."""
    binder = get_binder_by_id(db_session, test_binder.id, "wrong-user")
    
    assert binder is None


def test_update_binder(db_session, test_user_id, test_binder):
    """Test updating a binder."""
    update_data = BinderUpdate(name="Updated Binder Name")
    updated = update_binder(db_session, test_binder.id, test_user_id, update_data)
    
    assert updated is not None
    assert updated.name == "Updated Binder Name"


def test_delete_binder(db_session, test_user_id, test_binder):
    """Test deleting a binder."""
    result = delete_binder(db_session, test_binder.id, test_user_id)
    
    assert result is True
    assert get_binder_by_id(db_session, test_binder.id, test_user_id) is None


def test_get_binder_stats(db_session, test_user_id, test_binder, test_card):
    """Test getting binder statistics."""
    # Add FMV to card
    test_card.current_fmv = Decimal("200.00")
    db_session.commit()
    
    stats = get_binder_stats(db_session, test_binder.id, test_user_id)
    
    assert stats is not None
    assert stats.total_cards == 1
    assert stats.total_value == Decimal("200.00")
    assert stats.total_cost == Decimal("150.00")
    assert stats.roi_percentage > 0  # Should be positive ROI


# ============================================================================
# Card Tests
# ============================================================================

def test_create_card(db_session, test_user_id, test_binder):
    """Test creating a card."""
    card_data = CardCreate(
        binder_id=test_binder.id,
        athlete="LeBron James",
        search_query_string="LeBron James 2003 Topps Chrome",
        purchase_price=Decimal("500.00")
    )
    card = create_card(db_session, test_user_id, card_data)
    
    assert card is not None
    assert card.athlete == "LeBron James"
    assert card.binder_id == test_binder.id


def test_create_card_wrong_binder(db_session, test_user_id):
    """Test that users can't add cards to non-existent binders."""
    card_data = CardCreate(
        binder_id=99999,
        athlete="Test Athlete",
        search_query_string="test query"
    )
    card = create_card(db_session, test_user_id, card_data)
    
    assert card is None


def test_get_cards_by_binder(db_session, test_user_id, test_binder, test_card):
    """Test getting all cards in a binder."""
    cards = get_cards_by_binder(db_session, test_binder.id, test_user_id)
    
    assert len(cards) == 1
    assert cards[0].id == test_card.id


def test_get_card_by_id(db_session, test_user_id, test_card):
    """Test getting a specific card."""
    card = get_card_by_id(db_session, test_card.id, test_user_id)
    
    assert card is not None
    assert card.id == test_card.id


def test_update_card(db_session, test_user_id, test_card):
    """Test updating a card."""
    update_data = CardUpdate(
        athlete="Victor Wembanyama Jr.",
        current_fmv=Decimal("250.00")
    )
    updated = update_card(db_session, test_card.id, test_user_id, update_data)
    
    assert updated is not None
    assert updated.athlete == "Victor Wembanyama Jr."


def test_delete_card(db_session, test_user_id, test_card):
    """Test deleting a card."""
    result = delete_card(db_session, test_card.id, test_user_id)
    
    assert result is True
    assert get_card_by_id(db_session, test_card.id, test_user_id) is None


def test_get_cards_for_auto_update(db_session, test_user_id, test_binder):
    """Test finding cards that need auto-updates."""
    # Create card with old update timestamp
    old_card_data = CardCreate(
        binder_id=test_binder.id,
        athlete="Old Card",
        search_query_string="old card query",
        auto_update=True
    )
    old_card = create_card(db_session, test_user_id, old_card_data)
    old_card.last_updated_at = datetime.utcnow() - timedelta(days=35)
    db_session.commit()
    
    # Create card with recent update
    new_card_data = CardCreate(
        binder_id=test_binder.id,
        athlete="New Card",
        search_query_string="new card query",
        auto_update=True
    )
    new_card = create_card(db_session, test_user_id, new_card_data)
    new_card.last_updated_at = datetime.utcnow()
    db_session.commit()
    
    # Create card with auto_update disabled
    disabled_card_data = CardCreate(
        binder_id=test_binder.id,
        athlete="Disabled Card",
        search_query_string="disabled query",
        auto_update=False
    )
    create_card(db_session, test_user_id, disabled_card_data)
    
    stale_cards = get_cards_for_auto_update(db_session, days_threshold=30)
    
    assert len(stale_cards) == 1
    assert stale_cards[0].id == old_card.id


# ============================================================================
# Price History Tests
# ============================================================================

def test_add_price_history(db_session, test_card):
    """Test adding price history."""
    history_data = PriceHistoryCreate(
        card_id=test_card.id,
        value=Decimal("175.00"),
        num_sales=15,
        confidence="high"
    )
    history = add_price_history(db_session, history_data)
    
    assert history is not None
    assert history.card_id == test_card.id
    assert history.value == Decimal("175.00")


def test_get_card_price_history(db_session, test_card):
    """Test getting price history for a card."""
    # Add multiple history entries
    for i in range(5):
        history_data = PriceHistoryCreate(
            card_id=test_card.id,
            value=Decimal(f"{150 + i * 10}.00"),
            confidence="medium"
        )
        add_price_history(db_session, history_data)
    
    history = get_card_price_history(db_session, test_card.id, limit=3)
    
    assert len(history) == 3
    # Should be in descending order by date
    assert history[0].value > history[-1].value


# ============================================================================
# Collection Overview Tests
# ============================================================================

def test_get_collection_overview(db_session, test_user_id, test_binder, test_card):
    """Test getting collection overview."""
    # Set FMV for ROI calculation
    test_card.current_fmv = Decimal("200.00")
    test_card.last_updated_at = datetime.utcnow()
    db_session.commit()
    
    overview = get_collection_overview(db_session, test_user_id)
    
    assert overview.total_binders == 1
    assert overview.total_cards == 1
    assert overview.total_value == Decimal("200.00")
    assert overview.total_cost == Decimal("150.00")
    assert overview.roi_percentage > 0


def test_collection_overview_empty(db_session, test_user_id):
    """Test collection overview with no binders."""
    overview = get_collection_overview(db_session, test_user_id)
    
    assert overview.total_binders == 0
    assert overview.total_cards == 0
    assert overview.total_value == Decimal("0")


# ============================================================================
# Edge Cases
# ============================================================================

def test_binder_cascade_delete(db_session, test_user_id, test_binder, test_card):
    """Test that deleting a binder cascades to cards."""
    card_id = test_card.id
    
    delete_binder(db_session, test_binder.id, test_user_id)
    
    # Card should be deleted
    card = db_session.query(Card).filter(Card.id == card_id).first()
    assert card is None


def test_card_cascade_delete_price_history(db_session, test_user_id, test_card):
    """Test that deleting a card cascades to price history."""
    # Add price history
    history_data = PriceHistoryCreate(
        card_id=test_card.id,
        value=Decimal("100.00")
    )
    history = add_price_history(db_session, history_data)
    history_id = history.id
    
    delete_card(db_session, test_card.id, test_user_id)
    
    # Price history should be deleted
    history = db_session.query(PriceHistory).filter(PriceHistory.id == history_id).first()
    assert history is None


def test_roi_calculation_no_purchase_price(db_session, test_user_id, test_binder):
    """Test ROI calculation when purchase price is missing."""
    card_data = CardCreate(
        binder_id=test_binder.id,
        athlete="Test Athlete",
        search_query_string="test query",
        purchase_price=None  # No purchase price
    )
    card = create_card(db_session, test_user_id, card_data)
    card.current_fmv = Decimal("100.00")
    db_session.commit()
    
    stats = get_binder_stats(db_session, test_binder.id, test_user_id)
    
    # Should handle missing purchase price gracefully
    assert stats.roi_percentage == 0.0
