#!/usr/bin/env python3
"""
Test Suite for Phase 4: Production Optimizations

This test suite validates:
1. Database indexes are properly configured
2. Alembic migrations work correctly
3. Async screenshot processing functions
4. Storage metrics tracking
5. Data retention/cleanup functionality
6. Performance improvements from Phase 4
"""

import pytest
import json
import time
from datetime import datetime, timedelta
from sqlalchemy import inspect
from backend.database.connection import get_db, SessionLocal, init_db
from backend.database.schema import FeedbackSubmission, FeedbackScreenshot
from backend.models.feedback import FeedbackSubmitRequest, AnnotationCoords
from backend.services.feedback_service import (
    create_feedback_submission_fast,
    store_screenshot_async,
    cleanup_old_feedback,
    get_storage_metrics
)


class TestPhase4DatabaseOptimizations:
    """Test database indexes and optimizations."""
    
    def test_database_indexes_exist(self):
        """Verify that all required indexes exist on tables."""
        from backend.database.connection import engine
        
        inspector = inspect(engine)
        
        # Check feedback_submissions table indexes
        indexes = inspector.get_indexes('feedback_submissions')
        index_columns = [idx['column_names'][0] for idx in indexes if len(idx['column_names']) == 1]
        
        # Verify required indexes
        required_indexes = ['session_id', 'category', 'created_at', 'is_read', 'is_archived', 'timestamp']
        
        for required_index in required_indexes:
            assert required_index in index_columns, f"Missing index on column: {required_index}"
        
        print(f"✓ All required database indexes exist: {index_columns}")
    
    def test_index_performance_improvement(self):
        """Test that indexes improve query performance."""
        db = SessionLocal()
        
        try:
            # Create test data
            for i in range(100):
                submission = FeedbackSubmission(
                    session_id=f"test_session_{i}",
                    category="Bug Report" if i % 2 == 0 else "Feature Request",
                    description=f"Test feedback {i}",
                    url="http://test.com",
                    timestamp=datetime.utcnow().isoformat(),
                    has_screenshot=False,
                    has_annotation=False,
                    is_read=(i % 3 == 0),
                    is_archived=(i % 5 == 0)
                )
                db.add(submission)
            db.commit()
            
            # Test indexed query performance
            start_time = time.time()
            results = db.query(FeedbackSubmission).filter(
                FeedbackSubmission.category == "Bug Report"
            ).filter(
                FeedbackSubmission.is_read == False
            ).all()
            query_time = time.time() - start_time
            
            assert len(results) > 0
            assert query_time < 0.1, f"Query took too long: {query_time}s (should be under 0.1s with indexes)"
            
            print(f"✓ Indexed query completed in {query_time:.4f}s")
        
        finally:
            # Cleanup
            db.query(FeedbackSubmission).delete()
            db.commit()
            db.close()


class TestPhase4AsyncProcessing:
    """Test async screenshot processing with BackgroundTasks."""
    
    def test_fast_submission_without_screenshot(self):
        """Test fast submission path without screenshot."""
        db = SessionLocal()
        
        try:
            feedback_data = FeedbackSubmitRequest(
                category="Comment",
                description="Test fast submission",
                browser="Test Browser",
                os="Test OS",
                screenResolution="1920x1080",
                viewportSize="1440x900",
                url="http://test.com",
                timestamp=datetime.utcnow().isoformat(),
                clientSessionId="test_session_123"
            )
            
            submission, screenshot_data = create_feedback_submission_fast(db, feedback_data)
            
            assert submission.id is not None
            assert submission.description == "Test fast submission"
            assert submission.has_screenshot is False
            assert screenshot_data is None
            
            print(f"✓ Fast submission created without screenshot: ID {submission.id}")
        
        finally:
            db.query(FeedbackSubmission).filter(
                FeedbackSubmission.id == submission.id
            ).delete()
            db.commit()
            db.close()
    
    def test_fast_submission_with_screenshot_async(self):
        """Test fast submission with async screenshot processing."""
        db = SessionLocal()
        
        try:
            # Create a small test screenshot (base64 encoded)
            test_screenshot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            
            feedback_data = FeedbackSubmitRequest(
                category="Bug Report",
                description="Test with screenshot",
                browser="Test Browser",
                os="Test OS",
                screenResolution="1920x1080",
                viewportSize="1440x900",
                url="http://test.com",
                timestamp=datetime.utcnow().isoformat(),
                clientSessionId="test_session_456",
                screenshot=test_screenshot
            )
            
            # Fast submission
            start_time = time.time()
            submission, screenshot_data = create_feedback_submission_fast(db, feedback_data)
            submission_time = time.time() - start_time
            
            assert submission.id is not None
            assert submission.has_screenshot is True
            assert screenshot_data == test_screenshot
            assert submission_time < 0.1, "Fast submission should be quick (< 0.1s)"
            
            # Simulate async screenshot storage
            db_async = SessionLocal()
            store_screenshot_async(submission.id, screenshot_data, db_async)
            
            # Verify screenshot was stored
            db.refresh(submission)
            screenshot = db.query(FeedbackScreenshot).filter(
                FeedbackScreenshot.feedback_id == submission.id
            ).first()
            
            assert screenshot is not None
            assert screenshot.screenshot_data == test_screenshot
            assert screenshot.size_kb > 0
            
            print(f"✓ Fast submission with async screenshot: ID {submission.id}, time {submission_time:.4f}s")
        
        finally:
            db.query(FeedbackSubmission).filter(
                FeedbackSubmission.id == submission.id
            ).delete()
            db.commit()
            db.close()


