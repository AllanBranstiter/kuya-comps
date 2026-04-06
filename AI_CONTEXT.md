# AI Context: Kuya Comps

> **Purpose:** This document provides context for AI assistants working on this project. It should be shared at the start of each new task to minimize token usage and accelerate onboarding.

**Last Updated:** April 6, 2026
**Version:** 1.0.0
**Maintained By:** Allan Branstiter

---

## 🎯 Project Overview

### What This Project Does
Kuya Comps is a FastAPI web application that scrapes and analyzes eBay baseball card sold/active listings, calculates fair market values using ML algorithms, and helps collectors find underpriced cards in real-time. It provides dual search display showing both historical sold data and current active listings priced below market value. Now includes comprehensive collection management with automated valuation updates.

### Key Features
- **Dual Search Display:** Automatically shows both sold listings and active listings below FMV
- **Smart Deal Finding:** Active listings filtered to show only items priced at or below Fair Market Value with discount indicators
- **Market Analysis:** Blended FMV using both sold comps (bid) and active listings (ask), with Discount/Market Value/Premium ranges
- **AI Market Summary:** After each FMV calculation, a plain-English summary describes market conditions, price direction, and ease of buying/selling — with a deal alert when active listings are below market value. Tier-aware model selection (Founders: Claude Sonnet; others: Gemini Flash 2.0). Graceful degradation if API key is absent or call fails.
- **Sales vs. Listed Now:** Side-by-side panel showing recent sold comps (Discount/Market Value/Premium) vs. active listing prices (Low/Median/High) with a plain-English price gap signal
- **Collectibility Score:** 1–10 score based on price tier and sales volume (supply/demand balance is captured separately in Market Activity)
- **Interactive Visualization:** Beeswarm chart showing sold (blue) and active (red) price distributions with outlier clipping
- **Grading Advisor:** Backend-powered intelligent grading recommendations with grade value analysis, premium calculations, and market comparisons across grading companies (PSA, BGS, SGC, CGC)
- **Advanced Analytics Dashboard:** Asking vs. Sold indicator, liquidity profiles, absorption ratios
- **Collection Management (NEW):** Track card collections with binders and smart organization
- **Editable Search Queries (NEW):** Edit search queries in Edit Card modal to refine automated valuations
- **Automated Valuation Engine (NEW):** Automatic FMV updates every 90 days with safety checks
- **User Authentication:** Supabase-based auth with session management and route gating
- **Portfolio Dashboard:** Save searches and view collection overview with ROI tracking

### Target Users
Baseball card collectors and flippers who want to:
- Find fair market values for cards before buying or selling
- Identify underpriced listings on eBay
- Compare prices across different grading companies and grades using Grading Advisor
- Make data-driven pricing decisions
- Track and manage their personal card collections
- Monitor portfolio value and ROI over time

---

## 🏗️ Architecture Overview

### Tech Stack

#### Backend
- **Framework:** FastAPI
- **Language:** Python 3.11+
- **Server:** uvicorn (development) / gunicorn (production)
- **Database:** SQLite with SQLAlchemy ORM (local collections), Supabase PostgreSQL (user auth & saved searches)
- **Authentication:** Supabase Auth with JWT tokens
- **Caching:** Redis with aioredis
- **Key Libraries:** scikit-learn, numpy, pandas, slowapi, sentry-sdk

#### Frontend
- **Framework:** Vanilla HTML, CSS, and JavaScript
- **Styling:** Custom CSS with CSS variables for theming
- **Build Tool:** None (static files)
- **State Management:** None (vanilla JS)
- **Authentication UI:** Supabase Auth modal with email/password and social logins

#### Infrastructure
- **Hosting:** Railway (primary), Render (alternative)
- **Database:** Supabase (PostgreSQL) for user data, SQLite for local collections
- **CI/CD:** GitHub Actions
- **Monitoring:** Sentry (production), custom `/metrics` endpoint
- **Cron Jobs:** Automated valuation updates (Phase 4)

### System Architecture
```
Frontend (static/) → FastAPI App (main.py) → External APIs (SearchAPI.io, eBay Browse API)
                                           ↓
                    Supabase Auth ← → Supabase PostgreSQL (user data, saved searches)
                                           ↓
                                         Redis Cache
                                           ↓
                                      SQLite Database (feedback.db, collections)
                                           ↓
                                      Cron Job (Automated Valuation)
```

---

## 📁 Project Structure

```
kuya-comps/
├── backend/              # All server-side logic
│   ├── routes/          # API endpoint handlers
│   │   ├── comps.py     # /comps and /active endpoints
│   │   ├── fmv.py       # /fmv endpoint
│   │   ├── health.py    # Health check endpoints
│   │   ├── feedback.py  # User feedback submission
│   │   ├── admin_feedback.py  # Admin dashboard API
│   │   ├── market_messages.py # Market message content
│   │   ├── collection_valuation.py # Card valuation endpoints (Phase 4)
│   │   └── grading_advisor.py  # API endpoints for grading analysis
│   ├── services/        # Business logic
│   │   ├── fmv_service.py         # FMV calculations
│   │   ├── analytics_score_service.py  # Market Confidence, Liquidity, Collectibility, Asking vs. Sold
│   │   ├── relevance_service.py   # AI-powered listing relevance scoring (OpenRouter/Gemini)
│   │   ├── market_summary_service.py  # AI Market Summary (OpenRouter; tier-aware model selection)
│   │   ├── feedback_service.py    # Feedback CRUD
│   │   ├── intelligence_service.py # Market intelligence
│   │   ├── market_message_service.py
│   │   ├── price_tier_service.py
│   │   ├── collection_service.py  # Collection & binder management (Phase 2)
│   │   ├── valuation_service.py   # Automated valuation engine (Phase 4)
│   │   └── grading_advisor_service.py  # Business logic for grading recommendations (816 lines)
│   ├── models/          # Data models & schemas
│   │   ├── schemas.py   # Pydantic models
│   │   ├── feedback.py  # Feedback request/response models
│   │   ├── validators.py
│   │   ├── collection_schemas.py  # Collection/binder models (Phase 2)
│   │   └── grading_advisor_schemas.py  # Pydantic models for Grading Advisor API
│   ├── middleware/      # Request processing chain
│   │   ├── request_id.py    # Request ID tracking
│   │   ├── metrics.py       # Performance metrics
│   │   ├── security.py      # Security headers
│   │   ├── admin_auth.py    # Admin authentication
│   │   └── supabase_auth.py # Supabase user authentication (Phase 2)
│   ├── database/        # Database connection & schema
│   │   ├── connection.py
│   │   └── schema.py    # SQLAlchemy models
│   ├── config.py        # Configuration management
│   ├── cache.py         # Redis caching layer
│   └── logging_config.py
├── static/              # Frontend files
│   ├── index.html       # Main application
│   ├── admin-feedback.html  # Admin dashboard
│   ├── script.js        # Main JavaScript
│   ├── css/            # Stylesheets
│   │   ├── collection.css  # Collection modal styles (Phase 1)
│   │   ├── feedback.css    # Feedback widget styles
│   │   └── grading-advisor.css  # Styles for Grading Advisor (1,346 lines)
│   └── js/             # JavaScript modules
│       ├── config.js    # Frontend configuration
│       ├── charts.js    # Visualization
│       ├── analysis.js  # Market analysis
│       ├── rendering.js # UI rendering
│       ├── validation.js
│       ├── errorHandler.js
│       ├── loadingStates.js
│       ├── auth.js      # Supabase authentication (Phase 2)
│       ├── collection.js # Collection modal & management (Phase 1)
│       ├── contentLoader.js # Dynamic content loading
│       ├── feedback.js  # Feedback widget
│       └── grading-advisor.js  # Frontend for Grading Advisor tab (1,055 lines)
├── tests/               # Test suite
│   ├── conftest.py
│   ├── routes/
│   └── services/
├── docs/                # Documentation
│   ├── SECURITY.md
│   ├── deployment.md
│   ├── runbook.md
│   ├── COLLECTIONS_PHASE2_QUICKSTART.md
│   ├── MARKET_MESSAGES_GUIDE.md
│   └── archive/         # Archived implementation docs
├── alembic/             # Database migrations
│   └── versions/
│       ├── 001_add_collections_binders_schema_phase2.py
│       └── d52e4a2e9844_add_database_indexes_for_phase4.py
├── main.py              # Application entry point
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variable template
├── Procfile             # Production startup command
├── railway.toml         # Railway configuration
└── README.md            # Project documentation
```

