# backend/models/schemas.py
"""
Pydantic models for API requests and responses.

This module contains all the data models used across the application,
extracted from main.py to avoid circular imports.
"""
from datetime import date
from typing import List, Optional, Dict
from pydantic import BaseModel


class Seller(BaseModel):
    name: Optional[str] = None
    reviews: Optional[int] = None
    positive_feedback_percent: Optional[float] = None
    is_top_rated_plus: Optional[bool] = None
    is_direct_from_seller: Optional[bool] = None
    thumbnail: Optional[str] = None


class ExtractedPriceRange(BaseModel):
    from_price: Optional[float] = None
    to_price: Optional[float] = None


class CompItem(BaseModel):
    date_scraped: date = date.today()
    library_id: Optional[int] = None
    position: Optional[int] = None
    library_card_name: Optional[str] = None
    product_id: Optional[str] = None
    item_id: Optional[str] = None
    title: Optional[str] = None
    subtitle: Optional[str] = None
    tag: Optional[str] = None
    link: Optional[str] = None
    seller: Optional[Seller] = None
    brand: Optional[str] = None
    condition: Optional[str] = None
    extensions: Optional[List[str]] = None
    authenticity: Optional[str] = None
    is_sponsored: Optional[bool] = None
    rating: Optional[float] = None
    reviews: Optional[int] = None
    reviews_link: Optional[str] = None
    buying_format: Optional[str] = None
    is_best_offer: Optional[bool] = None
    is_buy_it_now: Optional[bool] = None
    is_auction: Optional[bool] = None
    price: Optional[str] = None
    extracted_price: Optional[float] = None
    extracted_price_range: Optional[ExtractedPriceRange] = None
    is_price_range: Optional[bool] = None
    original_price: Optional[str] = None
    extracted_original_price: Optional[float] = None
    unit_price: Optional[str] = None
    extracted_unit_price: Optional[float] = None
    bids: Optional[int] = None
    time_left: Optional[str] = None
    deal: Optional[str] = None
    discount: Optional[str] = None
    items_sold: Optional[str] = None
    extracted_items_sold: Optional[int] = None
    stock: Optional[str] = None
    watching: Optional[str] = None
    extracted_watching: Optional[int] = None
    shipping: Optional[str] = None
    extracted_shipping: Optional[float] = None
    shipping_details: Optional[str] = None
    is_free_return: Optional[bool] = None
    is_in_psa_vault: Optional[bool] = None
    trending: Optional[str] = None
    thumbnail: Optional[str] = None
    images: Optional[List[str]] = None
    # Fields from previous version, for compatibility
    url: Optional[str] = None
    listing_type: Optional[str] = None
    shipping_price: Optional[float] = None
    shipping_type: Optional[str] = None
    best_offer_enabled: Optional[bool] = None
    has_best_offer: Optional[bool] = None
    sold_price: Optional[float] = None
    end_time: Optional[str] = None
    auction_sold: Optional[bool] = None
    total_bids: Optional[int] = None
    sold: Optional[bool] = None
    total_price: Optional[float] = None
    deep_link: Optional[str] = None


class CompsResponse(BaseModel):
    query: str
    pages_scraped: int
    items: List[CompItem]
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    avg_price: Optional[float] = None
    raw_items_scraped: Optional[int] = None
    duplicates_filtered: Optional[int] = None
    zero_price_filtered: Optional[int] = None
    market_intelligence: Optional[Dict] = None


class PriceTier(BaseModel):
    """Price tier information for dynamic content selection."""
    tier_id: Optional[str] = None
    tier_emoji: Optional[str] = None
    tier_name: Optional[str] = None
    tier_range: Optional[str] = None
    tier_color: Optional[str] = None
    price_used: Optional[float] = None
    price_source: Optional[str] = None  # "fmv" or "avg_listing"


class FmvResponse(BaseModel):
    fmv_low: Optional[float] = None
    fmv_high: Optional[float] = None
    expected_low: Optional[float] = None
    expected_high: Optional[float] = None
    market_value: Optional[float] = None
    quick_sale: Optional[float] = None
    patient_sale: Optional[float] = None
    volume_confidence: Optional[str] = None
    count: int
    price_tier: Optional[PriceTier] = None  # NEW: Price tier information


class MarketMessageRequest(BaseModel):
    """Request model for market message endpoint."""
    fmv: Optional[float] = None
    avg_listing_price: Optional[float] = None
    market_pressure: float
    liquidity_score: float
    market_confidence: float
    absorption_below: Optional[float] = None
    absorption_above: Optional[float] = None
    below_fmv_count: int = 0
    above_fmv_count: int = 0
    sales_below: int = 0
    sales_above: int = 0


class ProfileResponse(BaseModel):
    """Response model for user profile."""
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    """Request model for updating user profile."""
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
