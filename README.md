# eBay Baseball Card Comps Tool v0.9.0

A web application for scraping and analyzing eBay baseball card sold/active listings with FMV calculations, intelligent deal-finding, and a personal card collection tracker with automatic price history.

## Features

### Comps & Analysis
*   **Dual Search Display**: Automatically shows both sold listings and active listings below FMV
*   **Advanced Filtering**: Raw Only, Base Only, Exclude Autographs, and Buy It Now Only filters
*   **Smart Deal Finding**: Active listings filtered to show only items priced at or below Fair Market Value
*   **Discount Indicators**: Red percentage showing how much below FMV each active listing is priced
*   **Market Analysis**: Fair Market Value calculations with Discount/Market Value/Premium ranges
*   **Bid/Ask Market Structure**: Stock-market-style display showing what buyers paid (bid) vs. what sellers are asking (ask), with spread signal
*   **Collectibility Score**: 1–10 score using continuous log-scaled price, volume, and scarcity components
*   **AI Relevance Scoring**: LLM-powered listing filter — each sold and active listing is scored 0.0–1.0 for relevance to the search query; low-relevance listings (wrong card, wrong grade, lots) have minimal weight in FMV
*   **Interactive Visualization**: Beeswarm chart showing sold (blue) and active (red) price distributions
*   **PSA Grade Intelligence**: Compare prices across different PSA grades

### Collection Tracker
*   **Binders & Cards**: Organize cards into named binders with full CRUD support
*   **Save from Search**: Save a card directly from the Comps tab — search query and active filters (Raw Only, Base Only, Exclude Lots) are automatically stored with the card
*   **Price History Tracking**: Every card maintains a full price history
    - First entry uses purchase price + purchase date if both are provided; otherwise uses current FMV
    - Subsequent entries are created automatically each time the FMV is updated
*   **Automatic Price Refresh**: Click ⏰ (stale) or ⚠️ (flagged) in the Status column to re-scrape eBay and update the card's FMV using the same volume-weighted algorithm as the Comps tab
*   **Status Indicators**: ✓ (up to date, shows days until next refresh), ⏰ (stale, click to refresh), ⚠️ (flagged, click to retry)
*   **Price History Modal**: View full price history chart and table inside the Edit Card dialog; delete individual entries with instant Supabase sync
*   **ROI Tracking**: Each card shows cost basis, current FMV, and % gain/loss
*   **Edit Card**: Update any card field; FMV changes automatically create a new price history entry

### Grading Advisor
*   **Intelligent Grading Advisor**: Comprehensive tool to decide whether grading a raw card is financially worthwhile
    - Enter PSA market prices and population data for grades 1–10
    - Input raw card purchase price and grading fees
    - Get a color-coded verdict (Green Light, Yellow Caution, Red Stop)
    - View scenario analysis (Optimistic, Realistic, Pessimistic outcomes)
    - See break-even grade and expected value calculations
    - Get personalized "Kuya's Advice" with recommendations
    - Compare strategies for flippers vs. long-term collectors
    - Population distribution visualization

### General
*   **First-Time User Onboarding**: Interactive 9-step guided tour using Driver.js
*   **Subscription Tiers**: Free, Member, and Founder tiers with rate-limited feature access
*   **Clean UI**: Modern interface with responsive design
*   **Accessibility**: WCAG 2.1 Level A & AA compliant

## Tech Stack