### Key Files & Their Purpose

| File | Purpose | Important Notes |
|------|---------|-----------------|
| [`main.py`](main.py:1) | Application entry point, middleware setup | Middleware executes in reverse order of definition |
| [`backend/config.py`](backend/config.py:1) | Centralized configuration constants | All magic numbers and settings live here |
| [`backend/routes/comps.py`](backend/routes/comps.py:1) | /comps and /active endpoints | Main search functionality |
| [`backend/routes/fmv.py`](backend/routes/fmv.py:1) | POST /fmv (legacy) and POST /fmv/v2 (blended) | v2 is the active endpoint |
| [`backend/services/fmv_service.py`](backend/services/fmv_service.py:1) | calculate_fmv() + calculate_fmv_blended() | v2 blend uses price tier × supply ratio table |
| [`backend/services/collectibility_service.py`](backend/services/collectibility_service.py:1) | Collectibility score (1–10) | price_tier + volume components (scarcity removed — captured by Market Activity) |
| [`backend/services/search_log_service.py`](backend/services/search_log_service.py:1) | Saves every search to search_logs/ as JSON + CSV | Dev only — gitignored |
| [`backend/routes/dev_log.py`](backend/routes/dev_log.py:1) | POST /api/dev/analytics-snapshot | Frontend posts analytics after dashboard renders |
| [`backend/routes/collection_valuation.py`](backend/routes/collection_valuation.py:1) | Card valuation API (Phase 4) | Manual & batch FMV updates |
| [`backend/services/analytics_score_service.py`](backend/services/analytics_score_service.py:1) | Market Confidence, Liquidity, Collectibility, Asking vs. Sold scores | Unified analytics score engine; replaces collectibility_service |
| [`backend/services/relevance_service.py`](backend/services/relevance_service.py:1) | AI-powered listing relevance scoring | Uses Gemini 2.0 Flash Lite via OpenRouter; chunks 20 listings/call |
| [`backend/services/market_summary_service.py`](backend/services/market_summary_service.py:1) | AI Market Summary generation | Quality + signal gates; tier-aware model (Founders: Claude Sonnet, others: Gemini Flash 2.0); never raises |
| [`backend/services/fmv_service.py`](backend/services/fmv_service.py:1) | FMV business logic | Volume-weighted calculations |
| [`backend/services/collection_service.py`](backend/services/collection_service.py:1) | Collection & binder CRUD | Manages user collections |
| [`backend/services/valuation_service.py`](backend/services/valuation_service.py:1) | Automated valuation engine | Safety checks, outlier removal |
| [`backend/database/schema.py`](backend/database/schema.py:1) | SQLAlchemy models | All database tables |
| [`backend/middleware/supabase_auth.py`](backend/middleware/supabase_auth.py:1) | Supabase authentication | JWT token verification |
| [`static/js/config.js`](static/js/config.js:1) | Frontend configuration | API endpoints, timeouts, colors |
| [`static/js/auth.js`](static/js/auth.js:1) | User authentication module | Supabase integration |
| [`static/js/collection.js`](static/js/collection.js:1) | Collection modal & parsing | Smart search string parser |
| [`cron_update_valuations.py`](cron_update_valuations.py:1) | Automated valuation cron job | Runs daily to update card values |
| [`backend/models/grading_advisor_schemas.py`](backend/models/grading_advisor_schemas.py:1) | Pydantic request/response models for Grading Advisor API | Request validation & response formatting |
| [`backend/routes/grading_advisor.py`](backend/routes/grading_advisor.py:1) | REST API endpoints for grading analysis | Routes for grading recommendations |
| [`backend/services/grading_advisor_service.py`](backend/services/grading_advisor_service.py:1) | Core business logic for grade value analysis and recommendations | 816 lines of grading logic |
| [`static/js/grading-advisor.js`](static/js/grading-advisor.js:1) | Frontend JavaScript for Grading Advisor UI | 1,055 lines |
| [`static/css/grading-advisor.css`](static/css/grading-advisor.css:1) | CSS styles for Grading Advisor components | 1,346 lines |

---

## 🔑 Core Concepts & Patterns

### Important Design Decisions

1. **Middleware Execution Order**
   - **Why:** FastAPI executes middleware in reverse order of [`add_middleware()`](main.py:119) calls
   - **Impact:** Request processing flows: RequestID → Metrics → Security
   - **Code Reference:** [`main.py:119-122`](main.py:119)

2. **API Keys Server-Side Only**
   - **Why:** Security - never expose credentials to frontend
   - **Impact:** All external API calls must route through backend
   - **Implementation:** Environment variables loaded in [`backend/config.py`](backend/config.py:1)

3. **Aggressive Redis Caching**
   - **Why:** SearchAPI.io has per-request costs
   - **Impact:** 30-minute TTL for sold listings, 5-minute for active
   - **Implementation:** [`backend/cache.py`](backend/cache.py:1)

4. **Async Screenshot Processing**
   - **Why:** Large screenshots slow down API responses
   - **Impact:** Screenshots stored via BackgroundTasks
   - **Implementation:** [`backend/routes/feedback.py`](backend/routes/feedback.py:1)

5. **Supabase Authentication**
   - **Why:** Secure, scalable user management without managing auth ourselves
   - **Impact:** JWT-based authentication, social logins, password recovery
   - **Implementation:** [`backend/middleware/supabase_auth.py`](backend/middleware/supabase_auth.py:1), [`static/js/auth.js`](static/js/auth.js:1)

6. **Automated Valuation with Safety Checks**
   - **Why:** Keep collection values current without manual updates
   - **Impact:** Daily cron job updates FMV with keyword firewall, outlier removal, volatility guardrails
   - **Implementation:** [`backend/services/valuation_service.py`](backend/services/valuation_service.py:1), [`cron_update_valuations.py`](cron_update_valuations.py:1)

7. **Smart Collection Parser**
   - **Why:** Reduce data entry friction when adding cards
   - **Impact:** Auto-fills year, set, athlete, card number from search query
   - **Implementation:** [`static/js/collection.js:parseSearchString()`](static/js/collection.js:1)

8. **Editable Search Queries in Edit Card Modal**
   - **Why:** Allow users to refine search queries for automated valuations (e.g., after grading)
   - **Impact:** Edit Card modal includes "Search & Automation" section with search_query_string field
   - **Implementation:** [`static/js/collection.js`](static/js/collection.js:1) - Lines ~1550-1567 (HTML), Line ~1635 (handleEditCard)
   - **Data Safety:** Price history preserved (separate table, no cascade on updates)

