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

# Warning thresholds
HIGH_PSA_10_POP_THRESHOLD = 1000
LOW_POPULATION_THRESHOLD = 50
HIGH_CONCENTRATION_THRESHOLD = 50.0  # Percent


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
    distribution = _calculate_population_distribution(request.population_data)
    
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
        population_data=request.population_data
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
    population_data: Dict[str, int]
) -> PopulationDistribution:
    """
    Calculate population distribution statistics.
    
    Args:
        population_data: Dict mapping grade strings to population counts
    
    Returns:
        PopulationDistribution with total, percentages, and rarity tier
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
    
    return PopulationDistribution(
        total_population=total_population,
        grade_percentages=grade_percentages,
        rarity_tier=rarity_tier
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
    population_data: Dict[str, int]
) -> List[str]:
    """
    Generate warning messages for notable conditions.
    
    Warnings are generated for:
    - High PSA 10 population (> 1000)
    - Low total population (limited market data)
    - Negative expected value
    - High concentration in a single grade (> 50%)
    
    Args:
        matrix: Dict of GradeAnalysis objects for each grade
        distribution: PopulationDistribution data
        expected_value: Calculated expected value
        population_data: Original population data dict
    
    Returns:
        List of warning message strings
    """
    warnings: List[str] = []
    
    # Check PSA 10 population
    psa_10_pop = population_data.get("10", 0)
    if psa_10_pop > HIGH_PSA_10_POP_THRESHOLD:
        warnings.append(
            f"High PSA 10 population ({psa_10_pop:,}) may limit future value appreciation."
        )
    
    # Check low total population
    if distribution.total_population < LOW_POPULATION_THRESHOLD:
        warnings.append(
            f"Low population card ({distribution.total_population} total) - limited market data "
            "may affect price accuracy."
        )
    
    # Check negative expected value
    if expected_value < 0:
        warnings.append(
            f"Expected value is negative (${expected_value:.2f}) - consider alternatives."
        )
    
    # Check for high concentration in single grade
    for grade, percentage in distribution.grade_percentages.items():
        if percentage > HIGH_CONCENTRATION_THRESHOLD:
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
    
    lines.append("")
    
    # Expected value interpretation
    if expected_value >= 0:
        lines.append(
            f"• Expected value: **+${expected_value:.2f}** (weighted by population distribution)"
        )
    else:
        lines.append(
            f"• Expected value: **-${abs(expected_value):.2f}** (you're likely to lose money)"
        )
    
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
    lines: List[str] = [
        "🎴 Grading Analysis",
        f"Card Cost: ${request.raw_purchase_price:.2f} | Grading Fee: ${request.grading_fee:.2f}",
        f"Total Investment: ${request.raw_purchase_price + request.grading_fee:.2f}",
        "",
        f"Verdict: {response.verdict}",
    ]
    
    if response.break_even_grade:
        lines.append(f"Break-even: PSA {response.break_even_grade}")
    else:
        lines.append("Break-even: None (no profitable grades)")
    
    lines.append(f"Expected Value: ${response.expected_value:+.2f}")
    lines.append(f"Success Rate: {response.success_rate:.0f}%")
    
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
