# Export Enhancement Specification

**Created**: 2025-12-20  
**Status**: Requirements Defined  
**Priority**: 🔴 CRITICAL - Blocks Research Progress  
**Related Docs**: [`METADATA_TAGGING_FEASIBILITY.md`](METADATA_TAGGING_FEASIBILITY.md), [`ANALYTICS_SAMPLE_RESEARCH_PLAN.md`](../plans/ANALYTICS_SAMPLE_RESEARCH_PLAN.md)

---

## Purpose

Enhance the Kuya Comps export functionality to include all calculated analytics scores and metrics in the exported JSON file. This enables the research team to conduct systematic validation of the 6-tier market confidence system, bimodal detection, and FMV calculations.

---

## Current Export Format (v1.0.0)

```json
{
  "metadata": {
    "timestamp": "2025-12-20T03:22:03.421Z",
    "searchQuery": "...",
    "exportedBy": "Kuya Comps Export Tool",
    "version": "1.0.0"
  },
  "soldListings": {
    "raw": [...],
    "count": 31,
    "statistics": {
      "min_price": 19.99,
      "max_price": 58.98,
      "avg_price": 35.92
    }
  },
  "activeListings": {
    "raw": [...],
    "count": 11,
    "statistics": {
      "min_price": 29.00,
      "max_price": 65.00,
      "avg_price": 41.77
    }
  },
  "analytics": {
    "fmv": {
      "market_value": 34.22,
      "quick_sale": 29.83,
      "patient_sale": 37.96
    },
    "price_tier": null
  }
}
```

---

## Required Enhancements (v2.0.0)

### 1. Confidence Scores

Add market and volume confidence scores that the system already calculates during search:

```json
{
  "analytics": {
    "fmv": { ... },
    "confidence": {
      "market_score": 72.5,
      "volume_score": 85,
      "tier_label": "Good Consensus (70-84)",
      "tier_description": "CV 18-43%, normal variation around mean",
      "tier_color": "#4CAF50"
    }
  }
}
```

**Fields**:
- `market_score` (float): 0-100 score based on CV
- `volume_score` (int): 0-100 score based on sample size
- `tier_label` (string): Human-readable tier classification
- `tier_description` (string): Explanation of what tier means
- `tier_color` (string): Hex color code for UI consistency

---

### 2. Distribution Statistics

Add statistical measures of price distribution:

```json
{
  "analytics": {
    "fmv": { ... },
    "confidence": { ... },
    "distribution": {
      "cv_percent": 28.3,
      "std_dev": 9.68,
      "mean": 34.22,
      "median": 32.50,
      "mode": 30.00,
      "skewness": 0.45,
      "kurtosis": -0.12,
      "shape": "normal"
    }
  }
}
```

**Fields**:
- `cv_percent` (float): Coefficient of Variation as percentage
- `std_dev` (float): Standard deviation of sold prices
- `mean` (float): Average sold price (should match FMV market_value)
- `median` (float): Median sold price
- `mode` (float|null): Most common price (if applicable)
- `skewness` (float): Distribution skewness (-3 to +3 typically)
- `kurtosis` (float): Distribution kurtosis (excess kurtosis)
- `shape` (string): Classification: "normal", "bimodal", "skewed", "peaked", "flat", "irregular"

---

### 3. Bimodal Detection Results

Add bimodal distribution detection indicators:

```json
{
  "analytics": {
    "fmv": { ... },
    "confidence": { ... },
    "distribution": { ... },
    "bimodal": {
      "detected": false,
      "absorption_below_fmv": 0.48,
      "absorption_above_fmv": 0.52,
      "cluster_count": 1,
      "confidence_in_range": true,
      "criteria_met": {
        "market_confidence_55_69": false,
        "absorption_below_gte_1_5": false,
        "absorption_above_lt_0_3": false,
        "active_in_both_zones": true
      }
    }
  }
}
```

