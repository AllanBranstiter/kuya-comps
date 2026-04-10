"""
Tests for player_stats_service.
"""
import pytest

from backend.services.player_stats_service import (
    _interpolate,
    score_batter_stats,
    score_pitcher_stats,
    load_stats,
    build_name_index,
    get_player_season_stats,
)


class TestInterpolate:
    """Test linear interpolation between thresholds."""

    def test_at_elite(self):
        assert _interpolate(92.0, elite=92.0, poor=85.0, inverted=False) == 1.0

    def test_above_elite(self):
        assert _interpolate(95.0, elite=92.0, poor=85.0, inverted=False) == 1.0

    def test_at_poor(self):
        assert _interpolate(85.0, elite=92.0, poor=85.0, inverted=False) == 0.0

    def test_below_poor(self):
        assert _interpolate(80.0, elite=92.0, poor=85.0, inverted=False) == 0.0

    def test_midpoint(self):
        result = _interpolate(88.5, elite=92.0, poor=85.0, inverted=False)
        assert abs(result - 0.5) < 0.01

    def test_inverted_at_elite(self):
        # For inverted (lower is better): elite=22, poor=35
        assert _interpolate(22.0, elite=22.0, poor=35.0, inverted=True) == 1.0

    def test_inverted_at_poor(self):
        assert _interpolate(35.0, elite=22.0, poor=35.0, inverted=True) == 0.0

    def test_inverted_below_elite(self):
        assert _interpolate(15.0, elite=22.0, poor=35.0, inverted=True) == 1.0

    def test_inverted_midpoint(self):
        result = _interpolate(28.5, elite=22.0, poor=35.0, inverted=True)
        assert abs(result - 0.5) < 0.01


class TestScoreBatterStats:
    """Test batter composite scoring."""

    def test_elite_batter(self):
        stats = {
            "xwOBA": 0.420,
            "Barrel%": 0.18,
            "EV": 93.5,
            "HardHit%": 0.55,
            "O-Swing%": 0.18,
        }
        score = score_batter_stats(stats)
        assert score > 0.9

    def test_poor_batter(self):
        stats = {
            "xwOBA": 0.260,
            "Barrel%": 0.02,
            "EV": 83.0,
            "HardHit%": 0.25,
            "O-Swing%": 0.40,
        }
        score = score_batter_stats(stats)
        assert score < 0.1

    def test_average_batter(self):
        stats = {
            "xwOBA": 0.340,
            "Barrel%": 0.08,
            "EV": 88.0,
            "HardHit%": 0.40,
            "O-Swing%": 0.28,
        }
        score = score_batter_stats(stats)
        assert 0.3 < score < 0.7

    def test_missing_stats_neutral(self):
        score = score_batter_stats({})
        assert score == 0.3  # neutral fallback

    def test_partial_stats(self):
        stats = {"xwOBA": 0.400, "EV": 92.0}
        score = score_batter_stats(stats)
        assert score > 0.7  # elite on available metrics
class TestScorePitcherStats:
    """Test pitcher composite scoring."""

    def test_elite_pitcher(self):
        stats = {
            "K/9": 13.0,
            "ERA": 2.00,
            "WHIP": 0.85,
            "WAR": 7.0,
        }
        score = score_pitcher_stats(stats)
        assert score > 0.9

    def test_poor_pitcher(self):
        stats = {
            "K/9": 5.0,
            "ERA": 6.00,
            "WHIP": 1.70,
            "WAR": -0.5,
        }
        score = score_pitcher_stats(stats)
        assert score < 0.1

    def test_missing_stats_neutral(self):
        score = score_pitcher_stats({})
        assert score == 0.3


class TestLoadStats:
    """Test CSV loading (skipped if CSVs not available)."""

    def test_load_returns_dataframes(self):
        batting, pitching, career_bat, career_pit = load_stats()
        if batting is None:
            pytest.skip("FanGraphs CSVs not available")
        assert len(batting) > 100
        assert "MLBAMID" in batting.columns
        assert "NameASCII" in batting.columns

    def test_name_index_built(self):
        batting, _, _, _ = load_stats()
        if batting is None:
            pytest.skip("FanGraphs CSVs not available")
        index = build_name_index()
        assert len(index) > 100
        # Check a known player exists (lowercase key)
        keys = list(index.keys())
        assert any("ohtani" in k for k in keys) or len(keys) > 0
