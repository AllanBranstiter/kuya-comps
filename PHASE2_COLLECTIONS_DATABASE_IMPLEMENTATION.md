# Phase 2: Collections & Binders Database Schema Implementation

**Date:** January 15, 2026  
**Status:** ✅ Complete  
**Module:** User Collections & Automated Valuation

---

## Overview

Phase 2 implements the database schema and service layer for the Collections & Binders feature, enabling users to save sports cards to personal collections, organize them into binders, and track their value over time.

---

## Implementation Summary

### 1. Database Schema (`backend/database/schema.py`)

Added three new SQLAlchemy models to support the collections feature:

#### **Binders Table**
Represents user's card collection binders (like physical binders).

**Fields:**
- `id` - Primary key
- `user_id` - Supabase user ID (indexed)
- `name` - Binder name (max 200 chars)
- `cover_card_id` - Optional reference to a card for thumbnail
- `created_at` - Timestamp (indexed)
- `updated_at` - Auto-updated timestamp

**Relationships:**
- One-to-many with Cards
- Optional self-reference to cover card

**Indexes:**
- `idx_binder_user_created` - Composite index on (user_id, created_at)

---

#### **Cards Table**
Individual cards in user collections with comprehensive metadata.

**Identity Fields:**
- `year` - Card year (e.g., "2023")
- `set_name` - Set name (e.g., "Prizm")
- `athlete` - Athlete name (indexed)
- `card_number` - Card number
- `variation` - Parallel/variation (e.g., "Silver Prizm")

**Condition Fields:**
- `grading_company` - PSA, BGS, Raw, SGC, etc.
- `grade` - Grade value (e.g., "10", "9.5")

**Search & Update Logic:**
- `search_query_string` - Exact string for automated scraping
- `auto_update` - Boolean toggle for auto-valuation (indexed)
- `last_updated_at` - Last FMV update timestamp (indexed)

**Financial Fields:**
- `purchase_price` - User's purchase price (Numeric 10,2)
- `purchase_date` - Acquisition date
- `current_fmv` - Latest calculated Fair Market Value (Numeric 10,2)

**Status & Flags:**
- `review_required` - Flagged for manual review (indexed)
- `review_reason` - Why review is needed
- `no_recent_sales` - No sales found in last update

**Metadata:**
- `image_url` - Card image URL
- `tags` - JSON array of user tags
- `notes` - User notes
- `created_at` / `updated_at` - Timestamps

**Relationships:**
- Many-to-one with Binder
- One-to-many with PriceHistory

**Indexes:**
- `idx_card_binder_athlete` - Composite (binder_id, athlete)
- `idx_card_auto_update_stale` - Composite (auto_update, last_updated_at)
- `idx_card_review_required` - Single column

---

#### **PriceHistory Table**
Historical price data for sparkline charts and trend analysis.

**Fields:**
- `id` - Primary key
- `card_id` - Foreign key to Cards (indexed)
- `value` - FMV at this point (Numeric 10,2)
- `date_recorded` - Timestamp (indexed)
- `num_sales` - Number of sales in calculation
- `confidence` - "high", "medium", or "low"

**Relationships:**
- Many-to-one with Card

**Indexes:**
- `idx_price_history_card_date` - Composite (card_id, date_recorded)

---

### 2. Database Migration (`alembic/versions/001_add_collections_binders_schema_phase2.py`)

Created Alembic migration to:
- Create all three tables with proper constraints
- Add all indexes for query performance
- Set up foreign key relationships with CASCADE deletes
- Handle circular reference between Binders and Cards (cover_card_id)

