#!/usr/bin/env python3
"""
Test script for Phase 3: Admin Dashboard for Feedback Management
Tests admin authentication, API endpoints, and feedback management features.
"""
import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def print_section(title):
    """Print a test section header."""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

def print_result(test_name, success, details=""):
    """Print test result."""
    status = "✓ PASS" if success else "✗ FAIL"
    print(f"{status} | {test_name}")
    if details:
        print(f"      {details}")

def test_admin_login():
    """Test admin login functionality."""
    print_section("Test 1: Admin Login")
    
    # Test with wrong password
    response = requests.post(
        f"{BASE_URL}/admin/login",
        json={"password": "wrongpassword"}
    )
    print_result("Wrong password rejected", response.status_code == 401)
    
    # Test with correct password (default: changeme123)
    response = requests.post(
        f"{BASE_URL}/admin/login",
        json={"password": "changeme123"}
    )
    print_result("Correct password accepted", response.status_code == 200)
    
    # Check for session cookie
    has_cookie = 'admin_session' in response.cookies
    print_result("Session cookie set", has_cookie)
    
    return response.cookies if response.status_code == 200 else None

def test_protected_endpoints(cookies):
    """Test that admin endpoints require authentication."""
    print_section("Test 2: Protected Endpoints")
    
    # Test without auth
    response = requests.get(f"{BASE_URL}/admin/api/feedback")
    print_result("Unauthenticated request blocked", response.status_code == 401)
    
    # Test with auth
    response = requests.get(f"{BASE_URL}/admin/api/feedback", cookies=cookies)
    print_result("Authenticated request allowed", response.status_code == 200)
    
    return response.status_code == 200

def test_stats_endpoint(cookies):
    """Test statistics endpoint."""
    print_section("Test 3: Statistics Endpoint")
    
    response = requests.get(f"{BASE_URL}/admin/api/stats", cookies=cookies)
    print_result("Stats endpoint accessible", response.status_code == 200)
    
    if response.status_code == 200:
        data = response.json()
        print_result("Stats data structure valid", 
                    'success' in data and 'data' in data)
        
        if data.get('success'):
            stats = data['data']
            print(f"      Total submissions: {stats.get('total', 0)}")
            print(f"      Unread: {stats.get('unread', 0)}")
            print(f"      Archived: {stats.get('archived', 0)}")
            print(f"      Recent (7 days): {stats.get('recent_submissions', 0)}")

def create_test_feedback():
    """Create test feedback for admin testing."""
    print_section("Test 4: Create Test Feedback")
    
    test_data = {
        "category": "Bug Report",
        "description": "Test feedback for admin dashboard testing",
        "browser": "Test Browser",
        "os": "Test OS",
        "screenResolution": "1920x1080",
        "viewportSize": "1440x900",
        "url": "http://localhost:8000/test",
        "timestamp": "2025-12-20T00:00:00Z",
        "screenshot": None,
        "annotation": None,
        "clientSessionId": "test_admin_session",
        "lastApiResponse": {"test": "data"}
    }
    
    response = requests.post(
        f"{BASE_URL}/api/feedback",
        json=test_data
    )
    
    print_result("Test feedback created", response.status_code == 200)
    
    if response.status_code == 200:
        data = response.json()
        feedback_id = data.get('feedback_id')
        print(f"      Feedback ID: {feedback_id}")
        return feedback_id
    
    return None

def test_feedback_list(cookies):
    """Test feedback list endpoint with filters."""
    print_section("Test 5: Feedback List & Filtering")
    
    # Test basic list
    response = requests.get(f"{BASE_URL}/admin/api/feedback", cookies=cookies)
    print_result("List endpoint works", response.status_code == 200)
    
    if response.status_code == 200:
        data = response.json()
        if data.get('success'):
            print(f"      Total items: {data['pagination']['total_items']}")
            print(f"      Page: {data['pagination']['page']}/{data['pagination']['total_pages']}")
    
    # Test filtering by category
    response = requests.get(
        f"{BASE_URL}/admin/api/feedback?category=Bug Report",
        cookies=cookies
    )
    print_result("Category filter works", response.status_code == 200)
    
    # Test filtering by read status
    response = requests.get(
        f"{BASE_URL}/admin/api/feedback?is_read=false",
        cookies=cookies
    )
    print_result("Read status filter works", response.status_code == 200)
    
    # Test search
    response = requests.get(
        f"{BASE_URL}/admin/api/feedback?search=test",
        cookies=cookies
    )
    print_result("Search filter works", response.status_code == 200)
    
    # Test sorting
    response = requests.get(
        f"{BASE_URL}/admin/api/feedback?sort_by=id&sort_order=asc",
        cookies=cookies
    )
    print_result("Sorting works", response.status_code == 200)

