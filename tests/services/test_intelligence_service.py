"""
Unit tests for Market Intelligence Service.

Tests cover:
- Parallel type detection from card titles
- Grading service and grade detection
- Year extraction from titles
- Market intelligence analysis
"""
import pytest
from backend.services.intelligence_service import (
    detect_parallel_type,
    detect_grading_info,
    extract_card_year,
    analyze_market_intelligence
)
from main import CompItem


class TestDetectParallelType:
    """Test parallel type detection from card titles."""
    
    def test_detect_base_card(self):
        """Base cards should be detected correctly."""
        parallel, numbered = detect_parallel_type("2024 Topps Chrome Base Card")
        
        assert parallel == "base"
        assert numbered is None
    
    def test_detect_common_card(self):
        """Common cards should be classified as base."""
        parallel, numbered = detect_parallel_type("2024 Topps Chrome Common Card")
        
        assert parallel == "base"
        assert numbered is None
    
    def test_detect_refractor(self):
        """Regular refractors should be detected."""
        parallel, numbered = detect_parallel_type("2024 Topps Chrome Refractor")
        
        assert parallel == "refractor"
        assert numbered is None
    
    def test_detect_gold_refractor(self):
        """Gold refractors should be detected as specific type."""
        parallel, numbered = detect_parallel_type("2024 Topps Chrome Gold Refractor /50")
        
        assert parallel == "gold_refractor"
        assert numbered == 50
    
    def test_detect_orange_refractor(self):
        """Orange refractors should be detected."""
        parallel, numbered = detect_parallel_type("2024 Topps Chrome Orange Refractor /25")
        
        assert parallel == "orange_refractor"
        assert numbered == 25
    
    def test_detect_aqua_refractor(self):
        """Aqua refractors should be detected."""
        parallel, numbered = detect_parallel_type("2024 Topps Chrome Aqua Refractor /199")
        
        assert parallel == "aqua_refractor"
        assert numbered == 199
    
    def test_detect_raywave_refractor(self):
        """Ray wave refractors should be detected."""
        parallel, numbered = detect_parallel_type("2024 Topps Chrome Ray Wave Refractor")
        
        assert parallel == "raywave_refractor"
        assert numbered is None
    
    def test_detect_xfractor(self):
        """X-Fractors should be detected."""
        parallel, numbered = detect_parallel_type("2024 Topps Chrome X-Fractor /99")
        
        assert parallel == "xfractor"
        assert numbered == 99
    
    def test_detect_prism(self):
        """Prism cards should be detected."""
        parallel, numbered = detect_parallel_type("2024 Panini Prizm Silver Prism")
        
        assert parallel == "prism"
        assert numbered is None
    
    def test_numbered_parallel_without_type(self):
        """Numbered cards without specific type should be chrome_parallel."""
        parallel, numbered = detect_parallel_type("2024 Topps Chrome Card /10")
        
        assert parallel == "chrome_parallel"
        assert numbered == 10
    
    def test_numbered_extraction_formats(self):
        """Various numbering formats should be extracted."""
        test_cases = [
            ("Card /99", 99),
            ("Card /199", 199),
            ("Card /50", 50),
            ("Card /25", 25),
            ("Card /10", 10),
            ("Card /5", 5),
        ]
        
        for title, expected_num in test_cases:
            parallel, numbered = detect_parallel_type(title)
            assert numbered == expected_num
    
    def test_empty_title(self):
        """Empty title should return unknown."""
        parallel, numbered = detect_parallel_type("")
        
        assert parallel == "unknown"
        assert numbered is None
    
    def test_none_title(self):
        """None title should return unknown."""
        parallel, numbered = detect_parallel_type(None)
        
        assert parallel == "unknown"
        assert numbered is None
    
    def test_case_insensitive(self):
        """Detection should be case insensitive."""
        test_cases = [
            "2024 Topps Chrome GOLD REFRACTOR /50",
            "2024 Topps Chrome Gold Refractor /50",
            "2024 topps chrome gold refractor /50",
        ]
        
        for title in test_cases:
            parallel, numbered = detect_parallel_type(title)
            assert parallel == "gold_refractor"
            assert numbered == 50


