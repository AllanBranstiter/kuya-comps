# backend/middleware/basic_auth.py
"""
Basic Authentication Middleware for staging environment protection.

This middleware implements HTTP Basic Authentication to protect the staging
environment from unauthorized access while keeping production publicly accessible.
"""
import base64
import secrets
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from backend.config import is_staging, get_basic_auth_user, get_basic_auth_password
from backend.logging_config import get_logger


logger = get_logger(__name__)


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add HTTP Basic Authentication for staging environment.
    
    Only activates when ENVIRONMENT=staging.
    Uses BASIC_AUTH_USER and BASIC_AUTH_PASSWORD environment variables.
    Allows health check endpoints to pass through for monitoring.
    """
    
    def __init__(self, app):
        """Initialize the middleware."""
        super().__init__(app)
        self.enabled = is_staging()
        self.username = get_basic_auth_user() or ''
        self.password = get_basic_auth_password() or ''
        
        if self.enabled:
            if not self.username or not self.password:
                logger.warning(
                    "[BASIC_AUTH] Enabled but credentials not configured. "
                    "Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD environment variables."
                )
            else:
                logger.info("[BASIC_AUTH] Enabled for staging environment")
        else:
            from backend.config import get_environment
            logger.info(f"[BASIC_AUTH] Disabled (environment: {get_environment()})")
    
    async def dispatch(self, request: Request, call_next):
        """
        Process request and require Basic Auth if enabled.
        
        Args:
            request: Incoming request
            call_next: Next middleware/handler in chain
            
        Returns:
            Response (either 401 Unauthorized or the actual response)
        """
        # If not enabled or credentials not configured, pass through
        if not self.enabled or not self.username or not self.password:
            return await call_next(request)
        
        # Allow health check endpoints to pass through for monitoring
        if self._is_health_check(request):
            return await call_next(request)
        
        # Allow API endpoints to pass through (they use Supabase JWT auth)
        if request.url.path.startswith('/api/'):
            return await call_next(request)
        
        # Check for Authorization header
        auth_header = request.headers.get('Authorization')
        
        if not auth_header or not self._validate_credentials(auth_header):
            # Return 401 Unauthorized with WWW-Authenticate header
            return Response(
                content="Unauthorized - Staging Environment",
                status_code=401,
                headers={
                    'WWW-Authenticate': 'Basic realm="Kuya Comps Staging Environment"',
                    'Content-Type': 'text/plain'
                }
            )
        
        # Credentials valid, continue to the actual endpoint
        return await call_next(request)
    
    def _is_health_check(self, request: Request) -> bool:
        """
        Check if the request is for a health check endpoint.
        
        Args:
            request: Incoming request
            
        Returns:
            True if this is a health check endpoint
        """
        # Allow health check, metrics, and Railway healthcheck paths
        health_paths = ['/health', '/health/', '/healthz', '/metrics']
        return request.url.path in health_paths
    
    def _validate_credentials(self, auth_header: str) -> bool:
        """
        Validate Basic Auth credentials from Authorization header.
        
        Args:
            auth_header: Authorization header value (e.g., "Basic dXNlcjpwYXNz")
            
        Returns:
            True if credentials are valid
        """
        try:
            # Parse "Basic <base64>" format
            scheme, credentials = auth_header.split(' ', 1)
            
            if scheme.lower() != 'basic':
                return False
            
            # Decode base64 credentials
            decoded = base64.b64decode(credentials).decode('utf-8')
            provided_username, provided_password = decoded.split(':', 1)
            
            # Compare credentials (constant-time comparison to prevent timing attacks)
            return (
                secrets.compare_digest(provided_username, self.username) and
                secrets.compare_digest(provided_password, self.password)
            )
        except Exception as e:
            logger.warning(f"[BASIC_AUTH] Invalid authorization header: {e}")
            return False
