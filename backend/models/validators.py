# backend/models/validators.py
"""
Pydantic validators for API request validation.
"""

from typing import Optional
from pydantic import BaseModel, Field, field_validator


# Whitelist of allowed sort options for eBay searches
ALLOWED_SORT_OPTIONS = [
    "best_match",
    "price_low_to_high",
    "price_high_to_low",
    "time_newly_listed",
    "time_ending_soonest",
    "distance_nearest",
]

# Whitelist of allowed buying formats
ALLOWED_BUYING_FORMATS = [
    "auction",
    "buy_it_now",
    "best_offer",
    "classified_ad",
]

# Whitelist of allowed condition filters
ALLOWED_CONDITIONS = [
    "new",
    "used",
    "pre_owned_excellent",
    "pre_owned_good",
    "pre_owned_very_good",
    "for_parts_or_not_working",
]


class QueryValidator(BaseModel):
    """
    Validator for sold/completed listings search queries.
    Used by the /comps endpoint.
    """
    query: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Search term for eBay listings"
    )
    pages: int = Field(
        default=1,
        ge=1,
        le=10,
        description="Number of pages to scrape (1-10)"
    )
    delay: float = Field(
        default=2.0,
        ge=0.0,
        le=10.0,
        description="Delay between page fetches in seconds"
    )
    sort_by: str = Field(
        default="best_match",
        description="Sort order for search results"
    )
    buying_format: Optional[str] = Field(
        default=None,
        description="Filter by buying format"
    )
    condition: Optional[str] = Field(
        default=None,
        description="Filter by item condition"
    )
    price_min: Optional[float] = Field(
        default=None,
        ge=0,
        description="Minimum price filter"
    )
    price_max: Optional[float] = Field(
        default=None,
        ge=0,
        description="Maximum price filter"
    )
    raw_only: bool = Field(
        default=False,
        description="Filter out graded cards"
    )
    base_only: bool = Field(
        default=False,
        description="Filter out parallels and variations"
    )
    exclude_autographs: bool = Field(
        default=False,
        description="Filter out autographed cards"
    )
    test_mode: bool = Field(
        default=False,
        description="Use test data instead of live API"
    )

    @field_validator('sort_by')
    @classmethod
    def validate_sort_by(cls, v: str) -> str:
        """Validate sort_by is in the allowed list."""
        if v not in ALLOWED_SORT_OPTIONS:
            raise ValueError(
                f"sort_by must be one of: {', '.join(ALLOWED_SORT_OPTIONS)}"
            )
        return v

    @field_validator('buying_format')
    @classmethod
    def validate_buying_format(cls, v: Optional[str]) -> Optional[str]:
        """Validate buying_format is in the allowed list."""
        if v is not None and v not in ALLOWED_BUYING_FORMATS:
            raise ValueError(
                f"buying_format must be one of: {', '.join(ALLOWED_BUYING_FORMATS)}"
            )
        return v

    @field_validator('condition')
    @classmethod
    def validate_condition(cls, v: Optional[str]) -> Optional[str]:
        """Validate condition is in the allowed list."""
        if v is not None and v not in ALLOWED_CONDITIONS:
            raise ValueError(
                f"condition must be one of: {', '.join(ALLOWED_CONDITIONS)}"
            )
        return v

    @field_validator('price_max')
    @classmethod
    def validate_price_range(cls, v: Optional[float], info) -> Optional[float]:
        """Validate price_max is greater than price_min if both are set."""
        price_min = info.data.get('price_min')
        if v is not None and price_min is not None and v < price_min:
            raise ValueError("price_max must be greater than price_min")
        return v


class ActiveListingsValidator(BaseModel):
    """
    Validator for active listings search queries.
    Used by the /active endpoint.
    """
    query: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Search term for eBay listings"
    )
    pages: int = Field(
        default=1,
        ge=1,
        le=10,
        description="Number of pages to scrape (1-10)"
    )
    delay: float = Field(
        default=2.0,
        ge=0.0,
        le=10.0,
        description="Delay between page fetches in seconds"
    )
    sort_by: str = Field(
        default="best_match",
        description="Sort order for search results"
    )
    buying_format: Optional[str] = Field(
        default=None,
        description="Filter by buying format"
    )
    condition: Optional[str] = Field(
        default=None,
        description="Filter by item condition"
    )
    price_min: Optional[float] = Field(
        default=None,
        ge=0,
        description="Minimum price filter"
    )
    price_max: Optional[float] = Field(
        default=None,
        ge=0,
        description="Maximum price filter"
    )

    @field_validator('sort_by')
    @classmethod
    def validate_sort_by(cls, v: str) -> str:
        """Validate sort_by is in the allowed list."""
        if v not in ALLOWED_SORT_OPTIONS:
            raise ValueError(
                f"sort_by must be one of: {', '.join(ALLOWED_SORT_OPTIONS)}"
            )
        return v

    @field_validator('buying_format')
    @classmethod
    def validate_buying_format(cls, v: Optional[str]) -> Optional[str]:
        """Validate buying_format is in the allowed list."""
        if v is not None and v not in ALLOWED_BUYING_FORMATS:
            raise ValueError(
                f"buying_format must be one of: {', '.join(ALLOWED_BUYING_FORMATS)}"
            )
        return v

    @field_validator('condition')
    @classmethod
    def validate_condition(cls, v: Optional[str]) -> Optional[str]:
        """Validate condition is in the allowed list."""
        if v is not None and v not in ALLOWED_CONDITIONS:
            raise ValueError(
                f"condition must be one of: {', '.join(ALLOWED_CONDITIONS)}"
            )
        return v

    @field_validator('price_max')
    @classmethod
    def validate_price_range(cls, v: Optional[float], info) -> Optional[float]:
        """Validate price_max is greater than price_min if both are set."""
        price_min = info.data.get('price_min')
        if v is not None and price_min is not None and v < price_min:
            raise ValueError("price_max must be greater than price_min")
        return v
