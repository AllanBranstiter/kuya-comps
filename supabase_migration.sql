-- ============================================================================
-- Supabase Database Migration for Collections Feature
-- ============================================================================
-- This SQL creates the binders, cards, and price_history tables needed for
-- the card collection feature in Kuya Comps.
--
-- HOW TO RUN:
-- 1. Go to https://supabase.com/dashboard
-- 2. Select your project
-- 3. Navigate to "SQL Editor" in the left sidebar
-- 4. Click "New Query"
-- 5. Copy and paste this entire file
-- 6. Click "Run" or press Ctrl+Enter
-- ============================================================================

-- Create binders table
CREATE TABLE IF NOT EXISTS binders (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    cover_card_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for binders
CREATE INDEX IF NOT EXISTS ix_binders_user_id ON binders(user_id);
CREATE INDEX IF NOT EXISTS ix_binders_created_at ON binders(created_at);
CREATE INDEX IF NOT EXISTS idx_binder_user_created ON binders(user_id, created_at);

-- Create cards table
CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    binder_id INTEGER NOT NULL REFERENCES binders(id) ON DELETE CASCADE,
    year VARCHAR(10),
    set_name VARCHAR(200),
    athlete VARCHAR(200) NOT NULL,
    card_number VARCHAR(50),
    variation VARCHAR(200),
    grading_company VARCHAR(50),
    grade VARCHAR(20),
    image_url TEXT,
    search_query_string TEXT NOT NULL,
    auto_update BOOLEAN NOT NULL DEFAULT TRUE,
    last_updated_at TIMESTAMP,
    purchase_price NUMERIC(10, 2),
    purchase_date TIMESTAMP,
    current_fmv NUMERIC(10, 2),
    review_required BOOLEAN NOT NULL DEFAULT FALSE,
    review_reason TEXT,
    no_recent_sales BOOLEAN NOT NULL DEFAULT FALSE,
    tags TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for cards
CREATE INDEX IF NOT EXISTS ix_cards_binder_id ON cards(binder_id);
CREATE INDEX IF NOT EXISTS ix_cards_athlete ON cards(athlete);
CREATE INDEX IF NOT EXISTS ix_cards_auto_update ON cards(auto_update);
CREATE INDEX IF NOT EXISTS ix_cards_last_updated_at ON cards(last_updated_at);
CREATE INDEX IF NOT EXISTS ix_cards_review_required ON cards(review_required);
CREATE INDEX IF NOT EXISTS idx_card_binder_athlete ON cards(binder_id, athlete);
CREATE INDEX IF NOT EXISTS idx_card_auto_update_stale ON cards(auto_update, last_updated_at);
CREATE INDEX IF NOT EXISTS idx_card_review_required ON cards(review_required);

-- Create price_history table
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    value NUMERIC(10, 2) NOT NULL,
    date_recorded TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    num_sales INTEGER,
    confidence VARCHAR(20)
);

-- Create indexes for price_history
CREATE INDEX IF NOT EXISTS ix_price_history_card_id ON price_history(card_id);
CREATE INDEX IF NOT EXISTS ix_price_history_date_recorded ON price_history(date_recorded);
CREATE INDEX IF NOT EXISTS idx_price_history_card_date ON price_history(card_id, date_recorded);

-- Add foreign key for cover_card_id (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_binders_cover_card_id'
    ) THEN
        ALTER TABLE binders 
        ADD CONSTRAINT fk_binders_cover_card_id 
        FOREIGN KEY (cover_card_id) REFERENCES cards(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================
-- These policies ensure users can only access their own data

-- Enable RLS on all tables
ALTER TABLE binders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own binders" ON binders;
DROP POLICY IF EXISTS "Users can insert their own binders" ON binders;
DROP POLICY IF EXISTS "Users can update their own binders" ON binders;
DROP POLICY IF EXISTS "Users can delete their own binders" ON binders;

DROP POLICY IF EXISTS "Users can view cards in their binders" ON cards;
DROP POLICY IF EXISTS "Users can insert cards in their binders" ON cards;
DROP POLICY IF EXISTS "Users can update cards in their binders" ON cards;
DROP POLICY IF EXISTS "Users can delete cards in their binders" ON cards;

DROP POLICY IF EXISTS "Users can view price history for their cards" ON price_history;
DROP POLICY IF EXISTS "Users can insert price history for their cards" ON price_history;

-- Create RLS policies for binders
CREATE POLICY "Users can view their own binders" ON binders
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own binders" ON binders
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own binders" ON binders
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own binders" ON binders
    FOR DELETE USING (auth.uid()::text = user_id);

-- Create RLS policies for cards
CREATE POLICY "Users can view cards in their binders" ON cards
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM binders 
            WHERE binders.id = cards.binder_id 
            AND binders.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert cards in their binders" ON cards
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM binders 
            WHERE binders.id = cards.binder_id 
            AND binders.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can update cards in their binders" ON cards
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM binders 
            WHERE binders.id = cards.binder_id 
            AND binders.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can delete cards in their binders" ON cards
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM binders 
            WHERE binders.id = cards.binder_id 
            AND binders.user_id = auth.uid()::text
        )
    );

-- Create RLS policies for price_history
CREATE POLICY "Users can view price history for their cards" ON price_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM cards 
            JOIN binders ON binders.id = cards.binder_id
            WHERE cards.id = price_history.card_id 
            AND binders.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert price history for their cards" ON price_history
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM cards 
            JOIN binders ON binders.id = cards.binder_id
            WHERE cards.id = price_history.card_id 
            AND binders.user_id = auth.uid()::text
        )
    );

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this after the migration to verify tables were created successfully

SELECT 
    'binders' as table_name,
    COUNT(*) as row_count
FROM binders
UNION ALL
SELECT 
    'cards' as table_name,
    COUNT(*) as row_count
FROM cards
UNION ALL
SELECT 
    'price_history' as table_name,
    COUNT(*) as row_count
FROM price_history;

-- You should see:
-- table_name    | row_count
-- --------------|----------
-- binders       | 0
-- cards         | 0
-- price_history | 0
--
-- This confirms the tables exist (even if empty)