9. **Card Context Menus**
   - **Why:** Provide full card management capabilities within binders
   - **Impact:** Card context menu shows Edit, Move, and Delete options
   - **Implementation:** [`static/js/collection.js:showCardContextMenu()`](static/js/collection.js:1766)
   - **Note:** Move functionality fully integrated - users can reorganize cards between binders

10. **Grading Advisor Backend Architecture**
    - **Why:** Grading Advisor was implemented with full backend support (unlike the previous frontend-only Grading Intelligence) to enable:
      - Server-side data aggregation from multiple sources
      - Caching of population reports and market data
      - More complex calculations without client-side performance impact
      - Future AI/ML integration for grading predictions
    - **Impact:** Clean separation of concerns, better maintainability, improved performance
    - **Implementation:** [`backend/services/grading_advisor_service.py`](backend/services/grading_advisor_service.py:1), [`backend/routes/grading_advisor.py`](backend/routes/grading_advisor.py:1)

11. **Modern Options Button Design**
   - **Why:** Improved visual hierarchy, better accessibility, larger touch targets
   - **Impact:** Replaced Unicode "⋮" with pill-shaped buttons featuring three CSS dots
   - **Design:** 12px border-radius, #f5f5f7 background, blue (#007aff) hover state
   - **Implementation:** [`static/js/collection.js`](static/js/collection.js:788) (binder), Line 1033 (card row)

11. **AI Relevance Scoring**
    - **Why:** eBay searches return noise — lots, reprints, digital cards, wrong grades — that distort FMV
    - **Impact:** Each listing receives a 0.0–1.0 relevance score used as a weight multiplier in FMV; irrelevant listings have near-zero influence
    - **Implementation:** [`backend/services/relevance_service.py`](backend/services/relevance_service.py:1) — LLM call to Gemini 2.0 Flash Lite via OpenRouter; chunked in batches of 20; graceful fallback to uniform weights if API key absent or chunk fails
    - **Config:** `OPENROUTER_API_KEY` env var required; model: `google/gemini-2.0-flash-lite-001`

12. **Unified Analytics Score Engine**
    - **Why:** Analytics scores (Confidence, Liquidity, Collectibility, Asking vs. Sold) were scattered and used hard thresholds that caused cliff effects
    - **Impact:** All four scores now computed in one service using continuous/log-scaled algorithms; consistent with FMV's view of the data
    - **Implementation:** [`backend/services/analytics_score_service.py`](backend/services/analytics_score_service.py:1)