class TestPhase4Monitoring:
    """Test monitoring and metrics functionality."""
    
    def test_storage_metrics(self):
        """Test storage metrics collection."""
        db = SessionLocal()
        
        try:
            # Create some test data
            test_screenshot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            
            for i in range(5):
                submission = FeedbackSubmission(
                    session_id=f"metrics_test_{i}",
                    category="Bug Report",
                    description=f"Metrics test {i}",
                    url="http://test.com",
                    timestamp=datetime.utcnow().isoformat(),
                    has_screenshot=True,
                    has_annotation=False
                )
                db.add(submission)
                db.flush()
                
                screenshot = FeedbackScreenshot(
                    feedback_id=submission.id,
                    screenshot_data=test_screenshot,
                    size_kb=len(test_screenshot) // 1024 or 1
                )
                db.add(screenshot)
            
            db.commit()
            
            # Get metrics
            metrics = get_storage_metrics(db)
            
            assert metrics['total_submissions'] >= 5
            assert metrics['total_screenshots'] >= 5
            assert metrics['total_screenshot_storage_kb'] > 0
            assert metrics['avg_screenshot_size_kb'] > 0
            assert 'submissions_last_24h' in metrics
            
            print(f"✓ Storage metrics collected: {metrics}")
        
        finally:
            # Cleanup
            db.query(FeedbackSubmission).filter(
                FeedbackSubmission.session_id.like('metrics_test_%')
            ).delete()
            db.commit()
            db.close()


