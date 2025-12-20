# backend/database/connection.py
"""
Database connection and session management for feedback system.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from backend.database.schema import Base
from backend.logging_config import get_logger

logger = get_logger(__name__)


def get_database_url() -> str:
    """
    Get database URL from environment or use default SQLite.
    
    Returns:
        Database URL string
    """
    return os.getenv('FEEDBACK_DATABASE_URL', 'sqlite:///./feedback.db')


def get_engine():
    """
    Create and return database engine.
    
    For SQLite, we use check_same_thread=False and StaticPool for async compatibility.
    """
    database_url = get_database_url()
    
    if database_url.startswith('sqlite'):
        # SQLite-specific configuration for async/multi-threading
        engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=False  # Set to True for SQL query logging
        )
    else:
        # PostgreSQL or other databases
        engine = create_engine(database_url, echo=False)
    
    return engine


# Create engine
engine = get_engine()

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """
    Initialize database tables.
    
    Creates all tables defined in schema.py if they don't exist.
    """
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise


def get_db() -> Session:
    """
    Dependency function to get database session.
    
    Yields:
        Database session
    
    Usage in FastAPI:
        @app.get("/endpoint")
        def endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
