#!/usr/bin/env python3
# cron_update_valuations.py
"""
Cron job script for automated card valuation updates (Phase 4).

This script should be scheduled to run daily (e.g., via cron or Railway scheduled tasks)
to automatically update Fair Market Values for cards in user collections.

Usage:
    python3 cron_update_valuations.py [--days-threshold 30] [--max-cards 100] [--delay 2.0]

Example cron entry (runs daily at 2 AM):
    0 2 * * * cd /path/to/kuya-comps && python3 cron_update_valuations.py >> logs/valuation.log 2>&1

Environment Variables Required:
    - SEARCHAPI_API_KEY: SearchAPI.io API key for scraping eBay
    - FEEDBACK_DATABASE_URL: Database connection string (optional, defaults to sqlite)
"""
import asyncio
import argparse
import sys
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from backend.database.connection import SessionLocal
from backend.services.valuation_service import update_stale_cards
from backend.config import get_settings
from backend.logging_config import get_logger
from scraper import scrape_sold_comps

logger = get_logger(__name__)


async def main():
    """Main entry point for the cron job."""
    parser = argparse.ArgumentParser(
        description='Automated card valuation update cron job'
    )
    parser.add_argument(
        '--days-threshold',
        type=int,
        default=30,
        help='Number of days since last update to consider a card stale (default: 30)'
    )
    parser.add_argument(
        '--max-cards',
        type=int,
        default=None,
        help='Maximum number of cards to update (default: None = all)'
    )
    parser.add_argument(
        '--delay',
        type=float,
        default=2.0,
        help='Delay in seconds between card updates (default: 2.0)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be updated without actually updating'
    )
    
    args = parser.parse_args()
    
    logger.info("=" * 80)
    logger.info(f"[Cron Job] Starting automated valuation update at {datetime.utcnow().isoformat()}")
    logger.info(f"[Cron Job] Parameters: days_threshold={args.days_threshold}, max_cards={args.max_cards}, delay={args.delay}")
    logger.info("=" * 80)
    
    # Get API key from settings
    settings = get_settings()
    api_key = settings.SEARCHAPI_API_KEY
    
    if not api_key:
        logger.error("[Cron Job] SEARCHAPI_API_KEY not configured. Exiting.")
        sys.exit(1)
    
    # Create database session
    db = SessionLocal()
    
    try:
        if args.dry_run:
            # Dry run - just show what would be updated
            from backend.services.collection_service import get_cards_for_auto_update
            
            stale_cards = get_cards_for_auto_update(db, args.days_threshold)
            
            if args.max_cards:
                stale_cards = stale_cards[:args.max_cards]
            
            logger.info(f"[Cron Job] DRY RUN: Would update {len(stale_cards)} cards")
            
            for i, card in enumerate(stale_cards[:10], 1):
                logger.info(f"[Cron Job]   {i}. Card {card.id}: {card.athlete} - {card.set_name} (last updated: {card.last_updated_at})")
            
            if len(stale_cards) > 10:
                logger.info(f"[Cron Job]   ... and {len(stale_cards) - 10} more")
            
            logger.info("[Cron Job] DRY RUN complete. No changes made.")
            return
        
        # Perform batch update
        summary = await update_stale_cards(
            db=db,
            scraper_func=scrape_sold_comps,
            api_key=api_key,
            days_threshold=args.days_threshold,
            max_cards=args.max_cards,
            delay_between_cards=args.delay
        )
        
        # Log summary
        logger.info("=" * 80)
        logger.info("[Cron Job] Batch update complete!")
        logger.info(f"[Cron Job] Total cards processed: {summary['total_cards']}")
        logger.info(f"[Cron Job] Successfully updated: {summary['updated']}")
        logger.info(f"[Cron Job] Flagged for review: {summary['flagged']}")
        logger.info(f"[Cron Job] Errors: {summary['errors']}")
        logger.info("=" * 80)
        
        # Log details of flagged cards
        flagged_results = [r for r in summary['results'] if r.get('flagged_for_review')]
        if flagged_results:
            logger.info("[Cron Job] Cards flagged for review:")
            for result in flagged_results[:5]:
                logger.info(f"[Cron Job]   Card {result['card_id']}: {result.get('reason', 'unknown reason')}")
            if len(flagged_results) > 5:
                logger.info(f"[Cron Job]   ... and {len(flagged_results) - 5} more")
        
        # Log details of errors
        error_results = [r for r in summary['results'] if not r.get('success')]
        if error_results:
            logger.warning("[Cron Job] Cards with errors:")
            for result in error_results[:5]:
                logger.warning(f"[Cron Job]   Card {result['card_id']}: {result.get('reason', 'unknown error')}")
            if len(error_results) > 5:
                logger.warning(f"[Cron Job]   ... and {len(error_results) - 5} more")
        
        # Exit with appropriate code
        if summary['errors'] > 0:
            logger.warning("[Cron Job] Completed with errors")
            sys.exit(1)
        else:
            logger.info("[Cron Job] Completed successfully")
            sys.exit(0)
        
    except Exception as e:
        logger.error(f"[Cron Job] Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
