# backend/models/feedback.py
"""
Pydantic models for feedback API requests and responses.
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, validator
import re
import base64


class AnnotationCoords(BaseModel):
    """Coordinates for screenshot annotation."""
    x: float
    y: float
    width: float
    height: float


class FeedbackSubmitRequest(BaseModel):
    """Request model for feedback submission."""
    category: str = Field(..., description="Feedback category (Bug Report, Comment, etc.)")
    description: str = Field(..., min_length=1, description="User's feedback description")
    browser: Optional[str] = Field(None, description="User agent string")
    os: Optional[str] = Field(None, description="Operating system")
    screenResolution: Optional[str] = Field(None, description="Screen resolution (e.g., '1920x1080')")
    viewportSize: Optional[str] = Field(None, description="Viewport size (e.g., '1440x900')")
    url: str = Field(..., description="Page URL where feedback was submitted")
    timestamp: str = Field(..., description="ISO 8601 timestamp from client")
    screenshot: Optional[str] = Field(None, description="Base64 encoded screenshot data")
    annotation: Optional[AnnotationCoords] = Field(None, description="Annotation coordinates")
    clientSessionId: str = Field(..., description="Client session identifier")
    lastApiResponse: Optional[Dict[str, Any]] = Field(None, description="Last API response (for bug reports)")
    
    @validator('screenshot')
    def validate_screenshot_size(cls, v):
        """
        Phase 2: Enhanced screenshot validation with format verification.
        Validates screenshot size and format to prevent overly large uploads.
        """
        if v is not None:
            # Verify it's a valid base64 data URL
            if not v.startswith('data:image/'):
                raise ValueError("Screenshot must be a valid data URL (data:image/...)")
            
            # Extract the format
            format_match = re.match(r'data:image/(.*?);base64,', v)
            if not format_match:
                raise ValueError("Screenshot must be base64 encoded")
            
            image_format = format_match.group(1).lower()
            allowed_formats = ['png', 'jpeg', 'jpg', 'webp']
            if image_format not in allowed_formats:
                raise ValueError(f"Invalid image format: {image_format}. Allowed: {', '.join(allowed_formats)}")
            
            # Calculate actual base64 data size (excluding data URL prefix)
            base64_data = v.split(',', 1)[1] if ',' in v else v
            
            # Validate it's proper base64
            try:
                base64.b64decode(base64_data, validate=True)
            except Exception:
                raise ValueError("Screenshot contains invalid base64 data")
            
            # Calculate approximate size in KB
            # Note: Base64 encoding increases size by ~33%, so this is the encoded size
            size_kb = len(v) / 1024
            
            # Phase 2: Strict 2MB limit
            if size_kb > 2048:  # 2MB limit
                raise ValueError(
                    f"Screenshot too large: {size_kb:.2f} KB (max 2048 KB). "
                    f"Please ensure client-side compression is working properly."
                )
            
            # Phase 2: Warning for large screenshots
            if size_kb > 1024:  # 1MB warning threshold
                print(f"[WARNING] Large screenshot: {size_kb:.2f} KB (consider increasing compression)")
        
        return v
    
    @validator('category')
    def validate_category(cls, v):
        """Validate category is one of the allowed values."""
        allowed_categories = [
            "Bug Report",
            "Comment",
            "Feature Request",
            "UI/UX Suggestion",
            "Other"
        ]
        if v not in allowed_categories:
            raise ValueError(f"Invalid category. Must be one of: {', '.join(allowed_categories)}")
        return v


class FeedbackSubmitResponse(BaseModel):
    """Response model for feedback submission."""
    success: bool
    feedback_id: int
    message: str


class FeedbackItem(BaseModel):
    """Model for returning feedback data (for admin interface in Phase 3)."""
    id: int
    session_id: str
    category: str
    description: str
    url: str
    timestamp: str
    browser: Optional[str]
    os: Optional[str]
    screen_resolution: Optional[str]
    viewport_size: Optional[str]
    has_screenshot: bool
    has_annotation: bool
    annotation_coords: Optional[str]
    api_state: Optional[str]
    created_at: str
    
    class Config:
        from_attributes = True  # Allows creation from ORM models
