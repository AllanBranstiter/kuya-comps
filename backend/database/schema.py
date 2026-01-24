# backend/database/schema.py
"""
SQLAlchemy database models for feedback system and collections.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime, Float, Numeric, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class FeedbackSubmission(Base):
    """Main feedback submissions table."""
    __tablename__ = "feedback_submissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False, index=True)
    category = Column(String(50), nullable=False, index=True)
    description = Column(Text, nullable=False)
    url = Column(Text, nullable=False)
    timestamp = Column(String(50), nullable=False, index=True)  # ISO 8601 timestamp from client
    browser = Column(Text, nullable=True)
    os = Column(String(100), nullable=True)
    screen_resolution = Column(String(20), nullable=True)
    viewport_size = Column(String(20), nullable=True)
    has_screenshot = Column(Boolean, default=False, nullable=False)
    has_annotation = Column(Boolean, default=False, nullable=False)
    annotation_coords = Column(Text, nullable=True)  # JSON string
    api_state = Column(Text, nullable=True)  # JSON string of last API response
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Phase 3: Admin management fields
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    is_archived = Column(Boolean, default=False, nullable=False, index=True)
    admin_notes = Column(Text, nullable=True)
    
    # Relationship to screenshots
    screenshots = relationship("FeedbackScreenshot", back_populates="feedback", cascade="all, delete-orphan")


class FeedbackScreenshot(Base):
    """Separate table for screenshots to keep main table lean."""
    __tablename__ = "feedback_screenshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    feedback_id = Column(Integer, ForeignKey("feedback_submissions.id", ondelete="CASCADE"), nullable=False)
    screenshot_data = Column(Text, nullable=False)  # Base64 encoded image data
    size_kb = Column(Integer, nullable=True)  # Screenshot size for monitoring
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationship to feedback
    feedback = relationship("FeedbackSubmission", back_populates="screenshots")


# ============================================================================
# Collections & Binders Schema (Phase 2)
# ============================================================================

class Binder(Base):
    """User's card collection binders."""
    __tablename__ = "binders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), nullable=False, index=True)  # Supabase user ID
    name = Column(String(200), nullable=False)
    cover_card_id = Column(Integer, ForeignKey("cards.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    cards = relationship("Card", back_populates="binder", foreign_keys="Card.binder_id", cascade="all, delete-orphan")
    cover_card = relationship("Card", foreign_keys=[cover_card_id], post_update=True)
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_binder_user_created', 'user_id', 'created_at'),
    )


class Card(Base):
    """Individual cards in user collections."""
    __tablename__ = "cards"

    # Primary key
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Foreign keys
    binder_id = Column(Integer, ForeignKey("binders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(100), nullable=False, index=True)  # Denormalized for direct queries
    
    # Card Identity Fields
    year = Column(String(10), nullable=True)  # e.g., "2023"
    set_name = Column(String(200), nullable=True)  # e.g., "Prizm"
    athlete = Column(String(200), nullable=False, index=True)  # e.g., "Victor Wembanyama"
    card_number = Column(String(50), nullable=True)  # e.g., "1", "RC-1"
    variation = Column(String(200), nullable=True)  # e.g., "Silver Prizm", "Base"
    
    # Condition Fields
    grading_company = Column(String(50), nullable=True)  # e.g., "PSA", "BGS", "Raw", "SGC"
    grade = Column(String(20), nullable=True)  # e.g., "10", "9.5", "Gem Mint 10"
    
    # Visual
    image_url = Column(Text, nullable=True)  # URL to card image
    
    # Search & Update Logic
    search_query_string = Column(Text, nullable=False)  # Exact string used for automated scraping
    auto_update = Column(Boolean, default=True, nullable=False, index=True)  # Enable/disable auto-valuation
    last_updated_at = Column(DateTime, nullable=True, index=True)  # Last FMV update timestamp
    
    # Financial Fields
    purchase_price = Column(Numeric(10, 2), nullable=True)  # User's purchase price
    purchase_date = Column(DateTime, nullable=True)  # When user acquired the card
    current_fmv = Column(Numeric(10, 2), nullable=True)  # Latest calculated Fair Market Value
    
    # Status & Flags
    review_required = Column(Boolean, default=False, nullable=False, index=True)  # Flagged for manual review
    review_reason = Column(Text, nullable=True)  # Why review is needed (e.g., "50%+ price change")
    no_recent_sales = Column(Boolean, default=False, nullable=False)  # No sales found in last update
    
    # Quick Filter Flags (for FMV calculations)
    exclude_lots = Column(Boolean, default=False, nullable=True)  # Filter out lot listings from FMV calculations
    raw_only = Column(Boolean, default=False, nullable=True)  # Filter to only raw/ungraded listings
    base_only = Column(Boolean, default=False, nullable=True)  # Filter to only base card listings
    
    # Metadata
    tags = Column(Text, nullable=True)  # JSON array of user tags
    notes = Column(Text, nullable=True)  # User notes about the card
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    binder = relationship("Binder", back_populates="cards", foreign_keys=[binder_id])
    price_history = relationship("PriceHistory", back_populates="card", cascade="all, delete-orphan")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_card_binder_athlete', 'binder_id', 'athlete'),
        Index('idx_card_auto_update_stale', 'auto_update', 'last_updated_at'),
        Index('idx_card_review_required', 'review_required'),
        Index('idx_card_user_id_auto_update', 'user_id', 'auto_update'),  # New composite index
    )


class PriceHistory(Base):
    """Historical price data for cards (used for sparkline charts)."""
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    card_id = Column(Integer, ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True)
    value = Column(Numeric(10, 2), nullable=False)  # FMV at this point in time
    date_recorded = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Optional metadata about the valuation
    num_sales = Column(Integer, nullable=True)  # Number of sales used in calculation
    confidence = Column(String(20), nullable=True)  # "high", "medium", "low"
    
    # Relationship
    card = relationship("Card", back_populates="price_history")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_price_history_card_date', 'card_id', 'date_recorded'),
    )
