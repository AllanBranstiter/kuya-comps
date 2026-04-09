"""
Tests for analytics_score_service collectibility scoring.

Tests cover:
    - _calculate_rarity_score (rescaled 0-2 range)
    - calculate_collectibility with rebalanced formula (price 0-3, volume 0-2, player 0-5)
    - Player score integration
"""
import math
import pytest

from backend.services.analytics_score_service import (
    calculate_collectibility,
    _calculate_rarity_score,
)


# ---------------------------------------------------------------------------
# _calculate_rarity_score (rescaled: 0-2 range)
# ---------------------------------------------------------------------------

class TestCalculateRarityScore:
    def test_none_input(self):
        assert _calculate_rarity_score(None) is None

    def test_unknown_confidence(self):
        info = {"print_run": 100, "confidence": "unknown", "source": None}
        assert _calculate_rarity_score(info) is None

    def test_estimated_confidence_ignored(self):
        info = {"print_run": 100, "confidence": "estimated", "source": "reference table"}
        assert _calculate_rarity_score(info) is None

    def test_print_to_order_string_ignored(self):
        info = {"print_run": "print-to-order", "confidence": "confirmed", "source": "listing data"}
        assert _calculate_rarity_score(info) is None

    def test_confirmed_1_of_1(self):
        info = {"print_run": 1, "confidence": "confirmed", "source": "listing data"}
        assert _calculate_rarity_score(info) == 2.0

    def test_confirmed_50(self):
        info = {"print_run": 50, "confidence": "confirmed", "source": "listing data"}
        score = _calculate_rarity_score(info)
        assert 1.2 < score < 1.5  # ~1.35

    def test_confirmed_100(self):
        info = {"print_run": 100, "confidence": "confirmed", "source": "listing data"}
        score = _calculate_rarity_score(info)
        assert 1.0 < score < 1.3  # ~1.15

    def test_confirmed_999(self):
        info = {"print_run": 999, "confidence": "confirmed", "source": "listing data"}
        score = _calculate_rarity_score(info)
        assert 0.3 < score < 0.6  # ~0.47

    def test_checklist_5000_returns_zero(self):
        info = {"print_run": 5000, "confidence": "checklist", "source": "checklist data"}
        assert _calculate_rarity_score(info) == 0.0

    def test_above_ceiling_returns_zero(self):
        info = {"print_run": 10000, "confidence": "checklist", "source": "checklist data"}
        assert _calculate_rarity_score(info) == 0.0

    def test_checklist_confidence_works(self):
        info = {"print_run": 250, "confidence": "checklist", "source": "Topps Heritage 2026"}
        score = _calculate_rarity_score(info)
        assert 0.7 < score < 1.0  # ~0.88


# ---------------------------------------------------------------------------
# calculate_collectibility: card-level only (no player)
# ---------------------------------------------------------------------------

class TestCollectibilityCardLevel:
    def test_no_print_run_no_player(self):
        """Without print_run or player, score based on price + volume only."""
        result = calculate_collectibility(50.0, 5)
        assert result["components"]["rarity"] is None
        assert result["components"]["player"] is None
        # Price: log2(50/5) = 3.32 -> capped at 3.0
        # Volume: log2(5)/log2(100)*2 = 0.70
        # Total: 3.70 -> 4
        assert result["score"] == 4
        assert result["label"] == "Common"

    def test_unknown_confidence_unchanged(self):
        info = {"print_run": 100, "confidence": "unknown", "source": None}
        result = calculate_collectibility(50.0, 5, info)
        assert result["components"]["rarity"] is None
        assert result["score"] == 4

    def test_max_without_player_is_5(self):
        """Without player data, max score is 5 (Sought After)."""
        result = calculate_collectibility(1000.0, 200)
        # Price: capped at 3.0; Volume: capped at 2.0
        assert result["score"] == 5
        assert result["label"] == "Sought After"

    def test_very_low_value_scores_1(self):
        """Sub-$5 card with 1 sale should score 1 (Bulk)."""
        result = calculate_collectibility(2.0, 1)
        assert result["score"] == 1
        assert result["label"] == "Bulk"

    def test_zero_value(self):
        result = calculate_collectibility(0, 0)
        assert result["score"] == 1
        assert result["label"] == "Bulk"


# ---------------------------------------------------------------------------
# calculate_collectibility: card-level with rarity
# ---------------------------------------------------------------------------

