# backend/services/grading_advisor_service.py
"""
Grading Advisor Service for the Intelligent Grading Advisor feature.

This module contains all business logic for analyzing whether a card is worth
submitting to PSA for professional grading based on price data, population
data, grading fees, and expected grade predictions.
"""
from typing import Dict, List, Optional, Tuple

from backend.models.grading_advisor_schemas import (
    GradingAdvisorRequest,
    GradingAdvisorResponse,
    GradeAnalysis,
    ScenarioAnalysis,
    ScenarioResult,
    PopulationDistribution,
    CollectorProfiles,
)


# ============================================================================
# Constants
# ============================================================================

# Benchmark grade for "Buy the Slab" scenario (PSA 8 is industry standard)
BENCHMARK_GRADE = "8"

# Success rate thresholds for verdict determination
GREEN_LIGHT_THRESHOLD = 50.0  # > 50% = Green Light
YELLOW_LIGHT_MIN = 15.0       # 15-50% = Yellow Light
# < 15% = Gem or Bust

# Population thresholds for rarity tiers
VERY_RARE_MAX = 100
RARE_MAX = 500
UNCOMMON_MAX = 2000

# Gem rate thresholds (PSA 10 percentage of total population)
GEM_RATE_RARE = 5.0           # <5% = Rare gems (PSA 9s very valuable)
GEM_RATE_QUALITY = 30.0       # 5-30% = Quality card (PSA 9s valuable)
GEM_RATE_MODERATE = 60.0      # 30-60% = Moderate (PSA 9s declining value)
# 60%+ = Common gems (PSA 9s nearly worthless, must get PSA 10)

# Warning thresholds
HIGH_PSA_10_POP_THRESHOLD = 1000
LOW_POPULATION_THRESHOLD = 50
HIGH_CONCENTRATION_THRESHOLD = 50.0  # Percent


# ============================================================================
# Era Classification Functions
# ============================================================================

def _classify_card_era(year: Optional[int]) -> Tuple[str, str]:
    """Classify card era based on year. Returns (era_name, era_class)."""
    if not year or year < 1800:
        return ('Unknown', 'unknown')
    if year < 1984:
        return ('Vintage', 'vintage')
    elif year <= 1994:
        return ('Junk Wax Era', 'junk-wax')
    elif year <= 2019:
        return ('Modern', 'modern')
    else:
        return ('Ultra-Modern', 'ultra-modern')

def _calculate_high_grade_rate(
    population_data: Dict[str, int],
    era: str
) -> Tuple[Optional[float], Optional[str], Optional[str]]:
    """Calculate PSA 7+ rate for vintage cards."""
    if era != 'vintage':
        return (None, None, None)
    
    total_population = sum(population_data.get(str(i), 0) for i in range(1, 11))
    if total_population == 0:
        return (0.0, 'Unknown', 'unknown')
    
    high_grade_pop = sum(population_data.get(str(i), 0) for i in range(7, 11))
    high_grade_rate = (high_grade_pop / total_population) * 100
    
    if high_grade_rate > 40.0:
        return (round(high_grade_rate, 1), "Elite", "elite")
    elif high_grade_rate >= 25.0:
        return (round(high_grade_rate, 1), "Quality", "quality")
    elif high_grade_rate >= 10.0:
        return (round(high_grade_rate, 1), "Average", "average")
    else:
        return (round(high_grade_rate, 1), "Difficult", "difficult")


# ============================================================================
# Main Analysis Function
# ============================================================================

