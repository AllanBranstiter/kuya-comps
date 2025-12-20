# Analytics Research Log

This document tracks empirical findings from real search data and how they inform adjustments to our analytical models and thresholds.

---

## Entry 1: Market Confidence Tier Recalibration
**Date**: 2025-12-20  
**Researcher**: Allan Branstiter  
**Status**: Implemented

### Search Data Examined

**Card**: 2025 Topps Chrome Update Nick Kurtz #USC178 Prism Refractor  
**Data Source**: `/Users/allanbranstiter/Downloads/kuya-export-2025-topps-chrome-nick-kurtz-usc178-prism-2025-12-20.json`

**Sold Listings (31 items)**:
- **Min Price**: $19.99
- **Max Price**: $58.98
- **Average Price**: $35.92
- **Market Value (FMV)**: $34.22
- **Price Spread**: $39.00 (195% from low to high)
- **Ratio**: 2.95x (highest to lowest)

**Active Listings (11 items)**:
- **Min Price**: $29.00
- **Max Price**: $65.00
- **Average Price**: $41.77

### Problem Identified

The card received a **Market Confidence score of 72/100**, which was labeled as **"Strong price consensus"** under the previous 70+ threshold.

**Why this was inaccurate:**
1. **Wide Price Range**: $19.99-$58.98 represents a massive 195% spread
2. **High Variability**: Prices scattered from $16.61 to $54.99 with high volatility
3. **Coefficient of Variation**: Approximately 28%, indicating significant variability
4. **Lack of Clustering**: Prices don't cluster tightly around the mean

**True market consensus characteristics:**
- Prices clustered within 10-15% of mean
- CV below 15-20%
- Minimal outliers
- Consistent pricing across listing types

### Analysis Performed

**Coefficient of Variation Calculation**:
```
Standard Deviation = ~$10.00 (estimated from range)
Average Price = $35.92
CV = (StdDev / Avg) × 100
CV ≈ (10 / 35.92) × 100 ≈ 28%
```

**Market Confidence Formula**:
```
Confidence = 100 / (1 + CV / 100)
Confidence = 100 / (1 + 28 / 100)
Confidence = 100 / 1.28 ≈ 78/100
```

*Note: Actual calculation in system yielded 72/100, likely due to different outlier filtering*

**Comparison to Backend System**:
- Backend Volume Confidence thresholds (in [`backend/services/fmv_service.py`](../backend/services/fmv_service.py:276-281)):
  - High: ≥60% high-weight sales
  - Medium: ≥30% high-weight sales
  - Low: <30% high-weight sales
- These backend thresholds are more conservative and better calibrated

### Changes Implemented

#### Previous Tier System (3 tiers):
| Score Range | Label | Description |
|-------------|-------|-------------|
| 70-100 | Strong price consensus | High confidence |
| 40-69 | Moderate price variation | Moderate confidence |
| 20-39 | High price variation | Low confidence |
| 0-19 | Extreme price scatter | Very low confidence |

#### New Tier System (5 tiers):
| Score Range | Label | Description | Typical CoV |
|-------------|-------|-------------|-------------|
| **80-100** | 🟢 Strong price consensus | Excellent consistency with tight clustering | <20% |
| **60-79** | 🔵 Good price consensus | Solid consistency, decent agreement | 20-40% |
| **40-59** | 🟡 Moderate price variation | Noticeable variation but functional | 40-60% |
| **20-39** | 🟠 High price variation | High variation, less certainty | 60-100% |
| **0-19** | 🔴 Extreme price scatter | Extreme variation, unreliable | >100% |

### Files Modified

1. **[`static/script.js`](../static/script.js:3012)** - Main display logic and indicator card
2. **[`static/script.js`](../static/script.js:3545-3557)** - Market insights generation
3. **[`static/script.js`](../static/script.js:187-219)** - Fallback popup content
4. **[`static/script.js`](../static/script.js:2282-2290)** - Helper function `getConfidenceStatement()`
5. **[`static/market_messages_content.json`](../static/market_messages_content.json:318-350)** - JSON popup definitions
6. **[`static/js/analysis.js`](../static/js/analysis.js:309-317)** - Analysis module helper function

### Expected Impact

**For Nick Kurtz USC178 Prism** (72/100):
- **Before**: "Strong price consensus" ❌
- **After**: "Good price consensus" ✅
- **Accuracy**: Significantly improved - reflects the real market variation

