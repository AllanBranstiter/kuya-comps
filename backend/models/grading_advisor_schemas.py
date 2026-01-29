# backend/models/grading_advisor_schemas.py
"""
Pydantic schemas for the Intelligent Grading Advisor feature.

This module provides data models for analyzing whether a card is worth
submitting to PSA for professional grading based on price data, population
data, and expected grade analysis.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Dict, List, Literal, Optional


# ============================================================================
# Supporting Schemas
# ============================================================================

class GradeAnalysis(BaseModel):
    """
    Analysis for a single PSA grade level.
    
    Provides profit/loss calculations and ROI for each potential grade
    outcome to help users understand the financial impact of different
    grading scenarios.
    """
    grade: str = Field(..., description="PSA grade (1-10)")
    market_value: float = Field(..., ge=0, description="Current market value for this grade")
    population: int = Field(..., ge=0, description="PSA population count for this grade")
    profit_loss: float = Field(..., description="Profit or loss if card receives this grade")
    roi: float = Field(..., description="Return on investment percentage")
    is_profitable: bool = Field(..., description="Whether this grade outcome is profitable")


class ScenarioResult(BaseModel):
    """
    Result for a single grading scenario (optimistic, realistic, or pessimistic).
    """
    grade: str = Field(..., description="Expected grade for this scenario")
    profit_loss: float = Field(..., description="Expected profit or loss")
    probability: float = Field(
        ..., 
        ge=0, 
        le=1, 
        description="Probability of this scenario (0-1)"
    )


class ScenarioAnalysis(BaseModel):
    """
    Three-scenario analysis showing best, likely, and worst case outcomes.
    
    Helps users understand the range of possible financial outcomes
    when submitting a card for grading.
    """
    optimistic: ScenarioResult = Field(..., description="Best case scenario")
    realistic: ScenarioResult = Field(..., description="Most likely scenario")
    pessimistic: ScenarioResult = Field(..., description="Worst case scenario")


class PopulationDistribution(BaseModel):
    """
    PSA population distribution data for the card.
    
    Provides insights into rarity and market competition based on
    how many copies exist at each grade level.
    """
    total_population: int = Field(..., ge=0, description="Total PSA population across all grades")
    grade_percentages: Dict[str, float] = Field(
        ...,
        description="Percentage of population at each grade (keys: '1'-'10')"
    )
    rarity_tier: str = Field(
        ...,
        description="Rarity classification: 'Common', 'Uncommon', 'Rare', or 'Very Rare'"
    )
    gem_rate: float = Field(
        default=0.0,
        ge=0,
        le=100,
        description="Percentage of population at PSA 10 (gem rate)"
    )
    gem_rate_tier: str = Field(
        default="Unknown",
        description="Gem rate classification: 'Rare Gems', 'Quality Card', 'Moderate', or 'Common Gems'"
    )
    gem_rate_class: str = Field(
        default="moderate",
        description="CSS class for gem rate styling: 'rare-gems', 'quality', 'moderate', or 'common-gems'"
    )
    era: str = Field(
        default="Unknown",
        description="Card era: 'Vintage', 'Junk Wax Era', 'Modern', 'Ultra-Modern'"
    )
    era_class: str = Field(
        default="unknown",
        description="CSS class: 'vintage', 'junk-wax', 'modern', 'ultra-modern'"
    )
    high_grade_rate: Optional[float] = Field(
        default=None,
        ge=0,
        le=100,
        description="Percentage at PSA 7+ (vintage cards only)"
    )
    high_grade_tier: Optional[str] = Field(
        default=None,
        description="'Elite', 'Quality', 'Average', 'Difficult'"
    )
    high_grade_class: Optional[str] = Field(
        default=None,
        description="CSS class for high-grade rate"
    )
    
    @field_validator('rarity_tier')
    @classmethod
    def validate_rarity_tier(cls, v: str) -> str:
        """Validate rarity tier is one of the allowed values."""
        allowed = ['Common', 'Uncommon', 'Rare', 'Very Rare']
        if v not in allowed:
            raise ValueError(f"rarity_tier must be one of {allowed}")
        return v
    
    @field_validator('gem_rate_tier')
    @classmethod
    def validate_gem_rate_tier(cls, v: str) -> str:
        """Validate gem rate tier is one of the allowed values."""
        allowed = ['Ultra-Rare', 'Rare', 'Average', 'Plentiful', 'Unknown']
        if v not in allowed:
            raise ValueError(f"gem_rate_tier must be one of {allowed}")
        return v
    
    @field_validator('gem_rate_class')
    @classmethod
    def validate_gem_rate_class(cls, v: str) -> str:
        """Validate gem rate class is one of the allowed values."""
        allowed = ['rare-gems', 'quality', 'moderate', 'common-gems']
        if v not in allowed:
            raise ValueError(f"gem_rate_class must be one of {allowed}")
        return v


class CollectorProfiles(BaseModel):
    """
    Personalized advice for different collector strategies.
    
    Provides tailored recommendations based on whether the user
    is looking to flip for quick profit or hold long-term.
    """
    flipper_advice: str = Field(..., description="Advice for collectors looking to flip quickly")
    long_term_advice: str = Field(..., description="Advice for long-term holders")
    recommended_strategy: Literal["flip", "hold", "avoid"] = Field(
        ..., 
        description="Recommended overall strategy"
    )


# ============================================================================
# Request Schema
# ============================================================================

class GradingAdvisorRequest(BaseModel):
    """
    Request model for the Grading Advisor endpoint.
    
    Contains all the data needed to analyze whether a card is worth
    submitting to PSA for professional grading.
    """
    price_data: Dict[str, float] = Field(
        ..., 
        description="PSA price data for grades 1-10 (keys: '1', '2', ..., '10')"
    )
    population_data: Dict[str, int] = Field(
        ..., 
        description="PSA population data for grades 1-10 (keys: '1', '2', ..., '10')"
    )
    raw_purchase_price: float = Field(
        ..., 
        ge=0, 
        description="What the user paid for the raw (ungraded) card"
    )
    grading_fee: float = Field(
        default=21.00, 
        ge=0, 
        description="Cost to grade the card (default: $21.00 for PSA Value tier)"
    )
    expected_grade: Optional[int] = Field(
        default=None,
        ge=1,
        le=10,
        description="User's predicted grade (1-10, optional)"
    )
    card_year: Optional[int] = Field(
        default=None,
        ge=1800,
        le=2026,
        description="Year the card was manufactured (used for era classification)"
    )
    
    @field_validator('price_data')
    @classmethod
    def validate_price_data(cls, v: Dict[str, float]) -> Dict[str, float]:
        """Validate that price data contains valid grade keys."""
        valid_grades = {str(i) for i in range(1, 11)}
        for key in v.keys():
            if key not in valid_grades:
                raise ValueError(f"Invalid grade key '{key}'. Must be '1' through '10'")
        return v
    
    @field_validator('population_data')
    @classmethod
    def validate_population_data(cls, v: Dict[str, int]) -> Dict[str, int]:
        """Validate that population data contains valid grade keys."""
        valid_grades = {str(i) for i in range(1, 11)}
        for key in v.keys():
            if key not in valid_grades:
                raise ValueError(f"Invalid grade key '{key}'. Must be '1' through '10'")
        return v


# ============================================================================
# Response Schema
# ============================================================================

class GradingAdvisorResponse(BaseModel):
    """
    Response model for the Grading Advisor endpoint.
    
    Provides comprehensive analysis including verdict, grade-by-grade
    breakdown, scenario analysis, and personalized advice.
    """
    # Primary verdict
    verdict: str = Field(
        ...,
        description="Display text (e.g., '✅ GREEN LIGHT: SUBMIT')"
    )
    status: Literal["green", "yellow", "red"] = Field(
        ...,
        description="Color status for UI styling"
    )
    
    # Confidence metrics (era-adjusted)
    confidence_score: int = Field(..., ge=1, le=5, description="Confidence score 1-5")
    confidence_label: str = Field(..., description="EXCELLENT, HIGH, MODERATE, MARGINAL, or RISKY")
    confidence_class: str = Field(..., description="CSS class for styling")
    confidence_dots: str = Field(..., description="Visual dots display (e.g., '●●●●●')")
    
    # Summary metrics
    success_rate: float = Field(
        ..., 
        ge=0, 
        le=100, 
        description="Percentage of grades that would be profitable"
    )
    expected_value: float = Field(
        ..., 
        description="Weighted expected profit/loss across all scenarios"
    )
    break_even_grade: Optional[str] = Field(
        default=None, 
        description="Minimum grade needed to break even (e.g., '8')"
    )
    target_grade: Optional[str] = Field(
        default=None, 
        description="Recommended target grade for optimal returns"
    )
    
    # Detailed analysis
    matrix: Dict[str, GradeAnalysis] = Field(
        ..., 
        description="Grade-by-grade analysis (keys: '1'-'10')"
    )
    scenario_analysis: ScenarioAnalysis = Field(
        ..., 
        description="Optimistic/Realistic/Pessimistic outcome scenarios"
    )
    profitable_grades: List[str] = Field(
        ..., 
        description="List of grade strings that would be profitable"
    )
    
    # Population insights
    distribution: PopulationDistribution = Field(
        ..., 
        description="Population distribution data"
    )
    
    # Collector guidance
    collector_profiles: CollectorProfiles = Field(
        ..., 
        description="Flipper and long-term holder advice"
    )
    era_insights: Optional[str] = Field(
        default=None, 
        description="Era-specific educational content (e.g., vintage vs. modern)"
    )
    
    # Warnings and flags
    warnings: List[str] = Field(
        default_factory=list, 
        description="Population warning flags and cautions"
    )
    
    # Output text
    advice_text: str = Field(
        ..., 
        description="'Kuya's Advice' - generated explanation for the user"
    )
    copy_text: str = Field(
        ..., 
        description="Pre-formatted text for sharing/copying"
    )
