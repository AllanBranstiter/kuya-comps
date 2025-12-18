"""
Async HTTP Client Wrapper
Provides retry logic, timeout handling, and connection pooling for async HTTP requests.
"""

import asyncio
import logging
from typing import Optional, Dict, Any
import httpx
from backend.exceptions import ScraperError

logger = logging.getLogger(__name__)


class AsyncHTTPClient:
    """
    Async HTTP client with retry logic and connection pooling.
    
    Features:
    - Automatic retries with exponential backoff
    - Configurable timeouts
    - Connection pooling for better performance
    - Comprehensive error handling
    """
    
    def __init__(
        self,
        max_retries: int = 3,
        timeout: int = 30,
        max_connections: int = 100,
        max_keepalive_connections: int = 20
    ):
        """
        Initialize the async HTTP client.
        
        Args:
            max_retries: Maximum number of retry attempts
            timeout: Request timeout in seconds
            max_connections: Maximum number of connections in the pool
            max_keepalive_connections: Maximum number of connections to keep alive
        """
        self.max_retries = max_retries
        self.timeout = timeout
        self.limits = httpx.Limits(
            max_connections=max_connections,
            max_keepalive_connections=max_keepalive_connections
        )
        self._client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        self._client = httpx.AsyncClient(
            timeout=self.timeout,
            limits=self.limits,
            http2=True,
            follow_redirects=True
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self._client:
            await self._client.aclose()
    
    async def get(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None
    ) -> httpx.Response:
        """
        Perform an async GET request with retry logic.
        
        Args:
            url: URL to request
            params: Query parameters
            headers: Request headers
            timeout: Optional timeout override
            
        Returns:
            httpx.Response object
            
        Raises:
            ScraperError: If all retry attempts fail
        """
        if not self._client:
            raise RuntimeError("Client not initialized. Use async context manager.")
        
        request_timeout = timeout or self.timeout
        last_exception = None
        
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.debug(
                    f"HTTP GET attempt {attempt}/{self.max_retries}",
                    extra={"url": url, "params": params}
                )
                
                response = await self._client.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=request_timeout
                )
                
                # Raise for bad status codes
                response.raise_for_status()
                
                logger.debug(
                    f"HTTP GET successful",
                    extra={"url": url, "status_code": response.status_code}
                )
                
                return response
                
            except httpx.HTTPStatusError as e:
                last_exception = e
                logger.warning(
                    f"HTTP status error on attempt {attempt}",
                    extra={
                        "url": url,
                        "status_code": e.response.status_code,
                        "attempt": attempt
                    }
                )
                
                # Don't retry client errors (4xx) except 429 (rate limit)
                if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                    raise ScraperError(
                        f"HTTP {e.response.status_code} error: {str(e)}",
                        error_code="HTTP_CLIENT_ERROR"
                    )
                
                # Exponential backoff for retries
                if attempt < self.max_retries:
                    backoff_time = 2 ** (attempt - 1)
                    logger.info(f"Retrying in {backoff_time}s...")
                    await asyncio.sleep(backoff_time)
                    
            except httpx.TimeoutException as e:
                last_exception = e
                logger.warning(
                    f"HTTP timeout on attempt {attempt}",
                    extra={"url": url, "timeout": request_timeout, "attempt": attempt}
                )
                
                if attempt < self.max_retries:
                    backoff_time = 2 ** (attempt - 1)
                    await asyncio.sleep(backoff_time)
                    
            except httpx.RequestError as e:
                last_exception = e
                logger.warning(
                    f"HTTP request error on attempt {attempt}",
                    extra={"url": url, "error": str(e), "attempt": attempt}
                )
                
                if attempt < self.max_retries:
                    backoff_time = 2 ** (attempt - 1)
                    await asyncio.sleep(backoff_time)
        
        # All retries failed
        error_msg = f"All {self.max_retries} retry attempts failed for URL: {url}"
        logger.error(error_msg, extra={"last_exception": str(last_exception)})
        raise ScraperError(
            error_msg,
            error_code="HTTP_ALL_RETRIES_FAILED",
            details={"last_exception": str(last_exception)}
        )
    
    async def post(
        self,
        url: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[int] = None
    ) -> httpx.Response:
        """
        Perform an async POST request with retry logic.
        
        Args:
            url: URL to request
            data: Form data
            json: JSON data
            headers: Request headers
            timeout: Optional timeout override
            
        Returns:
            httpx.Response object
            
        Raises:
            ScraperError: If all retry attempts fail
        """
        if not self._client:
            raise RuntimeError("Client not initialized. Use async context manager.")
        
        request_timeout = timeout or self.timeout
        last_exception = None
        
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.debug(
                    f"HTTP POST attempt {attempt}/{self.max_retries}",
                    extra={"url": url}
                )
                
                response = await self._client.post(
                    url,
                    data=data,
                    json=json,
                    headers=headers,
                    timeout=request_timeout
                )
                
                response.raise_for_status()
                
                logger.debug(
                    f"HTTP POST successful",
                    extra={"url": url, "status_code": response.status_code}
                )
                
                return response
                
            except httpx.HTTPStatusError as e:
                last_exception = e
                logger.warning(
                    f"HTTP status error on attempt {attempt}",
                    extra={
                        "url": url,
                        "status_code": e.response.status_code,
                        "attempt": attempt
                    }
                )
                
                # Don't retry client errors (4xx) except 429 (rate limit)
                if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                    raise ScraperError(
                        f"HTTP {e.response.status_code} error: {str(e)}",
                        error_code="HTTP_CLIENT_ERROR"
                    )
                
                if attempt < self.max_retries:
                    backoff_time = 2 ** (attempt - 1)
                    await asyncio.sleep(backoff_time)
                    
            except (httpx.TimeoutException, httpx.RequestError) as e:
                last_exception = e
                logger.warning(
                    f"HTTP error on attempt {attempt}",
                    extra={"url": url, "error": str(e), "attempt": attempt}
                )
                
                if attempt < self.max_retries:
                    backoff_time = 2 ** (attempt - 1)
                    await asyncio.sleep(backoff_time)
        
        # All retries failed
        error_msg = f"All {self.max_retries} retry attempts failed for URL: {url}"
        logger.error(error_msg, extra={"last_exception": str(last_exception)})
        raise ScraperError(
            error_msg,
            error_code="HTTP_ALL_RETRIES_FAILED",
            details={"last_exception": str(last_exception)}
        )