def analyze_grading_decision(request: GradingAdvisorRequest) -> GradingAdvisorResponse:
    """
    Analyze whether a card is worth submitting to PSA for grading.
    
    This is the main entry point for the Grading Advisor feature. It takes
    price and population data and returns a comprehensive analysis including
    verdict, grade-by-grade breakdown, scenario analysis, and personalized advice.
    
    Args:
        request: GradingAdvisorRequest containing price_data, population_data,
                 raw_purchase_price, grading_fee, and optional expected_grade
    
    Returns:
        GradingAdvisorResponse with complete analysis results
    
    Example:
        >>> request = GradingAdvisorRequest(
        ...     price_data={"1": 5.0, "2": 8.0, ..., "10": 500.0},
        ...     population_data={"1": 10, "2": 25, ..., "10": 150},
        ...     raw_purchase_price=50.0,
        ...     grading_fee=21.0,
        ...     expected_grade=8
        ... )
        >>> response = analyze_grading_decision(request)
        >>> print(response.verdict)
        "✅ GREEN LIGHT: SUBMIT"
    """
    total_cost = request.raw_purchase_price + request.grading_fee
    
    # Build grade-by-grade analysis matrix
    matrix: Dict[str, GradeAnalysis] = {}
    profitable_grades: List[str] = []
    
    for grade_num in range(1, 11):
        grade = str(grade_num)
        price = request.price_data.get(grade, 0.0)
        population = request.population_data.get(grade, 0)
        
        analysis = _calculate_grade_analysis(
            grade=grade,
            market_value=price,
            population=population,
            raw_purchase_price=request.raw_purchase_price,
            grading_fee=request.grading_fee
        )
        matrix[grade] = analysis
        
        if analysis.is_profitable:
            profitable_grades.append(grade)
    
    # Calculate population distribution
    distribution = _calculate_population_distribution(request.population_data, request.card_year)
    
    # Calculate success rate
    success_rate = (len(profitable_grades) / 10) * 100
    
    # Calculate expected value
    expected_value = _calculate_expected_value(matrix, distribution)
    
    # Find break-even grade
    break_even_grade = _find_break_even_grade(matrix)
    
    # Find target grade (highest profitable grade)
    target_grade = _find_target_grade(matrix, profitable_grades)
    
    # Determine verdict based on scenarios
    verdict, status = _determine_verdict(
        success_rate=success_rate,
        expected_grade=request.expected_grade,
        matrix=matrix,
        total_cost=total_cost,
        price_data=request.price_data
    )
    
    # Generate scenario analysis
    scenario_analysis = _generate_scenario_analysis(matrix, distribution)
    
    # Generate collector profiles
    collector_profiles = _generate_collector_profiles(
        matrix=matrix,
        distribution=distribution,
        verdict=verdict,
        status=status,
        profitable_grades=profitable_grades
    )
    
    # Generate warnings
    warnings = _generate_warnings(
        matrix=matrix,
        distribution=distribution,
        expected_value=expected_value,
        population_data=request.population_data,
        raw_purchase_price=request.raw_purchase_price,
        grading_fee=request.grading_fee,
        target_grade=target_grade,
        break_even_grade=break_even_grade,
        success_rate=success_rate,
        expected_grade=request.expected_grade
    )
    
    # Generate advice text
    advice_text = _generate_advice_text(
        verdict=verdict,
        status=status,
        success_rate=success_rate,
        expected_value=expected_value,
        break_even_grade=break_even_grade,
        target_grade=target_grade,
        total_cost=total_cost,
        profitable_grades=profitable_grades
    )
    
    # Build response object (copy_text needs access to response fields)
    response = GradingAdvisorResponse(
        verdict=verdict,
        status=status,
        success_rate=success_rate,
        expected_value=expected_value,
        break_even_grade=break_even_grade,
        target_grade=target_grade,
        matrix=matrix,
        scenario_analysis=scenario_analysis,
        profitable_grades=profitable_grades,
        distribution=distribution,
        collector_profiles=collector_profiles,
        warnings=warnings,
        advice_text=advice_text,
        copy_text=""  # Placeholder, will be set after
    )
    
    # Generate copy text (needs response data)
    copy_text = _generate_copy_text(request, response)
    response.copy_text = copy_text
    
    return response


# ============================================================================
# Helper Functions - Grade Analysis
# ============================================================================

def _calculate_grade_analysis(
    grade: str,
    market_value: float,
    population: int,
    raw_purchase_price: float,
    grading_fee: float
) -> GradeAnalysis:
    """
    Calculate profit/loss analysis for a single grade level.
    
    Args:
        grade: PSA grade string ("1" through "10")
        market_value: Current market value for this grade
        population: PSA population count for this grade
        raw_purchase_price: What user paid for raw card
        grading_fee: Cost to grade the card
    
    Returns:
        GradeAnalysis with profit_loss, roi, and is_profitable calculated
    """
    total_cost = raw_purchase_price + grading_fee
    profit_loss = market_value - total_cost
    
    # Calculate ROI, handling edge case of zero cost
    if total_cost > 0:
        roi = (profit_loss / total_cost) * 100
    else:
        roi = 0.0 if profit_loss == 0 else float('inf') if profit_loss > 0 else float('-inf')
    
    is_profitable = profit_loss > 0
    
    return GradeAnalysis(
        grade=grade,
        market_value=market_value,
        population=population,
        profit_loss=round(profit_loss, 2),
        roi=round(roi, 2),
        is_profitable=is_profitable
    )


def _calculate_population_distribution(
    population_data: Dict[str, int],
    card_year: Optional[int] = None
) -> PopulationDistribution:
    """
    Calculate population distribution statistics.
    
    Args:
        population_data: Dict mapping grade strings to population counts
        card_year: Optional year for era classification
    
    Returns:
        PopulationDistribution with total, percentages, rarity tier, and gem rate
    """
    total_population = sum(population_data.get(str(i), 0) for i in range(1, 11))
    
    # Calculate percentages for each grade
    grade_percentages: Dict[str, float] = {}
    for grade_num in range(1, 11):
        grade = str(grade_num)
        pop = population_data.get(grade, 0)
        if total_population > 0:
            percentage = (pop / total_population) * 100
        else:
            percentage = 0.0
        grade_percentages[grade] = round(percentage, 2)
    
    # Determine rarity tier
    rarity_tier = _calculate_rarity_tier(total_population)
    
    # Calculate gem rate (PSA 10 percentage)
    gem_rate = grade_percentages.get("10", 0.0)
    gem_rate_tier, gem_rate_class = _calculate_gem_rate_tier(gem_rate)
    
    # Classify card era
    era, era_class = _classify_card_era(card_year)
    
    # Calculate high-grade rate for vintage cards
    high_grade_rate, high_grade_tier, high_grade_class = _calculate_high_grade_rate(
        population_data, era_class
    )
    
    return PopulationDistribution(
        total_population=total_population,
        grade_percentages=grade_percentages,
        rarity_tier=rarity_tier,
        gem_rate=gem_rate,
        gem_rate_tier=gem_rate_tier,
        gem_rate_class=gem_rate_class,
        era=era,
        era_class=era_class,
        high_grade_rate=high_grade_rate,
        high_grade_tier=high_grade_tier,
        high_grade_class=high_grade_class
    )


