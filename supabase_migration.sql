-- ============================================================================
-- Supabase Database Migration for Kuya Comps
-- ============================================================================
-- This SQL creates all necessary tables for Kuya Comps:
--   - Collections: binders, cards, price_history
--   - User Profile: profiles
--   - Billing: subscriptions, daily_usage, stripe_events
--
-- HOW TO RUN:
-- 1. Go to https://supabase.com/dashboard
-- 2. Select your project
-- 3. Navigate to "SQL Editor" in the left sidebar
-- 4. Click "New Query"
-- 5. Copy and paste this entire file
-- 6. Click "Run" or press Ctrl+Enter
-- ============================================================================

-- ============================================================================
-- USER PROFILE TABLES
-- ============================================================================

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    company TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for profiles
CREATE INDEX IF NOT EXISTS ix_profiles_email ON profiles(email);

-- ============================================================================
-- BILLING TABLES
-- ============================================================================

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    billing_interval TEXT,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_tier CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing'))
);

-- Create indexes for subscriptions
CREATE INDEX IF NOT EXISTS ix_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS ix_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS ix_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS ix_subscriptions_status ON subscriptions(status);

-- Create daily_usage table
CREATE TABLE IF NOT EXISTS daily_usage (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL,
    searches_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_date UNIQUE(user_id, usage_date)
);

-- Create indexes for daily_usage
CREATE INDEX IF NOT EXISTS ix_daily_usage_user_id ON daily_usage(user_id);
CREATE INDEX IF NOT EXISTS ix_daily_usage_date ON daily_usage(usage_date);
CREATE INDEX IF NOT EXISTS ix_daily_usage_user_date ON daily_usage(user_id, usage_date);

-- Create stripe_events table for webhook logging
CREATE TABLE IF NOT EXISTS stripe_events (
    id SERIAL PRIMARY KEY,
    stripe_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    customer_id TEXT,
    subscription_id TEXT,
    payload JSONB NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for stripe_events
CREATE INDEX IF NOT EXISTS ix_stripe_events_stripe_event_id ON stripe_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS ix_stripe_events_event_type ON stripe_events(event_type);
CREATE INDEX IF NOT EXISTS ix_stripe_events_customer_id ON stripe_events(customer_id);
CREATE INDEX IF NOT EXISTS ix_stripe_events_processed ON stripe_events(processed);
CREATE INDEX IF NOT EXISTS ix_stripe_events_created_at ON stripe_events(created_at);

-- ============================================================================
-- COLLECTIONS TABLES
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
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE binders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Note: stripe_events is for backend use only, no RLS needed

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

DROP POLICY IF EXISTS "Users can view their own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users can view their own usage" ON daily_usage;

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

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Create RLS policies for subscriptions
CREATE POLICY "Users can view their own subscription" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Create RLS policies for daily_usage
CREATE POLICY "Users can view their own usage" ON daily_usage
    FOR SELECT USING (auth.uid() = user_id);

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
-- Automatic Profile Creation Trigger
-- ============================================================================
-- This trigger automatically creates a profile when a new user signs up

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        NOW(),
        NOW()
    );
    
    -- Also create a default free subscription
    INSERT INTO public.subscriptions (user_id, tier, status, created_at, updated_at)
    VALUES (
        NEW.id,
        'free',
        'active',
        NOW(),
        NOW()
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this after the migration to verify tables were created successfully

SELECT
    'profiles' as table_name,
    COUNT(*) as row_count
FROM profiles
UNION ALL
SELECT
    'subscriptions' as table_name,
    COUNT(*) as row_count
FROM subscriptions
UNION ALL
SELECT
    'daily_usage' as table_name,
    COUNT(*) as row_count
FROM daily_usage
UNION ALL
SELECT
    'stripe_events' as table_name,
    COUNT(*) as row_count
FROM stripe_events
UNION ALL
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

-- You should see all tables listed with their row counts
-- This confirms the tables exist (even if empty)

-- ============================================================================
-- Backfill Existing Users (Run this separately after the main migration)
-- ============================================================================
-- This creates profiles and subscriptions for any existing users

INSERT INTO profiles (id, email, created_at, updated_at)
SELECT
    id,
    email,
    created_at,
    NOW()
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

INSERT INTO subscriptions (user_id, tier, status, created_at, updated_at)
SELECT
    id,
    'free',
    'active',
    created_at,
    NOW()
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM subscriptions)
ON CONFLICT DO NOTHING;
