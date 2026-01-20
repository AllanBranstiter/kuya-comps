#!/usr/bin/env python3
"""
Migration Script: Backfill Price History for Existing Cards

This script creates initial price_history entries for all existing cards
that have a current_fmv value but no price history.

Usage:
    python migrate_existing_card_values.py

The script is idempotent - it can be run multiple times safely.
Cards that already have price history entries will be skipped.
"""
import sys
from datetime import datetime
from decimal import Decimal

# Add the project root to the path
sys.path.insert(0, '.')

from backend.database.connection import SessionLocal, init_db
from backend.database.schema import Card, PriceHistory
from backend.services.collection_service import add_price_history
from backend.models.collection_schemas import PriceHistoryCreate
from backend.logging_config import get_logger

logger = get_logger(__name__)


def migrate_existing_cards():
    """
    Backfill price_history entries for all existing cards with current_fmv.
    
    For each card:
    1. Check if current_fmv is set
    2. Check if card already has price history
    3. If not, create initial entry with:
       - value: card's current_fmv
       - date_recorded: card's created_at timestamp (when user originally added it)
       - confidence: "backfilled"
       - num_sales: None
    """
    logger.info("=" * 80)
    logger.info("Starting price history backfill migration")
    logger.info("=" * 80)
    
    # Initialize database (ensure tables exist)
    init_db()
    
    # Create database session
    db = SessionLocal()
    
    try:
        # Statistics counters
        total_cards = 0
        cards_with_fmv = 0
        cards_already_migrated = 0
        cards_migrated = 0
        cards_skipped = 0
        errors = 0
        
        # Query all cards
        all_cards = db.query(Card).all()
        total_cards = len(all_cards)
        
        logger.info(f"Found {total_cards} total cards in database")
        logger.info("")
        
        # Process each card
        for card in all_cards:
            try:
                # Check if card has a current_fmv
                if card.current_fmv is None or card.current_fmv <= 0:
                    cards_skipped += 1
                    logger.debug(f"Skipping card {card.id} ({card.athlete}): No current_fmv")
                    continue
                
                cards_with_fmv += 1
                
                # Check if card already has price history
                existing_history = db.query(PriceHistory).filter(
                    PriceHistory.card_id == card.id
                ).first()
                
                if existing_history:
                    cards_already_migrated += 1
                    logger.debug(f"Skipping card {card.id} ({card.athlete}): Already has price history")
                    continue
                
                # Create initial price history entry
                logger.info(f"Migrating card {card.id}: {card.athlete} (${card.current_fmv})")
                
                # Use card's created_at as the date_recorded to show when they originally added it
                price_history = PriceHistory(
                    card_id=card.id,
                    value=card.current_fmv,
                    date_recorded=card.created_at or datetime.utcnow(),
                    num_sales=None,
                    confidence="backfilled"
                )
                
                db.add(price_history)
                db.commit()
                
                cards_migrated += 1
                logger.info(f"  ✓ Created price history entry (date: {price_history.date_recorded})")
                
            except Exception as e:
                errors += 1
                logger.error(f"  ✗ Error migrating card {card.id}: {e}")
                db.rollback()
                continue
        
        # Print summary
        logger.info("")
        logger.info("=" * 80)
        logger.info("Migration Summary")
        logger.info("=" * 80)
        logger.info(f"Total cards in database:        {total_cards}")
        logger.info(f"Cards with current_fmv:         {cards_with_fmv}")
        logger.info(f"Cards already migrated:         {cards_already_migrated}")
        logger.info(f"Cards migrated in this run:     {cards_migrated}")
        logger.info(f"Cards skipped (no FMV):         {cards_skipped}")
        logger.info(f"Errors:                         {errors}")
        logger.info("=" * 80)
        
        if errors > 0:
            logger.warning(f"⚠️  Migration completed with {errors} errors")
            return False
        else:
            logger.info("✅ Migration completed successfully!")
            return True
            
    except Exception as e:
        logger.error(f"Fatal error during migration: {e}")
        db.rollback()
        return False
        
    finally:
        db.close()


def verify_migration():
    """
    Verify the migration by checking that all cards with current_fmv have price history.
    
    Returns:
        bool: True if verification passes, False otherwise
    """
    logger.info("")
    logger.info("=" * 80)
    logger.info("Verifying Migration")
    logger.info("=" * 80)
    
    db = SessionLocal()
    
    try:
        # Find cards with current_fmv but no price history
        cards_with_fmv = db.query(Card).filter(
            Card.current_fmv.isnot(None),
            Card.current_fmv > 0
        ).all()
        
        missing_history = []
        
        for card in cards_with_fmv:
            history = db.query(PriceHistory).filter(
                PriceHistory.card_id == card.id
            ).first()
            
            if not history:
                missing_history.append(card)
        
        if missing_history:
            logger.error(f"❌ Verification FAILED: {len(missing_history)} cards still missing price history")
            for card in missing_history[:5]:  # Show first 5
                logger.error(f"  - Card {card.id}: {card.athlete} (${card.current_fmv})")
            if len(missing_history) > 5:
                logger.error(f"  ... and {len(missing_history) - 5} more")
            return False
        else:
            logger.info(f"✅ Verification PASSED: All {len(cards_with_fmv)} cards with FMV have price history")
            return True
            
    except Exception as e:
        logger.error(f"Error during verification: {e}")
        return False
        
    finally:
        db.close()


def main():
    """Main entry point for migration script."""
    print("")
    print("╔" + "=" * 78 + "╗")
    print("║" + " " * 15 + "Price History Backfill Migration" + " " * 31 + "║")
    print("╚" + "=" * 78 + "╝")
    print("")
    
    # Run migration
    success = migrate_existing_cards()
    
    if not success:
        logger.error("Migration failed. Please review errors above.")
        sys.exit(1)
    
    # Verify migration
    verified = verify_migration()
    
    if not verified:
        logger.error("Verification failed. Please review errors above.")
        sys.exit(1)
    
    logger.info("")
    logger.info("🎉 Migration and verification completed successfully!")
    logger.info("")
    sys.exit(0)


if __name__ == "__main__":
    main()