def _calculate_rarity_tier(total_pop: int) -> str:
    """
    Determine rarity tier based on total population.
    
    Args:
        total_pop: Total PSA population across all grades
    
    Returns:
        Rarity classification string
    """
    if total_pop < VERY_RARE_MAX:
        return "Very Rare"
    elif total_pop < RARE_MAX:
        return "Rare"
    elif total_pop < UNCOMMON_MAX:
        return "Uncommon"
    else:
        return "Common"


def _calculate_gem_rate_tier(gem_rate: float) -> Tuple[str, str]:
    """
    Classify card based on PSA 10 concentration (gem rate).
    
    Gem rate is the percentage of the total population that is PSA 10.
    Low gem rates mean PSA 9s retain good value since 10s are rare.
    High gem rates mean PSA 9s lose value since 10s are common.
    
    Args:
        gem_rate: Percentage of population at PSA 10 (0-100)
    
    Returns:
        Tuple of (tier_label, tier_class) for UI display and styling
    """
    if gem_rate < GEM_RATE_RARE:
        return ("Ultra-Rare", "rare-gems")
    elif gem_rate < GEM_RATE_QUALITY:
        return ("Rare", "quality")
    elif gem_rate < GEM_RATE_MODERATE:
        return ("Average", "moderate")
    else:
        return ("Plentiful", "common-gems")


# ============================================================================
# Helper Functions - Value Calculations
# ============================================================================

def _calculate_expected_value(
    matrix: Dict[str, GradeAnalysis],
    distribution: PopulationDistribution
) -> float:
    """
    Calculate weighted expected value across all grade scenarios.
    
    Uses population distribution as probability weights:
    EV = sum(grade_profit_loss * (grade_population / total_population))
    
    Args:
        matrix: Dict of GradeAnalysis objects for each grade
        distribution: PopulationDistribution with total and percentages
    
    Returns:
        Expected profit/loss value weighted by population distribution
    """
    if distribution.total_population == 0:
        return 0.0
    
    expected_value = 0.0
    for grade, analysis in matrix.items():
        # Weight by population percentage (convert from percentage to fraction)
        weight = distribution.grade_percentages.get(grade, 0.0) / 100
        expected_value += analysis.profit_loss * weight
    
    return round(expected_value, 2)


def _find_break_even_grade(matrix: Dict[str, GradeAnalysis]) -> Optional[str]:
    """
    Find the minimum grade needed to break even (profit_loss >= 0).
    
    Args:
        matrix: Dict of GradeAnalysis objects for each grade
    
    Returns:
        Grade string of lowest break-even grade, or None if no grade breaks even
    """
    for grade_num in range(1, 11):
        grade = str(grade_num)
        if grade in matrix and matrix[grade].profit_loss >= 0:
            return grade
    return None


def _find_target_grade(
    matrix: Dict[str, GradeAnalysis],
    profitable_grades: List[str]
) -> Optional[str]:
    """
    Find the target grade (highest profitable grade for optimal returns).
    
    Args:
        matrix: Dict of GradeAnalysis objects for each grade
        profitable_grades: List of grade strings that are profitable
    
    Returns:
        Highest profitable grade string, or None if none are profitable
    """
    if not profitable_grades:
        return None
    
    # Sort by grade number descending and return highest
    sorted_grades = sorted(profitable_grades, key=lambda x: int(x), reverse=True)
    return sorted_grades[0]


# ============================================================================
# Helper Functions - Verdict Determination
# ============================================================================

