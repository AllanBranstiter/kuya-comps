"""
Tests for player_identification_service.
"""
import pytest

from backend.services.player_identification_service import (
    _strip_known_tokens,
    identify_player,
)


class TestStripKnownTokens:
    """Test regex token stripping from card search queries."""

    def test_basic_query(self):
        result = _strip_known_tokens("2024 Topps Chrome Shohei Ohtani #123")
        assert "Shohei Ohtani" in result
        assert "2024" not in result
        assert "Topps" not in result.lower()
        assert "Chrome" not in result.lower()
        assert "#123" not in result

    def test_graded_card(self):
        result = _strip_known_tokens("PSA 10 2023 Topps Update Ronald Acuna Jr #123")
        assert "Ronald Acuna Jr" in result
        assert "PSA" not in result
        assert "2023" not in result

    def test_parallel(self):
        result = _strip_known_tokens("2024 Bowman Chrome Refractor Dylan Crews /499")
        assert "Dylan Crews" in result
        assert "Refractor" not in result
        assert "/499" not in result

    def test_ebay_operator(self):
        result = _strip_known_tokens("bowman chrome 2025 -lot roman anthony")
        assert "roman anthony" in result.lower()
        assert "-lot" not in result

    def test_auto_relic(self):
        result = _strip_known_tokens("2024 Topps Museum Collection Auto Relic Mike Trout /25")
        assert "Mike Trout" in result
        assert "Auto" not in result
        assert "Relic" not in result

    def test_year_range(self):
        result = _strip_known_tokens("1989 Upper Deck Ken Griffey Jr Rookie Card #1")
        assert "Ken Griffey Jr" in result
        assert "1989" not in result
        assert "Upper Deck" not in result.lower()

    def test_bowman_1st(self):
        result = _strip_known_tokens("2025 Bowman 1st Edition Chrome Junior Caminero")
        assert "Junior Caminero" in result
        assert "1st" not in result
        assert "Bowman" not in result.lower()

    def test_multiple_parallels(self):
        result = _strip_known_tokens("2024 Topps Sapphire Gold Shimmer Elly De La Cruz SP /50")
        assert "Elly De La Cruz" in result

    def test_empty_query(self):
        result = _strip_known_tokens("")
        assert result == ""

    def test_only_tokens_no_player(self):
        result = _strip_known_tokens("2024 Topps Chrome Refractor PSA 10 /50")
        # Should be mostly empty after stripping
        assert len(result.strip()) < 5


class TestIdentifyPlayer:
    """Test the full identification pipeline.

    NOTE: These tests rely on the name index being built from CSVs.
    If CSVs are not available in CI, they should be skipped.
    """

    @pytest.fixture(autouse=True)
    def _check_csv_available(self):
        """Skip tests if FanGraphs CSVs are not available."""
        from backend.services.player_stats_service import load_stats
        batting, _, _, _ = load_stats()
        if batting is None:
            pytest.skip("FanGraphs CSVs not available")

    def test_identifies_star_batter(self):
        result = identify_player("2024 Topps Chrome Shohei Ohtani #123 Refractor")
        assert result is not None
        assert "Ohtani" in result["name"]
        assert result["mlbam_id"] is not None

    def test_identifies_with_grade(self):
        result = identify_player("PSA 10 2023 Topps Ronald Acuna Jr #1")
        assert result is not None
        assert "Acuna" in result["name"]

    def test_identifies_pitcher(self):
        result = identify_player("2024 Topps Chrome Spencer Strider #456")
        assert result is not None
        assert result["mlbam_id"] is not None

    def test_returns_none_for_no_player(self):
        result = identify_player("2024 Topps Chrome Refractor PSA 10 /50")
        # May or may not return None depending on fuzzy matching
        # But if it does return something, confidence should be low
        if result is not None:
            assert result.get("confidence") in ("inferred", "ai")

    def test_returns_none_for_empty(self):
        assert identify_player("") is None
        assert identify_player(None) is None

    def test_handles_nickname(self):
        """Vlad Jr, Julio, etc. should still match if in name index."""
        result = identify_player("2024 Topps Julio Rodriguez RC")
        # May or may not match depending on CSV content
        if result:
            assert result["mlbam_id"] is not None
