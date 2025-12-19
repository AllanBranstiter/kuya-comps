# Market Messages Content Guide

**Version:** 1.0  
**Last Updated:** December 18, 2024  
**Purpose:** Editable content for all Market Assessment messages and More Info pop-ups

---

## 📋 Table of Contents

1. [Market Assessment Messages](#market-assessment-messages)
2. [More Info Pop-ups](#more-info-pop-ups)
3. [Editing Guidelines](#editing-guidelines)
4. [Implementation Notes](#implementation-notes)

---

## 🎯 Market Assessment Messages

These messages appear in the Analysis Dashboard's "Market Assessment" section based on market conditions.

### Message Placeholders

The following placeholders are replaced with calculated values:
- `{confidence}` - Market confidence score (0-100)
- `{marketPressure}` - Market pressure percentage with +/- sign
- `{absMarketPressure}` - Absolute value of market pressure
- `{liquidityScore}` - Liquidity score (0-100)
- `{dataQualityScore}` - Overall data quality score (0-100)
- `{absorptionBelow/At/Above}` - Absorption ratios for price bands
- `{salesBelow/At/Above}` - Number of sales in each band
- `{belowFMV/atFMV/aboveFMV}` - Active listings in each band
- `{dominantBandStatement}` - Generated activity statement
- `{velocityStatement}` - Generated sell time estimate

---

### 1. ⚠️ Data Quality Warning

**Trigger:** `marketConfidence < 30 AND |marketPressure| > 20`  
**Color:** #ff9500 (Orange)

**Message:**
> *When prices are scattered and confidence is low, it usually means the data is messy or the market's uncertain.*
> 
> The prices are all over the place (confidence: {confidence}/100) and asking prices are {marketPressure}% vs FMV. This usually means your search is mixing different card types, conditions, or variations together. Try making your search more specific to get better results. 

**If you’re a seller**
- Be careful pricing your card based on outliers.
- Buyers will question your price and negotiate aggressively.
- Before listing, tighten your search to match your exact card.

**If you’re flipping**
- This isn’t a reliable market for consistent flips.
- Only buy if the deal is obviously mispriced and easy to verify.
- Otherwise, the risk outweighs the reward.

**If you’re collecting long-term**
- This is a “pause and research” moment.
- Waiting for cleaner data usually leads to better buying decisions.
- No need to rush unless the card is extremely scarce.

**Data Quality Score:** {dataQualityScore}/100

---

### 2. 🔀 Two-Tier Market Detected

**Trigger:** `absorptionBelow >= 1.5 AND absorptionAbove < 0.3 AND belowFMV > 0 AND aboveFMV > 0`  
**Color:** #5856d6 (Purple)

**Message:**
> *Cards priced below fair value are selling quickly, while higher-priced listings struggle to move.*
>
> This market has two different speeds: Cards priced below FMV are selling {absorptionBelow}x faster than new listings appear ({salesBelow} sales vs {belowFMV} listings), while higher-priced cards aren't selling quickly ({absorptionAbove} absorption, {salesAbove} sales vs {aboveFMV} listings). Average asking price is {marketPressure}% vs FMV.

**If you’re a seller**
- Cards priced near or below fair value sell much faster.
- Overpricing usually leads to long wait times.
- If you want a quick sale, price competitively.

**If you’re flipping**
- This is a good flipping setup.
- Buy below fair value and sell close to it.
- Avoid premium pricing—those listings tend to stall.

**If you’re collecting long-term**
- A solid time to buy if you stick to fair prices.
- Ignore overpriced listings; they don’t reflect real demand.
- Patient buyers have the advantage here.

**Data Quality Score:** {dataQualityScore}/100

---

### 3. 🚨 High Risk Market Conditions

**Trigger:** `marketPressure > 30 AND liquidityScore < 50`  
**Color:** #ff3b30 (Red)

**Message:**
> *Prices are high, but buyers aren’t active*
>
> Sellers are asking {marketPressure}% above FMV, but there aren't many buyers interested (liquidity: {liquidityScore}/100). This means listings are overpriced compared to what buyers are actually willing to pay. It may be better to wait for sellers to lower prices or look for better deals elsewhere.

**If you’re a seller**
- This is a tough environment to sell in.
- Expect slow sales or price drops.
- If you need to sell, pricing below the crowd helps.

**If you’re flipping**
- This is usually a bad setup.
- High prices plus low demand leave little room for profit.
- Better opportunities exist elsewhere.

**If you’re collecting long-term**
- Waiting often pays off here.
- Markets like this tend to cool down.
- Patience can lead to better entry prices later.

**Additional Info:**
- Data Quality Score: {dataQualityScore}/100
- Activity: {dominantBandStatement}
- {velocityStatement}

---

### 4. 🔥 Overpriced but Active Market

**Trigger:** `marketPressure > 30 AND liquidityScore >= 50`
**Color:** #ff9500 (Orange)

**Message:**
> *Prices are high, but buyers are still buying*
>
> The market for this card is very hot. Asking prices are {marketPressure}% above FMV, and are supported by strong demand and good liquidity ({liquidityScore}/100). Sellers currently have the upper hand because there are plenty of buyers and lots of sales happening, which helps support these high prices. Prices may still be rising, but they could start to drop if buyer interest or liquidity slows down.

**If you’re a seller**
- This is a strong selling window.
- Buyers are accepting higher prices right now.
- Consider selling while demand is hot.

**If you’re flipping**
- Flips are possible, but timing matters.
- You need to buy and resell quickly.
- Miss the timing, and you risk holding overpriced inventory.

**If you’re collecting long-term**
- You’re paying extra to get a card immediately.
- If you don’t need the card now, waiting is usually safer.
- Great cards often come back down once hype fades.

**Additional Info:**
- Data Quality Score: {dataQualityScore}/100
- Activity: {dominantBandStatement}

---

### 5. ⚡ Fair Pricing, Limited Demand

**Trigger:** `marketPressure <= 15 AND liquidityScore < 50`  
**Color:** #ff9500 (Orange)

**Message:**
> *Prices make sense, but sales are slow*
>
> Prices are fairly reasonable ({marketPressure}% vs FMV), but not many buyers are interested (liquidity: {liquidityScore}/100). Even though prices are fair, cards aren't selling well. This could mean the card is losing popularity or buyer interest is fading. If this card is from a recent release, this could also mean the number of cards available for sale (supply) is starting to outstrip the number of interested buyers (demand).

**If you’re a seller**
- Slow sales are likely, even at fair prices.
- If you want quicker action, slight discounts can help.
- Otherwise, patience is required.

**If you’re flipping**
- Not ideal for quick flips.
- Even good deals may take time to resell.
- Only buy if you expect a future catalyst.

**If you’re collecting long-term**
- This can be a great quiet buying opportunity.
- Fair prices without hype often age well.
- Especially attractive for iconic or historically stable cards.

**Additional Info:**
- Data Quality Score: {dataQualityScore}/100
- Activity: {dominantBandStatement}

---

### 6. 💎 Strong Buy Opportunity

**Trigger:** `marketPressure < 0 AND liquidityScore >= 70`  
**Color:** #34c759 (Green)

**Message:**
> *Underpriced cards with strong buyer demand*
>
> Available cards are priced {absMarketPressure}% below FMV and lots of buyers are active (liquidity: {liquidityScore}/100). This is a rare opportunity: cards are underpriced and selling fast. This could mean a player is breaking out or performing well.

**If you're a seller**
- You could be leaving money on the table at current prices—consider your opinion of the player's potential
- Expect fast sales, even if you raise your price slightly.
- If you're listing now, consider pricing closer to fair value—or just above it.

**If you're flipping**
- This is an excellent setup.
- Buy quickly at current prices and aim for fast resale.
- Delays matter here—once sellers adjust, margins shrink.

**If you're collecting long-term**
- This is one of the better times to buy if you're optimistic about the player's potential
- You're entering below fair value in a market with real demand.
- Acting sooner usually beats waiting in conditions like this.

**Additional Info:**
- Data Quality Score: {dataQualityScore}/100
- Activity: {dominantBandStatement}
- {velocityStatement}

---

### 7. ✅ Healthy Market Conditions

**Trigger:** `marketPressure >= 0 AND marketPressure <= 15 AND liquidityScore >= 70`  
**Color:** #34c759 (Green)

**Message:**
> *Fair prices and active buyers*
>
> Prices are fair ({marketPressure}% vs FMV) and there's plenty of buyer activity (liquidity: {liquidityScore}/100). This is a healthy, well-functioning market where both buyers and sellers are active. Prices accurately reflect current demand: good conditions for both buying and selling.

**If you’re a seller**
- Fair pricing is being rewarded with steady sales.
- No need to overthink timing—this is a good environment to list.
- Well-presented listings should move at reasonable prices.

**If you’re flipping**
- Opportunities exist, but they’re not automatic.
- Profits depend on buying well, not on market imbalance.
- Focus on small edges rather than big swings.

**If you’re collecting long-term**
- A comfortable, low-stress time to buy.
- You’re unlikely to overpay or miss out by waiting briefly.
- Buy based on preference, not fear of price movement.

**Additional Info:**
- Data Quality Score: {dataQualityScore}/100
- Activity: {dominantBandStatement}
- {velocityStatement}

---

### 8. 📊 Balanced Market (Default)

**Trigger:** All other conditions  
**Color:** #007aff (Blue)

**Message:**
> Prices are in the middle range ({marketPressure}% vs FMV) with moderate buyer activity (liquidity: {liquidityScore}/100). This is a normal, stable market: nothing particularly remarkable happening. Use your normal judgment when buying or selling.

**Additional Info:**
- Data Quality Score: {dataQualityScore}/100
- Activity: {dominantBandStatement}

---

## 💡 More Info Pop-ups

Content for the information dialogs shown when users click the ℹ️ buttons.

---

## 1. Market Pressure Info

### Title
📊 Understanding Market Pressure

### Introduction
Market Pressure compares what sellers are **asking today** to what buyers **recently paid**. It does not affect Fair Market Value.

### Formula
**Formula:**
```
(Median Asking Price - FMV) / FMV × 100
```
*Note: Outlier prices are filtered using IQR method for accuracy.*

### Interpretation Bands

#### 🟢 0% to 15% (HEALTHY)
**What it means:** Normal pricing friction. Sellers price slightly above recent sales to leave room for negotiation.

**What to do:** Fair pricing - safe to buy at asking prices or make small offers.

---

#### 🔵 15% to 30% (OPTIMISTIC)
**What it means:** Seller optimism. Prices drifting above recent buyer behavior.

**What to do:** Make offers 10-20% below asking - sellers are likely open to negotiation.

---

#### 🟠 30% to 50% (RESISTANCE)
**What it means:** Overpriced market. Clear resistance between buyers and sellers.

**What to do:** Be patient. Sellers will likely need to lower prices or accept significantly lower offers (20-30% below ask).

---

#### 🔴 50%+ (EXTREME)
**What it means:** Extremely high asking prices. Listings unlikely to transact near current levels unless demand and liquidity is also high.

**What to do:** Wait for price corrections or look for better-priced alternatives. These sellers are detached from market reality. Also check liquidity score.

---

#### 🟣 Negative % (BELOW FMV)
**What it means:** Sellers are asking less than recent sale prices.

**What to do:** These may be undervalued or motivated sellers. Do your due diligence before committing to a sale or purchase.

---

### Quick Tip
💡 **Quick Tip:**
Market Pressure above 30% suggests waiting for price corrections or making significantly lower offers. Below 0% indicates potential buying opportunities **if** buyer demand is healthy.

### Example
📝 **Example:**
If cards recently sold for **$100** (FMV), but current listings ask **$140**, that's **+40% Market Pressure** (Resistance) = sellers are asking too much.

### Data Confidence
📊 **Pricing Data Confidence:**
- **High:** 10+ active listings
- **Medium:** 5-9 active listings
- **Low:** Less than 5 active listings (use with caution)

---

## 2. Market Confidence Info

### Title
🎯 Understanding Market Confidence

### Introduction
Market Confidence measures how **consistent** prices are in the market. Higher consistency = more reliable data and clearer pricing signals.

### Formula
**Formula:**
```
100 / (1 + Coefficient of Variation / 100)
```
*Coefficient of Variation = (Standard Deviation ÷ Average Price) × 100*

### Confidence Bands

#### 🟢 70-100 (HIGH CONFIDENCE)
**What it means:** Prices are very consistent - strong market consensus on value.

**What to do:** FMV estimates are highly reliable. Safe to use for pricing decisions.

---

#### 🔵 40-69 (MODERATE CONFIDENCE)
**What it means:** Some price variation but overall market is functional. ***Closer to 40 means caution; closer to 70 means improving clarity.***

**What to do:** FMV estimates are reasonably reliable. Consider using price ranges.

---

#### 🟠 20-39 (LOW CONFIDENCE)
**What it means:** High price variation - market is less certain.

**What to do:** Use caution with FMV estimates. Consider refining search terms or gathering more data.

---

#### 🔴 0-19 (VERY LOW CONFIDENCE)
**What it means:** Extreme price variation - unreliable market signals.

**What to do:** FMV estimates may not be accurate. Refine search or check for data quality issues.

---

### Key Principle
💡 **Key Principle:**
Market Confidence tells you how **reliable** the data is, not what the value is. High confidence means prices are clustered together. Low confidence means prices are scattered and unpredictable.

### Example
📝 **Example:**
If 20 cards sold between $95-$105 (tight range), confidence is **HIGH (80+)**. If they sold between $50-$200 (wide range), confidence is **LOW (30 or less)**.

### Improve Confidence
🔧 **Improve Confidence:**
- Make search terms more specific (exact card number, parallel type)
- Filter out unrelated variations (use "Base Only" or exclude parallels)
- Exclude lots and multi-card listings
- Check for grading consistency (don't mix raw with graded)

---

## 3. Liquidity Risk Info

### Title
💧 Understanding Liquidity Risk

### Introduction
Liquidity Risk measures how easy or difficult it may be to **SELL** a card at or near Fair Market Value. It focuses on **exit risk**, not value.

### Absorption Ratio
**Absorption Ratio:**
```
Completed Sales / Active Listings
```
*Measures demand vs supply based on 90-day sales and current Buy It Now listings.*

### Liquidity Bands

#### 🟢 Ratio ≥ 1.0 (HIGH LIQUIDITY)
**What it means:** Demand exceeds supply - cards sell quickly.

**What to do:** Price competitively to capture demand. Quick exits are likely.

---

#### 🔵 Ratio 0.5-1.0 (MODERATE)
**What it means:** Balanced market with healthy liquidity.

**What to do:** Normal market conditions - expect reasonable sell time.

---

#### 🟠 Ratio 0.2-0.5 (LOW LIQUIDITY)
**What it means:** Slow absorption - elevated exit risk.

**What to do:** May need patience or competitive pricing to attract buyers.

---

#### 🔴 Ratio < 0.2 (VERY LOW)
**What it means:** Illiquid market - high exit risk.

**What to do:** Pricing at or below FMV may help, but sales can still take time.

---

### Key Principle
💡 **Key Principle:**
Liquidity Risk does NOT modify FMV. It tells you how easy it will be to sell at that price. High FMV with low liquidity means the card is valuable but may take time to sell.

### Data Confidence
📊 **Liquidity Data Coverage:**
- **High:** 10+ sales AND 10+ active listings
- **Medium:** 5+ sales AND 5+ active listings
- **Low:** Below medium thresholds (use with caution)

---

## ✏️ Editing Guidelines

### Safe to Edit
- ✅ Message text (preserve placeholders like `{confidence}`)
- ✅ Icon emojis (🟢, 🔵, etc.)
- ✅ Headers and section titles
- ✅ Examples and tips
- ✅ Band labels and descriptions

### Do NOT Change
- ❌ Placeholder syntax (keep `{curlyBraces}`)
- ❌ Trigger conditions (unless you understand the logic)
- ❌ Color codes format (keep #rrggbb format)
- ❌ File structure and hierarchy

### Best Practices
1. Keep messages clear and action-oriented
2. Maintain consistent tone (direct, helpful, non-technical)
3. Use concrete examples where possible
4. Keep technical jargon to minimum
5. Test readability - aim for 8th grade reading level

---

## 🔧 Implementation Notes

### File Locations
- **Market Assessment Logic:** `/static/js/analysis.js` - `renderMarketAssessment()` function
- **Market Pressure Popup:** `/static/script.js` - `showMarketPressureInfo()` function
- **Market Confidence Popup:** `/static/script.js` - `showMarketConfidenceInfo()` function
- **Liquidity Risk Popup:** `/static/script.js` - `showLiquidityRiskInfo()` function

### Content Integration Process
After editing this file:
1. Copy the updated message text
2. Open the corresponding function in the codebase
3. Replace the existing message content
4. Preserve all HTML structure and styling
5. Test in the application to verify rendering

### Color Reference
- Green (#34c759) - Positive/healthy conditions
- Blue (#007aff) - Neutral/informational
- Purple (#5856d6) - Special conditions
- Orange (#ff9500) - Caution/warning
- Red (#ff3b30) - Risk/danger

---

## 📊 Message Coverage Matrix

| Scenario | Icon | Color | Trigger Logic | Action Tone |
|----------|------|-------|---------------|-------------|
| Data Quality Warning | ⚠️ | Orange | Low confidence + high pressure | Diagnostic |
| Two-Tier Market | 🔀 | Purple | High below absorption + low above | Analytical |
| High Risk | 🚨 | Red | High pressure + low liquidity | Cautionary |
| Overpriced Active | ⚠️ | Orange | High pressure + good liquidity | Warning |
| Fair/Limited Demand | ⚡ | Orange | Low pressure + low liquidity | Cautionary |
| Strong Buy Op | 💎 | Green | Negative pressure + high liquidity | Opportunistic |
| Healthy Market | ✅ | Green | Low pressure + high liquidity | Positive |
| Balanced Market | 📊 | Blue | Default fallback | Neutral |

---

## 📝 Version History

### Version 1.0 (2024-12-18)
- Initial extraction of all market messages
- Organized into editable Markdown format
- Added comprehensive editing guidelines
- Documented 8 market assessment scenarios
- Extracted 3 complete More Info pop-ups

---

**Need Help?** 
- All placeholders `{likeThis}` are replaced with live data
- Preserve HTML tags if editing directly in code
- Test changes in a development environment first
- Keep messages under 200 words for readability