class TestCollectibilityWithRarity:
    def test_rare_card_boosts_score(self):
        """A /100 card should score higher than without rarity."""
        without = calculate_collectibility(20.0, 2)
        info = {"print_run": 100, "confidence": "confirmed", "source": "listing data"}
        with_rarity = calculate_collectibility(20.0, 2, info)

        assert with_rarity["score"] > without["score"]
        assert with_rarity["components"]["rarity"] is not None
        assert with_rarity["components"]["rarity"] > with_rarity["components"]["volume"]

    def test_common_card_not_affected(self):
        """A /5000 card with 50 sales: rarity is 0, volume already higher."""
        info = {"print_run": 5000, "confidence": "checklist", "source": "checklist data"}
        result = calculate_collectibility(2.0, 50, info)
        assert result["components"]["rarity"] == 0.0
        assert result["score"] == calculate_collectibility(2.0, 50)["score"]

    def test_1_of_1_no_player_caps_at_5(self):
        """A 1/1 at $200 without player data maxes at 5."""
        info = {"print_run": 1, "confidence": "confirmed", "source": "listing data"}
        result = calculate_collectibility(200.0, 3, info)
        # Price: 3.0 (capped) + rarity: 2.0 = 5.0 -> 5
        assert result["score"] == 5
        assert result["label"] == "Sought After"

    def test_rarity_only_helps_never_hurts(self):
        """If volume > rarity, volume is used (rarity doesn't reduce)."""
        info = {"print_run": 2000, "confidence": "confirmed", "source": "listing data"}
        without = calculate_collectibility(10.0, 50)
        with_rarity = calculate_collectibility(10.0, 50, info)
        assert with_rarity["score"] == without["score"]

    def test_components_include_rarity(self):
        info = {"print_run": 100, "confidence": "confirmed", "source": "listing data"}
        result = calculate_collectibility(50.0, 5, info)
        components = result["components"]
        assert "price" in components
        assert "volume" in components
        assert "rarity" in components
        assert isinstance(components["rarity"], float)


# ---------------------------------------------------------------------------
# calculate_collectibility: with player score
# ---------------------------------------------------------------------------

class TestCollectibilityWithPlayer:
    def test_player_score_adds_to_total(self):
        """Player score adds to the total alongside price and volume."""
        player = {"score": 3.5, "confidence": "high", "components": {}}
        result = calculate_collectibility(50.0, 5, player_score=player)
        # Price: 3.0 + volume: 0.70 + player: 3.5 = 7.20 -> 7
        assert result["score"] == 7
        assert result["label"] == "Highly Collectible"
        assert result["components"]["player"] == 3.5

    def test_blue_chip_requires_player(self):
        """Score 9-10 requires a strong player score."""
        player = {"score": 4.5, "confidence": "high", "components": {"test": True}}
        result = calculate_collectibility(100.0, 50, player_score=player)
        # Price: 3.0 + volume: ~1.70 + player: 4.5 = 9.20 -> 9
        assert result["score"] >= 9
        assert result["label"] == "Blue Chip"
        assert result["components"]["player_details"] == {"test": True}

    def test_player_score_none_ignored(self):
        """player_score=None behaves like no player data."""
        result = calculate_collectibility(50.0, 5, player_score=None)
        assert result["components"].get("player") is None
        assert result["score"] == 4

    def test_player_score_zero_ignored(self):
        """Player score of 0.0 doesn't add to total."""
        player = {"score": 0.0, "confidence": "none", "components": {}}
        result = calculate_collectibility(50.0, 5, player_score=player)
        assert result["components"].get("player") is None
        assert result["score"] == 4

    def test_player_clamped_at_5(self):
        """Player score is clamped at 5.0 even if higher."""
        player = {"score": 7.0, "confidence": "high", "components": {}}
        result = calculate_collectibility(100.0, 50, player_score=player)
        assert result["components"]["player"] == 5.0

    def test_full_score_clamped_at_10(self):
        """Total score never exceeds 10."""
        player = {"score": 5.0, "confidence": "high", "components": {}}
        result = calculate_collectibility(1000.0, 200, player_score=player)
        assert result["score"] == 10

    def test_rarity_plus_player(self):
        """Rarity and player combine correctly."""
        info = {"print_run": 50, "confidence": "confirmed", "source": "listing data"}
        player = {"score": 4.0, "confidence": "high", "components": {}}
        result = calculate_collectibility(100.0, 2, info, player)
        # Price: 3.0 + rarity: ~1.35 (> volume ~0.30) + player: 4.0 = 8.35 -> 8
        assert result["score"] >= 8
        assert result["label"] == "Highly Collectible"
        assert result["components"]["rarity"] is not None
        assert result["components"]["player"] == 4.0
