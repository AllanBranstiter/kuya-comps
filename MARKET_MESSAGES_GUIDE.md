# Market Messages Content Guide

**Version:** 1.2.0
**Last Updated:** December 20, 2024
**Purpose:** Editable content for all Market Assessment messages and More Info pop-ups

---

## 📋 Table of Contents

1. [Market Assessment Messages](#market-assessment-messages)
2. [More Info Pop-ups](#more-info-pop-ups)
3. [Price Tier Market Dynamics](#price-tier-market-dynamics)
4. [Editing Guidelines](#editing-guidelines)
5. [Implementation Notes](#implementation-notes)

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
> *Current sellers are asking {absMarketPressure}% below Fair Market Value*
>
> Active listings are priced below what cards recently sold for, and lots of buyers are active (liquidity: {liquidityScore}/100). This is a rare opportunity: current asking prices are undervalued compared to recent sales. This could mean sellers haven't adjusted to rising demand, or a player is breaking out.

**If you're a seller**
- Current market asks are below recent sales—you could price at Fair Market Value and still sell quickly
- Expect fast sales even if you raise your price toward Fair Market Value
- Consider pricing at Fair Market Value or just above it

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
*Measures demand vs supply based on recent completed sales and current Buy It Now listings.*

### How Absorption Converts to Liquidity Score
The 0-100 liquidity score is calculated from the absorption ratio:

- **Ratio ≥ 1.0:** Score ranges from 80-100 (increases by 20 points per 1.0 ratio increase)
- **Ratio 0.5-1.0:** Score ranges from 50-79 (linear scale)
- **Ratio 0.2-0.5:** Score ranges from 25-49 (linear scale)
- **Ratio < 0.2:** Score ranges from 10-24 (linear scale down to minimum of 10)

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

## 💰 Price Tier Market Dynamics

Understanding how baseball card markets behave differently at various price points helps you make better decisions. Buyer psychology, market speed, and risk factors change significantly as prices increase. Use these insights alongside the Market Assessment messages to get a complete picture of your specific card's market.

### Tier Classification

- 🟢 **Tier 1 (tier_1):** Under $100 - #34c759 (Green)
- 🔵 **Tier 2 (tier_2):** $100-$499 - #007aff (Blue)
- 🟣 **Tier 3 (tier_3):** $500-$2,000 - #5856d6 (Purple)
- 🟠 **Tier 4 (tier_4):** $2,000-$10,000 - #ff9500 (Orange)
- 🔴 **Tier 5 (tier_5):** $10,000+ - #ff3b30 (Red)

---

### 🟢 Tier 1: Under $100

**Tier:** tier_1
**Price Range:** Under $100
**Color:** #34c759 (Green)

#### Market Characteristics

This is the highest volume, fastest-moving segment of the baseball card market. Cards typically sell within days to a couple weeks when priced fairly. Markets at this tier react quickly to player news and trends, which means prices can move fast in either direction. Liquidity scores are usually highest here, with more buyers and listings than any other tier.

#### Buyer Psychology

Buyers at this tier mix collectors, flippers, and casual fans. Impulse purchases are common—if someone likes a player or sees a deal, they often buy quickly without extensive research. Buyers expect quick transactions and reasonable condition, but most are forgiving of minor flaws. Price sensitivity is high: a difference of $10-20 can push buyers to a competitor's listing.

#### Liquidity Expectations

Expect high liquidity scores (typically 60-100) and fast sales when prices align with FMV. Cards priced at or below FMV usually move within 3-7 days. Even cards with moderate Market Pressure (+10% to +20%) can sell within 1-2 weeks if presentation is good. This tier rarely sees the extended wait times common in higher price ranges.

**If you're a seller**
- Speed matters more than maximizing price. Price competitively and expect quick sales.
- Shipping costs eat into profits—consider free shipping if it helps you sell faster.
- Photos matter less than higher tiers, but clean images of the actual card build trust.
- If you're not selling within 2 weeks, your price is likely too high or your listing isn't visible enough.

**If you're flipping**
- This is volume-driven flipping. Aim for 15-30% margins and fast turnover.
- Look for cards with negative Market Pressure (below FMV) and liquidity scores above 70—these are [Strong Buy Opportunities](#6--strong-buy-opportunity).
- Avoid holding inventory more than 30 days. If it's not moving, drop the price.
- Transaction costs (fees, shipping) matter a lot at this tier. Factor them into every purchase.

**If you're collecting long-term**
- Great tier for experimenting and building your collection without major risk.
- When you see [Healthy Market Conditions](#7--healthy-market-conditions) (fair prices, high liquidity), it's a low-stress time to buy.
- Don't rush during [Overpriced but Active Markets](#4--overpriced-but-active-market) unless you need the card immediately—patience usually pays off.
- Focus on players you genuinely want. At this price, collecting for enjoyment makes more sense than pure investment.

#### Risk Factors

- **Trend Sensitivity:** Rookie hype and player performance can cause rapid price swings. A bad week can drop values 20-40%.
- **Shipping Damage:** At this price point, insurance is rarely used. Damaged cards become total losses.
- **Condition Creep:** Small condition issues matter less now, but hurt resale value later.
- **Fee Impact:** Platform fees (10-15%) and shipping can consume 30-40% of the sale price on low-end cards.

#### Quick Tips

💡 **Tier 1 Pro Tip:** When Market Pressure is above 20%, wait 1-2 weeks. Sellers usually adjust prices downward when cards don't move quickly. This tier moves too fast to sustain overpricing.

💡 **Watch Liquidity:** At Tier 1, a liquidity score below 50 is unusual and often signals declining player interest. See [Fair Pricing, Limited Demand](#5--fair-pricing-limited-demand) for what this means.

---

### 🔵 Tier 2: $100-$499

**Tier:** tier_2
**Price Range:** $100-$499
**Color:** #007aff (Blue)

#### Market Characteristics

This tier represents the sweet spot for active collectors. Markets move at a moderate pace—faster than high-end cards, slower than budget buys. Buyers do meaningful research and compare multiple listings before purchasing. Liquidity scores typically range from 40-80, varying by player and card scarcity. Market Pressure readings here are reliable indicators: buyers notice when asking prices drift above recent sales.

#### Buyer Psychology

Buyers at this tier are knowledgeable hobbyists and serious collectors. They check recent sales, compare conditions, and often negotiate. Graded cards start commanding clear premiums over raw cards. Buyers expect detailed photos, accurate descriptions, and reasonable shipping timelines. They're less impulsive than Tier 1 buyers but more decisive than higher-tier investors.

#### Liquidity Expectations

Typical liquidity scores range from 50-70 for established players. Expect 1-3 week sell times at fair prices. Cards with Market Pressure above 25% face serious resistance—buyers will wait or make low offers rather than pay above-market prices. When you see negative Market Pressure (asking less than FMV) combined with liquidity scores above 60, expect very fast sales.

**If you're a seller**
- Quality photos and detailed descriptions matter. Buyers scrutinize condition at this tier.
- If Market Pressure shows you're asking 20%+ above FMV, expect slow sales or significant offers below your asking price.
- Grading can help: a PSA 9 commands predictable premiums over raw cards.
- Price within 10% of FMV for sales within 2-3 weeks. Higher pricing means longer wait times.

**If you're flipping**
- Focus on quality over quantity. Fewer transactions, higher margins (20-40%) are achievable.
- Look for [Two-Tier Markets](#2--two-tier-market-detected)—cards below FMV sell fast while overpriced ones stall.
- Player performance matters. Time purchases before hot streaks; sell into performance peaks.
- Grading costs ($20-40) are worth it for borderline cards that could grade 9 or higher.

**If you're collecting long-term**
- This tier balances affordability with significance. You're buying players and cards that matter.
- [Healthy Market Conditions](#7--healthy-market-conditions) (Market Pressure 0-15%, Liquidity 70+) signal good entry points.
- Avoid [High Risk Market Conditions](#3--high-risk-market-conditions) (high Market Pressure, low liquidity)—patience pays off.
- Consider grading valuable pulls. Protection and resale value both improve.

#### Risk Factors

- **Player Performance Volatility:** A slump or injury can drop values 30-50% quickly.
- **Market Timing Sensitivity:** Buying during [Overpriced but Active](#4--overpriced-but-active-market) periods means overpaying.
- **Authentication Concerns:** Counterfeits exist at this tier. Buy from reputable sellers.
- **Grade Sensitivity:** A PSA 8 vs PSA 9 can mean 40-60% price difference.

#### Quick Tips

💡 **Tier 2 Pro Tip:** When Market Pressure exceeds 30% and liquidity is below 50 ([High Risk](#3--high-risk-market-conditions)), sellers usually reduce prices within 2-4 weeks. Wait them out unless the card is particularly scarce.

💡 **Player Performance Watch:** Set alerts for your target players. Buying during quiet periods (offseason, slumps) when Market Pressure is low can save 20-40% vs peak performance pricing.

### 🟣 Tier 3: $500-$2,000

**Tier:** tier_3
**Price Range:** $500-$2,000
**Color:** #5856d6 (Purple)

#### Market Characteristics

This tier marks the transition to serious collecting and investment. Markets are thinner—fewer buyers and fewer listings mean liquidity scores often range from 30-60. Sales typically take 2-4 weeks at fair prices, longer if Market Pressure is elevated. Market dynamics become more important: even a [Balanced Market](#8--balanced-market-default) (moderate pressure, moderate liquidity) requires patience at this tier.

#### Buyer Psychology

Buyers are experienced collectors and investors who treat purchases carefully. They research extensively, check population reports for graded cards, and verify authenticity. Negotiations are standard—even fairly priced listings receive offers. Buyers want proof of condition: clear photos, grading details, and seller reputation matter significantly. They're willing to wait weeks or months for the right card at the right price.

#### Liquidity Expectations

Expect moderate to low liquidity scores (30-60 typical). Healthy cards with fair pricing sell in 2-4 weeks. Cards facing [High Risk Market Conditions](#3--high-risk-market-conditions) (high Market Pressure above 30%, low liquidity below 50) can take months. When you encounter [Strong Buy Opportunities](#6--strong-buy-opportunity) (negative Market Pressure, high liquidity), act quickly—these are rare at this tier and don't last.

**If you're a seller**
- Professional presentation is essential. Get quality photos, accurate grading details, and complete descriptions.
- Market Pressure above 20% will significantly slow sales. Price within 10-15% of FMV for reasonable movement.
- Consider auction houses or specialty platforms for high-demand cards.
- Be prepared to negotiate. Few buyers pay full asking price at this tier.
- During [Fair Pricing, Limited Demand](#5--fair-pricing-limited-demand) markets, be patient or offer slight discounts.

**If you're flipping**
- This tier requires expertise. Know population reports, player histories, and market trends cold.
- Target 30-50% margins minimum—wait times and holding costs are significant.
- [Two-Tier Markets](#2--two-tier-market-detected) are ideal: buy below FMV (fast absorption) and sell near FMV.
- Avoid cards during [Overpriced but Active Markets](#4--overpriced-but-active-market) unless you can resell immediately.
- Grading is non-negotiable for most flips. Budget $40-100 per card for professional grading.

**If you're collecting long-term**
- You're making significant investments. Buy during market weakness, not strength.
- [Healthy Market Conditions](#7--healthy-market-conditions) are rare at this tier—when they appear, it's a buying window.
- During [Data Quality Warnings](#1--data-quality-warning), pause and refine your search before committing.
- Authentication and grading protect your investment. Don't skip these steps to save money.
- Consider condition census—top-graded examples in major sets hold value best long-term.

#### Risk Factors

- **Market Illiquidity:** Low liquidity scores (below 40) mean finding a buyer takes time. Exit planning matters.
- **Authentication Critical:** Counterfeits and alterations are profitable to create at this tier.
- **Grade Dependence:** A one-point grade difference can mean 50-100% price variation.
- **Market Pressure Sensitivity:** High Market Pressure above 30% with low liquidity means you may wait 3-6 months to sell.

#### Quick Tips

💡 **Tier 3 Pro Tip:** At this tier, [Data Quality Scores](#market-confidence-info) below 60 suggest your search is mixing different card variations. Refine your search terms to get clearer, more reliable pricing signals before buying or selling.

💡 **Liquidity Risk Awareness:** When [Liquidity Risk](#liquidity-risk-info) is high (absorption ratio below 0.5), you're taking on exit risk. Make sure you're comfortable holding the card for 6+ months if needed.

---

### 🟠 Tier 4: $2,000-$10,000

**Tier:** tier_4
**Price Range:** $2,000-$10,000
**Color:** #ff9500 (Orange)

#### Market Characteristics

This is investment-grade territory. Markets are slow and thin—liquidity scores rarely exceed 50, often running 20-40. Transactions commonly take 1-3 months even at fair prices. Market Pressure readings become critical: buyers simply won't engage when asking prices are 20%+ above recent sales. The thin market means [Balanced Markets](#8--balanced-market-default) don't guarantee quick sales—patience is mandatory at this tier.

#### Buyer Psychology

Buyers are serious investors, advanced collectors, or dealers. Every purchase involves extensive research: population data, price history, authenticity verification, market trends. They track specific cards for months, waiting for the right opportunity. Relationships and reputation matter—deals often happen through established networks, not just public marketplaces. Buyers expect negotiation and won't overpay even for desirable cards.

#### Liquidity Expectations

Liquidity scores typically run 20-50. Even cards showing [Healthy Market Conditions](#7--healthy-market-conditions) (fair pressure, good liquidity) still take 4-8 weeks to sell. High Market Pressure situations ([High Risk](#3--high-risk-market-conditions)) can mean 6-12 month hold times. [Strong Buy Opportunities](#6--strong-buy-opportunity) at this tier are extremely rare and usually indicate major market mispricing—investigate carefully before assuming it's a deal.

**If you're a seller**
- Professional grading and authentication aren't optional—they're required for serious buyers.
- Price within 5-10% of FMV maximum. This market punishes overpricing severely.
- Use specialty auction houses or consignment for premium cards. They access serious buyers you can't reach.
- Be prepared for months-long sales processes and extensive negotiations.
- During [Fair Pricing, Limited Demand](#5--fair-pricing-limited-demand), consider waiting for better market conditions or accept longer timelines.
- Market Pressure above 15% will stop almost all buyer interest.

**If you're flipping**
- This tier requires deep expertise and significant capital. Don't enter casually.
- Target 40-60% margins minimum—holding costs and risks are substantial.
- Focus on market inefficiencies: estate sales, uninformed sellers, temporary market dislocations.
- [Two-Tier Markets](#2--two-tier-market-detected) with high absorption below FMV are your ideal buying windows.
- Avoid [Overpriced but Active Markets](#4--overpriced-but-active-market)—by the time you can resell, enthusiasm likely fades.
- Budget $100-300 per card for top-tier grading services and fast turnaround.

**If you're collecting long-term**
- These are major financial decisions. Treat them as seriously as other investment purchases.
- Buy only during market weakness: watch for [Data Quality Warnings](#1--data-quality-warning) that signal seller uncertainty.
- [High Risk Market Conditions](#3--high-risk-market-conditions) mean waiting is wise—markets this thin eventually correct.
- Get multiple expert opinions before major purchases. Authentication expertise matters enormously.
- Understand you're buying illiquid assets. Plan to hold 5-10+ years if needed.

#### Risk Factors

- **Extreme Illiquidity:** Liquidity scores below 30 mean very limited buyer pool. Selling takes significant time.
- **Market Risk:** Changes in player legacy, collecting trends, or economic conditions can impact values 30-50%.
- **Authenticity Stakes:** Professional authentication is critical. Mistakes at this tier are financially devastating.
- **Market Pressure Paralysis:** High Market Pressure (above 20%) with low liquidity can make cards essentially unsellable.

#### Quick Tips

💡 **Tier 4 Pro Tip:** When you see [High Risk Market Conditions](#3--high-risk-market-conditions) (Market Pressure above 30%, Liquidity below 50), sellers usually drop prices 15-25% within 2-3 months. Patience is rewarded at this tier.

💡 **Professional Networks:** At this tier, private sales through established dealers often yield better outcomes than public listings. Build relationships with reputable dealers in your collecting area.

---

### 🔴 Tier 5: $10,000+

**Tier:** tier_5
**Price Range:** $10,000+
**Color:** #ff3b30 (Red)

#### Market Characteristics

This is the ultra-premium market where cards are treated as investment assets. Liquidity scores rarely exceed 40 and often run 10-30—this is an extremely thin market. Transactions commonly take 3-12 months or longer. Market metrics become less precise due to scarce data: [Data Quality Scores](#market-confidence-info) are often low simply due to limited sales. Professional expertise and established networks drive most transactions.

#### Buyer Psychology

Buyers are wealthy collectors, institutional investors, investment funds, or museums. Purchases involve authentication experts, appraisers, legal counsel, and financial advisors. Buyers often track specific cards for years, waiting for perfect opportunities. Provenance, condition census rankings, and historical significance matter as much as player performance. These are relationship-driven transactions where reputation and trust determine whether deals happen.

#### Liquidity Expectations

Expect very low liquidity scores (often 10-30). Even fairly priced premium cards take months to sell. Market Assessment messages are less reliable at this tier due to data scarcity—use them as one signal among many, not as definitive guidance. Private auction houses (Heritage, Goldin, etc.) handle most transactions. The concept of [Healthy Market Conditions](#7--healthy-market-conditions) barely applies—this tier operates on its own timeline regardless of metrics.

**If you're a seller**
- Use major auction houses exclusively. They access serious buyers and provide authentication credibility.
- Market Pressure metrics are less meaningful—each card is unique. Focus on comparable sales and expert appraisals.
- Expect 6-12+ month sales timelines through auction houses. Private sales can happen faster with the right buyer.
- Insurance, storage, and opportunity costs are significant. Factor these into pricing decisions.
- Work with established advisors who specialize in high-value collectibles.
- Tax implications matter—consult with tax professionals on sales this large.

**If you're flipping**
- This tier requires institutional-level expertise and significant capital ($50K+ minimum working capital).
- Margins must be 50-100%+ to justify risks and holding costs.
- Focus exclusively on market inefficiencies: estates, forced liquidations, private treaty sales below market.
- Most profitable opportunities never reach public markets—network access is everything.
- Budget $300-500+ per card for premium grading, authentication, and advisory services.
- Be prepared to hold cards 1-3+ years if market conditions aren't favorable.

**If you're collecting long-term**
- These are major financial commitments. Engage financial advisors and collectibles specialists.
- Buy cards for historical significance and personal passion, not short-term price trends.
- Authentication is everything. Use multiple experts and premium grading services exclusively.
- Plan to hold 10-20+ years minimum. Short-term liquidity at this tier is essentially non-existent.
- Consider insurance riders specifically for high-value collectibles.
- Provenance documentation: maintain complete records of purchase, grading, storage, and chain of custody.
- Estate planning: include valuable cards in estate documents with clear instructions.

#### Risk Factors

- **Liquidity Crisis Risk:** Finding a qualified buyer at a fair price can take years. This is not a liquid investment.
- **Market Timing Uncertainty:** Economic cycles, generational collecting shifts, and player legacy changes impact values unpredictably.
- **Authentication Everything:** Any questions about authenticity destroy value completely. Use only top-tier experts.
- **Holding Costs:** Insurance, climate-controlled storage, and opportunity cost of capital are significant annual expenses.
- **Inheritance Complexity:** Make sure heirs understand value and how to sell. Many valuable collections sell far below market in estate sales.

#### Quick Tips

💡 **Tier 5 Pro Tip:** Market Assessment metrics at this tier should be treated as loose guidelines only. Data is too sparse for reliable statistical analysis. Focus on comparable sales from major auction houses and expert appraisals instead.

💡 **Professional Everything:** At this tier, amateur moves cost tens of thousands. Use premium grading (PSA, SGC), major auction houses (Heritage, Goldin), specialist insurance, and professional advisors for every decision.

💡 **Network Access:** 70%+ of tier 5 deals happen through private networks before reaching public markets. Building relationships with major dealers, auction houses, and serious collectors is as important as capital.

---

## 🔍 Using Tier Insights with Market Assessments

### Integration Guide

Each market assessment message becomes more useful when you understand your tier's characteristics:

**Example: [Strong Buy Opportunity](#6--strong-buy-opportunity) message**
- **Tier 1:** Act within 24-48 hours. These opportunities vanish quickly at high-volume tiers.
- **Tier 2:** Act within 3-5 days. Research the card but don't over-analyze—good deals move.
- **Tier 3:** Take 1-2 weeks to verify authenticity and condition before buying.
- **Tier 4-5:** Investigate extensively. Rare market mispricing at this tier often signals authenticity concerns or hidden condition issues.

**Example: [High Risk Market Conditions](#3--high-risk-market-conditions) message**
- **Tier 1:** Wait 7-14 days. Sellers adjust quickly when cards don't move.
- **Tier 2:** Wait 3-4 weeks. Market pressure usually eases as sellers realize prices aren't sustainable.
- **Tier 3:** Wait 1-3 months. Thin markets take longer to correct.
- **Tier 4-5:** Wait 3-6+ months or look elsewhere. These markets correct very slowly.

### Cross-Reference Quick Guide

| Market Message | Tier 1 Action | Tier 2 Action | Tier 3 Action | Tier 4-5 Action |
|----------------|---------------|---------------|---------------|-----------------|
| **Strong Buy** | Buy within 48hr | Buy within 5 days | Verify & buy 1-2wks | Investigate deeply |
| **Healthy Market** | Normal buying | Normal buying | Good opportunity | Rare, verify data |
| **Balanced** | Normal judgment | Normal judgment | Slightly cautious | Investigate trends |
| **High Risk** | Wait 1-2 weeks | Wait 3-4 weeks | Wait 1-3 months | Wait 3-6+ months |
| **Overpriced Active** | Avoid unless urgent | Timing risk | High timing risk | Avoid |
| **Fair/Limited Demand** | Opportunity | Patient buying | Good for collecting | Investigate cause |
| **Two-Tier** | Best flip setup | Strong flip setup | Good flip setup | Rare, verify data |
| **Data Warning** | Refine search | Refine search | Refine or pause | Get expert opinion |

---

## 📊 Tier Comparison Matrix

| Aspect | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|--------|--------|--------|--------|--------|--------|
| **Typical Sell Time** | 3-7 days | 1-3 weeks | 2-4 weeks | 1-3 months | 3-12+ months |
| **Typical Liquidity Score** | 60-100 | 40-80 | 30-60 | 20-50 | 10-30 |
| **Market Pressure Tolerance** | +30% (slow sales) | +20% (resistance) | +15% (major resistance) | +10% (severe resistance) | Unique per card |
| **Buyer Knowledge** | Low-Moderate | Moderate-High | High | Expert | Expert |
| **Due Diligence Time** | Minutes | Hours | Days | Weeks | Months |
| **Grading Impact** | Minimal | Moderate | High | Critical | Critical |
| **Photo Quality Impact** | Low | Moderate | High | Critical | Critical |
| **Market Depth** | Very Deep | Moderate | Thin | Very Thin | Extremely Thin |
| **Price Volatility** | High | Moderate | Moderate | Moderate-Low | Low |
| **Impulse Buying** | Very Common | Uncommon | Rare | Never | Never |
| **Negotiation Expected** | Rare | Common | Standard | Required | Required |
| **Platform Fees Impact** | High (30-40%) | Moderate (15-25%) | Moderate (10-20%) | Low-Mod (8-15%) | Low (via auction) |
| **Authentication Needs** | Not required | Helpful | Important | Critical | Absolutely Essential |
| **Typical Flip Margin** | 15-30% | 20-40% | 30-50% | 40-60% | 50-100%+ |
| **Capital Risk** | Very Low | Low-Moderate | Moderate-High | High | Very High |

---

## 4️⃣ Editing Guidelines

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

## 5️⃣ Implementation Notes

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
| Overpriced Active | 🔥 | Orange | High pressure + good liquidity | Warning |
| Fair/Limited Demand | ⚡ | Orange | Low pressure + low liquidity | Cautionary |
| Strong Buy Op | 💎 | Green | Negative pressure + high liquidity | Opportunistic |
| Healthy Market | ✅ | Green | Low pressure + high liquidity | Positive |
| Balanced Market | 📊 | Blue | Default fallback | Neutral |

---

## 📝 Version History

### Version 1.2.0 (2024-12-20)
- **Improved clarity and accuracy of user-facing messages:**
  - Changed "90-day sales" to "recent completed sales" in Liquidity Risk popup (more accurate to implementation)
  - Added detailed explanation of how Absorption Ratio converts to 0-100 Liquidity Score
  - Updated Strong Buy Opportunity message to clarify it refers to current asking prices vs recent sales
  - Revised seller advice in Strong Buy scenario to emphasize pricing opportunity
  - Updated `getDominantBandStatement()` function to use plain language instead of technical "absorption ratio"
  - Activity statements now show actual numbers (e.g., "12 recent sales vs 8 listings") with pace descriptors (fast/normal/slow)

### Version 1.1.0 (2024-12-19)
- Added Price Tier Market Dynamics section with 5 comprehensive price tiers
- Integrated tier-specific guidance for sellers, flippers, and collectors
- Added cross-references linking tier insights with all 8 Market Assessment messages
- Included Integration Guide showing tier-specific responses to market conditions
- Added comprehensive Tier Comparison Matrix across 15+ market dimensions
- Provided liquidity score ranges, Market Pressure tolerances, and timing expectations per tier

### Version 1.0.1 (2024-12-19)
- Synced with implementation files (analysis.js and script.js)
- Fixed Message Coverage Matrix: Updated "Overpriced Active" icon from ⚠️ to 🔥 to match code
- Verified all content matches actual implementation
- Confirmed all placeholders, trigger conditions, and message text are accurate

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
