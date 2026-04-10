"""
Tests for player_score_service sub-factor scoring.
"""
import pytest

from backend.services.player_score_service import (
    score_position,
    score_tam,
    score_pedigree,
    score_liquidity,
    score_flipping_signal,
    _adp_score,
    _views_to_score,
)


class TestScorePosition:
    def test_shortstop_highest_batter(self):
        assert score_position("SS") > 0.8

    def test_pitcher_lower(self):
        assert score_position("SP") < score_position("SS")

    def test_reliever_lowest(self):
        assert score_position("RP") < score_position("SP")

    def test_empty_returns_neutral(self):
        assert score_position("") == 0.50

    def test_multi_position(self):
        """SS/2B should use first position (SS)."""
        assert score_position("SS/2B") == score_position("SS")


class TestScoreTam:
    def test_nyy_high(self):
        score = score_tam("NYY")
        assert score > 0.9

    def test_mil_low(self):
        score = score_tam("MIL")
        assert score < 0.3

    def test_lad_high(self):
        score = score_tam("LAD")
        assert score > 0.8

    def test_unknown_team_neutral(self):
        assert score_tam("XXX") == 0.50

    def test_empty_team_neutral(self):
        assert score_tam("") == 0.50

    def test_alias_cws(self):
        """CWS should map to CHW."""
        assert score_tam("CWS") == score_tam("CHW")

    def test_alias_sd(self):
        """SD should map to SDP."""
        assert score_tam("SD") == score_tam("SDP")


class TestAdpScore:
    def test_top_pick(self):
        assert _adp_score(1.0) == 0.95

    def test_top_5(self):
        assert _adp_score(3.0) == 0.90

    def test_top_15(self):
        assert _adp_score(10.0) == 0.80

    def test_top_50(self):
        assert _adp_score(30.0) == 0.65

    def test_top_100(self):
        assert _adp_score(75.0) == 0.50

    def test_mid_range(self):
        assert _adp_score(150.0) == 0.35

    def test_late(self):
        assert _adp_score(250.0) == 0.25

    def test_very_late(self):
        assert _adp_score(400.0) == 0.15

    def test_none_returns_default(self):
        assert _adp_score(None) == 0.20


class TestScorePedigree:
    def test_hof_member(self):
        """HOF member should score 1.0."""
        # Use Derek Jeter's MLBAM ID (115135)
        score = score_pedigree(115135, None, None)
        assert score == 1.0

    def test_non_hof_no_career_stats(self):
        """Unknown player with no data defaults to no-ADP prospect score."""
        score = score_pedigree(999999, None, None)
        assert score == 0.20

    def test_established_star(self):
        """Established player with high WAR."""
        career = {"career_ab": 3000, "career_war": 30.0, "is_pitcher": False}
        season = {"WAR": 5.0}
        score = score_pedigree(999999, career, season)
        assert score > 0.8  # ~5 WAR/season = elite

    def test_early_career_with_adp(self):
        """Early career player with strong ADP and good WAR."""
        career = {"career_ab": 500, "career_war": 4.0, "is_pitcher": False}
        season = {"WAR": 3.0}
        adp = 5.0  # top 5 pick
        score = score_pedigree(999999, career, season, adp)
        # 0.90 * 0.4 + WAR_rate * 0.6
        assert score > 0.6

    def test_prospect_high_adp(self):
        """Pre-debut prospect with high ADP."""
        career = {"career_ab": 0, "career_war": 0, "is_pitcher": False}
        adp = 2.0
        score = score_pedigree(999999, career, None, adp)
        assert score == 0.90  # ADP 2 = top 5

    def test_prospect_no_adp(self):
        """Pre-debut prospect with no ADP data."""
        career = {"career_ab": 0, "career_war": 0, "is_pitcher": False}
        score = score_pedigree(999999, career, None)
        assert score == 0.20  # default

    def test_pitcher_established(self):
        """Established pitcher with career IP >= 800."""
        career = {"career_ip": 1200, "career_war": 24.0, "is_pitcher": True}
        season = {"WAR": 4.0}
        score = score_pedigree(999999, career, season)
        assert score > 0.7


class TestScoreLiquidity:
    def test_high_liquidity(self):
        analytics = {"liquidity": {"score": 85}}
        assert score_liquidity(analytics) == 0.85

    def test_low_liquidity(self):
        analytics = {"liquidity": {"score": 20}}
        assert score_liquidity(analytics) == 0.20

    def test_no_analytics(self):
        assert score_liquidity(None) == 0.50

    def test_missing_liquidity_key(self):
        assert score_liquidity({"confidence": {}}) == 0.50


class TestScoreFlippingSignal:
    def test_hot_market(self):
        """Tight spread, high turnover, asks near sold prices."""
        analytics = {
            "staleness": {"raw_gap_pct": 3.0},
            "competitive_zone": {"center": 50.0},
        }
        score = score_flipping_signal(analytics, sold_count=30, active_count=10, bid_center=50.0)
        assert score > 0.8

    def test_cold_market(self):
        """Wide spread, low turnover, asks much higher than sold."""
        analytics = {
            "staleness": {"raw_gap_pct": 40.0},
            "competitive_zone": {"center": 80.0},
        }
        score = score_flipping_signal(analytics, sold_count=2, active_count=20, bid_center=50.0)
        assert score < 0.3

    def test_no_analytics_neutral(self):
        score = score_flipping_signal(None, sold_count=5, active_count=5)
        # Should be somewhat neutral
        assert 0.1 < score < 0.6

    def test_no_active_listings(self):
        score = score_flipping_signal(None, sold_count=10, active_count=0)
        # Sold with no active = strong signal for turnover
        assert score > 0.3


class TestViewsToScore:
    """Test Wikipedia pageview to score conversion."""

    def test_zero_views(self):
        assert _views_to_score(0) == 0.05

    def test_low_views(self):
        score = _views_to_score(500)
        assert 0.05 <= score < 0.15

    def test_1k_views(self):
        score = _views_to_score(1000)
        assert 0.10 < score < 0.20

    def test_10k_views(self):
        score = _views_to_score(10_000)
        assert 0.35 < score < 0.55

    def test_100k_views(self):
        score = _views_to_score(100_000)
        assert 0.65 < score < 0.85

    def test_500k_views(self):
        score = _views_to_score(500_000)
        assert score >= 0.90

    def test_1m_views(self):
        score = _views_to_score(1_000_000)
        assert score == 1.0

    def test_monotonic(self):
        """Higher views should always produce higher scores."""
        prev = 0.0
        for views in [100, 1000, 5000, 20000, 100000, 500000]:
            score = _views_to_score(views)
            assert score > prev, f"Score for {views} ({score}) not > prev ({prev})"
            prev = score
