# Collections & Binders - Phase 2 Quick Start Guide

**Module:** User Collections & Automated Valuation  
**Phase:** 2 - Database Schema & Service Layer  
**Status:** ✅ Complete

---

## What Was Implemented

Phase 2 establishes the database foundation for the Collections & Binders feature:

1. **Database Schema** - Three new tables (Binders, Cards, PriceHistory)
2. **Pydantic Models** - Request/response validation schemas
3. **Service Layer** - Business logic for CRUD operations
4. **Database Migration** - Alembic migration script
5. **Unit Tests** - Comprehensive test coverage
6. **Configuration** - Collection-specific constants

---

## Quick Reference

### Database Tables

```
┌─────────────┐
│   Binders   │
├─────────────┤
│ id          │
│ user_id     │◄─── Supabase user ID
│ name        │
│ cover_card  │
└─────────────┘
      │
      │ 1:many
      ▼
┌─────────────┐
│    Cards    │
├─────────────┤
│ id          │
│ binder_id   │
│ athlete     │
│ year/set    │
│ grade       │
│ purchase_$  │
│ current_fmv │
│ auto_update │
└─────────────┘
      │
      │ 1:many
      ▼
┌──────────────┐
│PriceHistory  │
├──────────────┤
│ id           │
│ card_id      │
│ value        │
│ date_recorded│
└──────────────┘
```

---

## Usage Examples

### Creating a Binder

```python
from backend.services.collection_service import create_binder
from backend.models.collection_schemas import BinderCreate

binder_data = BinderCreate(name="My Rookie Cards")
binder = create_binder(db, user_id="user-123", binder_data=binder_data)
```

### Adding a Card

```python
from backend.services.collection_service import create_card
from backend.models.collection_schemas import CardCreate
from decimal import Decimal

card_data = CardCreate(
    binder_id=binder.id,
    year="2023",
    set_name="Prizm",
    athlete="Victor Wembanyama",
    card_number="1",
    variation="Silver Prizm",
    grading_company="PSA",
    grade="10",
    search_query_string="2023 Prizm Wembanyama Silver PSA 10",
    auto_update=True,
    purchase_price=Decimal("150.00"),
    purchase_date=datetime.utcnow()
)

card = create_card(db, user_id="user-123", card_data=card_data)
```

### Recording Price History

```python
from backend.services.collection_service import add_price_history
from backend.models.collection_schemas import PriceHistoryCreate

history_data = PriceHistoryCreate(
    card_id=card.id,
    value=Decimal("200.00"),
    num_sales=15,
    confidence="high"
)

history = add_price_history(db, history_data)
```

### Getting Collection Overview

```python
from backend.services.collection_service import get_collection_overview

overview = get_collection_overview(db, user_id="user-123")

print(f"Total Value: ${overview.total_value}")
print(f"Total Cost: ${overview.total_cost}")
print(f"ROI: {overview.roi_percentage}%")
print(f"Cards Needing Review: {overview.cards_needing_review}")
```

### Finding Stale Cards

```python
from backend.services.collection_service import get_cards_for_auto_update

# Get cards not updated in 30+ days
stale_cards = get_cards_for_auto_update(db, days_threshold=30)

for card in stale_cards:
    print(f"Card {card.id} needs update: {card.athlete}")
```

---

## Key Features

### 🔒 Security
- All service functions verify user ownership
- Prevents unauthorized access to other users' collections
- Cascade deletes maintain referential integrity

### 📊 Analytics
- Automatic ROI calculations
- Binder-level and collection-level statistics
- Top performers tracking
- Stale data detection

### 🎯 Flexibility
- Optional metadata fields (year, set, variation)
- Support for graded and raw cards
- Custom tags and notes
- Configurable auto-update settings

### ⚡ Performance
- Strategic indexes on common queries
- Composite indexes for complex lookups
- Efficient cascade operations

---

## Configuration Constants

Located in [`backend/config.py`](../backend/config.py):

```python
COLLECTION_AUTO_UPDATE_THRESHOLD_DAYS = 30
COLLECTION_VOLATILITY_THRESHOLD = 0.50
COLLECTION_MAX_CARDS_PER_BINDER = 1000
COLLECTION_MAX_BINDERS_PER_USER = 50
COLLECTION_SPARKLINE_DATA_POINTS = 30
COLLECTION_KEYWORD_BLACKLIST = ['reprint', 'digital', 'rp', ...]
```

---

## Running the Migration

```bash
# Apply the migration
alembic upgrade head

# Verify tables were created
sqlite3 feedback.db ".tables"
# Should show: binders, cards, price_history

# Rollback if needed
alembic downgrade -1
```

---

## Running Tests