**Fields**:
- `detected` (boolean): True if bimodal pattern detected
- `absorption_below_fmv` (float): Ratio of prices below FMV (0-1)
- `absorption_above_fmv` (float): Ratio of prices above FMV (0-1)
- `cluster_count` (int): Number of price clusters detected (1, 2, or 3+)
- `confidence_in_range` (boolean): True if market confidence is 55-69
- `criteria_met` (object): Breakdown of which detection criteria were met

---

### 4. Price Statistics

Add detailed price statistics for research analysis:

```json
{
  "analytics": {
    "fmv": { ... },
    "confidence": { ... },
    "distribution": { ... },
    "bimodal": { ... },
    "statistics": {
      "price_ratio": 2.95,
      "price_range": 39.00,
      "iqr": 12.50,
      "q1": 24.99,
      "q2": 32.50,
      "q3": 37.49,
      "outliers": {
        "count": 2,
        "lower_bound": 5.99,
        "upper_bound": 56.24,
        "values": [58.98, 59.50]
      }
    }
  }
}
```

**Fields**:
- `price_ratio` (float): max_price / min_price
- `price_range` (float): max_price - min_price
- `iqr` (float): Interquartile range (Q3 - Q1)
- `q1` (float): First quartile (25th percentile)
- `q2` (float): Second quartile (median, 50th percentile)
- `q3` (float): Third quartile (75th percentile)
- `outliers` (object): Detected outlier information
  - `count` (int): Number of outliers detected
  - `lower_bound` (float): Values below this are outliers
  - `upper_bound` (float): Values above this are outliers
  - `values` (array): Actual outlier price values

---

## Complete Enhanced Export Format (v2.0.0)

```json
{
  "metadata": {
    "timestamp": "2025-12-20T03:22:03.421Z",
    "searchQuery": "...",
    "exportedBy": "Kuya Comps Export Tool",
    "version": "2.0.0"
  },
  "soldListings": {
    "raw": [...],
    "count": 31,
    "statistics": {
      "min_price": 19.99,
      "max_price": 58.98,
      "avg_price": 35.92
    }
  },
  "activeListings": {
    "raw": [...],
    "count": 11,
    "statistics": {
      "min_price": 29.00,
      "max_price": 65.00,
      "avg_price": 41.77
    }
  },
  "analytics": {
    "fmv": {
      "market_value": 34.22,
      "quick_sale": 29.83,
      "patient_sale": 37.96
    },
    "confidence": {
      "market_score": 72.5,
      "volume_score": 85,
      "tier_label": "Good Consensus (70-84)",
      "tier_description": "CV 18-43%, normal variation around mean",
      "tier_color": "#4CAF50"
    },
    "distribution": {
      "cv_percent": 28.3,
      "std_dev": 9.68,
      "mean": 34.22,
      "median": 32.50,
      "mode": 30.00,
      "skewness": 0.45,
      "kurtosis": -0.12,
      "shape": "normal"
    },
    "bimodal": {
      "detected": false,
      "absorption_below_fmv": 0.48,
      "absorption_above_fmv": 0.52,
      "cluster_count": 1,
      "confidence_in_range": true,
      "criteria_met": {
        "market_confidence_55_69": false,
        "absorption_below_gte_1_5": false,
        "absorption_above_lt_0_3": false,
        "active_in_both_zones": true
      }
    },
    "statistics": {
      "price_ratio": 2.95,
      "price_range": 39.00,
      "iqr": 12.50,
      "q1": 24.99,
      "q2": 32.50,
      "q3": 37.49,
      "outliers": {
        "count": 2,
        "lower_bound": 5.99,
        "upper_bound": 56.24,
        "values": [58.98, 59.50]
      }
    },
    "price_tier": null
  }
}
```

---

## Implementation Checklist

### Phase 1: Backend Changes
- [ ] Update analytics calculation to store all metrics (not just display)
- [ ] Create `AnalyticsExport` data model with all required fields
- [ ] Modify FMV service to return complete analytics object
- [ ] Update bimodal detection to return detailed criteria breakdown
- [ ] Add distribution shape classification logic