### Backend
*   **Framework**: Python with [FastAPI](https://fastapi.tiangolo.com/)
*   **Server**: uvicorn (development) / gunicorn (production)
*   **Data Source**: [SearchAPI.io](https://www.searchapi.io/) for eBay listings scraping
*   **Database**: Supabase (PostgreSQL) via Supabase Python client + SQLAlchemy (feedback tables only)
*   **Auth**: Supabase JWT — all user-facing endpoints verify `Authorization: Bearer <token>`
*   **Caching**: Redis with aioredis for aggressive API cost optimization
*   **Rate Limiting**: slowapi (10 requests/minute per IP)
*   **Monitoring**: Sentry (production), custom `/metrics` endpoint
*   **ML/Analytics**: scikit-learn, numpy, pandas, scipy for volume-weighted FMV calculations; httpx for OpenRouter AI relevance scoring

### Frontend
*   **UI**: Vanilla HTML, CSS, and JavaScript (static files)
*   **Styling**: External CSS with WCAG 2.1 AA compliant colors
*   **Visualization**: Interactive beeswarm charts for price distribution
*   **Collection Module**: [`static/js/collection.js`](static/js/collection.js) — binders, cards, price history, edit/delete, price refresh
*   **Components**: Reusable Modal class with focus trapping, escape key handling, ARIA attributes

### Architecture
*   **Modular Backend**: Organized in [`/backend/`](backend/) directory with routes, services, models, middleware, config, and cache modules
*   **API Endpoints**: See [API](#api) section below
*   **Middleware Chain**: RequestID → Metrics → SecurityHeaders (execution in reverse order of definition)
*   **Static File Serving**: Frontend served from root path (must be mounted last in FastAPI)
*   **Caching Strategy**: Redis layer minimizes SearchAPI.io costs and improves response times

## Directory Structure

```
kuya-comps/
├── backend/
│   ├── routes/
│   │   ├── collection_valuation.py   # /api/v1/cards/{id}/update-value, admin batch endpoints
│   │   ├── billing.py                # /usage, subscription info
│   │   ├── profile.py                # /api/profile
│   │   ├── grading_advisor.py        # /api/grading-advisor
│   │   └── ...                       # comps, fmv, health, feedback, admin
│   ├── services/
│   │   ├── valuation_service.py      # Automated FMV updates using volume-weighted algorithm
│   │   ├── fmv_service.py            # Core volume-weighted FMV calculation (shared)
│   │   ├── analytics_score_service.py # Market Confidence, Liquidity, Collectibility, Market Pressure
│   │   ├── relevance_service.py      # AI-powered listing relevance scoring (OpenRouter/Gemini)
│   │   ├── collection_service.py     # Binder/card CRUD, price history writes
│   │   ├── subscription_service.py   # Tier limits and usage tracking
│   │   └── ...
│   ├── database/
│   │   ├── connection.py             # SQLAlchemy engine (Supabase pooler, SSL, feedback-only init)
│   │   └── schema.py                 # ORM models: Binder, Card, PriceHistory, FeedbackSubmission
│   ├── models/
│   │   ├── schemas.py                # CompItem and related Pydantic models
│   │   └── collection_schemas.py     # Collection-specific Pydantic models
│   ├── middleware/
│   ├── config/
│   └── cache/
├── static/
│   ├── index.html                    # Main application
│   ├── style.css
│   ├── script.js                     # Comps & Analysis tab logic
│   ├── css/
│   │   ├── onboarding.css
│   │   ├── shared-styles.css
│   │   └── grading-advisor.css
│   └── js/
│       ├── collection.js             # Collection tracker module
│       ├── modal.js
│       ├── auth.js
│       ├── subscription.js
│       ├── onboarding.js
│       ├── grading-advisor.js
│       └── ...
├── docs/
├── tests/
├── main.py
├── scraper.py
├── requirements.txt
├── Procfile
└── .gitleaks.toml
```

## Setup and Running

### Local Development

1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Set up Environment Variables:**
    ```bash
    cp .env.example .env
    # Edit .env and add your SearchAPI.io API key and Supabase credentials
    ```

3.  **Run the application:**
    ```bash
    uvicorn main:app --reload
    ```

4.  **Open your browser:**
    Navigate to [http://127.0.0.1:8000](http://127.0.0.1:8000)

### Production Deployment (Railway)

1.  **Push to GitHub** — ensure `.env` is in `.gitignore`

2.  **Deploy on Railway** — connect your GitHub repo; Railway auto-detects Python via `Procfile`

3.  **Environment Variables Required:**
    - `SEARCH_API_KEY` — SearchAPI.io API key (required)
    - `FEEDBACK_DATABASE_URL` — Supabase connection pooler URL (required for collection features)
      - Use the **Transaction pooler** URL from Supabase → Settings → Database → Connection Pooling (port 6543)
      - Example: `postgresql://postgres.xxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
    - `SUPABASE_URL` — your Supabase project URL
    - `SUPABASE_KEY` — your Supabase service role key
    - `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID` — eBay API credentials (recommended)
    - `ENVIRONMENT` — set to `production`
    - `SENTRY_DSN` — error monitoring (optional)
    - `REDIS_URL` — automatically provided by Railway for caching
    - `OPENROUTER_API_KEY` — OpenRouter API key for AI relevance scoring (optional; scoring is skipped gracefully if absent)
    - `ADMIN_USER_IDS`, `ADMIN_EMAILS` — comma-separated admin identifiers

### Supabase Setup

The collection features require several tables in your Supabase project. Run the following in Supabase SQL Editor if any columns are missing:

```sql
-- Ensure all card columns exist
ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS search_query_string TEXT,
    ADD COLUMN IF NOT EXISTS auto_update BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS review_required BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS review_reason TEXT,
    ADD COLUMN IF NOT EXISTS no_recent_sales BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS exclude_lots BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS raw_only BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS base_only BOOLEAN DEFAULT FALSE;

-- Allow users to delete their own price history entries
CREATE POLICY "Users can delete their own price history"
ON price_history FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM cards
        WHERE cards.id = price_history.card_id
        AND cards.user_id = auth.uid()::text
    )
);
```

## API

*   **`GET /comps`** — Sold listings for market analysis
*   **`GET /active`** — Active listings at or below FMV
*   **`POST /fmv`** — Volume-weighted Fair Market Value calculation (legacy, sold comps only)
*   **`POST /fmv/v2`** — Blended FMV calculation using both sold comps (bid) and active listings (ask); optional `query` field triggers AI relevance scoring — returns `sold_relevance_scores` and `active_relevance_scores` arrays
*   **`POST /api/v1/cards/{card_id}/update-value`** — Trigger FMV refresh for a single card (auth required)
    - Scrapes eBay using the card's stored search query and saved filters
    - Uses the same volume-weighted FMV algorithm as the Comps tab
    - Updates `current_fmv`, `last_updated_at`, and writes a new `price_history` entry
    - Flags with ⚠️ if zero sales found; always updates if ≥ 1 sale
*   **`POST /admin/api/valuation/batch-update`** — Batch FMV update for all stale cards (admin only)
*   **`GET /admin/api/valuation/stats`** — Valuation statistics dashboard (admin only)
*   **`GET /usage`** — Current user's tier and usage stats
*   **`POST /api/grading-advisor`** — Grading analysis with expected value calculations
*   **`GET /metrics`** — Application performance metrics

## Security

- **Automated Secret Scanning**: Pre-commit hook using [gitleaks](https://github.com/gitleaks/gitleaks)
- **Comprehensive `.gitignore`**: Excludes `.env`, credentials, private keys
- **Environment Variables**: API keys handled server-side only
- **JWT Authentication**: All collection endpoints verify Supabase Bearer tokens
- **Row Level Security**: Supabase RLS policies control per-user data access
- **Secure API Routing**: Keys never exposed to the frontend

See [`docs/SECURITY.md`](docs/SECURITY.md) for full security guidelines.

## Performance & Cost Optimization

*   **Aggressive Caching**: Redis reduces SearchAPI.io requests
*   **Rate Limiting**: 10 requests/minute per IP
*   **Connection Pooling**: Supabase transaction pooler for Railway compatibility
*   **Middleware Optimization**: Reverse execution order of `add_middleware()` calls

## Version History

### Version 0.9.0 (AI Relevance Scoring & Analytics Score Engine)

**AI Relevance Scoring (`relevance_service.py`):**
- New `backend/services/relevance_service.py` — scores each listing title 0.0–1.0 for relevance to the search query using an LLM (Gemini 2.0 Flash Lite via OpenRouter)
- Scores used as weight multipliers in FMV so irrelevant listings (wrong variant, wrong grade, lots, reprints) have minimal influence on the price estimate
- `/fmv/v2` now accepts an optional `query` field; when provided, AI scoring runs and `sold_relevance_scores` / `active_relevance_scores` arrays are returned in the response
- Processing is chunked (20 listings/call) and gracefully falls back to uniform weights if the API key is absent or a chunk fails
- Model: `google/gemini-2.0-flash-lite-001` via OpenRouter; configurable via `OPENROUTER_API_KEY` env var

**Analytics Score Engine (`analytics_score_service.py`):**
- New `backend/services/analytics_score_service.py` consolidates all analytics score calculations into a single service
- **Market Confidence**: volume-weighted coefficient of variation → 0–100 score with bands (Excellent / Good / Moderate / High Variation / Chaotic)
- **Liquidity**: recency-weighted absorption ratio (14-day exponential decay on sold count vs. BIN active count) → 0–100 score with labels
- **Collectibility**: continuous log-scaled components replace hard price thresholds, eliminating cliff effects — price (1–4), volume (0–3), scarcity (0–3) → 1–10 score
- **Market Pressure**: seller-deduplicated, IQR-filtered ask median vs. FMV → pressure % with status labels (BELOW_FMV / HEALTHY / OPTIMISTIC / RESISTANCE / UNREALISTIC)

**FMV Price Bins (tier-scaled):**
- Replaced single `PRICE_BIN_SIZE` constant with four tier-specific constants: `PRICE_BIN_SIZE_BULK` ($0.50), `PRICE_BIN_SIZE_LOW` ($2.00), `PRICE_BIN_PCT_MID` (5%), `PRICE_BIN_PCT_GRAIL` (3%)
- Bin size now scales with card value, producing better cluster detection across all price tiers

**Cleanup:**
- Phase implementation summary files (15 `.md` files) removed from project root; superseded by `AI_CONTEXT.md`

### Version 0.8.0 (Blended FMV, Collectibility Score, Bid/Ask Dashboard)

**Blended FMV Engine (`/fmv/v2`):**
- New `POST /fmv/v2` endpoint accepts both sold comps (bid side) and active listings (ask side)
- FMV is now a weighted blend of bid center and ask median, with weights determined by price tier (Bulk/Low/Mid/Grail) and supply/demand ratio (active ÷ sold count)
- Oversupplied cheap cards lean toward the ask; scarce expensive cards trust the comps
- "Sellers dreaming" override clamps ask influence when ask > 2× bid
- Discount (p25) and Premium (p75) are also blended: Discount uses p10 of active listings; Premium uses p90 of active listings, with a more conservative bid weight so dreaming sellers don't inflate the ceiling
- Always enforces: Discount ≤ Market Value ≤ Premium
- `fmv_low` / `fmv_high` retired — output simplified to three values

**Collectibility Score:**
- New `backend/services/collectibility_service.py` — scores cards 1–10 based on price tier (1–4 pts), sold volume (0–3 pts), and supply scarcity (active/sold ratio, 0–3 pts)
- Labels: Bulk (1–2), Common (3–4), Sought After (5–6), Highly Collectible (7–8), Blue Chip (9–10)
- Six-scenario market signal derived from price tier × volume × supply matrix

**Analysis Dashboard:**
- New **Bid/Ask Market Structure** section: two-column display (Bid = sold tiers, Ask = active p10/median/p90) with spread bar and signal label
- New **Collectibility** indicator card (4th in the Key Indicators Grid)
- Removed Market Assessment section (redundant with indicator cards)
- Removed Sales Speed by Price table (redundant with Pricing Recommendations)
- Removed Price Statistics block (Min/Max/Avg); FMV card is now the primary price summary
- Renamed Quick Sale → Discount, Patient Sale → Premium throughout

**Beeswarm Chart:**
- Active listings now plotted as red dots alongside sold listings (blue)
- Three-item legend: Sold Listings / Active Listings / FMV Range
- Axis range driven by sold prices + FMV markers only; active outliers/dreamers clipped rather than expanding the scale
- Axis centered on the midpoint of displayed data for visual balance
- Outlier detection upgraded to interpolated Q1/Q3 percentiles (fixes edge case where Q3 landed on an outlier with small samples)

**Search Logging:**
- `search_logs/` directory captures every search as JSON + CSV for analysis
- Analytics snapshot (posted by frontend after search) now includes: ask p10/median/p90, bid/ask spread, collectibility score/label/scenario
- `backend/routes/dev_log.py` — new fields added to `AnalyticsSnapshot` model

### Version 0.7.0 (Collection Price History & FMV Fix)

**Price History Tracking:**
- When a card is added, the first price history entry uses the purchase price + purchase date (if both are provided); otherwise falls back to current FMV at today's date
- Each FMV update (manual or automated) automatically appends a new price history entry
- Full price history is displayed as a line chart + table inside the Edit Card modal
- Individual history entries can be deleted from the UI; deletions sync immediately to Supabase

**FMV Calculation Fix:**
- The automated price refresh (⏰/⚠️) now uses the same **volume-weighted FMV algorithm** as the Comps & Analysis tab (`calculate_fmv()` from `fmv_service.py`) — volume-weighted mean, IQR outlier removal, skewness correction, and price concentration detection
- Previously used a simple median, which produced incorrect results
- Card-specific filters (`raw_only`, `base_only`) are now applied during automated updates, matching the behavior when the card was originally searched

**Status Column Improvements:**
- ⏰ tooltip: "Click to update price"; clicking triggers immediate FMV refresh
- ⚠️ tooltip: shows flagged reason + "Click to update price"; clicking retries the update
- ✓ tooltip: shows days remaining before next refresh is available

**Filter Persistence:**
- When saving a card from the Comps tab, the active filter checkboxes (Exclude Lots, Raw Only/Ungraded Only, Base Only) are now saved to the card record
- These saved filters are applied automatically during all future automated price updates

**Other Changes:**
- Removed 50% price-change volatility guardrail — FMV always updates regardless of how large the change is
- Minimum sales for FMV update reduced from 3 to 1; zero sales triggers ⚠️ flag
- Sparkline chart removed from binder card table (displayed only in Edit modal)
- Backend: Supabase Postgres connection uses Transaction pooler (port 6543) with SSL and `pgbouncer=true` parameter stripped for psycopg2 compatibility
- Backend: `init_db()` only creates feedback tables when connected to Postgres — existing Supabase collection tables are never altered on startup

### Version 0.6.0 (Grading Advisor)

Version 0.6.0 introduces a full backend-powered "Grading Advisor" system with comprehensive API support, Pydantic models, a dedicated service layer, and new endpoints for intelligent grading analysis.

- [`backend/models/grading_advisor_schemas.py`](backend/models/grading_advisor_schemas.py) — Pydantic models
- [`backend/routes/grading_advisor.py`](backend/routes/grading_advisor.py) — API endpoints
- [`backend/services/grading_advisor_service.py`](backend/services/grading_advisor_service.py) — Business logic
- [`static/js/grading-advisor.js`](static/js/grading-advisor.js) — Frontend module
- [`static/css/grading-advisor.css`](static/css/grading-advisor.css) — Styles

### Version 0.5.2 (First-Time User Onboarding)

- **Interactive 9-Step Tour**: Guides new users through main features using Driver.js v1.3.1
- **Smart Auto-Start**: Tour auto-starts for first-time visitors only (localStorage persistence)
- **Manual Restart**: "Take a Tour" link in footer
- Files: [`static/js/onboarding.js`](static/js/onboarding.js), [`static/css/onboarding.css`](static/css/onboarding.css)

### Version 0.5.1 (UX Improvements)

- **WCAG 2.1 Level AA Compliance**: All color contrast ratios meet 4.5:1 minimum
- **CSS Extraction**: ~1,856 lines of inline CSS extracted to `style.css`
- **Reusable Modal Component**: [`static/js/modal.js`](static/js/modal.js) with focus trapping, ARIA, escape key

### Version 0.5.0 (Production Beta)

- Test suite consolidated under [`tests/`](tests/)
- Migration scripts removed from root
- Streamlined project structure

### Version 0.4.0

- Complete modular backend restructure
- Redis caching, advanced rate limiting, ML/analytics integration
- Sentry monitoring, custom `/metrics` endpoint
- Analytics Dashboard with market pressure analysis, liquidity profiles, and persona-based recommendations
- Grading Intelligence tab, mobile-first responsive design, SEO enhancements

### Version 0.3.0
- Dual-search display with automatic sold + active listings
- Active listings filtered to show only items at or below FMV
- Buy It Now Only filter, improved auction detection

### Version 0.2.x
- Find Deals functionality with `/deals` endpoint
- Base Only, Exclude Autographs, combined filter support

### Version 0.1.0 (Initial Release)
- Basic eBay sold listings scraping
- Simple price statistics (min, max, average)
- SearchAPI.io integration