13. **Asking vs. Sold (formerly "Market Pressure")**
    - **Why:** The original "Market Pressure" metric used named status bands (HEALTHY, OPTIMISTIC, RESISTANCE, UNREALISTIC) that overstated confidence in the signal. The metric reliably tells you the gap between current asking prices and recent sold prices, but cannot reliably predict whether that gap represents a buying opportunity or a declining market.
    - **Impact:** Renamed to "Asking vs. Sold." Removed status bands and the info button. Card now leads with the plain-English sentence describing the gap, with the percentage demoted to supporting detail. Card is hidden entirely when sample size < 5. Purple styling (#5856d6 / lavender gradient).
    - **Label logic:** Within ±1% → "Asking prices match recent sales." | +1–15% → "slightly above" | +16–30% → "noticeably more" | +31–50% → "significantly more" | >50% → "far above what this card has actually sold for" | -1 to -15% → "slightly below" | <-15% → "well below"
    - **Implementation:** [`static/script.js`](static/script.js:1) — label assignment and card HTML

14. **FMV Reliability Card (formerly "Market Confidence")**
    - **Why:** The 0–100 score had no intuitive meaning to collectors. The card also showed CoV and Std Dev in the footer, which are opaque metrics. The user's real question is "can I trust this FMV?" — so the card was redesigned to answer that directly.
    - **Impact:** Renamed to "FMV Reliability." Score number dropped entirely. Headline is now a plain-English tier statement ("Prices vary a lot"). Body is a one-sentence implication ("Take the FMV as a rough guide only."). Footer shows only "Based on N sales." CoV, Std Dev, and info button removed. Blue styling retained for visual distinction from other cards.
    - **Band → display mapping:**
      - Excellent (≥85): "Prices are very consistent" / "Sales cluster tightly — the FMV is reliable."
      - Good (≥70): "Prices are fairly consistent" / "Some spread, but the FMV is a solid estimate."
      - Moderate (≥55): "Prices vary noticeably" / "The FMV is a reasonable midpoint, not a precise value."
      - High Variation (≥40): "Prices vary a lot" / "Take the FMV as a rough guide only."
      - Chaotic (<40): "Prices are all over the place" / "The FMV has limited reliability here."

15. **Market Activity Card (formerly "Liquidity")**
    - **Why:** The original metric presented an absorption ratio as a 0–100 score with labels like "Low Liquidity." Two fundamental problems surfaced: (1) sell speed depends heavily on ask price, which we don't control; (2) we don't know when sold listings actually sold within the 90-day window — we only have `date_scraped`. Predicting "days to sell" or using "Sell Speed" as a label overstates confidence in the data.
    - **Impact:** Renamed to "Market Activity." Numeric score and absorption ratio removed from display. Info button removed. Card now describes market conditions (demand vs. supply balance), not seller outcomes. Headline and body use market-landscape framing, not timing predictions.

16. **Collectibility Score — Scarcity Component Removed**
    - **Why:** The original formula combined price (1–4), volume (0–3), and scarcity (0–3, based on active-to-sold ratio) into a 1–10 score. The scarcity component was measuring supply/demand balance — the same signal already captured by the Market Activity card's absorption ratio. Keeping it in Collectibility created redundancy and muddied what the score was communicating.
    - **Impact:** Scarcity component removed. Price rescaled to 1–6, volume rescaled to 0–4 to maintain the 1–10 range. The score now cleanly answers: "Is this a card that commands high prices and has an established sales history?" Supply/demand balance is the Market Activity card's job.
    - **Files changed:** `backend/services/analytics_score_service.py` (formula), `backend/services/fmv_service.py` (call site), `static/script.js` (fallback formula, scenario strings, card footer)
    - **`collectibilityScenario` strings simplified** from 6 conditions (using highFMV/highVolume/highSupply) to 4 (highFMV/highVolume only). Card footer now shows "Sold: N comps | FMV: $X" instead of "Sold: N comps | Active: N listings."
    - **Tier → display mapping:**
      - High Liquidity (absorption ≥ 1.0): "Buyers are active" / "Recent sales are outpacing active listings — demand is strong relative to supply."
      - Moderate Liquidity (0.5–1.0): "Moderate buyer interest" / "Balanced market with healthy buyer activity relative to current supply."
      - Low Liquidity (0.2–0.5): "More sellers than buyers" / "Active listings outnumber recent sales — buyers have plenty of options."
      - Very Low Liquidity (<0.2): "Few active buyers" / "Very few recent buyers relative to current supply — a thin market."
    - **Footer:** "X recent sales vs. Y active listings" — raw signal, no derived conclusions.
    - **Implementation:** [`static/script.js`](static/script.js:1) — card HTML only; backend `calculate_liquidity()` in `analytics_score_service.py` unchanged.
    - **Backend change:** Market Confidence now uses a relevance-filtered price array (threshold `ai_relevance_score >= 0.5`) before computing CoV. Items below the threshold are excluded entirely — not just down-weighted — so CoV reflects genuine market variation rather than search noise from reprints, lots, and parallels. FMV calculations are unaffected. IQR outlier filtering still runs on the cleaned set. Falls back to full dataset gracefully if no relevance scores are present.
    - **Implementation:** [`backend/services/fmv_service.py`](backend/services/fmv_service.py:1) — relevance filter at call site in `calculate_fmv_blended()`; [`static/script.js`](static/script.js:1) — card HTML

### Data Flow Patterns

**Example: Search Request Flow**
```
1. User submits search → Frontend (script.js)
2. GET /comps → Backend (routes/comps.py)
3. Check Redis cache → (cache.py)
4. If miss: Call SearchAPI.io → (scraper.py)
5. Process & cache result (30 min TTL)
6. Return to frontend
7. Render results + beeswarm chart
```

**Example: Blended FMV Calculation Flow (v0.8.0)**
```
1. Sold search completes → data available
2. Active search completes → secondData available
3. renderData(data, secondData, marketValue) called
4. updateFmv(data, secondData) → POST /fmv/v2
5. Backend: calculate_fmv_blended(sold_items, active_items)
   - Bid center: volume-weighted percentiles of sold comps
   - Ask center: median of active prices
   - Price tier: Bulk/Low/Mid/Grail from bid center
   - Supply ratio: active_count / sold_count
   - Blend weight: from 4×3 table (tier × supply)
   - Override: bid_weight = max(w, 0.85) if ask > 2× bid
   - Discount = p25_sold * w + p10_active * (1-w)
   - Premium = p75_sold * w' + p90_active * (1-w'), w' = min(w+0.10, 0.95)
   - Clamp: Discount ≤ Market Value ≤ Premium
6. Return Discount / Market Value / Premium
7. renderAnalysisDashboard renders with blended FMV
```

**Example: FMV Calculation Flow (legacy /fmv)**
```
1. GET /fmv with sold items → (routes/fmv.py)
2. Apply IQR outlier detection → (fmv_service.py)
3. Calculate volume-weighted prices
4. Return quick_sale, market_value, patient_sale ranges
```

**Example: Add Card to Collection Flow (NEW)**
```
1. User clicks "Save to Collection" → (script.js)
2. Check authentication → (auth.js)
3. Open collection modal → (collection.js)
4. Parse search query → Auto-fill card metadata
5. User completes form (condition, price, binder)
6. Submit to backend → Create card in SQLite
7. Card stored with search_query_string for future updates
```

**Example: Automated Valuation Flow (NEW)**
```
1. Cron job runs daily → (cron_update_valuations.py)
2. Query cards with auto_update=TRUE & last_updated > 90 days
3. For each card:
   - Scrape eBay using search_query_string
   - Apply keyword firewall → Filter unwanted listings
   - Remove outliers using IQR
   - Calculate median FMV
   - Check volatility (>50% change?)
   - Update FMV or flag for review
   - Create price_history entry
4. Return batch update summary
```

### Naming Conventions

- **Files:** `snake_case.py`
- **Classes:** `PascalCase`
- **Functions:** `snake_case()`
- **Constants:** `SCREAMING_SNAKE_CASE`
- **Routes:** `/kebab-case`

---

## 🔧 Configuration & Environment

### Required Environment Variables

```bash
# API Keys (Required)
SEARCH_API_KEY=your_searchapi_io_key_here

# eBay API (Required for active listings)
EBAY_APP_ID=your_ebay_app_id_here
EBAY_DEV_ID=your_ebay_dev_id_here
EBAY_CERT_ID=your_ebay_cert_id_here
EBAY_ENVIRONMENT=production

# Supabase (Required for auth & user data)
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI Relevance Scoring (Optional — scoring skipped gracefully if absent)
OPENROUTER_API_KEY=your_openrouter_api_key

# Environment
ENVIRONMENT=development  # or production

# Caching
REDIS_URL=redis://localhost:6379

# Monitoring (Production)
SENTRY_DSN=your_sentry_dsn

# Admin Dashboard
ADMIN_PASSWORD=changeme123  # Change in production!
```

### Configuration Files

- **`.env`** - Local development (never commit)
- **`.env.example`** - Template showing required variables
- **[`backend/config.py`](backend/config.py:1)** - All configuration constants

### Key Configuration Constants

```python
# From backend/config.py
RATE_LIMIT_PER_MINUTE = 10       # API rate limiting
CACHE_TTL_SOLD = 1800            # 30 minutes for sold listings
CACHE_TTL_ACTIVE = 300           # 5 minutes for active listings
MAX_RESULTS_PER_PAGE = 120       # SearchAPI.io limit
IQR_OUTLIER_MULTIPLIER = 0.5     # Outlier detection threshold
MIN_ITEMS_FOR_FMV = 2            # Minimum samples for FMV
```

---

## 🛣️ API Reference

### Main Endpoints

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| GET | `/comps` | Search sold listings | No |
| GET | `/active` | Search active listings | No |
| GET | `/fmv` | Calculate fair market value | No |
| GET | `/health` | Health check | No |
| GET | `/metrics` | Performance metrics | No |
| POST | `/api/feedback` | Submit user feedback | No |
| GET | `/api/feedback/{id}/screenshot` | Get feedback screenshot | No |
| POST | `/admin/login` | Admin login | No |
| GET | `/admin/api/feedback` | List all feedback | Yes (Admin) |
| GET | `/admin/api/stats` | Dashboard statistics | Yes (Admin) |
| GET | `/admin/api/metrics` | Storage metrics | Yes (Admin) |
| POST | `/admin/api/cleanup` | Data retention cleanup | Yes (Admin) |
| GET | `/admin/api/export` | Export feedback to CSV | Yes (Admin) |
| POST | `/api/v1/cards/{id}/update-value` | Manual card valuation update | Yes (User) |
| POST | `/admin/api/valuation/batch-update` | Batch card valuation updates | Yes (Admin) |
| GET | `/admin/api/valuation/stats` | Valuation statistics | Yes (Admin) |

### Example API Calls

**Search Sold Listings:**
```bash
GET /comps?query=Mike+Trout+2011&raw_only=true&base_only=false
```

**Get Fair Market Value:**
```bash
GET /fmv?query=Mike+Trout+2011+PSA+10&grade=10
```

**Search Active Listings:**
```bash
GET /active?query=Mike+Trout+2011&bin_only=true
```

### Grading Advisor Endpoints

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| POST | `/api/grading-advisor/analyze` | Analyze a card for grading value potential | No |
| GET | `/api/grading-advisor/population/{card_id}` | Retrieve population report data for a card | No |

**Analyze Card for Grading:**
```bash
POST /api/grading-advisor/analyze
Content-Type: application/json

{
  "card_id": "123",
  "condition": "near-mint",
  "notes": "clean corners, centered well"
}

# Returns: grade recommendations, value analysis, premium calculations
```

**Get Population Report:**
```bash
GET /api/grading-advisor/population/123

# Returns: population counts by grade across grading companies (PSA, BGS, SGC, CGC)
```

### Response Formats

**Standard Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "metadata": {
    "count": 50,
    "cached": false
  }
}
```

**Error Response:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "details": { ... }
  }
}
```

---

## 🗄️ Database Schema

### SQLite Database Tables (Local)

