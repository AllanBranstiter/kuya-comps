# Price Tier Dynamic Content - Implementation Notes

## Completed Backend Components

✅ **Created Files:**
1. `/backend/services/price_tier_service.py` - Price tier determination logic
2. `/backend/services/market_message_service.py` - Message selection and formatting
3. `/backend/routes/market_messages.py` - API endpoints for tier messages
4. Updated `/backend/models/schemas.py` - Added PriceTier and MarketMessageRequest models
5. Populated `/market_messages_content.json` - All tier-specific message content

## Manual Changes Required

### 1. Register Market Messages Router in `main.py`

**File:** `/Users/allanbranstiter/Documents/GitHub/kuya-comps/main.py`

**Change Line 67:**
```python
# FROM:
from backend.routes import health, comps, fmv

# TO:
from backend.routes import health, comps, fmv, market_messages
```

**Add After Line 156 (after FMV router registration):**
```python
# Market messages endpoints (/market-message and /liquidity-popup/<tier_id>)
app.include_router(market_messages.router, tags=["Market Messages"])
```

### 2. Update FMV Service to Include Tier Data

**File:** `/Users/allanbranstiter/Documents/GitHub/kuya-comps/backend/services/fmv_service.py`

**Update imports (line 8):**
```python
# FROM:
from typing import List, Optional, Tuple
import numpy as np

# TO:
from typing import List, Optional, Tuple, Dict
import numpy as np
from backend.services.price_tier_service import get_price_tier
```

**Update FMVResult class __init__ method (add parameter around line 43):**
```python
def __init__(
    self,
    fmv_low: Optional[float] = None,
    fmv_high: Optional[float] = None,
    expected_low: Optional[float] = None,
    expected_high: Optional[float] = None,
    market_value: Optional[float] = None,
    quick_sale: Optional[float] = None,
    patient_sale: Optional[float] = None,
    volume_confidence: Optional[str] = None,
    count: int = 0,
    price_tier: Optional[Dict] = None  # ADD THIS LINE
):
```

**Update FMVResult class attributes (around line 52):**
```python
    self.patient_sale = patient_sale
    self.volume_confidence = volume_confidence
    self.count = count
    self.price_tier = price_tier  # ADD THIS LINE
```

**Update FMVResult.to_dict() method (around line 66):**
```python
return {
    'fmv_low': self.fmv_low,
    'fmv_high': self.fmv_high,
    'expected_low': self.expected_low,
    'expected_high': self.expected_high,
    'market_value': self.market_value,
    'quick_sale': self.quick_sale,
    'patient_sale': patient_sale,
    'volume_confidence': self.volume_confidence,
    'count': self.count,
    'price_tier': self.price_tier,  # ADD THIS LINE
}
```

**Update calculate_fmv() function return statement (around line 285):**
```python
# Calculate price tier based on market_value
tier_data = get_price_tier(fmv=market_value, avg_listing_price=None)

return FMVResult(
    fmv_low=fmv_low,
    fmv_high=fmv_high,
    expected_low=quick_sale,
    expected_high=patient_sale,
    market_value=market_value,
    quick_sale=quick_sale,
    patient_sale=patient_sale,
    volume_confidence=volume_confidence,
    count=len(inliers),
    price_tier=tier_data  # ADD THIS LINE
)
```

## API Endpoints Available

Once registered, these endpoints will be available:

### POST /market-message
Get tier-specific market message based on conditions.

**Request:**
```json
{
  "fmv": 150.00,
  "avg_listing_price": 165.00,
  "market_pressure": 12.5,
  "liquidity_score": 65,
  "market_confidence": 72,
  "absorption_below": 1.2,
  "absorption_above": 0.4,
  "below_fmv_count": 5,
  "above_fmv_count": 8,
  "sales_below": 6,
  "sales_above": 3
}
```

**Response:**
```json
{
  "tier": {
    "tier_id": "tier_2",
    "tier_emoji": "🔵",
    "tier_name": "$100-$499",
    "tier_range": "$100-$499",
    "tier_color": "#007aff",
    "price_used": 150.00,
    "price_source": "fmv"
  },
  "message": {
    "message_type": "normal_market",
    "title": "Normal, Stable Market",
    "icon": "📊",
    "content": "Prices are in the middle range (12.5% vs. recent sales)...",
    "advice": {...},
    "color": "#007aff"
  }
}
```

### GET /liquidity-popup/{tier_id}
Get tier-specific liquidity popup content.

**Example:** `/liquidity-popup/tier_3`

**Response:**
```json
{
  "title": "How Easy Is It to Sell This Card?",
  "content": "This score shows how hard or easy it might be to sell your card at a fair price. At this price level, lower scores are expected..."
}
```

## Testing

After making the manual changes above, test the endpoints:

```bash
# Start the server
cd /Users/allanbranstiter/Documents/GitHub/kuya-comps
python -m uvicorn main:app --reload

# Test market message endpoint
curl -X POST http://localhost:8000/market-message \
  -H "Content-Type: application/json" \
  -d '{"fmv":150,"avg_listing_price":165,"market_pressure":12.5,"liquidity_score":65,"market_confidence":72}'

# Test liquidity popup endpoint
curl http://localhost:8000/liquidity-popup/tier_3
```

## Frontend Integration Status

- ⏳ Frontend updates pending (analysis.js and script.js)
- ⏳ Unit tests pending
- ⏳ Integration tests pending

## Next Steps

1. Make the manual changes listed above
2. Test the backend endpoints
3. Implement frontend integration
4. Create unit and integration tests
5. Update documentation