def _determine_verdict(
    success_rate: float,
    expected_grade: Optional[int],
    matrix: Dict[str, GradeAnalysis],
    total_cost: float,
    price_data: Dict[str, float]
) -> Tuple[str, str]:
    """
    Determine the verdict and status based on analysis scenarios.
    
    Scenario Priority (checked in order):
    1. Scenario E - User Prediction: User predicted grade would lose money
    2. Scenario A - Buy the Slab: Benchmark grade (PSA 8) costs less than grading
    3. Scenario B - Green Light: >50% of grades are profitable
    4. Scenario C - Yellow Light: 15-50% of grades are profitable
    5. Scenario D - Gem or Bust: <15% of grades are profitable
    
    Args:
        success_rate: Percentage of profitable grades (0-100)
        expected_grade: User's predicted grade (1-10), or None
        matrix: Dict of GradeAnalysis objects for each grade
        total_cost: raw_purchase_price + grading_fee
        price_data: Original price data dict
    
    Returns:
        Tuple of (verdict_text, status_color)
    """
    # Scenario E: User predicted a losing grade
    if expected_grade is not None:
        expected_grade_str = str(expected_grade)
        if expected_grade_str in matrix:
            if not matrix[expected_grade_str].is_profitable:
                return ("🛑 ABORT MISSION", "red")
    
    # Scenario A: Buy the Slab
    # Check if benchmark grade (PSA 8) is cheaper to buy already graded
    benchmark_price = price_data.get(BENCHMARK_GRADE, 0.0)
    if benchmark_price > 0 and benchmark_price < total_cost:
        return ("🛑 BUY THE SLAB", "red")
    
    # Alternative: If PSA 8 has no data, check highest grade with meaningful population
    if benchmark_price == 0:
        # Find highest grade with price data as alternative benchmark
        for grade_num in range(10, 0, -1):
            grade = str(grade_num)
            alt_price = price_data.get(grade, 0.0)
            if alt_price > 0 and alt_price < total_cost:
                return ("🛑 BUY THE SLAB", "red")
            elif alt_price > 0:
                break  # Found a grade with data that doesn't trigger the scenario
    
    # Scenario B: Green Light
    if success_rate > GREEN_LIGHT_THRESHOLD:
        return ("✅ GREEN LIGHT: SUBMIT", "green")
    
    # Scenario C: Yellow Light
    if success_rate >= YELLOW_LIGHT_MIN:
        return ("⚠️ PROCEED WITH CAUTION", "yellow")
    
    # Scenario D: Gem or Bust
    return ("💀 GEM OR BUST", "red")


# ============================================================================
# Helper Functions - Scenario Analysis
# ============================================================================

def _generate_scenario_analysis(
    matrix: Dict[str, GradeAnalysis],
    distribution: PopulationDistribution
) -> ScenarioAnalysis:
    """
    Generate three-scenario analysis (optimistic, realistic, pessimistic).
    
    - Optimistic: Highest profitable grade (PSA 10 if profitable, else next highest)
    - Realistic: Weighted average outcome based on population distribution
    - Pessimistic: Lowest grade (PSA 1) outcome
    
    Args:
        matrix: Dict of GradeAnalysis objects for each grade
        distribution: PopulationDistribution data
    
    Returns:
        ScenarioAnalysis with three scenario outcomes
    """
    # Optimistic: Find highest profitable grade
    optimistic_grade = "10"
    optimistic_profit = matrix.get("10", GradeAnalysis(
        grade="10", market_value=0, population=0, profit_loss=0, roi=0, is_profitable=False
    )).profit_loss
    
    for grade_num in range(10, 0, -1):
        grade = str(grade_num)
        if grade in matrix and matrix[grade].is_profitable:
            optimistic_grade = grade
            optimistic_profit = matrix[grade].profit_loss
            break
    
    # If no profitable grade, use PSA 10 anyway as "best case"
    if optimistic_profit <= 0 and "10" in matrix:
        optimistic_grade = "10"
        optimistic_profit = matrix["10"].profit_loss
    
    # Calculate optimistic probability based on population
    optimistic_prob = distribution.grade_percentages.get(optimistic_grade, 0.0) / 100
    
    optimistic = ScenarioResult(
        grade=optimistic_grade,
        profit_loss=optimistic_profit,
        probability=round(optimistic_prob, 4)
    )
    
    # Realistic: Weighted average (mode or most common grade)
    # Find grade with highest population percentage
    max_pop_grade = "8"  # Default to PSA 8
    max_pop_pct = 0.0
    
    for grade, pct in distribution.grade_percentages.items():
        if pct > max_pop_pct:
            max_pop_pct = pct
            max_pop_grade = grade
    
    realistic_profit = matrix.get(max_pop_grade, GradeAnalysis(
        grade=max_pop_grade, market_value=0, population=0, profit_loss=0, roi=0, is_profitable=False
    )).profit_loss
    realistic_prob = max_pop_pct / 100
    
    realistic = ScenarioResult(
        grade=max_pop_grade,
        profit_loss=realistic_profit,
        probability=round(realistic_prob, 4)
    )
    
    # Pessimistic: PSA 1 (lowest grade)
    pessimistic_grade = "1"
    pessimistic_profit = matrix.get("1", GradeAnalysis(
        grade="1", market_value=0, population=0, profit_loss=0, roi=0, is_profitable=False
    )).profit_loss
    pessimistic_prob = distribution.grade_percentages.get("1", 0.0) / 100
    
    pessimistic = ScenarioResult(
        grade=pessimistic_grade,
        profit_loss=pessimistic_profit,
        probability=round(pessimistic_prob, 4)
    )
    
    return ScenarioAnalysis(
        optimistic=optimistic,
        realistic=realistic,
        pessimistic=pessimistic
    )


# ============================================================================
# Helper Functions - Collector Profiles
# ============================================================================

