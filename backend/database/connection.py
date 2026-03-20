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
    For PostgreSQL (Supabase), we add SSL and connection pool settings.
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
        # PostgreSQL — Supabase requires SSL
        connect_args = {}
        if 'supabase.co' in database_url:
            connect_args = {'sslmode': 'require'}
        engine = create_engine(
            database_url,
            connect_args=connect_args,
            pool_pre_ping=True,  # Verify connections before use
            echo=False
        )

    return engine


# Create engine
engine = get_engine()

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """
    Initialize database tables.

    When using SQLite: creates all tables (full local setup).
    When using PostgreSQL: only creates feedback tables (binders/cards/price_history
    already exist in Supabase and should not be recreated or altered).
    """
    from backend.database.schema import FeedbackSubmission, FeedbackScreenshot
    database_url = get_database_url()

    try:
        if database_url.startswith('sqlite'):
            # SQLite: create all tables including collection tables
            Base.metadata.create_all(bind=engine)
        else:
            # PostgreSQL (Supabase): only create feedback tables
            # Collection tables (binders, cards, price_history) already exist in Supabase
            feedback_tables = [
                FeedbackSubmission.__table__,
                FeedbackScreenshot.__table__,
            ]
            Base.metadata.create_all(bind=engine, tables=feedback_tables)
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
