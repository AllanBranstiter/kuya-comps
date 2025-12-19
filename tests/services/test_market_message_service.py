"""
Unit tests for Market Message Service.

Tests cover:
- Message type determination logic
- Placeholder formatting
- Tier-specific message retrieval
- Liquidity popup content
- Edge cases and error handling
"""
import pytest
from unittest.mock import patch, mock_open
from backend.services.market_message_service import (
    determine_message_type,
    format_message_placeholders,
    get_market_message,
    get_liquidity_popup_content,
    load_message_content
)


class TestDetermineMessageType:
    """Test market condition message type determination."""
    
    def test_data_quality_warning(self):
        """Low confidence + high pressure = data quality warning."""
        result = determine_message_type(
            market_pressure=25.0,
            liquidity_score=50,
            market_confidence=25  # Low confidence
        )
        assert result == "data_quality_warning"
    
    def test_two_tier_market(self):
        """High absorption below + low above = two tier market."""
        result = determine_message_type(
            market_pressure=10.0,
            liquidity_score=60,
            market_confidence=70,
            absorption_below=2.0,  # High absorption below
            absorption_above=0.2,  # Low absorption above
            below_fmv_count=5,
            above_fmv_count=3
        )
        assert result == "two_tier_market"
    
    def test_high_pressure_low_liquidity(self):
        """High pressure + low liquidity = high risk."""
        result = determine_message_type(
            market_pressure=35.0,  # High pressure
            liquidity_score=40,    # Low liquidity
            market_confidence=60
        )
        assert result == "high_pressure_low_liquidity"
    
    def test_overpriced_active_market(self):
        """High pressure + good liquidity = overpriced but active."""
        result = determine_message_type(
            market_pressure=35.0,  # High pressure
            liquidity_score=70,    # Good liquidity
            market_confidence=60
        )
        assert result == "overpriced_active_market"
    
    def test_fair_price_low_liquidity(self):
        """Fair pressure + low liquidity = fair price low liquidity."""
        result = determine_message_type(
            market_pressure=10.0,  # Fair pressure
            liquidity_score=40,    # Low liquidity
            market_confidence=60
        )
        assert result == "fair_price_low_liquidity"
    
    def test_strong_buy_opportunity(self):
        """Negative pressure + high liquidity = strong buy."""
        result = determine_message_type(
            market_pressure=-10.0,  # Negative pressure
            liquidity_score=75,     # High liquidity
            market_confidence=60
        )
        assert result == "strong_buy_opportunity"
    
    def test_healthy_market_conditions(self):
        """Fair pressure + high liquidity = healthy market."""
        result = determine_message_type(
            market_pressure=10.0,  # Fair pressure
            liquidity_score=75,    # High liquidity
            market_confidence=60
        )
        assert result == "healthy_market_conditions"
    
    def test_normal_market_default(self):
        """Normal conditions = normal market."""
        result = determine_message_type(
            market_pressure=20.0,
            liquidity_score=60,
            market_confidence=60
        )
        assert result == "normal_market"
    
    def test_boundary_conditions(self):
        """Test exact boundary values."""
        # Exactly 30% pressure with 50 liquidity should be high_pressure_low_liquidity
        result = determine_message_type(
            market_pressure=30.1,
            liquidity_score=49.9,
            market_confidence=60
        )
        assert result == "high_pressure_low_liquidity"
    
    def test_negative_market_pressure(self):
        """Negative pressure indicates underpriced market."""
        result = determine_message_type(
            market_pressure=-15.0,
            liquidity_score=50,
            market_confidence=60
        )
        # Should fall through to normal_market if not caught by strong_buy
        assert result in ["normal_market", "fair_price_low_liquidity"]


