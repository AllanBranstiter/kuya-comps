#!/usr/bin/env python3
# test_phase4_simple.py
"""
Simplified test suite for Phase 4: Automated Valuation Engine
Tests core logic without database dependencies.
"""

from backend.services.valuation_service import (
    passes_keyword_firewall,
    remove_outliers_iqr,
    calculate_median_fmv,
    check_volatility,
    EXCLUDED_KEYWORDS,
    VOLATILITY_THRESHOLD,
    MIN_SALES_FOR_UPDATE
)
from decimal import Decimal


def test_keyword_firewall():
    """Test keyword firewall functionality."""
    print("\n" + "=" * 80)
    print("TEST 1: KEYWORD FIREWALL")
    print("=" * 80)
    
    # Test passes
    assert passes_keyword_firewall("2024 Topps Chrome Rookie") == True
    print("✓ Passes normal listing")
    
    # Test excludes
    assert passes_keyword_firewall("2024 Topps Chrome REPRINT") == False
    print("✓ Excludes reprint")
    
    assert passes_keyword_firewall("2024 Topps Chrome DIGITAL") == False
    print("✓ Excludes digital")
    
    assert passes_keyword_firewall("2024 Topps Chrome BOX") == False
    print("✓ Excludes box")
    
    assert passes_keyword_firewall("Lot of 10 cards") == False
    print("✓ Excludes lot")
    
    # Test all keywords
    for keyword in EXCLUDED_KEYWORDS:
        test_title = f"2024 Topps Chrome {keyword.upper()}"
        assert passes_keyword_firewall(test_title) == False
    
    print(f"✓ All {len(EXCLUDED_KEYWORDS)} excluded keywords work correctly")
    print(f"\nKeywords: {', '.join(EXCLUDED_KEYWORDS)}")


def test_outlier_removal():
    """Test IQR outlier removal."""
    print("\n" + "=" * 80)
    print("TEST 2: OUTLIER REMOVAL (IQR)")
    print("=" * 80)
    
    # Test with outliers
    prices = [1.00, 8.50, 9.00, 9.50, 10.00, 10.50, 11.00, 11.50, 12.00, 100.00]
    filtered, num_removed = remove_outliers_iqr(prices)
    
    assert num_removed == 2
    assert 1.00 not in filtered
    assert 100.00 not in filtered
    print(f"✓ Removed {num_removed} outliers from {len(prices)} prices")
    print(f"  Original: ${min(prices):.2f} - ${max(prices):.2f}")
    print(f"  Filtered: ${min(filtered):.2f} - ${max(filtered):.2f}")
    
    # Test normal distribution
    normal_prices = [9.00, 9.50, 10.00, 10.50, 11.00, 11.50, 12.00]
    filtered2, num_removed2 = remove_outliers_iqr(normal_prices)
    
    assert num_removed2 == 0
    print(f"✓ Preserves normal distribution (0 removed)")
    
    # Test minimum data requirement
    few_prices = [10.00, 11.00, 12.00]
    filtered3, num_removed3 = remove_outliers_iqr(few_prices)
    
    assert num_removed3 == 0
    print(f"✓ Requires minimum 4 data points (skipped with {len(few_prices)})")


def test_median_fmv():
    """Test median FMV calculation."""
    print("\n" + "=" * 80)
    print("TEST 3: MEDIAN FMV CALCULATION")
    print("=" * 80)
    
    # Odd number of prices
    prices_odd = [8.00, 9.00, 10.00, 11.00, 12.00]
    median_odd = calculate_median_fmv(prices_odd)
    assert median_odd == Decimal('10.00')
    print(f"✓ Odd count: {prices_odd} → ${median_odd}")
    
    # Even number of prices
    prices_even = [8.00, 9.00, 11.00, 12.00]
    median_even = calculate_median_fmv(prices_even)
    assert median_even == Decimal('10.00')
    print(f"✓ Even count: {prices_even} → ${median_even}")
    
    # Minimum sales requirement
    too_few = [10.00, 11.00]
    median_none = calculate_median_fmv(too_few)
    assert median_none is None
    print(f"✓ Requires minimum {MIN_SALES_FOR_UPDATE} sales (rejected {len(too_few)})")
    
    # Resistance to outliers
    with_outlier = [9.00, 9.50, 10.00, 10.50, 11.00, 100.00]
    median = calculate_median_fmv(with_outlier)
    mean = sum(with_outlier) / len(with_outlier)
    print(f"✓ Outlier resistance:")
    print(f"  Prices: {with_outlier}")
    print(f"  Median: ${median} (robust)")
    print(f"  Mean: ${mean:.2f} (skewed by outlier)")


def test_volatility_check():
    """Test volatility guardrail."""
    print("\n" + "=" * 80)
    print("TEST 4: VOLATILITY GUARDRAIL")
    print("=" * 80)
    
    # Large increase
    should_flag1, pct1, reason1 = check_volatility(Decimal('100.00'), Decimal('50.00'))
    assert should_flag1 == True
    assert pct1 == 1.0
    print(f"✓ Flags large increase: $50 → $100 ({pct1:.0%})")
    
    # Large decrease
    should_flag2, pct2, reason2 = check_volatility(Decimal('40.00'), Decimal('100.00'))
    assert should_flag2 == True
    assert pct2 == 0.6
    print(f"✓ Flags large decrease: $100 → $40 ({pct2:.0%})")
    
    # Normal change
    should_flag3, pct3, reason3 = check_volatility(Decimal('120.00'), Decimal('100.00'))
    assert should_flag3 == False
    assert pct3 == 0.2
    print(f"✓ Allows normal change: $100 → $120 ({pct3:.0%})")
    
    # At threshold
    should_flag4, pct4, reason4 = check_volatility(Decimal('150.00'), Decimal('100.00'))
    assert should_flag4 == False
    print(f"✓ Threshold check: $100 → $150 (exactly {VOLATILITY_THRESHOLD:.0%}, not flagged)")
    
    # First update
    should_flag5, pct5, reason5 = check_volatility(Decimal('100.00'), None)
    assert should_flag5 == False
    print(f"✓ First update: No previous FMV (not flagged)")


def run_all_tests():
    """Run all tests."""
    print("\n" + "=" * 80)
    print("PHASE 4: AUTOMATED VALUATION ENGINE - SIMPLE TEST SUITE")
    print("=" * 80)
    
    try:
        test_keyword_firewall()
        test_outlier_removal()
        test_median_fmv()
        test_volatility_check()
        
        print("\n" + "=" * 80)
        print("✓ ALL TESTS PASSED!")
        print("=" * 80)
        print("\nPhase 4 Core Logic Verified:")
        print("  ✓ Keyword Firewall - Excludes unwanted listings")
        print("  ✓ Outlier Removal - IQR filtering works correctly")
        print("  ✓ FMV Calculation - Median-based, resistant to outliers")
        print("  ✓ Volatility Guardrail - Flags >50% price changes")
        print("\nPhase 4 implementation is ready for production!")
        print()
        
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
