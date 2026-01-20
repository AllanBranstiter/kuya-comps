#!/usr/bin/env python3
"""
Supabase Migration Script: Backfill Price History for Existing Cards

This script creates initial price_history entries for all existing cards
in Supabase PostgreSQL that have a current_fmv value but no price history.

Installation:
    pip install supabase python-dotenv

Usage:
    # Dry run (preview changes without committing)
    python migrate_supabase_price_history.py --dry-run
    
    # Execute migration
    python migrate_supabase_price_history.py

Environment Variables Required:
    SUPABASE_URL - Your Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY - Service role key (has admin access)

The script is idempotent - it can be run multiple times safely.
Cards that already have price history entries will be skipped.
"""
import os
import sys
import argparse
from datetime import datetime
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: supabase library not installed")
    print("Install it with: pip install supabase python-dotenv")
    sys.exit(1)


class SupabasePriceHistoryMigration:
    """Handles backfilling price_history entries in Supabase."""
    
    def __init__(self, dry_run=False):
        """
        Initialize the migration with Supabase connection.
        
        Args:
            dry_run: If True, preview changes without committing
        """
        self.dry_run = dry_run
        self.supabase = None
        
        # Statistics counters
        self.total_cards = 0
        self.cards_with_fmv = 0
        self.cards_already_migrated = 0
        self.cards_migrated = 0
        self.cards_skipped = 0
        self.errors = 0
        
        self._connect()
    
    def _connect(self):
        """Establish connection to Supabase."""
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            print("ERROR: Missing required environment variables")
            print("Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
            print("\nMake sure you have a .env file with these variables set.")
            sys.exit(1)
        
        try:
            self.supabase = create_client(supabase_url, supabase_key)
            print("✓ Connected to Supabase successfully")
        except Exception as e:
            print(f"ERROR: Failed to connect to Supabase: {e}")
            sys.exit(1)
    
    def _log(self, message: str, level: str = "INFO"):
        """Log a message with timestamp."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix = {
            "INFO": "ℹ️ ",
            "SUCCESS": "✓ ",
            "WARNING": "⚠️ ",
            "ERROR": "✗ ",
            "DEBUG": "  "
        }.get(level, "  ")
        print(f"[{timestamp}] {prefix}{message}")
    
    def fetch_all_cards(self) -> List[Dict[str, Any]]:
        """
        Fetch all cards from Supabase.
        
        Returns:
            List of card dictionaries
        """
        try:
            response = self.supabase.table("cards").select(
                "id, current_fmv, created_at, athlete, year, set_name, card_number"
            ).execute()
            
            cards = response.data
            self._log(f"Found {len(cards)} total cards in database")
            return cards
        except Exception as e:
            self._log(f"Error fetching cards: {e}", "ERROR")
            raise
    
    def has_price_history(self, card_id: int) -> bool:
        """
        Check if a card already has price history entries.
        
        Args:
            card_id: The card's ID
            
        Returns:
            True if price history exists, False otherwise
        """
        try:
            response = self.supabase.table("price_history").select(
                "id"
            ).eq("card_id", card_id).limit(1).execute()
            
            return len(response.data) > 0
        except Exception as e:
            self._log(f"Error checking price history for card {card_id}: {e}", "ERROR")
            return True  # Assume it exists to be safe
    
    def create_price_history(self, card_id: int, value: float, date_recorded: str) -> bool:
        """
        Create a price history entry for a card.
        
        Args:
            card_id: The card's ID
            value: The FMV value to record
            date_recorded: ISO timestamp for when to record the price
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if self.dry_run:
                self._log(f"  [DRY RUN] Would create price history entry", "DEBUG")
                return True
            
            data = {
                "card_id": card_id,
                "value": value,
                "date_recorded": date_recorded,
                "num_sales": None,
                "confidence": "backfilled"
            }
            
            self.supabase.table("price_history").insert(data).execute()
            return True
        except Exception as e:
            self._log(f"Error creating price history: {e}", "ERROR")
            return False
    
    def format_card_name(self, card: Dict[str, Any]) -> str:
        """
        Format a card's name for display.
        
        Args:
            card: Card dictionary
            
        Returns:
            Formatted card name
        """
        parts = []
        
        if card.get("year"):
            parts.append(card["year"])
        if card.get("set_name"):
            parts.append(card["set_name"])
        if card.get("athlete"):
            parts.append(card["athlete"])
        if card.get("card_number"):
            parts.append(f"#{card['card_number']}")
        
        return " ".join(parts) if parts else f"Card {card['id']}"
    
    def migrate_card(self, card: Dict[str, Any]) -> bool:
        """
        Migrate a single card by creating its initial price history entry.
        
        Args:
            card: Card dictionary with id, current_fmv, created_at, etc.
            
        Returns:
            True if migration successful or skipped, False on error
        """
        try:
            card_id = card["id"]
            current_fmv = card.get("current_fmv")
            created_at = card.get("created_at")
            
            # Check if card has a current_fmv
            if current_fmv is None or float(current_fmv) <= 0:
                self.cards_skipped += 1
                self._log(
                    f"Skipping card {card_id} ({self.format_card_name(card)}): No current_fmv",
                    "DEBUG"
                )
                return True
            
            self.cards_with_fmv += 1
            
            # Check if card already has price history
            if self.has_price_history(card_id):
                self.cards_already_migrated += 1
                self._log(
                    f"Skipping card {card_id} ({self.format_card_name(card)}): Already has price history",
                    "DEBUG"
                )
                return True
            
            # Create initial price history entry
            card_name = self.format_card_name(card)
            self._log(f"Migrating card {card_id}: {card_name} (${current_fmv})")
            
            # Use card's created_at as the date_recorded to show when they originally added it
            date_recorded = created_at if created_at else datetime.utcnow().isoformat()
            
            success = self.create_price_history(card_id, float(current_fmv), date_recorded)
            
            if success:
                self.cards_migrated += 1
                mode = "[DRY RUN] " if self.dry_run else ""
                self._log(f"  {mode}✓ Created price history entry (date: {date_recorded})", "SUCCESS")
                return True
            else:
                self.errors += 1
                return False
                
        except Exception as e:
            self.errors += 1
            self._log(f"  ✗ Error migrating card {card.get('id', 'unknown')}: {e}", "ERROR")
            return False
    
    def run_migration(self) -> bool:
        """
        Execute the complete migration process.
        
        Returns:
            True if migration completed successfully, False otherwise
        """
        self._log("=" * 80)
        mode_text = "[DRY RUN] " if self.dry_run else ""
        self._log(f"{mode_text}Starting price history backfill migration")
        self._log("=" * 80)
        print()
        
        # Fetch all cards
        try:
            cards = self.fetch_all_cards()
            self.total_cards = len(cards)
        except Exception as e:
            self._log(f"Fatal error fetching cards: {e}", "ERROR")
            return False
        
        if not cards:
            self._log("No cards found in database", "WARNING")
            return True
        
        print()
        
        # Process each card
        for i, card in enumerate(cards, 1):
            if i % 10 == 0:
                self._log(f"Progress: {i}/{self.total_cards} cards processed...")
            self.migrate_card(card)
        
        # Print summary
        self._print_summary()
        
        if self.errors > 0:
            self._log(f"Migration completed with {self.errors} errors", "WARNING")
            return False
        else:
            mode_text = "[DRY RUN] " if self.dry_run else ""
            self._log(f"{mode_text}Migration completed successfully!", "SUCCESS")
            return True
    
    def verify_migration(self) -> bool:
        """
        Verify the migration by checking that all cards with current_fmv have price history.
        
        Returns:
            True if verification passes, False otherwise
        """
        print()
        self._log("=" * 80)
        self._log("Verifying Migration")
        self._log("=" * 80)
        
        if self.dry_run:
            self._log("Skipping verification in dry-run mode", "INFO")
            return True
        
        try:
            # Fetch all cards with current_fmv
            cards_with_fmv = self.supabase.table("cards").select(
                "id, current_fmv, athlete, year, set_name"
            ).not_.is_("current_fmv", "null").gt("current_fmv", 0).execute()
            
            missing_history = []
            
            for card in cards_with_fmv.data:
                if not self.has_price_history(card["id"]):
                    missing_history.append(card)
            
            if missing_history:
                self._log(
                    f"Verification FAILED: {len(missing_history)} cards still missing price history",
                    "ERROR"
                )
                for card in missing_history[:5]:  # Show first 5
                    self._log(
                        f"  - Card {card['id']}: {self.format_card_name(card)} (${card.get('current_fmv')})",
                        "ERROR"
                    )
                if len(missing_history) > 5:
                    self._log(f"  ... and {len(missing_history) - 5} more", "ERROR")
                return False
            else:
                self._log(
                    f"Verification PASSED: All {len(cards_with_fmv.data)} cards with FMV have price history",
                    "SUCCESS"
                )
                return True
                
        except Exception as e:
            self._log(f"Error during verification: {e}", "ERROR")
            return False
    
    def _print_summary(self):
        """Print migration summary statistics."""
        print()
        self._log("=" * 80)
        self._log("Migration Summary")
        self._log("=" * 80)
        self._log(f"Total cards in database:        {self.total_cards}")
        self._log(f"Cards with current_fmv:         {self.cards_with_fmv}")
        self._log(f"Cards already migrated:         {self.cards_already_migrated}")
        mode_text = "(would migrate) " if self.dry_run else ""
        self._log(f"Cards migrated in this run:     {self.cards_migrated} {mode_text}")
        self._log(f"Cards skipped (no FMV):         {self.cards_skipped}")
        self._log(f"Errors:                         {self.errors}")
        self._log("=" * 80)


def main():
    """Main entry point for migration script."""
    parser = argparse.ArgumentParser(
        description="Backfill price_history entries for existing cards in Supabase"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without committing to database"
    )
    args = parser.parse_args()
    
    print()
    print("╔" + "=" * 78 + "╗")
    print("║" + " " * 12 + "Supabase Price History Backfill Migration" + " " * 25 + "║")
    print("╚" + "=" * 78 + "╝")
    print()
    
    if args.dry_run:
        print("🔍 DRY RUN MODE - No changes will be committed to database")
        print()
    
    # Create migration instance
    migration = SupabasePriceHistoryMigration(dry_run=args.dry_run)
    
    # Run migration
    success = migration.run_migration()
    
    if not success:
        print()
        migration._log("Migration failed. Please review errors above.", "ERROR")
        sys.exit(1)
    
    # Verify migration (skipped in dry-run mode)
    verified = migration.verify_migration()
    
    if not verified and not args.dry_run:
        print()
        migration._log("Verification failed. Please review errors above.", "ERROR")
        sys.exit(1)
    
    print()
    if args.dry_run:
        print("🔍 Dry run completed. Run without --dry-run to execute migration.")
    else:
        print("🎉 Migration and verification completed successfully!")
    print()
    sys.exit(0)


if __name__ == "__main__":
    main()