#### feedback_submissions
```sql
CREATE TABLE feedback_submissions (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    browser TEXT,
    os TEXT,
    screen_resolution TEXT,
    viewport_size TEXT,
    has_screenshot BOOLEAN DEFAULT 0,
    has_annotation BOOLEAN DEFAULT 0,
    annotation_coords TEXT,
    api_state TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT 0,
    is_archived BOOLEAN DEFAULT 0,
    admin_notes TEXT
);

-- Indexes
CREATE INDEX ix_feedback_submissions_session_id ON feedback_submissions(session_id);
CREATE INDEX ix_feedback_submissions_category ON feedback_submissions(category);
CREATE INDEX ix_feedback_submissions_created_at ON feedback_submissions(created_at);
CREATE INDEX ix_feedback_submissions_is_read ON feedback_submissions(is_read);
CREATE INDEX ix_feedback_submissions_is_archived ON feedback_submissions(is_archived);
CREATE INDEX ix_feedback_submissions_timestamp ON feedback_submissions(timestamp);
```

#### feedback_screenshots
```sql
CREATE TABLE feedback_screenshots (
    id INTEGER PRIMARY KEY,
    feedback_id INTEGER NOT NULL,
    screenshot_data TEXT NOT NULL,
    size_kb INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(feedback_id) REFERENCES feedback_submissions(id) ON DELETE CASCADE
);
```

#### binders (Collections - Phase 2)
```sql
CREATE TABLE binders (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cover_card_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cover_card_id) REFERENCES cards(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX ix_binders_user_id ON binders(user_id);
```

#### cards (Collections - Phase 2)
```sql
CREATE TABLE cards (
    id INTEGER PRIMARY KEY,
    binder_id INTEGER NOT NULL,
    
    -- Card Identity
    year TEXT,
    set_name TEXT,
    athlete TEXT NOT NULL,
    card_number TEXT,
    variation TEXT,
    grading_company TEXT,
    grade TEXT,
    image_url TEXT,
    
    -- Search & Logic
    search_query_string TEXT NOT NULL,
    auto_update BOOLEAN DEFAULT 1,
    last_updated_at TIMESTAMP,
    
    -- Financials
    purchase_price DECIMAL(10, 2),
    purchase_date DATE,
    current_fmv DECIMAL(10, 2),
    
    -- Organization
    tags TEXT,
    notes TEXT,
    
    -- Review Flags (Phase 4)
    review_required BOOLEAN DEFAULT 0,
    review_reason TEXT,
    no_recent_sales BOOLEAN DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY(binder_id) REFERENCES binders(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX ix_cards_binder_id ON cards(binder_id);
CREATE INDEX ix_cards_auto_update ON cards(auto_update);
CREATE INDEX ix_cards_last_updated_at ON cards(last_updated_at);
CREATE INDEX ix_cards_review_required ON cards(review_required);
```

#### price_history (Phase 4)
```sql
CREATE TABLE price_history (
    id INTEGER PRIMARY KEY,
    card_id INTEGER NOT NULL,
    value DECIMAL(10, 2) NOT NULL,
    num_sales INTEGER,
    confidence TEXT,
    date_recorded TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX ix_price_history_card_id ON price_history(card_id);
CREATE INDEX ix_price_history_date_recorded ON price_history(date_recorded);
```

### Supabase Database Tables (PostgreSQL)

#### saved_searches (User's saved searches)
```sql
-- Managed by Supabase
-- Schema defined in Supabase dashboard
-- Stores user's saved searches with FMV data
```

### Relationships

- `feedback_submissions` 1:N → `feedback_screenshots` (via `feedback_id`)
- `binders` 1:N → `cards` (via `binder_id`)
- `cards` 1:N → `price_history` (via `card_id`)
- `binders` 1:1 → `cards` (cover_card_id, optional)

### Migrations

**Tool:** Alembic

**Commands:**
```bash
# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

**Migration Files:** [`alembic/versions/`](alembic/versions/)

---

## 🧪 Testing

### Test Structure

```
tests/
├── conftest.py              # Pytest fixtures
├── routes/                  # Route tests
│   ├── test_comps.py
│   ├── test_fmv.py
│   └── test_market_messages.py
└── services/                # Service tests
    ├── test_fmv_service.py
    ├── test_intelligence_service.py
    ├── test_market_message_service.py
    └── test_price_tier_service.py
```

### Running Tests

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/routes/test_comps.py

# Run with coverage
pytest --cov=backend --cov-report=html
```

### Key Test Patterns

```python
# Example test structure
def test_endpoint_success(client):
    """Test successful API call."""
    response = client.get("/comps?query=test")
    assert response.status_code == 200
    assert "data" in response.json()
```

---

## 🔒 Security Considerations

### Security Features

1. **Secret Scanning:** Pre-commit hook using gitleaks
2. **Rate Limiting:** 10 requests/minute per IP (5/hour for feedback)
3. **CORS Configuration:** Restricted to allowed origins
4. **Security Headers:** Added via middleware
5. **Input Validation:** All endpoints validate input via Pydantic
6. **Admin Authentication:** Session-based with 1-hour timeout

### Security Guidelines

- **API Keys:** Never commit to git, use environment variables only
- **Sensitive Data:** Listed in [`.gitignore`](.gitignore)
- **Admin Routes:** Protected by session authentication
- **User Input:** Always validated and sanitized
- **Screenshots:** Size limits (2MB) and format validation

### What's In `.gitignore`

```
.env
*.db
__pycache__/
.pytest_cache/
*.csv
credentials/
*.key
*.pem
```

---

## 🚀 Deployment

### Local Development

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set up environment
cp .env.example .env
# Edit .env with your API keys

# 3. Run migrations
alembic upgrade head

