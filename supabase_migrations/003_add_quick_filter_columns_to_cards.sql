-- Add quick filter columns to cards table
-- Migration: 003_add_quick_filter_columns_to_cards

ALTER TABLE cards
ADD COLUMN IF NOT EXISTS exclude_lots BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS raw_only BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS base_only BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN cards.exclude_lots IS 'Filter out lot listings from FMV calculations';
COMMENT ON COLUMN cards.raw_only IS 'Filter to only raw/ungraded listings';
COMMENT ON COLUMN cards.base_only IS 'Filter to only base card listings';