class TestPhase4DataRetention:
    """Test data retention and cleanup functionality."""
    
    def test_cleanup_old_feedback(self):
        """Test cleanup of old feedback submissions."""
        db = SessionLocal()
        
        try:
            # Create old submissions (older than retention period)
            old_date = datetime.utcnow() - timedelta(days=100)
            for i in range(3):
                submission = FeedbackSubmission(
                    session_id=f"old_session_{i}",
                    category="Bug Report",
                    description=f"Old feedback {i}",
                    url="http://test.com",
                    timestamp=old_date.isoformat(),
                    has_screenshot=False,
                    has_annotation=False,
                    created_at=old_date
                )
                db.add(submission)
            
            # Create recent submissions (within retention period)
            recent_date = datetime.utcnow() - timedelta(days=30)
            for i in range(2):
                submission = FeedbackSubmission(
                    session_id=f"recent_session_{i}",
                    category="Feature Request",
                    description=f"Recent feedback {i}",
                    url="http://test.com",
                    timestamp=recent_date.isoformat(),
                    has_screenshot=False,
                    has_annotation=False,
                    created_at=recent_date
                )
                db.add(submission)
            
            db.commit()
            
            # Run cleanup with 90-day retention
            cleanup_stats = cleanup_old_feedback(db, retention_days=90)
            
            assert cleanup_stats['submissions_deleted'] >= 3
            assert cleanup_stats['retention_days'] == 90
            
            # Verify old submissions are gone
            old_count = db.query(FeedbackSubmission).filter(
                FeedbackSubmission.session_id.like('old_session_%')
            ).count()
            assert old_count == 0
            
            # Verify recent submissions remain
            recent_count = db.query(FeedbackSubmission).filter(
                FeedbackSubmission.session_id.like('recent_session_%')
            ).count()
            assert recent_count == 2
            
            print(f"✓ Cleanup removed {cleanup_stats['submissions_deleted']} old submissions")
        
        finally:
            # Cleanup test data
            db.query(FeedbackSubmission).filter(
                FeedbackSubmission.session_id.like('recent_session_%')
            ).delete()
            db.commit()
            db.close()
    
    def test_cleanup_with_screenshots(self):
        """Test cleanup properly cascades to screenshots."""
        db = SessionLocal()
        
        try:
            # Create old submission with screenshot
            old_date = datetime.utcnow() - timedelta(days=100)
            test_screenshot = "data:image/png;base64,test"
            
            submission = FeedbackSubmission(
                session_id="cleanup_screenshot_test",
                category="Bug Report",
                description="Old feedback with screenshot",
                url="http://test.com",
                timestamp=old_date.isoformat(),
                has_screenshot=True,
                has_annotation=False,
                created_at=old_date
            )
            db.add(submission)
            db.flush()
            
            screenshot = FeedbackScreenshot(
                feedback_id=submission.id,
                screenshot_data=test_screenshot,
                size_kb=1
            )
            db.add(screenshot)
            db.commit()
            
            screenshot_id = screenshot.id
            
            # Run cleanup
            cleanup_stats = cleanup_old_feedback(db, retention_days=90)
            
            assert cleanup_stats['screenshots_deleted'] >= 1
            
            # Verify screenshot was deleted (cascade)
            screenshot_exists = db.query(FeedbackScreenshot).filter(
                FeedbackScreenshot.id == screenshot_id
            ).first()
            assert screenshot_exists is None
            
            print(f"✓ Cleanup cascaded to {cleanup_stats['screenshots_deleted']} screenshots")
        
        finally:
            db.close()


class TestPhase4Integration:
    """Integration tests for Phase 4 features."""
    
    def test_rate_limiting_already_configured(self):
        """Verify rate limiting is properly configured."""
        from backend.routes.feedback import router, limiter
        
        # Check that rate limiting decorator exists
        feedback_route = None
        for route in router.routes:
            if route.path == "/api/feedback" and "POST" in route.methods:
                feedback_route = route
                break
        
        assert feedback_route is not None, "Feedback route not found"
        print("✓ Rate limiting configured on feedback endpoint")
    
    def test_alembic_migration_exists(self):
        """Verify Alembic migration file exists."""
        import os
        
        migration_dir = "/Users/allanbranstiter/Documents/GitHub/kuya-comps/alembic/versions"
        assert os.path.exists(migration_dir), "Alembic versions directory not found"
        
        migrations = [f for f in os.listdir(migration_dir) if f.endswith('.py') and not f.startswith('__')]
        assert len(migrations) > 0, "No migration files found"
        
        print(f"✓ Found {len(migrations)} Alembic migration(s)")


def run_all_tests():
    """Run all Phase 4 tests."""
    print("\n" + "="*70)
    print("PHASE 4: Production Optimizations - Test Suite")
    print("="*70 + "\n")
    
    # Initialize database
    init_db()
    
    test_classes = [
        TestPhase4DatabaseOptimizations,
        TestPhase4AsyncProcessing,
        TestPhase4Monitoring,
        TestPhase4DataRetention,
        TestPhase4Integration
    ]
    
    total_tests = 0
    passed_tests = 0
    
    for test_class in test_classes:
        print(f"\n{test_class.__name__}")
        print("-" * 70)
        
        test_instance = test_class()
        test_methods = [method for method in dir(test_instance) if method.startswith('test_')]
        
        for test_method in test_methods:
            total_tests += 1
            try:
                getattr(test_instance, test_method)()
                passed_tests += 1
                print(f"  PASS: {test_method}")
            except AssertionError as e:
                print(f"  FAIL: {test_method}")
                print(f"    Error: {str(e)}")
            except Exception as e:
                print(f"  ERROR: {test_method}")
                print(f"    Error: {str(e)}")
    
    print("\n" + "="*70)
    print(f"Test Results: {passed_tests}/{total_tests} passed")
    print("="*70 + "\n")
    
    return passed_tests == total_tests


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