def _generate_collector_profiles(
    matrix: Dict[str, GradeAnalysis],
    distribution: PopulationDistribution,
    verdict: str,
    status: str,
    profitable_grades: List[str]
) -> CollectorProfiles:
    """
    Generate personalized advice for different collector strategies.
    
    - Flipper: Focus on quick ROI, recommend if break-even at common grades
    - Long-term Collector: Focus on population scarcity and future value
    - Recommended Strategy: "flip", "hold", or "avoid"
    
    Args:
        matrix: Dict of GradeAnalysis objects for each grade
        distribution: PopulationDistribution data
        verdict: The determined verdict string
        status: The status color ("green", "yellow", "red")
        profitable_grades: List of profitable grade strings
    
    Returns:
        CollectorProfiles with advice for each strategy
    """
    rarity = distribution.rarity_tier
    
    # Determine if common grades (7, 8) are profitable for flippers
    common_grades_profitable = any(
        grade in profitable_grades for grade in ["7", "8"]
    )
    
    # Flipper advice
    if status == "red":
        if "BUY THE SLAB" in verdict:
            flipper_advice = (
                "Skip grading entirely. You can buy an already-graded copy for less than "
                "the cost of grading your raw card. Look for slabbed deals on eBay."
            )
        elif "ABORT" in verdict:
            flipper_advice = (
                "Based on your expected grade, this card won't be profitable. "
                "Consider selling raw or waiting for better market conditions."
            )
        else:  # GEM OR BUST
            flipper_advice = (
                "This is a high-risk flip. Only the top grades are profitable, "
                "so unless you're confident in a gem mint outcome, pass on this one."
            )
    elif common_grades_profitable:
        flipper_advice = (
            "Good flip potential! Even mid-grades like PSA 7-8 are profitable. "
            "This gives you margin for error and a higher success rate."
        )
    else:
        flipper_advice = (
            "Moderate flip opportunity. You'll need a higher grade (PSA 9+) to profit. "
            "Only proceed if the card's condition strongly supports a high grade."
        )
    
    # Long-term collector advice
    if rarity == "Very Rare":
        long_term_advice = (
            f"This is a very rare card with only {distribution.total_population} total graded copies. "
            "Population scarcity could drive future premiums. Consider holding for long-term gains."
        )
    elif rarity == "Rare":
        long_term_advice = (
            f"With {distribution.total_population} graded copies, this card has solid scarcity appeal. "
            "A high-grade example could appreciate well over time for PC (personal collection)."
        )
    elif status == "green":
        long_term_advice = (
            "Strong market fundamentals with profitable outcomes across multiple grades. "
            "Worth adding to your collection with grading as a value-add."
        )
    else:
        long_term_advice = (
            "Consider the sentimental value if keeping long-term. "
            "From a pure investment standpoint, the numbers are challenging."
        )
    
    # Recommended strategy
    if status == "red":
        recommended_strategy = "avoid"
    elif common_grades_profitable and status == "green":
        recommended_strategy = "flip"
    elif rarity in ["Very Rare", "Rare"] or not common_grades_profitable:
        recommended_strategy = "hold"
    else:
        recommended_strategy = "flip"
    
    return CollectorProfiles(
        flipper_advice=flipper_advice,
        long_term_advice=long_term_advice,
        recommended_strategy=recommended_strategy
    )


# ============================================================================
# Helper Functions - Warnings
# ============================================================================