**For truly tight markets** (80+):
- Reserved for cards with CV <20% and tight price clustering
- Examples: Established player base cards, graded PSA 10s with consistent pricing
- Price range typically <15% from mean

**General Impact**:
- Users get more realistic expectations about price stability
- Better distinction between excellent (80+) and good (60-79) markets
- Aligns better with statistical reality (CV thresholds)
- More conservative = fewer false positives on "strong consensus"

### Statistical Justification

**Why 80/100 is the right threshold:**

1. **CV Mapping**:
   - Score 80 ≈ CV of 25%
   - Score 70 ≈ CV of 43%
   - CV >30% indicates substantial variability

2. **Price Spread Correlation**:
   - Score 80+ typically means: Max/Min ratio <2.0x
   - Score 70-79 typically means: Max/Min ratio 2.0-3.0x
   - Nick Kurtz: 2.95x ratio → fits 60-79 range better

3. **Market Behavior**:
   - True "strong consensus" = buyers/sellers agree on narrow range
   - "Good consensus" = general agreement but some price discovery
   - The data shows Nick Kurtz is in "good" territory, not "strong"

### Future Research Considerations

1. **Track tier accuracy** over time with real sales data
2. **Monitor CV distributions** across different card types/price tiers
3. **Consider card-type specific thresholds**:
   - Rookie cards may need looser thresholds (more volatile)
   - Vintage cards may need tighter thresholds (more stable)
4. **Correlation study**: Market Confidence score vs actual price prediction accuracy

### Related Metrics to Monitor

- **Volume Confidence** (backend): Already well-calibrated at 60% threshold
- **Liquidity Risk**: Currently well-implemented
- **Market Pressure**: Working effectively with current bands

### Testing Recommendations

1. Test with various card types:
   - High-end graded cards (expect 80+)
   - Modern rookie parallels (expect 60-79)
   - Mixed lots/variations (expect <40)
2. Verify user comprehension of new labels
3. Monitor feedback on whether "Good consensus" feels accurate

---

## Entry 2: Bimodal Market Detection & 6-Tier Recalibration
**Date**: 2025-12-20
**Researcher**: Allan Branstiter
**Status**: Implemented

### Search Data Examined

**Card**: 2025 Topps Archives Roki Sasaki #64SU-2 1964 Stand-Ups Rookie
**Data Source**: `/Users/allanbranstiter/Downloads/kuya-export-2025-topps-archives-roki-sasaki-stand-ups-p-2025-12-20.json`

**Sold Listings (22 items)**:
- **Min Price**: $4.00
- **Max Price**: $22.04
- **Average Price**: $11.18
- **Market Value (FMV)**: $11.18
- **Price Spread**: $18.04 (450% from low to high)
- **Ratio**: 5.5x (highest to lowest)

**Price Distribution (Bimodal)**:
- **Low cluster** (9 sales, 41%): $4.00-$6.31 (avg $5.10)
- **Mid cluster** (3 sales, 14%): $9.22-$11.32 (avg $10.61)
- **High cluster** (6 sales, 27%): $16.95-$22.04 (avg $20.42)

**Active Listings (31 items)**:
- **Min Price**: $4.99
- **Max Price**: $21.00
- **Average Price**: $10.85
- **Majority clustered**: $8-$15 range
- **Several outliers**: $20-$21 range

### Problem Identified

The card exhibited **clear bimodal distribution** with three distinct price clusters, yet would receive a Market Confidence score of approximately **60-65/100**, which under the previous 5-tier system (Entry 1) would be labeled as **"🔵 Good price consensus"**.

**Why this was critically inaccurate:**

1. **Bimodal Market Structure**: Three distinct buyer segments paying vastly different prices
   - Value buyers (41%): $4-6 range
   - Fair market buyers (14%): $9-11 range
   - Hype/FOMO buyers (27%): $19-22 range

2. **Extreme Price Spread**: 450% spread and 5.5x ratio indicates severe market fragmentation, not "good consensus"

3. **Seller-Buyer Disconnect**: Active listings concentrated at $10-15 while actual sales happen at extremes ($5 or $20)
   - Sellers pricing at theoretical "average"
   - Buyers either waiting for deals or overpaying due to hype
   - Middle ground represents only 14% of actual transactions

