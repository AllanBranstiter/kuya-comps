# backend/middleware/security.py
"""
Security Middleware for adding security headers to responses.

Implements headers recommended by OWASP:
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- Referrer-Policy
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from backend.config import is_production


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses.
    
    Headers are configured based on environment (stricter in production).
    """
    
    async def dispatch(self, request: Request, call_next):
        """
        Process request and add security headers to response.
        
        Args:
            request: Incoming request
            call_next: Next middleware/handler in chain
            
        Returns:
            Response with security headers added
        """
        response = await call_next(request)
        
        # Content Security Policy (CSP)
        # Restricts where resources can be loaded from
        csp_directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",  # Allow Supabase, Chart.js, html2canvas from CDN
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",  # Allow inline styles and Google Fonts
            "img-src 'self' data: https: blob:",  # Allow images from eBay and data URIs
            "font-src 'self' data: https://fonts.gstatic.com",  # Allow Google Fonts
            "connect-src 'self' https://api.ebay.com https://www.searchapi.io https://*.supabase.co",  # Allow API calls including Supabase
            "frame-ancestors 'none'",  # Prevent framing (same as X-Frame-Options)
            "base-uri 'self'",
            "form-action 'self'",
            "upgrade-insecure-requests" if is_production() else "",  # Force HTTPS in production
        ]
        response.headers["Content-Security-Policy"] = "; ".join(filter(None, csp_directives))
        
        # HTTP Strict Transport Security (HSTS)
        # Force HTTPS for all future requests (production only)
        if is_production():
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        
        # X-Content-Type-Options
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # X-Frame-Options
        # Prevent clickjacking by preventing the page from being framed
        response.headers["X-Frame-Options"] = "DENY"
        
        # X-XSS-Protection
        # Enable browser's XSS protection (legacy, CSP is preferred)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Referrer-Policy
        # Control how much referrer information is sent
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Permissions-Policy (formerly Feature-Policy)
        # Disable potentially dangerous browser features
        permissions_directives = [
            "geolocation=()",
            "microphone=()",
            "camera=()",
            "payment=()",
            "usb=()",
            "magnetometer=()",
            "gyroscope=()",
            "accelerometer=()",
        ]
        response.headers["Permissions-Policy"] = ", ".join(permissions_directives)
        
        # X-Permitted-Cross-Domain-Policies
        # Restrict Flash/PDF cross-domain access (legacy but good practice)
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        
        # Cache-Control for sensitive endpoints
        # Prevent caching of API responses
        if request.url.path.startswith("/comps") or request.url.path.startswith("/active"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        return response