def _generate_warnings(
    matrix: Dict[str, GradeAnalysis],
    distribution: PopulationDistribution,
    expected_value: float,
    population_data: Dict[str, int],
    raw_purchase_price: float,
    grading_fee: float,
    target_grade: Optional[str],
    break_even_grade: Optional[str],
    success_rate: float,
    expected_grade: Optional[int]
) -> List[str]:
    """
    Generate comprehensive warning messages for notable conditions.
    
    Warnings generated (prioritized list):
    - Gem rate analysis - impacts PSA 9 value
    - Price gap analysis - lottery ticket scenarios
    - Grading cost efficiency - fees vs card value
    - Break-even confidence score - probability of success
    - Physical condition requirements
    - Raw card market alternatives
    - Market liquidity concerns
    - Population pump warnings
    - Risk/reward proximity
    - Modern vs vintage indicators
    - Low population warnings
    - Negative expected value
    
    Args:
        matrix: Dict of GradeAnalysis objects for each grade
        distribution: PopulationDistribution data
        expected_value: Calculated expected value
        population_data: Original population data dict
        raw_purchase_price: What user paid for raw card
        grading_fee: Cost to grade the card
        target_grade: Recommended target grade
        break_even_grade: Minimum grade to break even
        success_rate: Percentage of profitable grades
        expected_grade: User's predicted grade
    
    Returns:
        List of warning message strings
    """
    warnings: List[str] = []
    
    # Era-specific warnings with enhanced contextual guidance
    era_class = distribution.era_class
    high_grade_rate = distribution.high_grade_rate
    gem_rate = distribution.gem_rate

    # =========================================================================
    # Vintage Era Warnings (Pre-1983) - Enhanced
    # =========================================================================
    if era_class == 'vintage':
        # Keep existing basic warning
        if high_grade_rate is not None:
            warnings.append(
                f"📚 Vintage Era: For pre-1983 cards, PSA 7-8 is high-grade. "
                f"Only {high_grade_rate:.1f}% achieve PSA 7+. "
                "Centering issues and paper aging are common."
            )
        
        # NEW: 7-to-8 jump warning (contextual)
        if break_even_grade and int(break_even_grade) in [7, 8]:
            warnings.append(
                "💰 The PSA 7-to-8 jump can mean thousands of dollars for vintage cards. "
                "Inspect corners with a loupe for micro-fraying before submitting."
            )
        
        # NEW: Centering guidance (always for vintage)
        warnings.append(
            "📐 Centering is critical for vintage cards. 50/50 centering can be worth "
            "significantly more than 70/30, even with identical corners."
        )
        
        # NEW: Crease warning (if break-even is low)
        if break_even_grade and int(break_even_grade) <= 6:
            warnings.append(
                "⚠️ Check for creases, even 'spider creases' only visible under light. "
                "Any crease will instantly drop a vintage card to PSA 4 or lower."
            )
    
    # =========================================================================
    # Junk Wax Era Warnings (1984-1994) - Enhanced
    # =========================================================================
    elif era_class == 'junk-wax':
        # Keep existing mass production warning
        if distribution.total_population > 10000 or (20.0 <= gem_rate <= 40.0):
            warnings.append(
                f"📦 Junk Wax Era (1984-1994): Mass production with {distribution.total_population:,} graded copies. "
                "Only submit cards you're confident will grade PSA 9+. "
                "Low QC during production means centering/print defects are common. "
                "High populations limit value appreciation—grading fees must be justified by the grade spread."
            )
        
        # NEW: Stronger population warning (contextual)
        psa_10_pop = population_data.get("10", 0)
        if psa_10_pop > 5000:
            warnings.append(
                f"📊 With {psa_10_pop:,} PSA 10s already graded, a PSA 9 may be worth less "
                "than your grading costs. Check the population report carefully."
            )
        
        # NEW: Commons warning (always for junk wax)
        warnings.append(
            "💸 Avoid grading common players from this era. Even in PSA 10, "
            "most cards struggle to cover the $20+ grading fee."
        )
    
    # =========================================================================
    # Modern Era Warnings (1995-2019) - NEW
    # =========================================================================
    elif era_class == 'modern':
        if break_even_grade and int(break_even_grade) >= 9:
            warnings.append(
                "🏆 For modern cards, PSA commands highest ROI for Gem Mint 10s. "
                "Consider BGS for thick cards (memorabilia/patches) or if chasing the rare BGS Black Label 10."
            )
    
    # =========================================================================
    # Ultra-Modern Era Warnings (2020+) - NEW
    # =========================================================================
    elif era_class == 'ultra-modern':
        if gem_rate > 60:
            warnings.append(
                "🔍 Ultra-modern chrome/refractor cards require technical perfection. "
                "Check for print lines, dimples, or surface scratches invisible to the naked eye that will prevent a PSA 10."
            )
    
    # Get gem rate and grade percentages
    gem_rate = distribution.gem_rate
    psa_9_pct = distribution.grade_percentages.get("9", 0.0)
    psa_8_pct = distribution.grade_percentages.get("8", 0.0)
    
    # Gem rate warnings with nuanced context
    if gem_rate > 60.0:
        # Very high gem rate - PSA 9s nearly worthless
        warnings.append(
            f"⚠️ {gem_rate:.1f}% gem rate - PSA 10s are common. "
            "PSA 9s have minimal value. You need a perfect 10 to profit."
        )
        # Additional context for PSA 8 if it's also common
        if psa_8_pct > 15.0:
            warnings.append(
                f"PSA 8 represents {psa_8_pct:.1f}% of population. "
                "With this gem rate, even PSA 8s may have limited value."
            )
    elif gem_rate >= 30.0 and gem_rate <= 60.0:
        # Moderate gem rate - PSA 9 value declining
        psa_9_profitable = matrix.get("9", GradeAnalysis(
            grade="9", market_value=0, population=0, profit_loss=0, roi=0, is_profitable=False
        )).is_profitable
        
        if psa_9_profitable:
            warnings.append(
                f"Gem rate is {gem_rate:.1f}%. PSA 9s are profitable but declining in value. "
                "Consider grading only if confident of PSA 9 or better."
            )
        else:
            warnings.append(
                f"Gem rate is {gem_rate:.1f}%. PSA 9s are not profitable at this price point. "
                "This is a 'gem or bust' situation - you need PSA 10."
            )
    elif gem_rate >= 5.0 and gem_rate < 30.0:
        # Quality card - PSA 9s retain value
        warnings.append(
            f"Quality gem rate of {gem_rate:.1f}%. PSA 9s retain strong value since 10s are relatively scarce."
        )
    elif gem_rate < 5.0 and gem_rate > 0:
        # Rare gems - PSA 9s very valuable
        warnings.append(
            f"💎 {gem_rate:.1f}% gem rate - PSA 10s are rare! "
            "Even PSA 9s retain excellent value due to gem scarcity."
        )
        # Extra context if PSA 9s are also rare
        if psa_9_pct < 10.0:
            warnings.append(
                f"PSA 9s only {psa_9_pct:.1f}% of population. High-grade examples are exceptionally scarce."
            )
    
    # Modern vs Vintage context based on gem rate
    if gem_rate > 50.0 and distribution.total_population > 1000:
        warnings.append(
            "High gem rate with large population suggests modern card (post-2000s). "
            "Modern cards typically have inflated PSA 10 populations."
        )
    elif gem_rate < 3.0 and distribution.total_population > 200:
        warnings.append(
            "Low gem rate suggests vintage or difficult-to-grade card. "
            "Vintage cards (pre-1980) typically have lower gem rates."
        )
    
    # =========================================================================
    # Recommendation #1: Price Gap Analysis (Lottery Ticket Warning)
    # =========================================================================
    psa_9_value = matrix.get("9", GradeAnalysis(
        grade="9", market_value=0, population=0, profit_loss=0, roi=0, is_profitable=False
    )).market_value
    psa_10_value = matrix.get("10", GradeAnalysis(
        grade="10", market_value=0, population=0, profit_loss=0, roi=0, is_profitable=False
    )).market_value
    
    if psa_9_value > 0:
        price_multiplier = psa_10_value / psa_9_value
        if price_multiplier > 5.0:
            warnings.append(
                f"PSA 10 worth {price_multiplier:.1f}x more than PSA 9 "
                f"(${psa_10_value:.0f} vs ${psa_9_value:.0f}). "
                "Half-grade difference creates massive value swing."
            )
    
    # =========================================================================
    # Recommendation #2: Grading Cost Efficiency Warning
    # =========================================================================
    if target_grade:
        target_value = matrix.get(target_grade, GradeAnalysis(
            grade=target_grade, market_value=0, population=0, profit_loss=0, roi=0, is_profitable=False
        )).market_value
        
        if target_value > 0:
            grading_fee_pct = (grading_fee / target_value) * 100
            
            if grading_fee_pct > 25.0:
                warnings.append(
                    f"Grading fee (${grading_fee:.0f}) is {grading_fee_pct:.0f}% "
                    f"of target grade value (${target_value:.0f}). "
                    "Consider lower-cost grading options or selling raw."
                )
    
    # =========================================================================
    # Recommendation #4: Break-Even Confidence Score
    # =========================================================================
    if break_even_grade:
        prob_above_breakeven = sum(
            distribution.grade_percentages.get(str(g), 0)
            for g in range(int(break_even_grade), 11)
        )
        
        if prob_above_breakeven < 30.0:
            warnings.append(
                f"Only {prob_above_breakeven:.0f}% of graded copies achieve "
                f"PSA {break_even_grade}+. Low probability of profitability."
            )
    
    # =========================================================================
    # Recommendation #5: Physical Condition Reminders
    # =========================================================================
    if break_even_grade and int(break_even_grade) >= 8:
        warnings.append(
            f"Achieving PSA {break_even_grade}+ requires: "
            "60/40 or better centering, sharp corners, clean edges, "
            "and no surface scratches. Inspect carefully under light."
        )
    
    # =========================================================================
    # Recommendation #6: Raw Card Market Alternative
    # =========================================================================
    if raw_purchase_price > 100 and success_rate < 40:
        warnings.append(
            f"You paid ${raw_purchase_price:.0f} for this raw card. "
            "With low success rate, consider selling raw to another collector "
            "rather than risking grading fees."
        )
    
    # =========================================================================
    # Recommendation #7: Market Liquidity Warning (Enhanced)
    # =========================================================================
    if distribution.total_population < 200:
        warnings.append(
            f"With only {distribution.total_population} graded copies, "
            "this card may be difficult to sell quickly. "
            "Lower liquidity means wider bid-ask spreads."
        )
    elif distribution.total_population < LOW_POPULATION_THRESHOLD:
        warnings.append(
            f"Low population card ({distribution.total_population} total) - limited market data "
            "may affect price accuracy."
        )
    
    # =========================================================================
    # Recommendation #11: Population Pump Warning
    # =========================================================================
    if distribution.total_population > 5000 and 30 < gem_rate < 60:
        warnings.append(
            f"Large population ({distribution.total_population:,}) with moderate gem rate "
            "suggests heavy submission volume. More grading could further dilute "
            "PSA 9 values over time."
        )
    
    # =========================================================================
    # Recommendation #12: Risk/Reward Proximity Warning
    # =========================================================================
    if expected_grade and break_even_grade:
        grade_gap = int(expected_grade) - int(break_even_grade)
        
        if grade_gap == 0:
            warnings.append(
                "Your expected grade exactly matches break-even. "
                "Any grading variance means you lose money. High risk."
            )
        elif grade_gap == 1:
            warnings.append(
                "Your expected grade is only 1 point above break-even. "
                "One grade lower and you lose money. Proceed with caution."
            )
    
    # =========================================================================
    # Existing Warnings
    # =========================================================================
    
    # Check negative expected value - use risk-focused language
    if expected_value < 0:
        warnings.append(
            "Based on population data, grading this card carries elevated risk. Consider selling raw or buying already graded."
        )
    
    # Check for high concentration in single grade (excluding gem rate which we already covered)
    for grade, percentage in distribution.grade_percentages.items():
        if percentage > HIGH_CONCENTRATION_THRESHOLD and grade != "10":
            warnings.append(
                f"{percentage:.1f}% of population in grade {grade} - unusual distribution pattern."
            )
            break  # Only report highest concentration
    
    return warnings