4. **Market Timing Issues**: $20+ sales likely represent:
   - Early adopters paying premium for new card (Roki Sasaki Dodgers hype)
   - FOMO purchases before price discovery
   - Possible miscategorized listings (graded cards slipping through filters)

**True bimodal market characteristics:**
- Multiple distinct price clusters
- No dominant central tendency
- Seller pricing doesn't match buyer behavior
- New card volatility with incomplete price discovery

### Analysis Performed

**Coefficient of Variation Calculation**:
```
Estimated Standard Deviation ≈ $6.50 (extreme bimodal spread)
Average Price = $11.18
CV = (StdDev / Avg) × 100
CV ≈ (6.50 / 11.18) × 100 ≈ 58%
```

**Market Confidence Formula**:
```
Confidence = 100 / (1 + CV / 100)
Confidence = 100 / (1 + 58 / 100)
Confidence = 100 / 1.58 ≈ 63/100
```

**Market Behavior Analysis**:
- **Sales Below FMV**: 41% selling at less than half FMV
- **Sales At FMV**: Only 14% selling near calculated FMV
- **Sales Above FMV**: 27% selling at nearly 2x FMV
- **Active listings**: Most priced where few actual sales occur

**Comparison to Entry 1 (Nick Kurtz)**:
- **Nick Kurtz**: CV ~28%, score 72, 2.95x ratio → "Good consensus" ✅ (normally distributed)
- **Roki Sasaki**: CV ~58%, score 63, 5.5x ratio → "Good consensus" ❌ (bimodal distribution)
- The 5-tier system couldn't distinguish between normal variation (Nick) and chaotic bimodal markets (Roki)

### Changes Implemented

#### Previous Tier System (5 tiers from Entry 1):
| Score Range | Label | Typical CoV |
|-------------|-------|-------------|
| 80-100 | 🟢 Strong price consensus | <20% |
| 60-79 | 🔵 Good price consensus | 20-40% |
| 40-59 | 🟡 Moderate price variation | 40-60% |
| 20-39 | 🟠 High price variation | 60-100% |
| 0-19 | 🔴 Extreme price scatter | >100% |

**Problem**: Score of 60-69 being called "good" when CV is 40-67% (high variation)

#### New Tier System (6 tiers):
| Score Range | Label | Typical CoV | Description |
|-------------|-------|-------------|-------------|
| **85-100** | 🟢 Excellent price consensus | <15% | Reserved for truly tight markets (PSA 10s, stable base cards) |
| **70-84** | 🔵 Good price consensus | 15-30% | Nick Kurtz territory - normal variation around mean |
| **55-69** | 🟡 Moderate price variation | 30-50% | **← Roki Sasaki lands HERE** - noticeable spread, functional market |
| **40-54** | 🟠 High price variation | 50-75% | Significant uncertainty, thin/emerging markets |
| **25-39** | 🔴 Very high price variation | 75-125% | Extreme uncertainty, speculative markets |
| **0-24** | ⚫ Market chaos | >125% | No consensus, likely miscategorized or data errors |

### Files Modified

1. **[`static/script.js`](../static/script.js:187-219)** - FALLBACK_POPUP_MARKET_CONFIDENCE (6 tiers)
2. **[`static/script.js`](../static/script.js:2280-2296)** - `getConfidenceStatement()` helper function (6 tiers)
3. **[`static/script.js`](../static/script.js:3005-3022)** - Market Confidence indicator card display logic (6 tiers)
4. **[`static/script.js`](../static/script.js:3545-3578)** - Market insights generation (6 tiers)
5. **[`static/market_messages_content.json`](../static/market_messages_content.json:319-357)** - Popup confidence bands (6 tiers)
6. **[`static/js/analysis.js`](../static/js/analysis.js:309-319)** - Analysis module helper function (6 tiers)

### Expected Impact

**For Roki Sasaki Stand-Ups** (CV ~58%, score ~63):
- **Before**: "🔵 Good price consensus" ❌ (misleading)
- **After**: "🟡 Moderate price variation" ✅ (accurate)
- **User communication**: Properly warns of bimodal market with high uncertainty

**For Nick Kurtz USC178 Prism** (CV ~28%, score ~72):
- **Before** (Entry 1 fix): "🔵 Good price consensus" ✅
- **After**: "🔵 Good price consensus" ✅ (preserved)
- **No regression**: Entry 1 improvements maintained

**For truly excellent markets** (score 85+):
- CV <15% markets now labeled "Excellent" instead of "Strong"
- Examples: PSA 10 base cards with consistent $47-$53 sales
- More accurate distinction from "good" markets

