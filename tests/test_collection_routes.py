# tests/test_collection_routes.py
"""
Tests for Collection CRUD endpoints (Phase 2).

Tests the new POST /api/v1/cards and POST /api/v1/binders endpoints
that replace direct Supabase insertion from the frontend.
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, date
from decimal import Decimal
from unittest.mock import Mock, patch, MagicMock

from main import app
from backend.database.schema import Card, Binder, PriceHistory


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    return {
        'id': 'test-user-123',
        'sub': 'test-user-123',
        'email': 'test@example.com'
    }


@pytest.fixture
def mock_binder(mock_user):
    """Mock binder for testing."""
    binder = Mock(spec=Binder)
    binder.id = 1
    binder.user_id = mock_user['sub']
    binder.name = 'Test Binder'
    binder.created_at = datetime.utcnow()
    binder.updated_at = datetime.utcnow()
    return binder


@pytest.fixture
def valid_card_data():
    """Valid card creation data."""
    return {
        'binder_id': 1,
        'year': '2024',
        'set_name': 'Topps Chrome',
        'athlete': 'Shohei Ohtani',
        'card_number': '1',
        'variation': 'Silver Refractor',
        'grading_company': 'PSA',
        'grade': '10',
        'purchase_price': 150.00,
        'purchase_date': '2024-01-15',
        'search_query_string': '2024 Topps Chrome Shohei Ohtani Silver Refractor PSA 10',
        'auto_update': True,
        'tags': 'rookie,investment',
        'notes': 'From eBay auction'
    }


@pytest.fixture
def mock_card(mock_user, valid_card_data):
    """Mock card for testing."""
    card = Mock(spec=Card)
    card.id = 1
    card.binder_id = valid_card_data['binder_id']
    card.user_id = mock_user['sub']
    card.year = valid_card_data['year']
    card.set_name = valid_card_data['set_name']
    card.athlete = valid_card_data['athlete']
    card.card_number = valid_card_data['card_number']
    card.variation = valid_card_data['variation']
    card.grading_company = valid_card_data['grading_company']
    card.grade = valid_card_data['grade']
    card.purchase_price = Decimal(str(valid_card_data['purchase_price']))
    card.purchase_date = datetime.strptime(valid_card_data['purchase_date'], '%Y-%m-%d').date()
    card.current_fmv = None
    card.search_query_string = valid_card_data['search_query_string']
    card.auto_update = valid_card_data['auto_update']
    card.tags = valid_card_data['tags']
    card.notes = valid_card_data['notes']
    card.created_at = datetime.utcnow()
    card.updated_at = datetime.utcnow()
    card.last_updated_at = None
    card.review_required = False
    card.review_reason = None
    card.no_recent_sales = False
    card.image_url = None
    return card


# ============================================================================
# Authentication Tests (401)
# ============================================================================

def test_create_card_without_auth(client):
    """Test that creating a card without authentication returns 401."""
    card_data = {
        'binder_id': 1,
        'athlete': 'Test Athlete',
        'search_query_string': 'Test Search'
    }
    
    response = client.post('/api/v1/cards', json=card_data)
    
    assert response.status_code == 401
    assert 'detail' in response.json()


def test_create_card_with_invalid_token(client):
    """Test that creating a card with invalid JWT token returns 401."""
    card_data = {
        'binder_id': 1,
        'athlete': 'Test Athlete',
        'search_query_string': 'Test Search'
    }
    
    response = client.post(
        '/api/v1/cards',
        json=card_data,
        headers={'Authorization': 'Bearer invalid_token_here'}
    )
    
    assert response.status_code == 401


def test_create_binder_without_auth(client):
    """Test that creating a binder without authentication returns 401."""
    binder_data = {'name': 'Test Binder'}
    
    response = client.post('/api/v1/binders', json=binder_data)
    
    assert response.status_code == 401


# ============================================================================
# Authorization Tests (404)
# ============================================================================

@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_card')
def test_create_card_in_nonexistent_binder(mock_create_card, mock_get_db, mock_auth, client, mock_user, valid_card_data):
    """Test that creating a card in a non-existent binder returns 404."""
    # Mock authentication
    mock_auth.return_value = mock_user
    
    # Mock database session
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    
    # Mock service layer returning None (binder not found)
    mock_create_card.return_value = None
    
    response = client.post(
        '/api/v1/cards',
        json=valid_card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 404
    assert 'binder not found' in response.json()['detail'].lower()


@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_card')
def test_create_card_in_another_users_binder(mock_create_card, mock_get_db, mock_auth, client, valid_card_data):
    """Test that user cannot add card to another user's binder."""
    # Mock authentication for user A
    mock_auth.return_value = {'id': 'user-a', 'sub': 'user-a'}
    
    # Mock database session
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    
    # Mock service layer returning None (binder not found for this user)
    mock_create_card.return_value = None
    
    # Try to add card to binder owned by user B
    response = client.post(
        '/api/v1/cards',
        json=valid_card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 404


# ============================================================================
# Validation Tests (422)
# ============================================================================

@patch('backend.routes.collection.get_current_user_required')
def test_create_card_missing_athlete(mock_auth, client, mock_user):
    """Test that creating a card without athlete name returns 422."""
    mock_auth.return_value = mock_user
    
    card_data = {
        'binder_id': 1,
        'search_query_string': 'Test Search'
        # Missing 'athlete' field
    }
    
    response = client.post(
        '/api/v1/cards',
        json=card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 422


@patch('backend.routes.collection.get_current_user_required')
def test_create_card_missing_search_query(mock_auth, client, mock_user):
    """Test that creating a card without search query returns 422."""
    mock_auth.return_value = mock_user
    
    card_data = {
        'binder_id': 1,
        'athlete': 'Test Athlete'
        # Missing 'search_query_string' field
    }
    
    response = client.post(
        '/api/v1/cards',
        json=card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 422


@patch('backend.routes.collection.get_current_user_required')
def test_create_card_missing_binder_id(mock_auth, client, mock_user):
    """Test that creating a card without binder_id returns 422."""
    mock_auth.return_value = mock_user
    
    card_data = {
        'athlete': 'Test Athlete',
        'search_query_string': 'Test Search'
        # Missing 'binder_id' field
    }
    
    response = client.post(
        '/api/v1/cards',
        json=card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 422


@patch('backend.routes.collection.get_current_user_required')
def test_create_binder_missing_name(mock_auth, client, mock_user):
    """Test that creating a binder without name returns 422."""
    mock_auth.return_value = mock_user
    
    binder_data = {}  # Missing 'name' field
    
    response = client.post(
        '/api/v1/binders',
        json=binder_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 422


# ============================================================================
# Success Tests (201)
# ============================================================================

@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_card')
def test_create_card_minimal_data(mock_create_card, mock_get_db, mock_auth, client, mock_user):
    """Test creating a card with only required fields."""
    mock_auth.return_value = mock_user
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    
    # Create mock card with minimal data
    mock_card_obj = Mock(spec=Card)
    mock_card_obj.id = 1
    mock_card_obj.binder_id = 1
    mock_card_obj.user_id = mock_user['sub']
    mock_card_obj.athlete = 'Test Athlete'
    mock_card_obj.search_query_string = 'Test Search'
    mock_card_obj.year = None
    mock_card_obj.set_name = None
    mock_card_obj.card_number = None
    mock_card_obj.variation = None
    mock_card_obj.grading_company = None
    mock_card_obj.grade = None
    mock_card_obj.purchase_price = None
    mock_card_obj.purchase_date = None
    mock_card_obj.current_fmv = None
    mock_card_obj.auto_update = True
    mock_card_obj.tags = None
    mock_card_obj.notes = None
    mock_card_obj.created_at = datetime.utcnow()
    mock_card_obj.updated_at = datetime.utcnow()
    mock_card_obj.last_updated_at = None
    mock_card_obj.review_required = False
    mock_card_obj.review_reason = None
    mock_card_obj.no_recent_sales = False
    mock_card_obj.image_url = None
    
    mock_create_card.return_value = mock_card_obj
    
    card_data = {
        'binder_id': 1,
        'athlete': 'Test Athlete',
        'search_query_string': 'Test Search'
    }
    
    response = client.post(
        '/api/v1/cards',
        json=card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data['athlete'] == 'Test Athlete'
    assert data['id'] == 1


@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_card')
def test_create_card_with_year_field(mock_create_card, mock_get_db, mock_auth, client, mock_user, mock_card):
    """CRITICAL: Test that year field is saved correctly."""
    mock_auth.return_value = mock_user
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    mock_create_card.return_value = mock_card
    
    card_data = {
        'binder_id': 1,
        'year': '2024',  # CRITICAL FIELD
        'athlete': 'Test Athlete',
        'search_query_string': 'Test Search'
    }
    
    response = client.post(
        '/api/v1/cards',
        json=card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data['year'] == '2024', "Year field must be saved correctly"


@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_card')
def test_create_card_with_purchase_date(mock_create_card, mock_get_db, mock_auth, client, mock_user, mock_card):
    """CRITICAL: Test that purchase_date field is saved correctly."""
    mock_auth.return_value = mock_user
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    mock_create_card.return_value = mock_card
    
    card_data = {
        'binder_id': 1,
        'athlete': 'Test Athlete',
        'purchase_date': '2024-01-15',  # CRITICAL FIELD
        'search_query_string': 'Test Search'
    }
    
    response = client.post(
        '/api/v1/cards',
        json=card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 201
    data = response.json()
    # purchase_date should be in the response
    assert 'purchase_date' in data, "purchase_date field must be in response"
    assert data['purchase_date'] is not None, "purchase_date must be saved correctly"


@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_card')
def test_create_card_full_data(mock_create_card, mock_get_db, mock_auth, client, mock_user, mock_card, valid_card_data):
    """Test creating a card with all fields populated."""
    mock_auth.return_value = mock_user
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    mock_create_card.return_value = mock_card
    
    response = client.post(
        '/api/v1/cards',
        json=valid_card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data['athlete'] == valid_card_data['athlete']
    assert data['year'] == valid_card_data['year']
    assert data['set_name'] == valid_card_data['set_name']
    assert data['card_number'] == valid_card_data['card_number']
    assert data['variation'] == valid_card_data['variation']
    assert data['grading_company'] == valid_card_data['grading_company']
    assert data['grade'] == valid_card_data['grade']


@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_binder')
def test_create_binder_success(mock_create_binder, mock_get_db, mock_auth, client, mock_user, mock_binder):
    """Test successful binder creation."""
    mock_auth.return_value = mock_user
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    mock_create_binder.return_value = mock_binder
    
    binder_data = {'name': 'Test Binder'}
    
    response = client.post(
        '/api/v1/binders',
        json=binder_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data['name'] == 'Test Binder'
    assert data['id'] == 1


# ============================================================================
# Edge Case Tests
# ============================================================================

@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_card')
def test_create_card_with_null_optional_fields(mock_create_card, mock_get_db, mock_auth, client, mock_user):
    """Test that null values for optional fields are handled correctly."""
    mock_auth.return_value = mock_user
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    
    mock_card_obj = Mock(spec=Card)
    mock_card_obj.id = 1
    mock_card_obj.binder_id = 1
    mock_card_obj.user_id = mock_user['sub']
    mock_card_obj.athlete = 'Test Athlete'
    mock_card_obj.search_query_string = 'Test'
    mock_card_obj.year = None
    mock_card_obj.purchase_date = None
    mock_card_obj.purchase_price = None
    mock_card_obj.current_fmv = None
    mock_card_obj.set_name = None
    mock_card_obj.card_number = None
    mock_card_obj.variation = None
    mock_card_obj.grading_company = None
    mock_card_obj.grade = None
    mock_card_obj.auto_update = True
    mock_card_obj.tags = None
    mock_card_obj.notes = None
    mock_card_obj.image_url = None
    mock_card_obj.created_at = datetime.utcnow()
    mock_card_obj.updated_at = datetime.utcnow()
    mock_card_obj.last_updated_at = None
    mock_card_obj.review_required = False
    mock_card_obj.review_reason = None
    mock_card_obj.no_recent_sales = False
    
    mock_create_card.return_value = mock_card_obj
    
    card_data = {
        'binder_id': 1,
        'athlete': 'Test Athlete',
        'search_query_string': 'Test',
        'year': None,
        'purchase_date': None,
        'purchase_price': None
    }
    
    response = client.post(
        '/api/v1/cards',
        json=card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data['year'] is None
    assert data['purchase_date'] is None


@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_card')
def test_create_card_with_empty_strings(mock_create_card, mock_get_db, mock_auth, client, mock_user):
    """Test that empty strings for optional fields are handled correctly."""
    mock_auth.return_value = mock_user
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    
    mock_card_obj = Mock(spec=Card)
    mock_card_obj.id = 1
    mock_card_obj.binder_id = 1
    mock_card_obj.user_id = mock_user['sub']
    mock_card_obj.athlete = 'Test Athlete'
    mock_card_obj.search_query_string = 'Test'
    mock_card_obj.year = None
    mock_card_obj.set_name = None
    mock_card_obj.card_number = None
    mock_card_obj.variation = None
    mock_card_obj.grading_company = None
    mock_card_obj.grade = None
    mock_card_obj.purchase_price = None
    mock_card_obj.purchase_date = None
    mock_card_obj.current_fmv = None
    mock_card_obj.auto_update = True
    mock_card_obj.tags = None
    mock_card_obj.notes = None
    mock_card_obj.image_url = None
    mock_card_obj.created_at = datetime.utcnow()
    mock_card_obj.updated_at = datetime.utcnow()
    mock_card_obj.last_updated_at = None
    mock_card_obj.review_required = False
    mock_card_obj.review_reason = None
    mock_card_obj.no_recent_sales = False
    
    mock_create_card.return_value = mock_card_obj
    
    card_data = {
        'binder_id': 1,
        'athlete': 'Test Athlete',
        'search_query_string': 'Test',
        'year': '',  # Empty string
        'set_name': ''
    }
    
    response = client.post(
        '/api/v1/cards',
        json=card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    # Empty strings should be acceptable and converted to None or stored as-is
    assert response.status_code == 201


# ============================================================================
# Error Handling Tests
# ============================================================================

@patch('backend.routes.collection.get_current_user_required')
@patch('backend.routes.collection.get_db')
@patch('backend.routes.collection.create_card')
def test_create_card_database_error(mock_create_card, mock_get_db, mock_auth, client, mock_user, valid_card_data):
    """Test that database errors are handled gracefully."""
    mock_auth.return_value = mock_user
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    
    # Simulate database error
    mock_create_card.side_effect = Exception('Database connection failed')
    
    response = client.post(
        '/api/v1/cards',
        json=valid_card_data,
        headers={'Authorization': 'Bearer valid_token'}
    )
    
    assert response.status_code == 500
    assert 'detail' in response.json()


@patch('backend.routes.collection.get_current_user_required')
def test_create_card_invalid_user_in_token(client):
    """Test that invalid user in JWT token is handled."""
    # Mock auth to return user without 'sub' field
    with patch('backend.routes.collection.get_current_user_required') as mock_auth:
        mock_auth.return_value = {'id': 'user-123'}  # Missing 'sub' field
        
        card_data = {
            'binder_id': 1,
            'athlete': 'Test Athlete',
            'search_query_string': 'Test'
        }
        
        response = client.post(
            '/api/v1/cards',
            json=card_data,
            headers={'Authorization': 'Bearer valid_token'}
        )
        
        assert response.status_code == 401
        assert 'invalid authentication token' in response.json()['detail'].lower()
