# backend/middleware/request_id.py
"""
Request ID Middleware for request tracking and correlation.

Generates a unique ID for each request and adds it to:
- Response headers (X-Request-ID)
- Request state (for logging)
- Sentry context (if Sentry is enabled)
"""
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from backend.logging_config import get_logger

logger = get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add unique request ID to each request.
    
    The request ID is:
    - Generated as a UUID4
    - Added to response headers as X-Request-ID
    - Stored in request.state for use in logging
    - Added to Sentry scope if Sentry is enabled
    """
    
    async def dispatch(self, request: Request, call_next):
        """
        Process request and add request ID.
        
        Args:
            request: Incoming request
            call_next: Next middleware/handler in chain
            
        Returns:
            Response with X-Request-ID header
        """
        # Generate or retrieve request ID
        request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        
        # Store in request state for logging
        request.state.request_id = request_id
        
        # Add to Sentry scope if available
        try:
            import sentry_sdk
            with sentry_sdk.configure_scope() as scope:
                scope.set_tag("request_id", request_id)
        except ImportError:
            # Sentry not installed, skip
            pass
        
        # Log request start
        logger.info(
            f"Request started: {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "client_host": request.client.host if request.client else None,
            }
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Add request ID to response headers
            response.headers['X-Request-ID'] = request_id
            
            # Log request completion
            logger.info(
                f"Request completed: {request.method} {request.url.path} - {response.status_code}",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                }
            )
            
            return response
            
        except Exception as e:
            # Log request error
            logger.error(
                f"Request failed: {request.method} {request.url.path}",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "error": str(e),
                },
                exc_info=True
            )
            raise