# 4. Start server
uvicorn main:app --reload
```

### Production Deployment

**Platform:** Railway (primary), Render (alternative)

**Required Environment Variables:**
- `SEARCH_API_KEY` (required)
- `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID` (required for active listings)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (required for auth & collections)
- `ENVIRONMENT=production`
- `REDIS_URL` (auto-provided by hosting)
- `SENTRY_DSN` (recommended)
- `ADMIN_PASSWORD` (change from default!)

**Startup Command:**
```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
```

**Configuration Files:** [`Procfile`](Procfile), [`railway.toml`](railway.toml)

---

## 📊 Performance & Optimization

### Caching Strategy

- **Redis:** Caches API responses to minimize external API costs
- **TTL:** 30 minutes for sold listings, 5 minutes for active
- **Cache Keys:** Based on query parameters and filters

### Performance Metrics

- **Response Time:** Target <100ms for cached, <500ms for uncached
- **Rate Limits:** 10 requests/minute per IP
- **Database Queries:** <20ms with proper indexes

### Known Bottlenecks

1. **External API Calls:** SearchAPI.io has per-request cost
   - **Mitigation:** Aggressive Redis caching (30 min TTL)
2. **Large Screenshot Uploads:** Can block response
   - **Mitigation:** Async background processing with BackgroundTasks
3. **FMV Calculations:** ML processing for outlier detection
   - **Mitigation:** Cached results, efficient numpy operations

---

## 🐛 Common Issues & Solutions

### Issue: "SEARCH_API_KEY not configured"
**Solution:** Add `SEARCH_API_KEY` to `.env` file

### Issue: Redis connection failed
**Solution:** 
1. Check Redis is running: `redis-cli ping`
2. Verify `REDIS_URL` in environment
3. App degrades gracefully without Redis

### Issue: Migration conflicts
**Solution:**
```bash
alembic downgrade -1
alembic upgrade head
```

### Issue: "No such column: feedback_submissions.is_read"
**Solution:** Delete `feedback.db` and restart server to recreate with new schema

### Issue: Rate limit errors in development
**Solution:** Increase limit in [`backend/config.py:RATE_LIMIT_PER_MINUTE`](backend/config.py:213)

### Issue: Admin password not working
**Solution:** Set `ADMIN_PASSWORD` environment variable (default: `changeme123`)

---

## 📚 Important Documentation

### Internal Docs

- [`README.md`](README.md) - Project overview and setup
- [`docs/SECURITY.md`](docs/SECURITY.md) - Security guidelines
- [`docs/deployment.md`](docs/deployment.md) - Deployment guide
- [`docs/runbook.md`](docs/runbook.md) - Operational runbook
- [`docs/COLLECTIONS_PHASE2_QUICKSTART.md`](docs/COLLECTIONS_PHASE2_QUICKSTART.md) - Collections setup guide
- [`docs/MARKET_MESSAGES_GUIDE.md`](docs/MARKET_MESSAGES_GUIDE.md) - Market message system

### Phase Implementation Summaries

**Feedback System:**
- [`PHASE1_IMPLEMENTATION_SUMMARY.md`](PHASE1_IMPLEMENTATION_SUMMARY.md) - Feedback backend
- [`PHASE2_IMPLEMENTATION_SUMMARY.md`](PHASE2_IMPLEMENTATION_SUMMARY.md) - Screenshot optimization
- [`PHASE3_IMPLEMENTATION_SUMMARY.md`](PHASE3_IMPLEMENTATION_SUMMARY.md) - Admin dashboard
- [`PHASE4_IMPLEMENTATION_SUMMARY.md`](PHASE4_IMPLEMENTATION_SUMMARY.md) - Production optimizations

**Collections System:**
- [`COLLECTION_PHASE1_IMPLEMENTATION.md`](COLLECTION_PHASE1_IMPLEMENTATION.md) - Collection modal & smart parser
- [`PHASE2_COLLECTIONS_DATABASE_IMPLEMENTATION.md`](PHASE2_COLLECTIONS_DATABASE_IMPLEMENTATION.md) - Database schema
- [`PHASE3_COLLECTIONS_BINDER_VIEW_IMPLEMENTATION.md`](PHASE3_COLLECTIONS_BINDER_VIEW_IMPLEMENTATION.md) - Binder view UI
- [`PHASE4_COLLECTIONS_VALUATION_ENGINE_IMPLEMENTATION.md`](PHASE4_COLLECTIONS_VALUATION_ENGINE_IMPLEMENTATION.md) - Automated valuation

**User Features:**
- [`PHASE2_AUTH_UI_IMPLEMENTATION.md`](PHASE2_AUTH_UI_IMPLEMENTATION.md) - Supabase authentication
- [`PHASE5_IMPLEMENTATION_SUMMARY.md`](PHASE5_IMPLEMENTATION_SUMMARY.md) - User dashboard & route gating

**Security:**
- [`PHASE3_BACKEND_SECURITY_IMPLEMENTATION.md`](PHASE3_BACKEND_SECURITY_IMPLEMENTATION.md) - Backend security

### External References

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SearchAPI.io Docs](https://www.searchapi.io/docs)
- [eBay Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html)
- [Supabase Documentation](https://supabase.com/docs)
- [Railway Docs](https://docs.railway.app/)

---

## 🔄 Development Workflow

### Branch Strategy
- `main` - Production-ready code
- Feature branches for new development
- Direct commits to main for hotfixes

### Code Review Process
- Self-review before merge
- Test locally before pushing

### Release Process
- Push to main triggers Railway deployment
- Monitor Sentry for errors post-deploy
- Check `/health` and `/metrics` endpoints

---

## 📝 Version History & Roadmap

### Current Version: 1.0.0

**Recent Changes (v1.0.0 — AI Market Summary):**
- **`backend/services/market_summary_service.py`** (new): Generates a 2–3 sentence plain-English market summary after each FMV calculation. Quality gate (skips on insufficient data) + signal gate (at least one meaningful condition required). Alerts collectors to below-FMV active listings including the lowest price. Tier-aware model selection: Founders get `anthropic/claude-sonnet-4-5`, all others get `google/gemini-2.0-flash-001` via OpenRouter. Never raises — all failures return `None` silently.
- **`backend/models/schemas.py`:** `FmvResponse` — added `market_summary: Optional[str] = None`.
- **`backend/routes/fmv.py`:** `get_fmv_v2` changed to `async def`; added `user` dependency via `get_current_user_optional`; computes below-FMV active listing prices and passes them to the summary service alongside sold count, active count, and resolved user tier.
- **`static/script.js`:** Renders `.market-summary-panel` below the FMV card when `fmvData.market_summary` is present. Text escaped via `escapeHtml`.
- **`static/style.css`:** Added `.market-summary-panel`, `.market-summary-header`, `.market-summary-text` — styled to match the Discount/Market Value/Premium stat boxes.

**Previous Changes (v0.9.8 — Bid/Ask section reframed for casual users):**
- **`static/script.js`:** "Bid / Ask Market Structure" section renamed and relabeled throughout. Section title → "Sales vs. Listed Now". Left panel header → "Recent Sales — What cards have sold for". Right panel header → "Listed Now — What sellers are asking". Right panel rows: "Floor (p10)" → "Low", "Median Ask" → "Median", "Ceiling (p90)" → "High". Bottom bar label "Spread" → "Price Gap". All five spread signal strings rewritten in plain English (e.g., "Tight spread — strong market consensus" → "Sellers and buyers agree on price"). Fallback text updated to match.
- **Rationale:** The stock-market terminology (Bid/Ask, spread, p10/p90) was not meaningful to casual card collectors. The section now communicates the same data in plain language: what cards sold for recently vs. what sellers are asking right now.

**Previous Changes (v0.9.7 — Collectibility score scarcity component removed):**
- **`backend/services/analytics_score_service.py`:** `calculate_collectibility()` — removed `active_count` parameter and scarcity component (0–3, active-to-sold ratio). Price component rescaled 1–4 → 1–6; volume component rescaled 0–3 → 0–4. Score range remains 1–10.
- **`backend/services/fmv_service.py`:** Removed `active_count` argument from the `calculate_collectibility()` call.
- **`static/script.js`:** Fallback formula updated to match (no scarcity term, rescaled price/volume steps). `collectibilityScenario` simplified from 6 conditions to 4 (highFMV/highVolume only — highSupply removed). Card footer updated: "Active: N listings" → "FMV: $X". Tooltip updated to clarify supply/demand balance is handled by Market Activity.
- **Rationale:** The scarcity component (active-to-sold ratio) was measuring supply/demand balance — the same signal already captured by the Market Activity card. Removing it clarifies the score's meaning: "Is this a card that commands high prices and has an established sales history?"

**Previous Changes (v0.9.6 — Final stale liquidity framing cleanup):**
- **`market_messages_content.json` (root):** Was a stale v1.2.0 copy that never received the v1.3.0 updates. Overwritten with the current `static/market_messages_content.json` — both files are now identical at v1.3.0.
- **`backend/services/grading_advisor_service.py` line 1190:** "this card may be difficult to sell quickly. Lower liquidity means wider bid-ask spreads." → "this card has a smaller secondary market. Lower population typically means wider bid-ask spreads." Timing prediction removed; the bid-ask spread observation (which is a structural claim about thin markets, not a sell-speed prediction) was retained.

**Previous Changes (v0.9.5 — Market Activity framing propagated to script.js):**
- **`static/script.js`:** Same framing corrections applied to the remaining four locations that still used sell-speed language:
  - `FALLBACK_POPUP_LIQUIDITY_RISK` — fully rewritten to match the updated `market_messages_content.json` popup. Title changed to "Market Activity", score-conversion section removed, bands reframed with activity language, Key Principle updated to explicitly state the metric does not predict sell speed.
  - `calculateLiquidityRisk()` message strings — all four replaced: "cards likely sell quickly" / "expect reasonable sell time" / "may need patience or competitive pricing" / "High exit risk - consider pricing at or below FMV" → activity-based descriptions with no timing or pricing prescriptions.
  - Backend-scores liquidity block — same four message strings updated to match.
  - Strong Buy Opportunity block — message changed from "strong demand (liquidity: X/100)" to "strong recent sales activity (market activity: X/100)"; seller advice removed "leaving money on the table" and "Expect fast sales"; flipper advice changed from "Buy quickly" to "Buy at current prices before sellers adjust to the gap."

**Previous Changes (v0.9.4 — Market Activity framing propagated to market messages and analysis.js):**
- **`static/market_messages_content.json` (v1.2.0 → v1.3.0):** All market message bodies and persona advice strings updated to remove timing predictions and sell-speed framing. Key changes:
  - "buyers are active/interested" → "recent sales activity is high/low"
  - "selling quickly", "slow sales", "fast/slow" → removed throughout
  - Pricing recommendations that were tied to absorption as timing (e.g., "price at or below FMV to sell faster") reframed as market-condition observations
  - `liquidityRisk` popup fully rewritten as "Market Activity" — removed sell-speed interpretation, added explicit Key Principle: absorption ratio does not predict how fast your listing will sell
  - All 7 message types updated: `twoTierMarket`, `highRiskConditions`, `overpricedActiveMarket`, `fairPricingLimitedDemand`, `strongBuyOpportunity`, `healthyMarketConditions`, `balancedMarket`
- **`static/js/analysis.js`:** Same framing applied across all helper functions and fallback content:
  - `getSpeedFromAbsorption()` — labels changed from `FAST/NORMAL/SLOW` (with day estimates) to `HIGH/MODERATE/LOW` (activity levels, no timeline)
  - `getSellerQuickTip/getFlipperQuickTip/getCollectorQuickTip` — updated to use new labels, all `.timeline` references removed
  - `getDominantBandStatement()` — "selling very fast/slowly" → "high/low absorption"
  - `getVelocityStatement()` — day/week estimates removed; now describes activity level only
  - `getAbsorptionRatioInterpretation()` — removed "act fast", "deals vanish", "instant sales", "wait times"
  - `getPricingRecommendations()` — "Quick Sale Strategy" → "Competitive Price Strategy"; footer disclaimer added noting absorption ratio is not a sell-time prediction
  - `FALLBACK_MESSAGE_CONTENT` — all timing strings removed ("2-3 weeks", "7-10 day sale", "flip quickly", "Buy NOW", etc.)
- **Rationale:** Absorption ratio measures recent sales relative to current supply. It cannot predict how fast a specific listing sells because (1) sell speed depends on ask price set by the individual seller, and (2) `date_scraped` is not the actual sale date, making velocity estimates falsely precise. All user-facing text now describes market conditions, not seller outcomes.

**Previous Changes (v0.9.3 — Market Activity Card):**
- **Renamed:** "Liquidity" card → "Market Activity"
- **Removed:** 0–100 numeric score, absorption ratio, confidence level, info button — all removed from display
- **Redesigned:** Card now describes market conditions rather than predicting seller outcomes. Headline is a plain-English demand signal ("Buyers are active", "More sellers than buyers", etc.). Body is a one-sentence market-landscape description. Footer shows raw "X recent sales vs. Y active listings."
- **Rationale:** Two data constraints make timing predictions unreliable — (1) sell speed depends on ask price, which varies per seller; (2) `date_scraped` is not the actual sale date, so sales velocity calculations would be falsely precise. The metric honestly measures demand-vs-supply balance, not sell speed.
- **Backend:** No changes — `calculate_liquidity()` in `analytics_score_service.py` is unchanged.

**Previous Changes (v0.9.2 — FMV Reliability Card & Relevance-Filtered Confidence):**
- **Changed:** "Market Confidence" card renamed to "FMV Reliability"
- **Removed:** 0–100 numeric score, CoV%, Std Dev, info button — all removed from the card display
- **Redesigned:** Card now leads with a plain-English headline tier ("Prices vary a lot") and a one-sentence implication ("Take the FMV as a rough guide only."). Footer shows only "Based on N sales."
- **Backend:** `calculate_market_confidence()` in `fmv_service.py` now receives a relevance-filtered price array (`ai_relevance_score >= 0.5`) instead of the raw IQR-filtered array. Low-relevance items (reprints, lots, wrong-product noise) are excluded entirely before CoV is computed. FMV calculations are unaffected. Falls back to full dataset if no scores are present.
- **Changed:** "Asking vs. Sold" card color updated from neutral gray to purple (#5856d6, lavender gradient)

**Previous Changes (v0.9.1 — Asking vs. Sold):**
- **Changed:** "Market Pressure" indicator card renamed to "Asking vs. Sold"
- **Removed:** Status bands (HEALTHY/OPTIMISTIC/RESISTANCE/UNREALISTIC/BELOW FMV), colored gradients per band, info button
- **Added:** Plain-English sentence label describing the gap (e.g. "Sellers are asking noticeably more than recent sales.")
- **Added:** Disclaimer line: "Reflects current asking prices, not a prediction of where prices are headed."
- **Added:** Minimum sample size gate — card hidden entirely when fewer than 5 active listings in sample
- **Simplified:** Neutral gray card styling regardless of pressure value; `marketPressureStatus` and `dataConfidence` variables removed

**Previous Changes (v0.9.0 — AI Relevance Scoring & Analytics Score Engine):**
- **New:** `backend/services/relevance_service.py` — AI-powered listing relevance scoring using Gemini 2.0 Flash Lite (via OpenRouter); scores 0.0–1.0 per listing, used as FMV weight multipliers
- **New:** `backend/services/analytics_score_service.py` — unified engine for Market Confidence (volume-weighted CoV), Liquidity (recency-weighted absorption), Collectibility (continuous log-scaled), and Market Pressure (seller-deduplicated ask vs. FMV)
- **Updated:** `POST /fmv/v2` accepts optional `query` field; returns `sold_relevance_scores` and `active_relevance_scores` arrays when AI scoring runs
- **Updated:** Price bin sizing is now tier-scaled (`PRICE_BIN_SIZE_BULK`, `PRICE_BIN_SIZE_LOW`, `PRICE_BIN_PCT_MID`, `PRICE_BIN_PCT_GRAIL`) — replaces single constant
- **Cleanup:** Phase implementation summary `.md` files removed from project root (superseded by `AI_CONTEXT.md`)

**Previous Changes (v0.8.0 — Blended FMV, Collectibility Score, Bid/Ask Dashboard):**
- **New:** `POST /fmv/v2` — blended FMV using sold comps (bid) + active listings (ask)
- **New:** `backend/services/collectibility_service.py` — 1–10 collectibility score
- **New:** `backend/services/search_log_service.py` + `backend/routes/dev_log.py` — search logging
- **Dashboard:** Sales vs. Listed Now section, Collectibility indicator card
- **Dashboard:** Removed Market Assessment, Sales Speed by Price, Price Statistics block
- **Renamed:** Quick Sale → Discount, Patient Sale → Premium throughout UI
- **Beeswarm:** Active listings plotted as red dots, three-item legend, centered axis, active outliers clipped
- **FMV:** Outlier detection upgraded to interpolated Q1/Q3; `fmv_low`/`fmv_high` retired
- **API:** `CompsResponse` has `search_query_sent` field (exact string sent to SearchAPI)

**Previous Changes (v0.7.0 - Collection Price History & FMV Fix):**
- **Deprecated:** Old frontend-only Grading Intelligence tab (~970 lines removed from script.js, validation.js, style.css)
- **Implemented:** New backend-powered Grading Advisor system
- **Backend Added:**
  - [`grading_advisor_schemas.py`](backend/models/grading_advisor_schemas.py) (243 lines) - Pydantic models
  - [`grading_advisor.py`](backend/routes/grading_advisor.py) (149 lines) - API routes
  - [`grading_advisor_service.py`](backend/services/grading_advisor_service.py) (816 lines) - Business logic
- **Frontend Added:**
  - [`grading-advisor.js`](static/js/grading-advisor.js) (1,055 lines) - UI JavaScript
  - [`grading-advisor.css`](static/css/grading-advisor.css) (1,346 lines) - Styles
- **Features:** Grade value analysis, premium calculations, cross-company market comparisons (PSA, BGS, SGC, CGC)
- **Bug Fix:** Fixed binder collection bug in collection.js

**Previous Changes (v0.5.0 - Collections & Authentication):**
- **User Authentication:** Supabase integration with JWT tokens, social logins
- **Collection Management:** Track card collections with binders and smart organization
- **Smart Collection Parser:** Auto-fills year, set, athlete, card number from search queries
- **Editable Search Queries:** Edit Card modal now includes search_query_string field for refining automated valuations
- **Automated Valuation Engine:** Daily cron job updates card FMV with safety checks (90-day threshold)
  - Keyword firewall (excludes reprints, digital, etc.)
  - IQR outlier removal
  - Volatility guardrails (flags >50% changes)
  - Ghost town detection (no recent sales)
- **Portfolio Dashboard:** Save searches, view collection overview with ROI tracking
- **Route Gating:** Advanced analytics restricted to authenticated users
- **Database Schema:** New tables for binders, cards, price_history
- **Supabase Integration:** PostgreSQL for user data and saved searches
- **UI Improvements:** Modern pill-shaped options buttons with CSS dots, simplified context menus

**Version 0.4.0 (Previous):**
- Complete modular backend restructure ([`/backend/`](backend/))
- Redis caching layer for API cost optimization
- Advanced analytics dashboard with market intelligence
- Feedback system with admin dashboard (Phases 1-4)
- Mobile-first responsive design
- PSA grade intelligence comparison

### Upcoming Features
- [ ] Binder view dashboard with collection overview
- [ ] Card editing and deletion
- [ ] Bulk card import from CSV
- [ ] Price alert notifications
- [ ] Collection sharing/export features
- [ ] Cloud storage for card images (S3/Cloudinary)
- [ ] Multi-admin user support with roles
- [ ] Email notifications for flagged valuations

### Technical Debt
- SQLite for collections (consider PostgreSQL migration for scale)
- In-memory session storage for admin (migrate to Redis for production scale)
- Basic full-text search (consider Elasticsearch at scale)
- Single admin user (needs multi-user support)

---

## 💡 Development Tips for AI Assistants

### When Making Changes

1. **Always check configuration first:** [`backend/config.py`](backend/config.py) for constants
2. **Respect middleware order:** Reverse execution in [`main.py`](main.py:119)
3. **Use existing patterns:** Follow established service/route structure
4. **Update tests:** Add tests for new features in `tests/`
5. **Check security:** Never commit API keys or sensitive data
6. **Run linting:** Ensure code follows project style

### File Restrictions by Mode

- **Architect Mode:** Can only edit `*.md` files
- **Code Mode:** Can edit all code files
- **Debug Mode:** Focus on logging and diagnostics

### Common Tasks

**Add a new API endpoint:**
1. Create route handler in [`backend/routes/`](backend/routes/)
2. Add service logic in [`backend/services/`](backend/services/)
3. Register router in [`main.py`](main.py)
4. Add tests in [`tests/routes/`](tests/routes/)
5. Update this document

**Add a configuration constant:**
1. Add to [`backend/config.py`](backend/config.py)
2. Document in this file under Configuration section
3. Add to `.env.example` if it's an environment variable

**Add database table:**
1. Update [`backend/database/schema.py`](backend/database/schema.py)
2. Create Alembic migration: `alembic revision --autogenerate -m "description"`
3. Test migration: `alembic upgrade head`
4. Document schema in this file

---

## 🤝 Team Context

### Key Decisions & Why

1. **Why FastAPI over Flask/Django?**
   - Modern async support for external API calls
   - Automatic API documentation (OpenAPI/Swagger)
   - Type hints and Pydantic validation built-in

2. **Why SQLite over PostgreSQL for collections?**
   - Simpler deployment for current scale
   - Sufficient for personal collection usage
   - Can migrate to PostgreSQL if needed
   - Supabase PostgreSQL used for user auth/saved searches

3. **Why vanilla JavaScript over React?**
   - Simpler stack, faster initial load
   - Easier to maintain for single developer
   - No build step required

4. **Why SearchAPI.io over direct eBay API?**
   - eBay API doesn't support sold listings
   - SearchAPI provides unified interface
   - Caching reduces per-request costs

5. **Why Supabase for authentication?**
   - Managed auth service (no auth code to maintain)
   - Built-in social logins and password recovery
   - PostgreSQL database for user data
   - Row-level security for data isolation

6. **Why automated valuation with safety checks?**
   - Keep collection values current without manual effort
   - Safety checks prevent bad data from corrupting FMV
   - Manual review flags for high volatility (>50% changes)
   - Keyword firewall excludes reprints, digital, lots

### Project Constraints

- **Budget:** Minimize API costs (hence aggressive caching)
- **Scale:** Expected <1000 users initially
- **Timeline:** Solo development, iterative releases

---

## 📞 Getting Help

### Resources
- **Documentation:** [`/docs`](docs/) directory
- **Phase Summaries:** `PHASE*_IMPLEMENTATION_SUMMARY.md` files
- **API Docs:** `http://localhost:8000/docs` (Swagger UI)