### Phase 2: Frontend/Export Tool Changes
- [ ] Update export function to request full analytics data
- [ ] Increment export version from "1.0.0" to "2.0.0"
- [ ] Test export with various card searches (all tier levels)
- [ ] Validate JSON structure matches specification

### Phase 3: Testing
- [ ] Export 5+ samples covering all tier levels
- [ ] Verify all fields are populated correctly
- [ ] Compare calculated metrics with manual calculations
- [ ] Test with edge cases (low sample size, outliers, etc.)

### Phase 4: Documentation
- [ ] Update export tool documentation
- [ ] Add changelog entry for v2.0.0
- [ ] Document backward compatibility (v1.0.0 still supported?)
- [ ] Update research plan with new export capabilities

---

## Data Source References

All required data should already be calculated by the application. Key source files:

1. **Confidence Scores**: Calculated in analytics engine
2. **CV & Distribution**: Statistical calculations on sold prices
3. **Bimodal Detection**: [`analysis.js`](../static/js/analysis.js) - lines with bimodal detection logic
4. **FMV Calculations**: [`fmv_service.py`](../backend/services/fmv_service.py)

---

## Backward Compatibility

**Recommendation**: Maintain v1.0.0 format for existing users

**Options**:
1. **Version Flag**: Add `?version=2` parameter to export URL
2. **Separate Endpoint**: Create `/export/v2` endpoint
3. **Auto-Upgrade**: Increment all exports to v2.0.0 (breaking change)

**Preferred**: Option 1 (version flag) for flexibility

---

## Testing Validation

After implementation, validate with these test cases:

| Test Case | Card Type | Expected Tier | Key Validation |
|-----------|-----------|---------------|----------------|
| Nick Kurtz Prism | Modern Rookie Parallel | 70-84 | CV 20-35%, normal distribution |
| Roki Sasaki Stand-Ups | Modern Rookie Insert | 55-69 | Bimodal detected = true |
| Cal Ripken 1985 | Vintage Base | 85-100 | CV < 18%, high confidence |
| Jordan Walker (lot) | Mixed Listings | 0-24 | CV > 300%, chaos tier |
| Jackson Holliday | Modern Rookie | 70-84 | Stable pricing, no bimodal |

**Acceptance Criteria**: All metrics match manual calculations within ±2%

---

## Timeline Estimate

- **Backend Changes**: 4-6 hours
- **Frontend/Export Changes**: 2-3 hours
- **Testing**: 2-3 hours
- **Documentation**: 1-2 hours

**Total Estimate**: 1-2 development days

---

## Priority Justification

This enhancement is **CRITICAL** because:

1. **Blocks Research**: Cannot validate tier system without scores
2. **Data Loss**: Analytics calculated but not saved - wasted computation
3. **Manual Workaround**: Requires Python script and manual data entry
4. **Quality Assurance**: Need export data to validate algorithm accuracy

**Impact if Delayed**: 
- Research plan delayed by 2-4 weeks
- Manual calculation errors introduce uncertainty
- Cannot validate improvements to analytics engine
- Sample collection incomplete without proper metadata

---

## Success Metrics

Enhancement is successful when:
- ✅ All 16 existing samples re-exported with complete data
- ✅ All fields in specification populated correctly
- ✅ Manual calculation script validates export accuracy (±2%)
- ✅ Research team can populate `sample_inventory.json` automatically
- ✅ Analysis stages 1-5 can proceed without manual calculation

---

## Next Steps

1. **Developer Assignment**: Assign to backend/frontend developer
2. **Kickoff Meeting**: Review spec with developer (30 min)
3. **Implementation**: Developer implements changes (1-2 days)
4. **Testing**: Research team validates exports (1 day)
5. **Re-export**: Export all samples with v2.0.0 format
6. **Research**: Begin Stage 1 analysis with complete data

---

*Specification prepared for Kuya Comps analytics enhancement initiative*