# ============================================================================
# Helper Functions - Text Generation
# ============================================================================

def _generate_advice_text(
    verdict: str,
    status: str,
    success_rate: float,
    expected_value: float,
    break_even_grade: Optional[str],
    target_grade: Optional[str],
    total_cost: float,
    profitable_grades: List[str]
) -> str:
    """
    Generate natural language "Kuya's Advice" explaining the analysis.
    
    Args:
        verdict: The determined verdict string
        status: The status color
        success_rate: Percentage of profitable grades
        expected_value: Calculated expected value
        break_even_grade: Minimum grade to break even
        target_grade: Recommended target grade
        total_cost: Total investment (raw price + grading fee)
        profitable_grades: List of profitable grade strings
    
    Returns:
        Natural language advice text
    """
    lines: List[str] = []
    
    # Opening based on verdict
    if status == "green":
        lines.append("📊 **Kuya's Take:** This looks like a solid grading opportunity!")
    elif status == "yellow":
        lines.append("📊 **Kuya's Take:** This one requires careful consideration.")
    else:
        lines.append("📊 **Kuya's Take:** The numbers aren't in your favor here.")
    
    lines.append("")
    
    # Key metrics summary
    lines.append(f"With a total investment of **${total_cost:.2f}** (card + grading), here's what the data shows:")
    lines.append("")
    
    # Success rate context
    num_profitable = len(profitable_grades)
    if num_profitable > 0:
        lines.append(
            f"• **{num_profitable}/10 grades are profitable** ({success_rate:.0f}% success rate)"
        )
        if break_even_grade:
            lines.append(f"• You need at least a **PSA {break_even_grade}** to break even")
        if target_grade:
            lines.append(f"• Target **PSA {target_grade}** for optimal returns")
    else:
        lines.append("• **No grades are currently profitable** at this price point")
    
    # Removed expected value display - now using Confidence Score on frontend instead
    
    lines.append("")
    
    # Verdict-specific recommendation
    if "GREEN LIGHT" in verdict:
        lines.append(
            "**Recommendation:** Submit with confidence. The odds are in your favor, "
            "and you have good margin across multiple grades."
        )
    elif "PROCEED WITH CAUTION" in verdict:
        lines.append(
            "**Recommendation:** Only submit if you're confident the card will grade "
            "high. Carefully examine centering, corners, edges, and surface before deciding."
        )
    elif "GEM OR BUST" in verdict:
        lines.append(
            "**Recommendation:** This is a gamble. You need a PSA 9+ to profit. "
            "Unless the card is absolutely pristine, consider selling raw instead."
        )
    elif "BUY THE SLAB" in verdict:
        lines.append(
            "**Recommendation:** Don't grade - buy one already slabbed! "
            "You can find graded copies for less than your total grading cost."
        )
    else:  # ABORT MISSION
        lines.append(
            "**Recommendation:** Based on your grade expectation, this won't be profitable. "
            "Either reconsider your grade estimate or explore other options."
        )
    
    return "\n".join(lines)