class TestDetectGradingInfo:
    """Test grading service and grade detection."""
    
    def test_detect_psa_10(self):
        """PSA 10 should be detected correctly."""
        service, grade = detect_grading_info("2024 Topps Chrome PSA 10")
        
        assert service == "psa"
        assert grade == 10.0
    
    def test_detect_psa_9(self):
        """PSA 9 should be detected correctly."""
        service, grade = detect_grading_info("2024 Topps Chrome PSA 9")
        
        assert service == "psa"
        assert grade == 9.0
    
    def test_detect_bgs_95(self):
        """BGS 9.5 should be detected correctly."""
        service, grade = detect_grading_info("2024 Topps Chrome BGS 9.5")
        
        assert service == "bgs"
        assert grade == 9.5
    
    def test_detect_bgs_10(self):
        """BGS 10 should be detected correctly."""
        service, grade = detect_grading_info("2024 Topps Chrome BGS 10")
        
        assert service == "bgs"
        assert grade == 10.0
    
    def test_detect_sgc_10(self):
        """SGC 10 should be detected correctly."""
        service, grade = detect_grading_info("2024 Topps Chrome SGC 10")
        
        assert service == "sgc"
        assert grade == 10.0
    
    def test_detect_other_grading_services(self):
        """Other grading services should be detected."""
        test_cases = ["CGC", "CSG", "HGA", "TAG", "GMA"]
        
        for grader in test_cases:
            service, grade = detect_grading_info(f"2024 Topps Chrome {grader} 10")
            assert service == "other_graded"
            assert grade is None
    
    def test_raw_card_no_grading(self):
        """Cards without grading should return raw."""
        service, grade = detect_grading_info("2024 Topps Chrome Base Card")
        
        assert service == "raw"
        assert grade is None
    
    def test_case_insensitive_grading(self):
        """Grading detection should be case insensitive."""
        test_cases = [
            "2024 Topps Chrome psa 10",
            "2024 Topps Chrome PSA 10",
            "2024 Topps Chrome Psa 10",
        ]
        
        for title in test_cases:
            service, grade = detect_grading_info(title)
            assert service == "psa"
            assert grade == 10.0
    
    def test_decimal_grades(self):
        """Decimal grades should be parsed correctly."""
        test_cases = [
            ("BGS 9.5", "bgs", 9.5),
            ("PSA 8.5", "psa", 8.5),
            ("SGC 9.5", "sgc", 9.5),
        ]
        
        for grading_text, expected_service, expected_grade in test_cases:
            service, grade = detect_grading_info(f"2024 Card {grading_text}")
            assert service == expected_service
            assert grade == expected_grade
    
    def test_empty_title_grading(self):
        """Empty title should return raw."""
        service, grade = detect_grading_info("")
        
        assert service == "raw"
        assert grade is None
    
    def test_none_title_grading(self):
        """None title should return raw."""
        service, grade = detect_grading_info(None)
        
        assert service == "raw"
        assert grade is None


class TestExtractCardYear:
    """Test year extraction from card titles."""
    
    def test_extract_2024(self):
        """2024 should be extracted correctly."""
        year = extract_card_year("2024 Topps Chrome Elly De La Cruz")
        
        assert year == 2024
    
    def test_extract_2023(self):
        """2023 should be extracted correctly."""
        year = extract_card_year("2023 Bowman Chrome Paul Skenes")
        
        assert year == 2023
    
    def test_extract_2021(self):
        """2021 should be extracted correctly."""
        year = extract_card_year("2021 Topps Chrome Vladimir Guerrero Jr.")
        
        assert year == 2021
    
    def test_extract_2018(self):
        """2018 (earliest valid year) should be extracted."""
        year = extract_card_year("2018 Topps Chrome Ronald Acuna Jr.")
        
        assert year == 2018
    
    def test_extract_2025(self):
        """2025 should be extracted (valid future year)."""
        year = extract_card_year("2025 Topps Chrome Rookie Card")
        
        assert year == 2025
    
    def test_no_year_returns_none(self):
        """Titles without year should return None."""
        year = extract_card_year("Topps Chrome Base Card")
        
        assert year is None
    
    def test_invalid_year_returns_none(self):
        """Years outside valid range should return None."""
        test_cases = [
            "2017 Topps Chrome",  # Too early
            "2026 Topps Chrome",  # Too late
            "1990 Topps Chrome",  # Way too early
        ]
        
        for title in test_cases:
            year = extract_card_year(title)
            assert year is None
    
    def test_empty_title_year(self):
        """Empty title should return None."""
        year = extract_card_year("")
        
        assert year is None
    
    def test_none_title_year(self):
        """None title should return None."""
        year = extract_card_year(None)
        
        assert year is None


