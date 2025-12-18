# backend/exceptions.py
"""
Custom exception classes for Kuya Comps application.
Provides structured error handling with error codes and user-friendly messages.
"""

from typing import Optional, Dict, Any


class KuyaCompsException(Exception):
    """
    Base exception class for all Kuya Comps errors.
    
    Attributes:
        message: User-friendly error message
        error_code: Unique error code for tracking
        status_code: HTTP status code to return
        details: Optional additional error details
    """
    
    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for JSON response."""
        return {
            "error": {
                "message": self.message,
                "code": self.error_code,
                "details": self.details
            }
        }


class APIKeyMissingError(KuyaCompsException):
    """
    Raised when required API key is missing or invalid.
    """
    
    def __init__(
        self,
        service: str = "API",
        details: Optional[Dict[str, Any]] = None
    ):
        message = f"{service} key is missing or not configured. Please check your environment variables."
        super().__init__(
            message=message,
            error_code="API_KEY_MISSING",
            status_code=500,
            details=details or {"service": service}
        )


class ScraperError(KuyaCompsException):
    """
    Raised when web scraping or API calls fail.
    """
    
    def __init__(
        self,
        message: str = "Failed to fetch data from external service",
        service: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        error_details = details or {}
        if service:
            error_details["service"] = service
        
        super().__init__(
            message=message,
            error_code="SCRAPER_ERROR",
            status_code=502,  # Bad Gateway - external service error
            details=error_details
        )


class DataValidationError(KuyaCompsException):
    """
    Raised when input data fails validation (different from Pydantic validation).
    Use this for business logic validation errors.
    """
    
    def __init__(
        self,
        message: str = "Invalid input data",
        field: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        error_details = details or {}
        if field:
            error_details["field"] = field
        
        super().__init__(
            message=message,
            error_code="DATA_VALIDATION_ERROR",
            status_code=422,  # Unprocessable Entity
            details=error_details
        )


class RateLimitError(KuyaCompsException):
    """
    Raised when rate limit is exceeded (custom handler, slowapi has its own).
    """
    
    def __init__(
        self,
        message: str = "Rate limit exceeded. Please try again later.",
        retry_after: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        error_details = details or {}
        if retry_after:
            error_details["retry_after_seconds"] = retry_after
        
        super().__init__(
            message=message,
            error_code="RATE_LIMIT_EXCEEDED",
            status_code=429,  # Too Many Requests
            details=error_details
        )


class ExternalServiceError(KuyaCompsException):
    """
    Raised when external service (eBay, SearchAPI) returns an error.
    """
    
    def __init__(
        self,
        message: str = "External service error",
        service: str = "Unknown",
        service_error: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        error_details = details or {}
        error_details["service"] = service
        if service_error:
            error_details["service_error"] = service_error
        
        super().__init__(
            message=message,
            error_code="EXTERNAL_SERVICE_ERROR",
            status_code=502,  # Bad Gateway
            details=error_details
        )


class DataNotFoundError(KuyaCompsException):
    """
    Raised when requested data is not found.
    """
    
    def __init__(
        self,
        message: str = "No data found for the given query",
        query: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        error_details = details or {}
        if query:
            error_details["query"] = query
        
        super().__init__(
            message=message,
            error_code="DATA_NOT_FOUND",
            status_code=404,  # Not Found
            details=error_details
        )


class ConfigurationError(KuyaCompsException):
    """
    Raised when application configuration is invalid.
    """
    
    def __init__(
        self,
        message: str = "Application configuration error",
        config_key: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        error_details = details or {}
        if config_key:
            error_details["config_key"] = config_key
        
        super().__init__(
            message=message,
            error_code="CONFIGURATION_ERROR",
            status_code=500,  # Internal Server Error
            details=error_details
        )
