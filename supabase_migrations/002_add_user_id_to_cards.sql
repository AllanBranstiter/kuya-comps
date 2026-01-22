-- Migration: Add user_id column to cards table
-- Date: 2026-01-22
-- Description: Denormalize user_id to cards table for simplified queries and better performance

-- Step 1: Add user_id column (nullable initially)
ALTER TABLE cards ADD COLUMN user_id TEXT;

-- Step 2: Populate user_id from binders table (data migration)
UPDATE cards
SET user_id = (
    SELECT user_id 
    FROM binders 
    WHERE binders.id = cards.binder_id
);

-- Step 3: Make user_id non-nullable
ALTER TABLE cards ALTER COLUMN user_id SET NOT NULL;

-- Step 4: Add indexes for performance
CREATE INDEX ix_cards_user_id ON cards(user_id);
CREATE INDEX idx_card_user_id_auto_update ON cards(user_id, auto_update);

-- Step 5: Data consistency enforcement
-- NOTE: PostgreSQL does not allow subqueries in CHECK constraints.
-- Data consistency (ensuring card.user_id matches binder.user_id) is enforced at the application level:
-- - When creating cards, user_id is set from the parent binder
-- - When updating cards, the application validates user_id consistency
-- - Foreign key constraints and application logic prevent inconsistent data

-- Verification query (run this after migration to confirm success):
-- SELECT COUNT(*) FROM cards WHERE user_id IS NULL;
-- Should return 0

-- Data consistency check:
-- SELECT COUNT(*) 
-- FROM cards c
-- JOIN binders b ON c.binder_id = b.id
-- WHERE c.user_id != b.user_id;
-- Should return 0