def test_feedback_detail(cookies, feedback_id):
    """Test feedback detail endpoint."""
    print_section("Test 6: Feedback Detail")
    
    if not feedback_id:
        print_result("Test skipped", False, "No feedback ID available")
        return
    
    response = requests.get(
        f"{BASE_URL}/admin/api/feedback/{feedback_id}",
        cookies=cookies
    )
    print_result("Detail endpoint works", response.status_code == 200)
    
    if response.status_code == 200:
        data = response.json()
        if data.get('success'):
            feedback = data['data']
            print(f"      Category: {feedback.get('category')}")
            print(f"      Read: {feedback.get('is_read')}")
            print(f"      Archived: {feedback.get('is_archived')}")

def test_feedback_updates(cookies, feedback_id):
    """Test feedback update operations."""
    print_section("Test 7: Feedback Updates")
    
    if not feedback_id:
        print_result("Test skipped", False, "No feedback ID available")
        return
    
    # Test marking as read
    response = requests.patch(
        f"{BASE_URL}/admin/api/feedback/{feedback_id}",
        json={"is_read": True},
        cookies=cookies
    )
    print_result("Mark as read", response.status_code == 200)
    
    # Test archiving
    response = requests.patch(
        f"{BASE_URL}/admin/api/feedback/{feedback_id}",
        json={"is_archived": True},
        cookies=cookies
    )
    print_result("Archive feedback", response.status_code == 200)
    
    # Test adding admin notes
    response = requests.patch(
        f"{BASE_URL}/admin/api/feedback/{feedback_id}",
        json={"admin_notes": "Test admin note"},
        cookies=cookies
    )
    print_result("Add admin notes", response.status_code == 200)
    
    # Verify updates
    response = requests.get(
        f"{BASE_URL}/admin/api/feedback/{feedback_id}",
        cookies=cookies
    )
    if response.status_code == 200:
        data = response.json()
        if data.get('success'):
            feedback = data['data']
            print_result("Updates verified", 
                        feedback['is_read'] == True and 
                        feedback['is_archived'] == True and
                        feedback['admin_notes'] == "Test admin note")

def test_export(cookies):
    """Test CSV export."""
    print_section("Test 8: CSV Export")
    
    response = requests.get(f"{BASE_URL}/admin/api/export", cookies=cookies)
    print_result("Export endpoint works", response.status_code == 200)
    
    if response.status_code == 200:
        is_csv = 'text/csv' in response.headers.get('content-type', '')
        print_result("Response is CSV", is_csv)
        
        if is_csv:
            lines = response.text.split('\n')
            print(f"      CSV has {len(lines)} lines")
            if len(lines) > 0:
                print(f"      Header: {lines[0][:80]}...")

def test_feedback_deletion(cookies, feedback_id):
    """Test feedback deletion."""
    print_section("Test 9: Feedback Deletion")
    
    if not feedback_id:
        print_result("Test skipped", False, "No feedback ID available")
        return
    
    response = requests.delete(
        f"{BASE_URL}/admin/api/feedback/{feedback_id}",
        cookies=cookies
    )
    print_result("Delete feedback", response.status_code == 200)
    
    # Verify deletion
    response = requests.get(
        f"{BASE_URL}/admin/api/feedback/{feedback_id}",
        cookies=cookies
    )
    print_result("Feedback deleted successfully", response.status_code == 404)

def test_logout(cookies):
    """Test logout functionality."""
    print_section("Test 10: Logout")
    
    response = requests.post(f"{BASE_URL}/admin/logout", cookies=cookies)
    print_result("Logout endpoint works", response.status_code == 200)

def main():
    """Run all admin dashboard tests."""
    print("\n" + "="*60)
    print("  PHASE 3 ADMIN DASHBOARD TEST SUITE")
    print("="*60)
    print(f"\nTesting against: {BASE_URL}")
    print("Default admin password: changeme123")
    print("\nNote: Set ADMIN_PASSWORD environment variable to change password")
    
    try:
        # Test 1: Login
        cookies = test_admin_login()
        if not cookies:
            print("\n✗ CRITICAL: Login failed. Cannot continue tests.")
            sys.exit(1)
        
        # Test 2: Protected endpoints
        test_protected_endpoints(cookies)
        
        # Test 3: Stats
        test_stats_endpoint(cookies)
        
        # Test 4: Create test feedback
        feedback_id = create_test_feedback()
        
        # Test 5: List and filters
        test_feedback_list(cookies)
        
        # Test 6: Detail view
        test_feedback_detail(cookies, feedback_id)
        
        # Test 7: Updates
        test_feedback_updates(cookies, feedback_id)
        
        # Test 8: Export
        test_export(cookies)
        
        # Test 9: Delete
        test_feedback_deletion(cookies, feedback_id)
        
        # Test 10: Logout
        test_logout(cookies)
        
        print_section("TESTS COMPLETED")
        print("\n✓ All tests completed successfully!")
        print(f"\nAccess the admin dashboard at: {BASE_URL}/admin-feedback.html")
        print("Default password: changeme123")
        
    except requests.exceptions.ConnectionError:
        print("\n✗ ERROR: Could not connect to server.")
        print(f"Is the server running at {BASE_URL}?")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