### Contact
- **Maintainer:** Allan Branstiter

---

## 🔍 Quick Reference

### Most Important Files

When starting a new task, review these first:

1. [`README.md`](README.md) - Project overview
2. This file (`AI_CONTEXT.md`) - Complete context
3. [`backend/config.py`](backend/config.py) - All settings
4. [`main.py`](main.py) - Application structure
5. [`.env.example`](.env.example) - Required environment setup

### Critical Patterns to Remember

- ⚠️ Middleware executes in **reverse order** of definition
- ⚠️ API keys **server-side only**, never in frontend
- ⚠️ Use Redis caching to minimize API costs
- ⚠️ All database changes require Alembic migration
- ⚠️ Rate limiting is 10 requests/minute per IP
- ⚠️ Screenshots processed async via BackgroundTasks
- ⚠️ Admin password default is `changeme123` - change in production!
- ⚠️ Collections use SQLite locally, user auth uses Supabase PostgreSQL
- ⚠️ Automated valuation has safety checks: keyword firewall, outlier removal, volatility guardrails
- ⚠️ Cards flagged for review (>50% price change) require manual approval
- ⚠️ Smart parser extracts metadata from search queries to reduce data entry

### Project Maturity

**Project Maturity:** Production (Beta v0.9.8)
**Test Coverage:** Partial (core services covered)
**Documentation:** Complete
**Active Development:** Yes
**Collections Feature:** Production-ready with automated valuation

---

*This document should be updated whenever significant architectural decisions are made or project structure changes. Keep it current to maximize its value for AI assistance.*