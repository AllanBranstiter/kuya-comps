# AI Context: Kuya Comps

> **Purpose:** This document provides context for AI assistants working on this project. It should be shared at the start of each new task to minimize token usage and accelerate onboarding.

**Last Updated:** January 20, 2026
**Version:** 0.5.0
**Maintained By:** Allan Branstiter

---

## 🎯 Project Overview

### What This Project Does
Kuya Comps is a FastAPI web application that scrapes and analyzes eBay baseball card sold/active listings, calculates fair market values using ML algorithms, and helps collectors find underpriced cards in real-time. It provides dual search display showing both historical sold data and current active listings priced below market value. Now includes comprehensive collection management with automated valuation updates.

### Key Features
- **Dual Search Display:** Automatically shows both sold listings and active listings below FMV
- **Smart Deal Finding:** Active listings filtered to show only items priced at or below Fair Market Value with discount indicators
- **Market Analysis:** Fair Market Value calculations with Quick Sale/Patient Sale ranges using ML
- **Interactive Visualization:** Beeswarm chart showing price distribution
- **Grading Intelligence:** Compare prices across different grading companies and grades with intelligent recommendations
- **Advanced Analytics Dashboard:** Market pressure analysis, liquidity profiles, absorption ratios
- **Collection Management (NEW):** Track card collections with binders and smart organization
- **Editable Search Queries (NEW):** Edit search queries in Edit Card modal to refine automated valuations
- **Automated Valuation Engine (NEW):** Automatic FMV updates every 90 days with safety checks
- **User Authentication:** Supabase-based auth with session management and route gating
- **Portfolio Dashboard:** Save searches and view collection overview with ROI tracking

### Target Users
Baseball card collectors and flippers who want to:
- Find fair market values for cards before buying or selling
- Identify underpriced listings on eBay
- Compare prices across different grading companies and grades using Grading Intelligence
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
│   │   └── collection_valuation.py # Card valuation endpoints (Phase 4)
│   ├── services/        # Business logic
│   │   ├── fmv_service.py         # FMV calculations
│   │   ├── feedback_service.py    # Feedback CRUD
│   │   ├── intelligence_service.py # Market intelligence
│   │   ├── market_message_service.py
│   │   ├── price_tier_service.py
│   │   ├── collection_service.py  # Collection & binder management (Phase 2)
│   │   └── valuation_service.py   # Automated valuation engine (Phase 4)
│   ├── models/          # Data models & schemas
│   │   ├── schemas.py   # Pydantic models
│   │   ├── feedback.py  # Feedback request/response models
│   │   ├── validators.py
│   │   └── collection_schemas.py  # Collection/binder models (Phase 2)
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
│   │   └── feedback.css    # Feedback widget styles
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
│       └── feedback.js  # Feedback widget
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
| [`backend/routes/fmv.py`](backend/routes/fmv.py:1) | Fair market value calculations | Uses ML for price analysis |
| [`backend/routes/collection_valuation.py`](backend/routes/collection_valuation.py:1) | Card valuation API (Phase 4) | Manual & batch FMV updates |
| [`backend/services/fmv_service.py`](backend/services/fmv_service.py:1) | FMV business logic | Volume-weighted calculations |
| [`backend/services/collection_service.py`](backend/services/collection_service.py:1) | Collection & binder CRUD | Manages user collections |
| [`backend/services/valuation_service.py`](backend/services/valuation_service.py:1) | Automated valuation engine | Safety checks, outlier removal |
| [`backend/database/schema.py`](backend/database/schema.py:1) | SQLAlchemy models | All database tables |
| [`backend/middleware/supabase_auth.py`](backend/middleware/supabase_auth.py:1) | Supabase authentication | JWT token verification |
| [`static/js/config.js`](static/js/config.js:1) | Frontend configuration | API endpoints, timeouts, colors |
| [`static/js/auth.js`](static/js/auth.js:1) | User authentication module | Supabase integration |
| [`static/js/collection.js`](static/js/collection.js:1) | Collection modal & parsing | Smart search string parser |
| [`cron_update_valuations.py`](cron_update_valuations.py:1) | Automated valuation cron job | Runs daily to update card values |

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

10. **Modern Options Button Design**
   - **Why:** Improved visual hierarchy, better accessibility, larger touch targets
   - **Impact:** Replaced Unicode "⋮" with pill-shaped buttons featuring three CSS dots
   - **Design:** 12px border-radius, #f5f5f7 background, blue (#007aff) hover state
   - **Implementation:** [`static/js/collection.js`](static/js/collection.js:788) (binder), Line 1033 (card row)

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

**Example: FMV Calculation Flow**
```
1. GET /fmv with query → (routes/fmv.py)
2. Fetch sold listings → (SearchAPI.io)
3. Apply IQR outlier detection → (fmv_service.py)
4. Calculate volume-weighted prices
5. Return quick_sale, market_value, patient_sale ranges
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

### Current Version: 0.5.0

**Recent Changes (Phase 5 - Collections & Authentication):**
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

**Current State:** Production (Beta v0.5.0)
**Test Coverage:** Partial (core services covered)
**Documentation:** Complete
**Active Development:** Yes
**Collections Feature:** Production-ready with automated valuation

---

*This document should be updated whenever significant architectural decisions are made or project structure changes. Keep it current to maximize its value for AI assistance.*