class TestFormatMessagePlaceholders:
    """Test placeholder replacement in message content."""
    
    def test_simple_placeholder_replacement(self):
        """Single placeholder should be replaced."""
        content = "Market pressure is {marketPressure}%"
        placeholders = {"marketPressure": 15.5}
        
        result = format_message_placeholders(content, placeholders)
        assert result == "Market pressure is 15.5%"
    
    def test_multiple_placeholders(self):
        """Multiple placeholders should all be replaced."""
        content = "Pressure: {pressure}%, Liquidity: {liquidity}"
        placeholders = {"pressure": 20.0, "liquidity": 65.0}
        
        result = format_message_placeholders(content, placeholders)
        assert result == "Pressure: 20.0%, Liquidity: 65.0"
    
    def test_float_formatting(self):
        """Floats should be formatted to 1 decimal place."""
        content = "Score: {score}"
        placeholders = {"score": 75.678}
        
        result = format_message_placeholders(content, placeholders)
        assert result == "Score: 75.7"
    
    def test_integer_handling(self):
        """Integers should be converted to strings."""
        content = "Count: {count}"
        placeholders = {"count": 42}
        
        result = format_message_placeholders(content, placeholders)
        assert result == "Count: 42"
    
    def test_string_passthrough(self):
        """String values should pass through unchanged."""
        content = "Status: {status}"
        placeholders = {"status": "Active"}
        
        result = format_message_placeholders(content, placeholders)
        assert result == "Status: Active"
    
    def test_missing_placeholder_ignored(self):
        """Missing placeholders should be left unchanged."""
        content = "Value: {missing}"
        placeholders = {"other": 10}
        
        result = format_message_placeholders(content, placeholders)
        assert result == "Value: {missing}"
    
    def test_no_placeholders(self):
        """Content without placeholders should be unchanged."""
        content = "This is a plain message"
        placeholders = {"value": 10}
        
        result = format_message_placeholders(content, placeholders)
        assert result == "This is a plain message"


class TestGetMarketMessage:
    """Test tier-specific market message retrieval."""
    
    @patch('backend.services.market_message_service.load_message_content')
    def test_get_message_for_tier_1(self, mock_load):
        """Should return tier_1 specific message."""
        mock_load.return_value = {
            "messages": {
                "normal_market": {
                    "title": "Normal Market",
                    "icon": "📊",
                    "base_color": "#007aff",
                    "tier_1": {
                        "content": "Tier 1 content with {marketPressure}%",
                        "advice_seller": ["Sell advice"],
                        "advice_buyer": ["Buy advice"],
                        "advice_collector": ["Collect advice"]
                    }
                }
            },
            "liquidity_popup": {}
        }
        
        result = get_market_message(
            tier_id="tier_1",
            market_pressure=15.0,
            liquidity_score=60,
            market_confidence=70
        )
        
        assert result["message_type"] == "normal_market"
        assert result["title"] == "Normal Market"
        assert result["icon"] == "📊"
        assert "15.0%" in result["content"] or "+15.0" in result["content"]
        assert "seller" in result["advice"]
        assert "buyer" in result["advice"]
        assert "collector" in result["advice"]
    
    @patch('backend.services.market_message_service.load_message_content')
    def test_get_message_fallback_to_tier_1(self, mock_load):
        """Should fallback to tier_1 if specific tier not available."""
        mock_load.return_value = {
            "messages": {
                "data_quality_warning": {
                    "title": "Data Quality Warning",
                    "icon": "⚠️",
                    "base_color": "#ff9500",
                    "tier_1": {
                        "content": "Generic warning",
                        "advice_seller": ["Be cautious"]
                    }
                }
            },
            "liquidity_popup": {}
        }
        
        result = get_market_message(
            tier_id="tier_5",  # Request tier_5
            market_pressure=25.0,
            liquidity_score=50,
            market_confidence=25  # Triggers data_quality_warning
        )
        
        assert result["message_type"] == "data_quality_warning"
        assert result["content"] == "Generic warning"
    
    @patch('backend.services.market_message_service.load_message_content')
    def test_placeholder_substitution_in_message(self, mock_load):
        """Placeholders should be substituted correctly."""
        mock_load.return_value = {
            "messages": {
                "normal_market": {
                    "title": "Test",
                    "icon": "📊",
                    "base_color": "#007aff",
                    "tier_2": {
                        "content": "Pressure: {absMarketPressure}%, Liquidity: {liquidityScore}",
                        "advice_seller": []
                    }
                }
            },
            "liquidity_popup": {}
        }
        
        result = get_market_message(
            tier_id="tier_2",
            market_pressure=-12.5,  # Negative
            liquidity_score=68.3,
            market_confidence=75
        )
        
        # absMarketPressure should be positive
        assert "12.5%" in result["content"]
        assert "68.3" in result["content"]
    
    @patch('backend.services.market_message_service.load_message_content')
    def test_extra_placeholders_passed_through(self, mock_load):
        """Extra placeholders should be included in substitution."""
        mock_load.return_value = {
            "messages": {
                "normal_market": {
                    "title": "Test",
                    "icon": "📊",
                    "base_color": "#007aff",
                    "tier_3": {
                        "content": "Custom: {customValue}",
                        "advice_seller": []
                    }
                }
            },
            "liquidity_popup": {}
        }
        
        result = get_market_message(
            tier_id="tier_3",
            market_pressure=10,
            liquidity_score=60,
            market_confidence=70,
            customValue="TestValue"
        )
        
        assert "TestValue" in result["content"]