**Migration Commands:**
```bash
# Apply migration
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

---

### 3. Pydantic Schemas (`backend/models/collection_schemas.py`)

Comprehensive request/response models for API validation:

#### **Binder Schemas:**
- `BinderBase` - Base fields
- `BinderCreate` - Creation request
- `BinderUpdate` - Update request
- `BinderResponse` - API response with computed fields (total_cards, total_value, ROI)
- `BinderStats` - Aggregated statistics

#### **Card Schemas:**
- `CardBase` - Base fields
- `CardCreate` - Creation request
- `CardUpdate` - Update request (all fields optional)
- `CardResponse` - API response with computed fields
- `CardWithHistory` - Card with price history array

#### **Price History Schemas:**
- `PriceHistoryBase` - Base fields with validation
- `PriceHistoryCreate` - Creation request
- `PriceHistoryResponse` - API response

#### **Analytics Schemas:**
- `BinderStats` - Binder-level statistics
- `CollectionOverview` - User's entire collection overview
- `CardFilter` - Search/filter parameters

#### **Bulk Operations:**
- `BulkCardCreate` - Create multiple cards (max 100)
- `BulkCardResponse` - Bulk creation results

---

### 4. Service Layer (`backend/services/collection_service.py`)

Business logic for managing collections:

#### **Binder Services:**
- `create_binder()` - Create new binder
- `get_user_binders()` - Get all user's binders
- `get_binder_by_id()` - Get specific binder (with ownership check)
- `update_binder()` - Update binder (name, cover card)
- `delete_binder()` - Delete binder and all cards
- `get_binder_stats()` - Calculate aggregated statistics

#### **Card Services:**
- `create_card()` - Add card to binder
- `get_cards_by_binder()` - Get all cards in binder
- `get_card_by_id()` - Get specific card (with ownership check)
- `update_card()` - Update card (supports moving between binders)
- `delete_card()` - Delete card
- `get_cards_for_auto_update()` - Find cards needing FMV updates

#### **Price History Services:**
- `add_price_history()` - Record new price point
- `get_card_price_history()` - Get history for sparklines

#### **Analytics Services:**
- `get_collection_overview()` - Full collection statistics with top performers

---

## Key Design Decisions

### 1. **User Ownership Security**
All service functions verify user ownership through `user_id` checks, preventing unauthorized access to other users' collections.

### 2. **Flexible Metadata**
Card identity fields (year, set, variation) are optional to accommodate various card types and incomplete information.

### 3. **Search Query Decoupling**
The `search_query_string` field separates visual metadata from the actual search parameters used for automated updates, as specified in the PRD.

### 4. **Numeric Precision**
Financial fields use `Numeric(10, 2)` for precise decimal handling (up to $99,999,999.99).

### 5. **Cascade Deletes**
Deleting a binder automatically removes all cards and price history, maintaining referential integrity.

### 6. **Performance Indexes**
Strategic indexes on:
- User lookups (`user_id`)
- Auto-update queries (`auto_update`, `last_updated_at`)
- Review flags (`review_required`)
- Time-based queries (`created_at`, `date_recorded`)

### 7. **Stale Data Detection**
Service layer identifies cards not updated in 30+ days for dashboard warnings.

### 8. **ROI Calculations**
Computed fields calculate Return on Investment:
```
ROI% = ((current_fmv - purchase_price) / purchase_price) * 100
```

---

## Database Relationships

```
User (Supabase)
  └─> Binders (1:many)
       ├─> Cards (1:many)
       │    └─> PriceHistory (1:many)
       └─> cover_card (1:1, optional)
```

---

## Next Steps (Phase 3 & 4)

### Phase 3: Frontend - Binder View Dashboard
- Implement "My Collection" tab UI
- Rich list view with condition badges
- Sparkline charts using PriceHistory data
- Stale data warnings (yellow/red indicators)
- Review flags (⚠️ icons)

### Phase 4: Backend - Automated Valuation Engine
- Cron job to find stale cards
- FMV calculation with safety checks:
  - Keyword firewall (exclude "Reprint", "Digital", etc.)
  - IQR outlier removal
  - Ghost town check (no results = no update)
  - Volatility guardrail (>50% change = flag for review)
- Update `current_fmv` and create `PriceHistory` entries

---

## Testing Recommendations

### Unit Tests
- Service layer functions with mock database
- Pydantic schema validation
- ROI calculation accuracy

### Integration Tests
- Full CRUD operations for binders and cards
- User ownership verification
- Cascade delete behavior
- Price history recording

### Performance Tests
- Query performance with 1000+ cards
- Index effectiveness
- Bulk operations

---

## Configuration

No new environment variables required for Phase 2. Uses existing database connection from `FEEDBACK_DATABASE_URL`.

---

## Files Created/Modified

### Created:
1. `backend/models/collection_schemas.py` - Pydantic models
2. `backend/services/collection_service.py` - Business logic
3. `alembic/versions/001_add_collections_binders_schema_phase2.py` - Migration
4. `PHASE2_COLLECTIONS_DATABASE_IMPLEMENTATION.md` - This document

### Modified:
1. `backend/database/schema.py` - Added Binder, Card, PriceHistory models

---

## API Endpoints (To Be Implemented)

Suggested REST API structure for Phase 3:

```
# Binders
POST   /api/v1/binders                    - Create binder
GET    /api/v1/binders                    - List user's binders
GET    /api/v1/binders/{id}               - Get binder details
PATCH  /api/v1/binders/{id}               - Update binder
DELETE /api/v1/binders/{id}               - Delete binder
GET    /api/v1/binders/{id}/stats         - Get binder statistics

# Cards
POST   /api/v1/cards                      - Add card to binder
GET    /api/v1/binders/{id}/cards         - List cards in binder
GET    /api/v1/cards/{id}                 - Get card details
PATCH  /api/v1/cards/{id}                 - Update card
DELETE /api/v1/cards/{id}                 - Delete card
GET    /api/v1/cards/{id}/history         - Get price history

# Collection
GET    /api/v1/collection/overview        - Collection overview
GET    /api/v1/collection/cards/stale     - Cards needing updates
GET    /api/v1/collection/cards/review    - Cards flagged for review
```

---

## Conclusion

Phase 2 successfully implements the database foundation for the Collections & Binders feature. The schema is designed for:
- **Scalability** - Indexed for performance with large collections
- **Flexibility** - Accommodates various card types and metadata
- **Security** - User ownership verification at service layer
- **Maintainability** - Clean separation of concerns with service layer

The implementation follows the PRD specifications and sets up the foundation for Phase 3 (Frontend UI) and Phase 4 (Automated Valuation Engine).