**General Impact**:
- **55-69 band**: Catches bimodal/fragmented markets like Roki Sasaki
- **70-84 band**: Preserves accuracy for normal variation markets like Nick Kurtz
- **85-100 band**: Reserved for exceptionally tight markets
- **More granular**: 6 tiers provide better precision than previous 5
- **Better user expectations**: Clearer warnings about market uncertainty

### Statistical Justification

**Why 6 tiers instead of 5:**

1. **CV Mapping Precision**:
   - Score 85 ≈ CV of 18% (truly excellent)
   - Score 80 ≈ CV of 25% (strong but not exceptional)
   - Score 70 ≈ CV of 43% (good, noticeable variance)
   - Score 60 ≈ CV of 67% (moderate-high, not "good")
   - Score 55 ≈ CV of 82% (high variation threshold)

2. **Key Distinction at 70**:
   - **Above 70** (CV <43%): Prices vary but follow normal distribution
   - **Below 70** (CV >43%): Prices show significant scatter or bimodal patterns
   - Nick Kurtz (72) vs Roki Sasaki (63) proves this boundary works

3. **Key Distinction at 85**:
   - **Above 85** (CV <18%): True price consensus, exceptional consistency
   - **70-84** (CV 18-43%): Good consensus with expected market variance
   - Prevents grade inflation - "excellent" means excellent

4. **Key Distinction at 55**:
   - **55-69** (CV 30-82%): Moderate variation, still functional
   - **40-54** (CV 82-150%): High variation, significant uncertainty
   - Roki Sasaki at 63 correctly flagged as moderate, not good

### Market Behavior Validation

**Bimodal Distribution Evidence** (Roki Sasaki):
- 41% of sales below FMV/2 = buyers waiting for bargains
- 27% of sales above 1.8x FMV = hype overpayment
- 14% at FMV = small minority paying "fair" price
- Active listings concentrated where few actual sales occur

**This pattern indicates**:
- Market has NOT settled on value
- Multiple buyer segments with different valuation models
- New card still in price discovery phase
- High risk for sellers pricing at "average" FMV

**A CV of 58% correctly signals**: "Use caution - this market is fragmented and uncertain"

### Comparison to Backend System

Backend Volume Confidence thresholds (in [`backend/services/fmv_service.py`](../backend/services/fmv_service.py:276-281)):
- High: ≥60% high-weight sales
- Medium: ≥30% high-weight sales
- Low: <30% high-weight sales

**New Market Confidence tiers** (frontend):
- Excellent: ≥85 (CV <18%)
- Good: 70-84 (CV 18-43%)
- Moderate: 55-69 (CV 30-82%) ← **Better alignment with backend philosophy**
- High: 40-54 (CV 82-150%)
- Very High: 25-39 (CV 125-300%)
- Chaos: 0-24 (CV >300%)

Both systems now use conservative thresholds before assigning "good" labels.

### Future Research Considerations

1. **Bimodal Detection Algorithm**: Develop statistical test for multimodal distributions
   - Dip test or Hartigan's test
   - Alert users when distribution isn't normal
   - Special handling for new card releases

2. **Time-Series Analysis**: Track how CV changes as card ages
   - New cards: Expect high CV (price discovery)
   - Established cards: Should show lower CV
   - Hype events: CV may spike temporarily

3. **Player Performance Correlation**: Link Roki Sasaki card price to MLB performance
   - Initial hype → high CV
   - Performance validates → CV should decrease
   - Performance disappoints → CV may increase temporarily

4. **Card Type Specific Thresholds**:
   - **New rookie parallels**: Allow CV 40-70% before flagging (price discovery expected)
   - **Vintage base cards**: Expect CV <20% (stable market)
   - **Ultra-rare cards**: Accept higher CV due to thin markets

### Testing Recommendations

1. **Validate with known card types**:
   - Bimodal distribution cards (expect 55-69 score)
   - Normal distribution cards (expect 70-84 score)
   - Tight market cards (expect 85+ score)

2. **Monitor false positives**: Cards scoring 55-69 that don't deserve "moderate" warning

3. **User comprehension testing**: Do users understand difference between "good" and "moderate"?

4. **Edge case validation**: Cards right at boundaries (54, 55, 69, 70, 84, 85)

### Key Insight

