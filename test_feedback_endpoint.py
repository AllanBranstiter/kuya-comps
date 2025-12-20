#!/usr/bin/env python3
"""
Test script for the feedback API endpoint.

This script tests the /api/feedback endpoint to ensure it's working correctly.
"""
import requests
import json
from datetime import datetime

# Test data
test_feedback = {
    "category": "Bug Report",
    "description": "Test feedback submission from automated test",
    "browser": "Mozilla/5.0 (Test Browser)",
    "os": "Test OS",
    "screenResolution": "1920x1080",
    "viewportSize": "1440x900",
    "url": "http://localhost:8000/test",
    "timestamp": datetime.utcnow().isoformat() + "Z",
    "screenshot": None,  # No screenshot for this test
    "annotation": None,
    "clientSessionId": "test_session_123",
    "lastApiResponse": {
        "url": "/api/test",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "data": {"test": "data"}
    }
}

def test_feedback_submission():
    """Test submitting feedback to the API."""
    url = "http://localhost:8000/api/feedback"
    
    print("Testing feedback submission endpoint...")
    print(f"URL: {url}")
    print(f"Payload: {json.dumps(test_feedback, indent=2)}")
    
    try:
        response = requests.post(
            url,
            json=test_feedback,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Body: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            print("\n✅ Test PASSED: Feedback submitted successfully!")
            return True
        else:
            print(f"\n❌ Test FAILED: Expected status 200, got {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("\n❌ Test FAILED: Could not connect to server. Is it running?")
        return False
    except Exception as e:
        print(f"\n❌ Test FAILED: {e}")
        return False


def test_with_screenshot():
    """Test submitting feedback with a small screenshot."""
    # Create a small base64 encoded test image (1x1 pixel PNG)
    small_png_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    
    test_data = test_feedback.copy()
    test_data["screenshot"] = small_png_base64
    test_data["annotation"] = {
        "x": 100,
        "y": 200,
        "width": 300,
        "height": 400
    }
    test_data["category"] = "UI/UX Suggestion"
    test_data["description"] = "Test feedback with screenshot"
    
    url = "http://localhost:8000/api/feedback"
    
    print("\n\nTesting feedback submission with screenshot...")
    print(f"URL: {url}")
    
    try:
        response = requests.post(
            url,
            json=test_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Body: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            print("\n✅ Test PASSED: Feedback with screenshot submitted successfully!")
            return True
        else:
            print(f"\n❌ Test FAILED: Expected status 200, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"\n❌ Test FAILED: {e}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("Feedback API Endpoint Test Suite")
    print("=" * 60)
    
    # Run tests
    test1_passed = test_feedback_submission()
    test2_passed = test_with_screenshot()
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    print(f"Test 1 (Basic Feedback): {'✅ PASSED' if test1_passed else '❌ FAILED'}")
    print(f"Test 2 (With Screenshot): {'✅ PASSED' if test2_passed else '❌ FAILED'}")
    
    if test1_passed and test2_passed:
        print("\n🎉 All tests passed!")
    else:
        print("\n⚠️  Some tests failed. Check the output above for details.")