def _generate_copy_text(
    request: GradingAdvisorRequest,
    response: GradingAdvisorResponse
) -> str:
    """
    Generate shareable text format for copying/sharing results.
    
    Args:
        request: Original request data
        response: Complete response data
    
    Returns:
        Pre-formatted text suitable for copying/sharing
    """
    # Calculate confidence level for copy text
    high_grade_pop = (
        response.distribution.grade_percentages.get("10", 0) +
        response.distribution.grade_percentages.get("9", 0)
    )
    
    # Determine confidence level
    if response.break_even_grade:
        be_grade = int(response.break_even_grade)
        if be_grade <= 7 and high_grade_pop > 50:
            confidence_label = "EXCELLENT"
        elif be_grade <= 8 and high_grade_pop > 40:
            confidence_label = "HIGH"
        elif be_grade == 9 and high_grade_pop > 30:
            confidence_label = "MODERATE"
        elif be_grade == 9:
            confidence_label = "MARGINAL"
        else:
            confidence_label = "RISKY"
    else:
        confidence_label = "RISKY"
    
    lines: List[str] = [
        "🎴 Grading Analysis",
        f"Card Cost: ${request.raw_purchase_price:.2f} | Grading Fee: ${request.grading_fee:.2f}",
        f"Total Investment: ${request.raw_purchase_price + request.grading_fee:.2f}",
        "",
        f"Verdict: {response.verdict}",
    ]
    
    if response.break_even_grade:
        lines.append(f"Break-even: PSA {response.break_even_grade}+")
    else:
        lines.append("Break-even: None (no profitable grades)")
    
    lines.append(f"Grading Confidence: {confidence_label}")
    lines.append(f"Population Above Break-Even: {response.success_rate:.0f}%")
    
    if response.profitable_grades:
        lines.append(f"Profitable Grades: {', '.join(f'PSA {g}' for g in sorted(response.profitable_grades, key=int))}")
    
    lines.extend([
        "",
        f"Population: {response.distribution.total_population:,} ({response.distribution.rarity_tier})",
        f"Strategy: {response.collector_profiles.recommended_strategy.upper()}",
        "",
        "Powered by Kuya Comps 🏆"
    ])
    
    return "\n".join(lines)