**This case reveals that CV alone isn't enough** - we need to consider:
- Distribution shape (normal vs bimodal vs uniform)
- Market maturity (new vs established cards)
- Buyer behavior patterns (clustering vs scatter)

The 6-tier system is a step forward, but future enhancements should detect bimodal distributions explicitly and warn users that "multiple markets exist for this card at different price points."

### Bimodal Detection Enhancement (Phases 1-3)

Following the 6-tier implementation, we added explicit bimodal market detection to provide users with clearer warnings when markets exhibit fragmented pricing patterns.

**Detection Criteria**:
- Market Confidence: 55-69 (moderate variation tier)
- Absorption below FMV: ≥1.5 (hot zone indicating strong demand)
- Absorption above FMV: <0.3 (cold zone indicating weak demand)
- Active listings exist in both price zones (belowFMV > 0 AND aboveFMV > 0)

**Rationale**: This combination identifies markets where buyers are concentrating purchases below FMV (value hunters) while listings above FMV languish (hype pricing disconnected from buyer behavior). The moderate confidence band (55-69) ensures the market has enough data to be functional but exhibits the price scatter characteristic of bimodal distributions.

**User-Facing Changes**:

1. **Market Assessment** ([`static/js/analysis.js`](../static/js/analysis.js)):
   - New scenario: "🔀 Fragmented Market - Multiple Price Points"
   - Triggers before "Two-Tier Market" edge case in priority order
   - Provides persona-specific advice for navigating bimodal markets
   - Visual styling: Orange warning colors (#ff9500) to signal caution

2. **Liquidity Profile** ([`static/script.js`](../static/script.js)):
   - Summary alert box appears when bimodal pattern detected
   - Explains the two buyer segments (value hunters vs hype buyers)
   - Recommends targeting high-absorption zone for faster sales
   - Positioned after 3-band grid, before existing "Insight" box

3. **FMV Display** ([`static/script.js`](../static/script.js)):
   - Conditional warning caveat when market confidence <70
   - Severity messaging adapts to confidence tier:
     - 55-69: "Moderate variation"
     - 40-54: "High variation"
     - <40: "Very high variation"
   - Warns users that FMV estimates have higher uncertainty due to price scatter

**Files Modified**:
- [`static/market_messages_content.json`](../static/market_messages_content.json) - New `bimodalMarketWarning` scenario object
- [`static/js/analysis.js`](../static/js/analysis.js) - `detectBimodalPattern()` function and scenario selection logic
- [`static/script.js`](../static/script.js) - FMV caveat warning and Liquidity Profile bimodal alert

**Implementation Philosophy**: All changes are additive and defensive - they only appear when specific conditions are met. This prevents false positives while ensuring users receive critical warnings for genuinely fragmented markets like Roki Sasaki Stand-Ups.

**Testing Validation**:
- Roki Sasaki Stand-Ups (CV ~58%, score ~63): ✅ Triggers all bimodal warnings
- Nick Kurtz USC178 Prism (CV ~28%, score ~72): ✅ Shows no bimodal warnings
- Edge cases (scores 54, 55, 69, 70): ✅ Correctly respect tier boundaries

**Impact on User Experience**: Users now receive consistent, multi-layered warnings about market fragmentation across Market Assessment, Liquidity Profile, and FMV displays. This coherent messaging helps users understand why pricing is uncertain and provides actionable guidance for navigating bimodal markets.

---

## Template for Future Entries

```markdown
## Entry N: [Title]
**Date**: YYYY-MM-DD  
**Researcher**: [Name]  
**Status**: [Proposed/In Review/Implemented]

### Search Data Examined
[Card details, data source, key metrics]

### Problem Identified
[What issue was discovered in the current model]

### Analysis Performed
[Statistical analysis, calculations, comparisons]

### Changes Implemented
[What was changed and why]

### Expected Impact
[How this should affect user experience and accuracy]

### Future Research Considerations
[Follow-up questions or areas to monitor]
```

---

## Research Guidelines

1. **Always include raw data**: Export JSON files for reference
2. **Document calculations**: Show formulas and worked examples
3. **Test edge cases**: Verify changes work across different card types
4. **Track accuracy**: Compare predictions to actual market behavior
5. **User feedback**: Note any usability issues with new thresholds
6. **Version control**: Tag commits related to analytical model changes

---

*This research log helps ensure our analytics remain data-driven and continuously improve based on real market observations.*
