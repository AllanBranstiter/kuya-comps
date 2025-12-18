# backend/middleware/metrics.py
"""
Performance Monitoring Middleware for tracking application metrics.

Tracks:
- Request count by endpoint and status code
- Response time by endpoint
- Cache hit/miss rates
- Active requests
"""
import time
from collections import defaultdict
from typing import Dict, List
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from backend.logging_config import get_logger

logger = get_logger(__name__)


class MetricsCollector:
    """Singleton metrics collector for tracking application performance."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Initialize metrics storage."""
        self.request_count: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.request_duration: Dict[str, List[float]] = defaultdict(list)
        self.cache_hits: int = 0
        self.cache_misses: int = 0
        self.active_requests: int = 0
        self.errors_count: Dict[str, int] = defaultdict(int)
    
    def record_request(self, endpoint: str, status_code: int, duration: float):
        """
        Record a completed request.
        
        Args:
            endpoint: The API endpoint path
            status_code: HTTP status code
            duration: Request duration in seconds
        """
        # Count by endpoint and status
        self.request_count[endpoint][str(status_code)] += 1
        
        # Track duration
        self.request_duration[endpoint].append(duration)
        
        # Keep only last 1000 durations per endpoint to prevent memory bloat
        if len(self.request_duration[endpoint]) > 1000:
            self.request_duration[endpoint] = self.request_duration[endpoint][-1000:]
        
        # Track errors
        if status_code >= 400:
            self.errors_count[endpoint] += 1
    
    def record_cache_hit(self):
        """Record a cache hit."""
        self.cache_hits += 1
    
    def record_cache_miss(self):
        """Record a cache miss."""
        self.cache_misses += 1
    
    def get_cache_hit_rate(self) -> float:
        """
        Calculate cache hit rate.
        
        Returns:
            Cache hit rate as percentage (0-100)
        """
        total = self.cache_hits + self.cache_misses
        if total == 0:
            return 0.0
        return (self.cache_hits / total) * 100
    
    def get_avg_response_time(self, endpoint: str) -> float:
        """
        Get average response time for an endpoint.
        
        Args:
            endpoint: The API endpoint path
            
        Returns:
            Average response time in seconds
        """
        durations = self.request_duration.get(endpoint, [])
        if not durations:
            return 0.0
        return sum(durations) / len(durations)
    
    def get_p95_response_time(self, endpoint: str) -> float:
        """
        Get 95th percentile response time for an endpoint.
        
        Args:
            endpoint: The API endpoint path
            
        Returns:
            95th percentile response time in seconds
        """
        durations = sorted(self.request_duration.get(endpoint, []))
        if not durations:
            return 0.0
        
        index = int(len(durations) * 0.95)
        return durations[index] if index < len(durations) else durations[-1]
    
    def get_metrics_summary(self) -> Dict:
        """
        Get summary of all metrics.
        
        Returns:
            Dictionary containing all metrics
        """
        endpoints_summary = {}
        
        for endpoint in self.request_count.keys():
            total_requests = sum(self.request_count[endpoint].values())
            endpoints_summary[endpoint] = {
                "total_requests": total_requests,
                "status_codes": dict(self.request_count[endpoint]),
                "avg_response_time_ms": round(self.get_avg_response_time(endpoint) * 1000, 2),
                "p95_response_time_ms": round(self.get_p95_response_time(endpoint) * 1000, 2),
                "error_count": self.errors_count.get(endpoint, 0),
                "error_rate": round((self.errors_count.get(endpoint, 0) / total_requests * 100), 2) if total_requests > 0 else 0
            }
        
        return {
            "endpoints": endpoints_summary,
            "cache": {
                "hits": self.cache_hits,
                "misses": self.cache_misses,
                "hit_rate": round(self.get_cache_hit_rate(), 2),
            },
            "active_requests": self.active_requests,
        }
    
    def reset(self):
        """Reset all metrics (useful for testing)."""
        self._initialize()


# Global metrics collector instance
metrics = MetricsCollector()


class MetricsMiddleware(BaseHTTPMiddleware):
    """
    Middleware to track request metrics.
    
    Tracks request count, response time, and errors for each endpoint.
    """
    
    async def dispatch(self, request: Request, call_next):
        """
        Process request and track metrics.
        
        Args:
            request: Incoming request
            call_next: Next middleware/handler in chain
            
        Returns:
            Response with timing metrics
        """
        # Skip metrics endpoint itself to avoid recursion
        if request.url.path == "/metrics":
            return await call_next(request)
        
        # Track active requests
        metrics.active_requests += 1
        
        # Start timing
        start_time = time.time()
        
        try:
            # Process request
            response = await call_next(request)
            
            # Calculate duration
            duration = time.time() - start_time
            
            # Record metrics
            metrics.record_request(
                endpoint=request.url.path,
                status_code=response.status_code,
                duration=duration
            )
            
            # Add timing header
            response.headers['X-Response-Time'] = f"{duration:.3f}s"
            
            return response
            
        except Exception as e:
            # Record error
            duration = time.time() - start_time
            metrics.record_request(
                endpoint=request.url.path,
                status_code=500,
                duration=duration
            )
            raise
            
        finally:
            # Decrement active requests
            metrics.active_requests -= 1