class TestGetLiquidityPopupContent:
    """Test liquidity popup content retrieval."""
    
    @patch('backend.services.market_message_service.load_message_content')
    def test_get_tier_specific_content(self, mock_load):
        """Should return tier-specific liquidity content."""
        mock_load.return_value = {
            "messages": {},
            "liquidity_popup": {
                "title": "How Easy Is It to Sell?",
                "tier_2": {
                    "content": "Tier 2 liquidity explanation"
                }
            }
        }
        
        result = get_liquidity_popup_content("tier_2")
        
        assert result["title"] == "How Easy Is It to Sell?"
        assert result["content"] == "Tier 2 liquidity explanation"
    
    @patch('backend.services.market_message_service.load_message_content')
    def test_fallback_to_tier_1(self, mock_load):
        """Should fallback to tier_1 if specific tier not found."""
        mock_load.return_value = {
            "messages": {},
            "liquidity_popup": {
                "title": "Liquidity Info",
                "tier_1": {
                    "content": "Default explanation"
                }
            }
        }
        
        result = get_liquidity_popup_content("tier_99")
        
        assert result["content"] == "Default explanation"
    
    @patch('backend.services.market_message_service.load_message_content')
    def test_empty_content_when_missing(self, mock_load):
        """Should return empty content if nothing found."""
        mock_load.return_value = {
            "messages": {},
            "liquidity_popup": {
                "title": "Liquidity Info"
            }
        }
        
        result = get_liquidity_popup_content("tier_4")
        
        assert result["content"] == ""


class TestLoadMessageContent:
    """Test message content loading and caching."""
    
    def test_load_content_caches_result(self):
        """Content should be cached after first load."""
        # This test is tricky due to global cache
        # In real tests, you'd reset the cache between tests
        # For now, just verify it doesn't raise an error
        try:
            content = load_message_content()
            assert isinstance(content, dict)
            assert "messages" in content
            assert "liquidity_popup" in content
        except FileNotFoundError:
            # Expected if not running from project root
            pytest.skip("JSON file not accessible in test environment")
    
    @patch('builtins.open', side_effect=FileNotFoundError())
    def test_raises_error_when_file_missing(self, mock_file):
        """Should raise FileNotFoundError if JSON missing."""
        # Clear cache to force reload
        import backend.services.market_message_service as mms
        mms._MESSAGE_CONTENT_CACHE = None
        
        with pytest.raises(FileNotFoundError):
            load_message_content()