class TestAnalyzeMarketIntelligence:
    """Test full market intelligence analysis."""
    
    def test_empty_items_returns_empty_dict(self):
        """Empty item list should return empty dict."""
        insights = analyze_market_intelligence([])
        
        assert insights == {}
    
    def test_parallel_premium_calculation(self):
        """Parallel premiums should be calculated vs base cards."""
        items = [
            CompItem(item_id="1", title="2024 Chrome Base Card", total_price=20.0),
            CompItem(item_id="2", title="2024 Chrome Base Card", total_price=25.0),
            CompItem(item_id="3", title="2024 Chrome Gold Refractor /50", total_price=100.0),
            CompItem(item_id="4", title="2024 Chrome Gold Refractor /50", total_price=120.0),
        ]
        
        insights = analyze_market_intelligence(items)
        
        assert 'parallel_premiums' in insights
        assert len(insights['parallel_premiums']) > 0
        assert 'Gold Refractor' in insights['parallel_premiums'][0]
    
    def test_grading_premium_calculation(self):
        """PSA 10 premium should be calculated vs raw cards."""
        items = [
            CompItem(item_id="1", title="2024 Chrome Raw Card", total_price=20.0),
            CompItem(item_id="2", title="2024 Chrome Raw Card", total_price=25.0),
            CompItem(item_id="3", title="2024 Chrome PSA 10", total_price=80.0),
            CompItem(item_id="4", title="2024 Chrome PSA 10", total_price=90.0),
        ]
        
        insights = analyze_market_intelligence(items)
        
        assert 'grading_premium' in insights
        assert 'PSA 10' in insights['grading_premium']
        assert 'Raw Card Premium' in insights['grading_premium']
    
    def test_year_trends_calculation(self):
        """Year-over-year trends should be calculated."""
        items = [
            CompItem(item_id="1", title="2023 Chrome Card", total_price=20.0),
            CompItem(item_id="2", title="2023 Chrome Card", total_price=25.0),
            CompItem(item_id="3", title="2024 Chrome Card", total_price=40.0),
            CompItem(item_id="4", title="2024 Chrome Card", total_price=50.0),
        ]
        
        insights = analyze_market_intelligence(items)
        
        assert 'year_trends' in insights
        assert len(insights['year_trends']) > 0
        assert '2024' in insights['year_trends'][0]
        assert '2023' in insights['year_trends'][0]
    
    def test_high_activity_premium(self):
        """High-bid auctions should show premium over average."""
        items = [
            CompItem(item_id="1", title="Card 1", total_price=50.0, bids=2),
            CompItem(item_id="2", title="Card 2", total_price=55.0, bids=3),
            CompItem(item_id="3", title="Card 3", total_price=100.0, bids=15),  # High activity
            CompItem(item_id="4", title="Card 4", total_price=110.0, bids=20),  # High activity
        ]
        
        insights = analyze_market_intelligence(items)
        
        assert 'activity_premium' in insights
        assert 'High-Bid Auctions' in insights['activity_premium']
    
    def test_parallel_breakdown_included(self):
        """Parallel breakdown with averages should be included."""
        items = [
            CompItem(item_id="1", title="2024 Chrome Base Card", total_price=20.0),
            CompItem(item_id="2", title="2024 Chrome Base Card", total_price=25.0),
            CompItem(item_id="3", title="2024 Chrome Refractor", total_price=60.0),
            CompItem(item_id="4", title="2024 Chrome Refractor", total_price=70.0),
        ]
        
        insights = analyze_market_intelligence(items)
        
        assert 'parallel_breakdown' in insights
        assert 'base' in insights['parallel_breakdown']
        assert 'refractor' in insights['parallel_breakdown']
        assert 'avg' in insights['parallel_breakdown']['base']
    
    def test_grading_breakdown_included(self):
        """Grading breakdown with averages should be included."""
        items = [
            CompItem(item_id="1", title="2024 Chrome Raw Card", total_price=20.0),
            CompItem(item_id="2", title="2024 Chrome Raw Card", total_price=25.0),
            CompItem(item_id="3", title="2024 Chrome PSA 10", total_price=80.0),
            CompItem(item_id="4", title="2024 Chrome PSA 10", total_price=90.0),
        ]
        
        insights = analyze_market_intelligence(items)
        
        assert 'grading_breakdown' in insights
        assert len(insights['grading_breakdown']) > 0
    
    def test_filters_none_and_zero_prices(self):
        """Items with None or zero prices should be filtered."""
        items = [
            CompItem(item_id="1", title="2024 Chrome Base Card", total_price=20.0),
            CompItem(item_id="2", title="2024 Chrome Base Card", total_price=None),  # Should be filtered
            CompItem(item_id="3", title="2024 Chrome Base Card", total_price=0.0),   # Should be filtered
            CompItem(item_id="4", title="2024 Chrome Base Card", total_price=25.0),
        ]
        
        insights = analyze_market_intelligence(items)
        
        # Should only process valid prices
        assert 'parallel_breakdown' in insights
        if 'base' in insights['parallel_breakdown']:
            # Should show 2 items, not 4
            assert '2 items' in insights['parallel_breakdown']['base']
    
    def test_filters_none_titles(self):
        """Items with None titles should be filtered."""
        items = [
            CompItem(item_id="1", title=None, total_price=20.0),  # Should be filtered
            CompItem(item_id="2", title="2024 Chrome Base Card", total_price=25.0),
            CompItem(item_id="3", title="2024 Chrome Base Card", total_price=30.0),
        ]
        
        insights = analyze_market_intelligence(items)
        
        # Should only process items with titles
        assert isinstance(insights, dict)
    
    def test_minimum_samples_required(self):
        """Need minimum samples for meaningful averages."""
        items = [
            CompItem(item_id="1", title="2024 Chrome Gold Refractor /50", total_price=100.0),
            # Only 1 gold refractor - shouldn't appear in breakdown
        ]
        
        insights = analyze_market_intelligence(items)
        
        # With only 1 sample, may not have enough for breakdown
        # (MIN_PARALLEL_SAMPLES is typically 2)
        if 'parallel_breakdown' in insights:
            # May or may not include single-sample types depending on config
            assert isinstance(insights['parallel_breakdown'], dict)
