# backend/models/collection_schemas.py
"""
Pydantic schemas for Collections & Binders feature (Phase 2).
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


# ============================================================================
# Binder Schemas
# ============================================================================

class BinderBase(BaseModel):
    """Base schema for Binder."""
    name: str = Field(..., min_length=1, max_length=200, description="Name of the binder")


class BinderCreate(BinderBase):
    """Schema for creating a new binder."""
    pass


class BinderUpdate(BaseModel):
    """Schema for updating a binder."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    cover_card_id: Optional[int] = None


class BinderResponse(BinderBase):
    """Schema for binder response."""
    id: int
    user_id: str
    cover_card_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    # Computed fields (not in DB)
    total_cards: Optional[int] = Field(None, description="Total number of cards in binder")
    total_value: Optional[Decimal] = Field(None, description="Sum of current FMV for all cards")
    total_cost: Optional[Decimal] = Field(None, description="Sum of purchase prices")
    roi_percentage: Optional[float] = Field(None, description="Return on investment percentage")
    
    class Config:
        from_attributes = True


# ============================================================================
# Card Schemas
# ============================================================================

class CardBase(BaseModel):
    """Base schema for Card."""
    # Identity fields
    year: Optional[str] = Field(None, max_length=10, description="Card year (e.g., '2023')")
    set_name: Optional[str] = Field(None, max_length=200, description="Card set name (e.g., 'Prizm')")
    athlete: str = Field(..., min_length=1, max_length=200, description="Athlete name")
    card_number: Optional[str] = Field(None, max_length=50, description="Card number")
    variation: Optional[str] = Field(None, max_length=200, description="Variation/parallel (e.g., 'Silver Prizm')")
    
    # Condition fields
    grading_company: Optional[str] = Field(None, max_length=50, description="Grading company (PSA, BGS, Raw, etc.)")
    grade: Optional[str] = Field(None, max_length=20, description="Grade (e.g., '10', '9.5')")
    
    # Visual
    image_url: Optional[str] = None
    
    # Search logic
    search_query_string: str = Field(..., min_length=1, description="Exact search string for automated updates")
    auto_update: bool = Field(True, description="Enable automatic FMV updates")
    
    # Financial fields
    purchase_price: Optional[Decimal] = Field(None, ge=0, description="Purchase price in USD")
    purchase_date: Optional[datetime] = None
    
    # Metadata
    tags: Optional[str] = Field(None, description="JSON array of tags")
    notes: Optional[str] = None


class CardCreate(CardBase):
    """Schema for creating a new card."""
    binder_id: int = Field(..., description="ID of the binder to add card to")


class CardUpdate(BaseModel):
    """Schema for updating a card."""
    year: Optional[str] = Field(None, max_length=10)
    set_name: Optional[str] = Field(None, max_length=200)
    athlete: Optional[str] = Field(None, min_length=1, max_length=200)
    card_number: Optional[str] = Field(None, max_length=50)
    variation: Optional[str] = Field(None, max_length=200)
    grading_company: Optional[str] = Field(None, max_length=50)
    grade: Optional[str] = Field(None, max_length=20)
    image_url: Optional[str] = None
    search_query_string: Optional[str] = Field(None, min_length=1)
    auto_update: Optional[bool] = None
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    purchase_date: Optional[datetime] = None
    tags: Optional[str] = None
    notes: Optional[str] = None
    binder_id: Optional[int] = None  # Allow moving cards between binders


class CardResponse(CardBase):
    """Schema for card response."""
    id: int
    binder_id: int
    current_fmv: Optional[Decimal] = None
    last_updated_at: Optional[datetime] = None
    review_required: bool = False
    review_reason: Optional[str] = None
    no_recent_sales: bool = False
    created_at: datetime
    updated_at: datetime
    
    # Computed fields
    roi_percentage: Optional[float] = Field(None, description="ROI for this specific card")
    days_since_update: Optional[int] = Field(None, description="Days since last FMV update")
    
    class Config:
        from_attributes = True


class CardWithHistory(CardResponse):
    """Card response with price history for sparkline charts."""
    price_history: List['PriceHistoryResponse'] = []


# ============================================================================
# Price History Schemas
# ============================================================================

class PriceHistoryBase(BaseModel):
    """Base schema for PriceHistory."""
    value: Decimal = Field(..., ge=0, description="FMV value at this point in time")
    num_sales: Optional[int] = Field(None, ge=0, description="Number of sales used in calculation")
    confidence: Optional[str] = Field(None, description="Confidence level: high, medium, low")
    
    @validator('confidence')
    def validate_confidence(cls, v):
        """Validate confidence level."""
        if v is not None and v not in ['high', 'medium', 'low']:
            raise ValueError("Confidence must be 'high', 'medium', or 'low'")
        return v


class PriceHistoryCreate(PriceHistoryBase):
    """Schema for creating a price history entry."""
    card_id: int


class PriceHistoryResponse(PriceHistoryBase):
    """Schema for price history response."""
    id: int
    card_id: int
    date_recorded: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Bulk Operations
# ============================================================================

class BulkCardCreate(BaseModel):
    """Schema for bulk card creation."""
    cards: List[CardCreate] = Field(..., min_items=1, max_items=100)


class BulkCardResponse(BaseModel):
    """Response for bulk card creation."""
    created: List[CardResponse]
    failed: List[dict] = Field(default_factory=list, description="Cards that failed to create")


# ============================================================================
# Dashboard/Analytics Schemas
# ============================================================================

class BinderStats(BaseModel):
    """Aggregated statistics for a binder."""
    binder_id: int
    binder_name: str
    total_cards: int
    total_value: Decimal = Field(description="Sum of current FMV")
    total_cost: Decimal = Field(description="Sum of purchase prices")
    roi_percentage: float = Field(description="Return on investment percentage")
    cards_needing_review: int = Field(description="Number of cards flagged for review")
    cards_with_stale_data: int = Field(description="Number of cards not updated in 30+ days")
    last_updated: Optional[datetime] = Field(None, description="Most recent card update in binder")


class CollectionOverview(BaseModel):
    """Overview of user's entire collection."""
    total_binders: int
    total_cards: int
    total_value: Decimal
    total_cost: Decimal
    roi_percentage: float
    cards_needing_review: int
    cards_with_stale_data: int
    top_performers: List[CardResponse] = Field(default_factory=list, description="Cards with highest ROI")
    recent_updates: List[CardResponse] = Field(default_factory=list, description="Recently updated cards")


# ============================================================================
# Search/Filter Schemas
# ============================================================================

class CardFilter(BaseModel):
    """Filters for card search."""
    binder_id: Optional[int] = None
    athlete: Optional[str] = None
    year: Optional[str] = None
    set_name: Optional[str] = None
    grading_company: Optional[str] = None
    min_value: Optional[Decimal] = None
    max_value: Optional[Decimal] = None
    review_required: Optional[bool] = None
    auto_update: Optional[bool] = None
    tags: Optional[List[str]] = None


# Update forward references
CardWithHistory.model_rebuild()