```bash
# Run all collection tests
pytest tests/services/test_collection_service.py -v

# Run specific test
pytest tests/services/test_collection_service.py::test_create_binder -v

# Run with coverage
pytest tests/services/test_collection_service.py --cov=backend.services.collection_service
```

---

## API Integration (Next Steps)

Phase 3 will implement REST API endpoints. Suggested structure:

```python
# backend/routes/collections.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.database.connection import get_db
from backend.middleware.supabase_auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["collections"])

@router.post("/binders")
async def create_binder_endpoint(
    binder_data: BinderCreate,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return create_binder(db, user_id, binder_data)

@router.get("/binders")
async def list_binders_endpoint(
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_user_binders(db, user_id)

# ... more endpoints
```

---

## Data Flow

### Adding a Card to Collection

```
User Action
    ↓
Frontend Modal (Phase 1)
    ↓
POST /api/v1/cards
    ↓
Pydantic Validation (CardCreate)
    ↓
Service Layer (create_card)
    ↓
Ownership Check (verify binder)
    ↓
Database Insert (Card table)
    ↓
Response (CardResponse)
```

### Automated Valuation (Phase 4)

```
Cron Job (Daily)
    ↓
get_cards_for_auto_update()
    ↓
For each stale card:
    ↓
Scrape eBay (search_query_string)
    ↓
Calculate FMV (with safety checks)
    ↓
If volatility > 50%:
    ├─ Flag for review
    └─ Don't update FMV
Else:
    ├─ Update current_fmv
    ├─ Update last_updated_at
    └─ Add PriceHistory entry
```

---

## Common Queries

### Get all cards needing review

```python
cards = db.query(Card).filter(Card.review_required == True).all()
```

### Get binder with highest value

```python
from sqlalchemy import func

binder_values = db.query(
    Binder.id,
    Binder.name,
    func.sum(Card.current_fmv).label('total_value')
).join(Card).group_by(Binder.id).order_by(
    func.sum(Card.current_fmv).desc()
).first()
```

### Get cards by athlete

```python
cards = db.query(Card).filter(
    Card.athlete.ilike('%wembanyama%')
).all()
```

### Get price trend for card

```python
history = db.query(PriceHistory).filter(
    PriceHistory.card_id == card_id
).order_by(PriceHistory.date_recorded.asc()).all()

# Calculate trend
if len(history) >= 2:
    trend = (history[-1].value - history[0].value) / history[0].value * 100
```

---

## Troubleshooting

### Migration fails with "table already exists"

```bash
# Drop tables and re-run
sqlite3 feedback.db "DROP TABLE IF EXISTS price_history; DROP TABLE IF EXISTS cards; DROP TABLE IF EXISTS binders;"
alembic upgrade head
```

### Foreign key constraint error

Ensure you're deleting in the correct order:
1. PriceHistory (child)
2. Cards (child)
3. Binders (parent)

Or use the service layer functions which handle cascades automatically.

### User can't access their binder

Verify the `user_id` matches exactly (case-sensitive). Check Supabase auth token.

---

## Files Reference

| File | Purpose |
|------|---------|
| [`backend/database/schema.py`](../backend/database/schema.py) | SQLAlchemy models |
| [`backend/models/collection_schemas.py`](../backend/models/collection_schemas.py) | Pydantic schemas |
| [`backend/services/collection_service.py`](../backend/services/collection_service.py) | Business logic |
| [`alembic/versions/001_*.py`](../alembic/versions/001_add_collections_binders_schema_phase2.py) | Database migration |
| [`tests/services/test_collection_service.py`](../tests/services/test_collection_service.py) | Unit tests |
| [`backend/config.py`](../backend/config.py) | Configuration constants |

---

## Next Steps

### Phase 3: Frontend - Binder View Dashboard
- [ ] Implement "My Collection" tab UI
- [ ] Create "Add to Collection" modal with smart parsing
- [ ] Build rich list view with condition badges
- [ ] Add sparkline charts using PriceHistory data
- [ ] Implement stale data warnings
- [ ] Add review flags UI

### Phase 4: Backend - Automated Valuation Engine
- [ ] Create cron job for daily updates
- [ ] Implement keyword firewall
- [ ] Add IQR outlier removal
- [ ] Implement ghost town check
- [ ] Add volatility guardrail (50% threshold)
- [ ] Create notification system for reviews

---

## Support

For questions or issues:
1. Check the [full implementation guide](../PHASE2_COLLECTIONS_DATABASE_IMPLEMENTATION.md)
2. Review the [PRD](../../Scripts%20and%20Prompts/CollectionBinders.md)
3. Run the test suite to verify setup
4. Check logs for detailed error messages

---

**Last Updated:** January 15, 2026  
**Version:** 1.0.0
