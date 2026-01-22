# backend/middleware/supabase_auth.py
"""
Supabase JWT Authentication Middleware

Validates Supabase JWT tokens from the Authorization header.
Extracts user information and makes it available to endpoints.
"""
import os
import jwt
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt import PyJWKClient
from backend.logging_config import get_logger

logger = get_logger(__name__)

# HTTP Bearer token scheme
security = HTTPBearer(auto_error=False)


class SupabaseAuth:
    """
    Supabase JWT authentication handler.
    
    Validates JWT tokens issued by Supabase and extracts user information.
    """
    
    def __init__(self):
        """Initialize Supabase auth with project configuration."""
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_jwt_secret = os.getenv('SUPABASE_JWT_SECRET')
        
        if not self.supabase_url:
            logger.warning("[SUPABASE AUTH] SUPABASE_URL not configured - auth will be disabled")
        
        if not self.supabase_jwt_secret:
            logger.warning("[SUPABASE AUTH] SUPABASE_JWT_SECRET not configured - auth will be disabled")
        
        # Initialize JWK client for fetching public keys (if using RS256)
        self.jwk_client = None
        if self.supabase_url:
            try:
                jwks_url = f"{self.supabase_url}/auth/v1/.well-known/jwks.json"
                self.jwk_client = PyJWKClient(jwks_url)
                logger.info(f"[SUPABASE AUTH] JWK client initialized with URL: {jwks_url}")
            except Exception as e:
                logger.error(f"[SUPABASE AUTH] Failed to initialize JWK client: {e}")
    
    def is_configured(self) -> bool:
        """Check if Supabase auth is properly configured."""
        return bool(self.supabase_url and self.supabase_jwt_secret)
    
    async def verify_token(self, token: str) -> dict:
        """
        Verify and decode a Supabase JWT token.
        
        Args:
            token: JWT token string
            
        Returns:
            Decoded token payload containing user information
            
        Raises:
            HTTPException: If token is invalid or expired
        """
        if not self.is_configured():
            logger.warning("[SUPABASE AUTH] Auth not configured - skipping token verification")
            return {"sub": "anonymous", "email": "anonymous@example.com"}
        
        # Diagnostic logging: show token structure (first 20 chars only)
        token_preview = token[:20] if len(token) > 20 else token
        logger.debug(f"[SUPABASE AUTH] Verifying token (preview): {token_preview}...")
        logger.debug(f"[SUPABASE AUTH] Token length: {len(token)} characters")
        logger.debug(f"[SUPABASE AUTH] JWT secret configured: {bool(self.supabase_jwt_secret)}")
        
        # Decode token WITHOUT verification first to inspect claims for diagnostic purposes
        try:
            unverified_payload = jwt.decode(
                token,
                options={"verify_signature": False, "verify_exp": False, "verify_aud": False}
            )
            logger.debug(f"[SUPABASE AUTH] Token claims (unverified): aud={unverified_payload.get('aud')}, "
                        f"iss={unverified_payload.get('iss')}, exp={unverified_payload.get('exp')}, "
                        f"email={unverified_payload.get('email')}")
        except Exception as e:
            logger.warning(f"[SUPABASE AUTH] Failed to decode token structure: {e}")
        
        try:
            # Supabase uses HS256 (HMAC with SHA-256) by default
            # The JWT secret is used to verify the signature
            decoded = jwt.decode(
                token,
                self.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": True
                }
            )
            
            logger.info(f"[SUPABASE AUTH] ✓ Token verified successfully for user: {decoded.get('email', 'unknown')}")
            return decoded
            
        except jwt.ExpiredSignatureError as e:
            logger.warning(f"[SUPABASE AUTH] ✗ Token has expired: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidAudienceError as e:
            logger.warning(f"[SUPABASE AUTH] ✗ Invalid token audience: {e}")
            logger.warning("[SUPABASE AUTH] Expected audience: 'authenticated'")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token audience",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidSignatureError as e:
            logger.warning(f"[SUPABASE AUTH] ✗ Invalid token signature: {e}")
            logger.warning("[SUPABASE AUTH] ⚠️  This usually means SUPABASE_JWT_SECRET is incorrect!")
            logger.warning("[SUPABASE AUTH] ⚠️  Check that SUPABASE_JWT_SECRET matches your Supabase project's JWT secret")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.DecodeError as e:
            logger.warning(f"[SUPABASE AUTH] ✗ Token decode error: {e}")
            logger.warning("[SUPABASE AUTH] Token appears to be malformed or corrupted")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidTokenError as e:
            logger.warning(f"[SUPABASE AUTH] ✗ Invalid token (generic): {type(e).__name__}: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            logger.error(f"[SUPABASE AUTH] ✗ Unexpected error verifying token: {type(e).__name__}: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    async def get_current_user(
        self,
        credentials: Optional[HTTPAuthorizationCredentials] = None
    ) -> Optional[dict]:
        """
        Extract and verify user from Authorization header.
        
        Args:
            credentials: HTTP Bearer credentials from request
            
        Returns:
            User information dict or None if not authenticated
            
        Raises:
            HTTPException: If token is present but invalid
        """
        # Diagnostic logging: check if credentials are present
        if not credentials:
            logger.debug("[SUPABASE AUTH] No credentials provided in request")
            return None
        
        token = credentials.credentials
        
        # Diagnostic logging: show token info
        token_preview = token[:20] if len(token) > 20 else token
        logger.debug(f"[SUPABASE AUTH] Extracting user from token (preview): {token_preview}...")
        logger.debug(f"[SUPABASE AUTH] Token length: {len(token)} characters")
        logger.debug(f"[SUPABASE AUTH] JWT secret configured: {bool(self.supabase_jwt_secret)}")
        
        user = await self.verify_token(token)
        return user


# Global instance
supabase_auth = SupabaseAuth()


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[dict]:
    """
    Dependency for optional authentication.
    Returns user info if authenticated, None otherwise.
    
    Usage:
        @app.get("/endpoint")
        async def endpoint(user: Optional[dict] = Depends(get_current_user_optional)):
            if user:
                # User is authenticated
                user_id = user.get('sub')
            else:
                # Anonymous access
    """
    if not credentials:
        return None
    
    return await supabase_auth.get_current_user(credentials)


async def get_current_user_required(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    Dependency for required authentication.
    Raises 401 if not authenticated.
    
    Usage:
        @app.get("/endpoint")
        async def endpoint(user: dict = Depends(get_current_user_required)):
            user_id = user.get('sub')
            # User is guaranteed to be authenticated
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return await supabase_auth.get_current_user(credentials)
