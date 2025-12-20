# backend/database/schema.py
"""
SQLAlchemy database models for feedback system.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class FeedbackSubmission(Base):
    """Main feedback submissions table."""
    __tablename__ = "feedback_submissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False, index=True)
    category = Column(String(50), nullable=False, index=True)
    description = Column(Text, nullable=False)
    url = Column(Text, nullable=False)
    timestamp = Column(String(50), nullable=False, index=True)  # ISO 8601 timestamp from client
    browser = Column(Text, nullable=True)
    os = Column(String(100), nullable=True)
    screen_resolution = Column(String(20), nullable=True)
    viewport_size = Column(String(20), nullable=True)
    has_screenshot = Column(Boolean, default=False, nullable=False)
    has_annotation = Column(Boolean, default=False, nullable=False)
    annotation_coords = Column(Text, nullable=True)  # JSON string
    api_state = Column(Text, nullable=True)  # JSON string of last API response
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Phase 3: Admin management fields
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    is_archived = Column(Boolean, default=False, nullable=False, index=True)
    admin_notes = Column(Text, nullable=True)
    
    # Relationship to screenshots
    screenshots = relationship("FeedbackScreenshot", back_populates="feedback", cascade="all, delete-orphan")


class FeedbackScreenshot(Base):
    """Separate table for screenshots to keep main table lean."""
    __tablename__ = "feedback_screenshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    feedback_id = Column(Integer, ForeignKey("feedback_submissions.id", ondelete="CASCADE"), nullable=False)
    screenshot_data = Column(Text, nullable=False)  # Base64 encoded image data
    size_kb = Column(Integer, nullable=True)  # Screenshot size for monitoring
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationship to feedback
    feedback = relationship("FeedbackSubmission", back_populates="screenshots")