# Convenience function for one-off requests
async def get_with_retry(
    url: str,
    params: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 30,
    max_retries: int = 3
) -> httpx.Response:
    """
    Convenience function for one-off async GET requests with retry logic.
    
    Args:
        url: URL to request
        params: Query parameters
        headers: Request headers
        timeout: Request timeout in seconds
        max_retries: Maximum number of retry attempts
        
    Returns:
        httpx.Response object
        
    Raises:
        ScraperError: If all retry attempts fail
    """
    async with AsyncHTTPClient(max_retries=max_retries, timeout=timeout) as client:
        return await client.get(url, params=params, headers=headers)


async def post_with_retry(
    url: str,
    data: Optional[Dict[str, Any]] = None,
    json: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 30,
    max_retries: int = 3
) -> httpx.Response:
    """
    Convenience function for one-off async POST requests with retry logic.
    
    Args:
        url: URL to request
        data: Form data
        json: JSON data
        headers: Request headers
        timeout: Request timeout in seconds
        max_retries: Maximum number of retry attempts
        
    Returns:
        httpx.Response object
        
    Raises:
        ScraperError: If all retry attempts fail
    """
    async with AsyncHTTPClient(max_retries=max_retries, timeout=timeout) as client:
        return await client.post(url, data=data, json=json, headers=headers)
