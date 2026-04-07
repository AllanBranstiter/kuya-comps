#!/usr/bin/env python3
"""
FMV Pipeline Audit — Investigation Script

Runs all 9 step investigations against search_logs/ and produces a
consolidated report. Designed to be run from the project root:

    cd /Users/allanbranstiter/Documents/GitHub/kuya-comps
    python3 investigate_fmv_pipeline.py
"""
import json
import glob
import os
import re
import sys
import numpy as np
from collections import Counter, defaultdict
from pathlib import Path
from math import ceil
from scipy.stats import skew

# Add project root to path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.config import (
    MIN_CONCENTRATION_RATIO, MIN_SECONDARY_CLUSTER_RATIO,
    PRICE_BIN_SIZE_BULK, PRICE_BIN_SIZE_LOW, PRICE_BIN_PCT_LOW,
    PRICE_BIN_PCT_MID, PRICE_BIN_PCT_GRAIL,
    AUCTION_BASE_WEIGHT, BUY_IT_NOW_WEIGHT, BEST_OFFER_WEIGHT,
    BID_COUNT_HIGH, BID_COUNT_MODERATE, BID_COUNT_LOW,
    BID_WEIGHT_HIGH, BID_WEIGHT_MODERATE, BID_WEIGHT_LOW,
    MIN_VOLUME_WEIGHT, MAX_VOLUME_WEIGHT,
)

LOG_DIR = Path("search_logs")


# ============================================================================
# Helpers
# ============================================================================

def load_sold_logs():
    """Load all sold JSON logs. Returns list of (filename, data) tuples.

    Retroactively parses buying_format on every item so that historical
    logs (saved before parse_buying_format was deployed) get correct
    is_auction / bids / has_best_offer flags.
    """
    logs = []
    for path in sorted(LOG_DIR.glob("sold_*.json")):
        if "_analytics" in path.name:
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            # Retroactively fix auction/BIN/BO flags from buying_format string
            for item in data.get("items", []):
                parse_buying_format(item)
            logs.append((path.name, data))
        except (json.JSONDecodeError, IOError):
            pass
    return logs


def load_analytics_supplements():
    """Load analytics supplement files. Returns dict keyed by linked sold log stem."""
    supplements = {}
    for path in sorted(LOG_DIR.glob("*_analytics.json")):
        try:
            with open(path) as f:
                data = json.load(f)
            linked = data.get("_meta", {}).get("linked_log", "")
            if linked:
                supplements[linked] = data
        except (json.JSONDecodeError, IOError):
            pass
    return supplements


_BID_PATTERN = re.compile(r'^(\d+)\s+bids?$', re.IGNORECASE)


def parse_buying_format(item):
    """Parse the buying_format string from SearchAPI and set auction/BIN/BO flags.

    Mirrors the parse_buying_format function in comps.py so we can
    retroactively fix historical logs that were saved before the parser
    was deployed.
    """
    buying_format = (item.get('buying_format') or '').strip()

    bid_match = _BID_PATTERN.match(buying_format)
    if bid_match:
        bid_count = int(bid_match.group(1))
        item['is_auction'] = True
        item['auction_sold'] = True
        item['bids'] = bid_count
        item['total_bids'] = bid_count
        item['is_buy_it_now'] = False
        item['is_best_offer'] = False
        return

    fmt_lower = buying_format.lower()

    if fmt_lower == 'buy it now':
        item['is_auction'] = False
        item['is_buy_it_now'] = True
        item['is_best_offer'] = False
        return

    if fmt_lower == 'or best offer':
        item['is_auction'] = False
        item['is_buy_it_now'] = True
        item['is_best_offer'] = True
        item['has_best_offer'] = True
        item['best_offer_enabled'] = True
        return


def extract_prices(items):
    """Extract valid total_price values from items list."""
    return [item["total_price"] for item in items
            if item.get("total_price") and item["total_price"] > 0]


def compute_volume_weight(item):
    """Replicate calculate_volume_weight logic on raw dict."""
    base = 1.0
    is_auction = (
        item.get("is_auction") or item.get("auction_sold") or
        (item.get("bids") is not None and item["bids"] > 0) or
        (item.get("total_bids") is not None and item["total_bids"] > 0)
    )
    if is_auction:
        mult = AUCTION_BASE_WEIGHT
        bids = item.get("bids") or item.get("total_bids") or 0
        if bids >= BID_COUNT_HIGH:
            mult += BID_WEIGHT_HIGH
        elif bids >= BID_COUNT_MODERATE:
            mult += BID_WEIGHT_MODERATE
        elif bids >= BID_COUNT_LOW:
            mult += BID_WEIGHT_LOW
    else:
        mult = BUY_IT_NOW_WEIGHT
        if item.get("has_best_offer") or item.get("best_offer_enabled"):
            mult = BEST_OFFER_WEIGHT
    w = base * mult
    ai = item.get("ai_relevance_score")
    if ai is not None:
        w *= ai
    return min(max(w, MIN_VOLUME_WEIGHT), MAX_VOLUME_WEIGHT)


def detect_clusters_from_prices(prices_arr):
    """Lightweight cluster detection mirroring fmv_service logic."""
    if len(prices_arr) < 4:
        return None
    median_price = float(np.median(prices_arr))
    if median_price <= 10:
        bin_size = PRICE_BIN_SIZE_BULK
    elif median_price <= 100:
        bin_size = median_price * PRICE_BIN_PCT_LOW
    elif median_price <= 1000:
        bin_size = median_price * PRICE_BIN_PCT_MID
    else:
        bin_size = median_price * PRICE_BIN_PCT_GRAIL

    min_p, max_p = float(np.min(prices_arr)), float(np.max(prices_arr))
    bins = np.arange(min_p, max_p + bin_size, bin_size)
    if len(bins) < 2:
        return None
    counts, edges = np.histogram(prices_arr, bins=bins)

    clusters = []
    in_cluster = False
    start = None
    for i, c in enumerate(counts):
        if c > 0:
            if not in_cluster:
                start = edges[i]
                in_cluster = True
            end = edges[i + 1]
        else:
            if in_cluster:
                clusters.append((start, end))
                in_cluster = False
    if in_cluster:
        clusters.append((start, end))

    if not clusters:
        return None

    cluster_data = []
    for s, e in clusters:
        mask = (prices_arr >= s) & (prices_arr <= e)
        cp = prices_arr[mask]
        if len(cp) > 0:
            cluster_data.append((float(np.median(cp)), cp, s, e))

    if not cluster_data:
        return None

    overall_median = float(np.median(prices_arr))
    primary_idx = min(range(len(cluster_data)),
                      key=lambda i: abs(cluster_data[i][0] - overall_median))
    _, primary_prices, _, _ = cluster_data[primary_idx]
    total = len(prices_arr)

    if len(primary_prices) < ceil(total * MIN_CONCENTRATION_RATIO):
        return None

    return {
        "cluster_count": len(cluster_data),
        "primary_size": len(primary_prices),
        "total": total,
        "gravity": len(primary_prices) / total,
        "primary_median": float(np.median(primary_prices)),
        "has_lower": any(cd[0] < cluster_data[primary_idx][0] and len(cd[1]) >= ceil(total * MIN_SECONDARY_CLUSTER_RATIO)
                         for j, cd in enumerate(cluster_data) if j != primary_idx),
        "has_upper": any(cd[0] > cluster_data[primary_idx][0] and len(cd[1]) >= ceil(total * MIN_SECONDARY_CLUSTER_RATIO)
                         for j, cd in enumerate(cluster_data) if j != primary_idx),
    }


def pct(num, denom):
    return f"{num/denom*100:.1f}%" if denom > 0 else "N/A"


def fmt_dist(values):
    """Format distribution summary: min / P25 / median / P75 / max."""
    if not values:
        return "no data"
    a = np.array(values)
    return (f"min={a.min():.2f}  P25={np.percentile(a,25):.2f}  "
            f"median={np.median(a):.2f}  P75={np.percentile(a,75):.2f}  "
            f"max={a.max():.2f}")


# ============================================================================
# Investigations
# ============================================================================

def investigate_step1(sold_logs, supplements):
    """Step 1: Gather the Evidence — data volume and date gaps."""
    print("=" * 70)
    print("STEP 1: Gather the Evidence")
    print("=" * 70)

    item_counts = []
    end_time_populated = 0
    total_items = 0
    low_volume = 0  # <10 items

    for name, data in sold_logs:
        items = data.get("items", [])
        prices = extract_prices(items)
        item_counts.append(len(prices))
        if len(prices) < 10:
            low_volume += 1
        for item in items:
            total_items += 1
            if item.get("end_time"):
                end_time_populated += 1

    # Active logs volume
    active_counts = []
    for path in sorted(LOG_DIR.glob("active_*.json")):
        if "_analytics" in path.name:
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            prices = extract_prices(data.get("items", []))
            active_counts.append(len(prices))
        except:
            pass

    low_active = sum(1 for c in active_counts if c < 5)

    print(f"\nSold logs analyzed: {len(sold_logs)}")
    print(f"Total sold items: {total_items}")
    print(f"Items per search: {fmt_dist(item_counts)}")
    print(f"Searches with <10 sold items: {low_volume} ({pct(low_volume, len(sold_logs))})")
    print(f"\nActive logs analyzed: {len(active_counts)}")
    print(f"Active items per search: {fmt_dist(active_counts)}")
    print(f"Searches with <5 active items: {low_active} ({pct(low_active, len(active_counts))})")
    print(f"\nend_time populated: {end_time_populated}/{total_items} ({pct(end_time_populated, total_items)})")
    print(f"  -> All recency weighting defaults to 30-day assumption")
    print()


def investigate_step2(sold_logs, supplements):
    """Step 2: Weighting — weight distribution, condition, seller reputation."""
    print("=" * 70)
    print("STEP 2: Not All Sales Are Created Equal")
    print("=" * 70)

    all_weights = []
    weight_by_type = {"auction": [], "bin": [], "best_offer": []}
    bid_counts = []
    conditions = Counter()
    price_by_condition = defaultdict(list)
    seller_fb = []

    for name, data in sold_logs:
        for item in data.get("items", []):
            if not item.get("total_price") or item["total_price"] <= 0:
                continue
            w = compute_volume_weight(item)
            all_weights.append(w)

            is_auction = (item.get("is_auction") or item.get("auction_sold") or
                         (item.get("bids") and item["bids"] > 0))
            if is_auction:
                weight_by_type["auction"].append(w)
                bid_counts.append(item.get("bids") or 0)
            elif item.get("has_best_offer") or item.get("best_offer_enabled"):
                weight_by_type["best_offer"].append(w)
            else:
                weight_by_type["bin"].append(w)

            cond = item.get("condition", "Unknown") or "Unknown"
            conditions[cond] += 1
            price_by_condition[cond].append(item["total_price"])

            fb = (item.get("seller") or {}).get("positive_feedback_percent")
            if fb is not None:
                seller_fb.append(fb)

    total_items = len(all_weights)
    print(f"\nVolume weight distribution ({total_items} items):")
    print(f"  {fmt_dist(all_weights)}")
    print(f"\n  By type:")
    for typ, ws in weight_by_type.items():
        print(f"    {typ}: {len(ws)} items ({pct(len(ws), total_items)}), weights: {fmt_dist(ws)}")

    if bid_counts:
        print(f"\n  Auction bid counts ({len(bid_counts)} auctions):")
        print(f"    {fmt_dist(bid_counts)}")
        high_bid = sum(1 for b in bid_counts if b >= BID_COUNT_HIGH)
        mod_bid = sum(1 for b in bid_counts if BID_COUNT_MODERATE <= b < BID_COUNT_HIGH)
        low_bid = sum(1 for b in bid_counts if BID_COUNT_LOW <= b < BID_COUNT_MODERATE)
        no_bid = sum(1 for b in bid_counts if b < BID_COUNT_LOW)
        print(f"    High ({BID_COUNT_HIGH}+ bids): {high_bid}")
        print(f"    Moderate ({BID_COUNT_MODERATE}-{BID_COUNT_HIGH-1}): {mod_bid}")
        print(f"    Low ({BID_COUNT_LOW}-{BID_COUNT_MODERATE-1}): {low_bid}")
        print(f"    Minimal (<{BID_COUNT_LOW}): {no_bid}")

    # Check if weights are bunched (low spread = not differentiating much)
    if all_weights:
        cv = np.std(all_weights) / np.mean(all_weights)
        print(f"\n  Weight CV (spread measure): {cv:.3f}")
        if cv < 0.15:
            print(f"  -> LOW SPREAD: weights are too similar, not differentiating well")
        else:
            print(f"  -> GOOD SPREAD: weights are differentiating sale types")

    print(f"\nCondition distribution:")
    for cond, count in conditions.most_common():
        prices = price_by_condition[cond]
        med = np.median(prices) if prices else 0
        print(f"  {cond}: {count} items, median price ${med:.2f}")

    print(f"\nSeller feedback: {len(seller_fb)} items with data")
    if seller_fb:
        print(f"  {fmt_dist(seller_fb)}")
        low_fb = sum(1 for fb in seller_fb if fb < 95)
        print(f"  Below 95%: {low_fb} ({pct(low_fb, len(seller_fb))})")

    # AI relevance not in logs
    print(f"\nAI relevance scores: NOT stored in search logs (computed live)")
    print(f"  -> Cannot assess from historical data; would need live sampling")
    print()


def investigate_step3(sold_logs, supplements):
    """Step 3: Outlier detection — removal rates, IQR sensitivity."""
    print("=" * 70)
    print("STEP 3: Throw Out the Weird Ones")
    print("=" * 70)

    removal_rates = []
    iqr_sensitivity = []  # (pct_removed_at_0.5x, pct_removed_at_1.5x)
    survivors_5x = []  # items with price > 5x median that survived IQR

    for name, data in sold_logs:
        prices = extract_prices(data.get("items", []))
        if len(prices) < 4:
            continue
        arr = np.array(prices)
        median = np.median(arr)
        q1, q3 = np.percentile(arr, [25, 75])
        iqr = q3 - q1

        for mult in [0.5, 1.0, 1.5]:
            lb = q1 - mult * iqr
            ub = q3 + mult * iqr
            kept = np.sum((arr >= lb) & (arr <= ub))
            removed = len(arr) - kept
            if mult == 0.5:
                removal_rates.append(removed / len(arr))
            if mult == 1.5:
                removal_1_5 = removed / len(arr)

        removal_0_5 = removal_rates[-1]
        iqr_sensitivity.append((removal_0_5, removal_1_5))

        # Check for extreme survivors at 1.5x
        ub_1_5 = q3 + 1.5 * iqr
        lb_1_5 = q1 - 1.5 * iqr
        within = arr[(arr >= lb_1_5) & (arr <= ub_1_5)]
        for p in within:
            if median > 0 and p > 5 * median:
                survivors_5x.append((name, p, median))

    print(f"\nSearches with >=4 items: {len(removal_rates)}")
    print(f"\nOutlier removal rate (IQR 0.5x, current setting):")
    print(f"  {fmt_dist([r*100 for r in removal_rates])}%")
    med_removal = np.median(removal_rates) * 100
    print(f"  Median: {med_removal:.1f}% of items removed per search")

    if iqr_sensitivity:
        diffs = [s[0] - s[1] for s in iqr_sensitivity]
        print(f"\nSensitivity gap (0.5x removal% - 1.5x removal%):")
        print(f"  {fmt_dist([d*100 for d in diffs])}%")
        big_swings = sum(1 for d in diffs if d > 0.15)
        print(f"  Searches where switching 0.5x->1.5x changes removal by >15%: {big_swings}")

    print(f"\nExtreme survivors (>5x median that passed 1.5x IQR): {len(survivors_5x)}")
    for name, price, med in survivors_5x[:5]:
        print(f"  ${price:.2f} (median ${med:.2f}, {price/med:.1f}x) in {name[:50]}")
    print()


def investigate_step4(sold_logs, supplements):
    """Step 4: Cluster detection — cluster rates, threshold sensitivity."""
    print("=" * 70)
    print("STEP 4: Find Where Prices Cluster")
    print("=" * 70)

    cluster_results = {"detected": 0, "not_detected": 0, "too_few": 0}
    cluster_counts = Counter()
    gravities = []
    has_lower = 0
    has_upper = 0

    # Threshold sensitivity
    at_20pct = 0
    at_25pct = 0

    for name, data in sold_logs:
        prices = extract_prices(data.get("items", []))
        if len(prices) < 4:
            cluster_results["too_few"] += 1
            continue

        arr = np.array(prices)
        result = detect_clusters_from_prices(arr)

        if result:
            cluster_results["detected"] += 1
            cluster_counts[result["cluster_count"]] += 1
            gravities.append(result["gravity"])
            if result["has_lower"]:
                has_lower += 1
            if result["has_upper"]:
                has_upper += 1
            at_25pct += 1
        else:
            cluster_results["not_detected"] += 1

        # Check if lowering to 20% would catch this
        if not result:
            # Re-run with lower threshold
            median_price = float(np.median(arr))
            if median_price <= 10:
                bs = PRICE_BIN_SIZE_BULK
            elif median_price <= 100:
                bs = PRICE_BIN_SIZE_LOW
            elif median_price <= 1000:
                bs = median_price * PRICE_BIN_PCT_MID
            else:
                bs = median_price * PRICE_BIN_PCT_GRAIL

            bins = np.arange(float(np.min(arr)), float(np.max(arr)) + bs, bs)
            if len(bins) >= 2:
                counts, edges = np.histogram(arr, bins=bins)
                clusters_raw = []
                in_c = False
                cs = None
                for i, c in enumerate(counts):
                    if c > 0:
                        if not in_c:
                            cs = edges[i]
                            in_c = True
                        ce = edges[i+1]
                    else:
                        if in_c:
                            clusters_raw.append((cs, ce))
                            in_c = False
                if in_c:
                    clusters_raw.append((cs, ce))

                for s, e in clusters_raw:
                    mask = (arr >= s) & (arr <= e)
                    cp = arr[mask]
                    if len(cp) >= ceil(len(arr) * 0.20):
                        at_20pct += 1
                        break

    total_eligible = cluster_results["detected"] + cluster_results["not_detected"]
    print(f"\nTotal sold logs: {len(sold_logs)}")
    print(f"Too few items (<4): {cluster_results['too_few']}")
    print(f"Eligible for clustering: {total_eligible}")
    print(f"\nCluster detected (25% threshold): {cluster_results['detected']} ({pct(cluster_results['detected'], total_eligible)})")
    print(f"No cluster detected: {cluster_results['not_detected']} ({pct(cluster_results['not_detected'], total_eligible)})")
    gained = at_20pct - at_25pct
    print(f"\nIf threshold lowered to 20%: would gain ~{gained} additional detections")

    print(f"\nCluster count distribution:")
    for count, freq in sorted(cluster_counts.items()):
        print(f"  {count} cluster(s): {freq} searches")

    print(f"\nGravity factor (primary_size / total):")
    if gravities:
        print(f"  {fmt_dist(gravities)}")

    detected = cluster_results["detected"]
    print(f"\nSecondary clusters (among detected):")
    print(f"  Has lower cluster: {has_lower} ({pct(has_lower, detected)})")
    print(f"  Has upper cluster: {has_upper} ({pct(has_upper, detected)})")
    print()


def investigate_step5(sold_logs, supplements):
    """Step 5: Sold-side values — branch distribution, skewness calibration."""
    print("=" * 70)
    print("STEP 5: Calculate the Sold-Side Values")
    print("=" * 70)

    branches = {"cluster": 0, "skewed": 0, "normal": 0, "insufficient": 0}
    mv_divergences = []  # abs(cluster_mv - mean_mv) / mean_mv
    skewness_values = []
    skew_gap = []  # median - mean gap when skewed

    for name, data in sold_logs:
        prices = extract_prices(data.get("items", []))
        if len(prices) < 2:
            branches["insufficient"] += 1
            continue

        arr = np.array(prices)
        # Simple IQR filter
        if len(arr) >= 4:
            q1, q3 = np.percentile(arr, [25, 75])
            iqr = q3 - q1
            mask = (arr >= q1 - 1.5 * iqr) & (arr <= q3 + 1.5 * iqr)
            filtered = arr[mask]
            if len(filtered) >= 2:
                arr = filtered

        result = detect_clusters_from_prices(arr)
        s = skew(arr, axis=0) if len(arr) >= 3 else 0

        if result:
            branches["cluster"] += 1
            mean_mv = np.mean(arr)
            cluster_mv = result["primary_median"]
            if mean_mv > 0:
                mv_divergences.append(abs(cluster_mv - mean_mv) / mean_mv * 100)
        elif abs(s) > 1.5:
            branches["skewed"] += 1
            median_v = np.median(arr)
            mean_v = np.mean(arr)
            if mean_v > 0:
                skew_gap.append((median_v - mean_v) / mean_v * 100)
        else:
            branches["normal"] += 1

        if len(arr) >= 3:
            skewness_values.append(s)

    total = sum(branches.values())
    print(f"\nBranch distribution ({total} searches):")
    for branch, count in branches.items():
        print(f"  {branch}: {count} ({pct(count, total)})")

    if mv_divergences:
        print(f"\nCluster MV vs Mean MV divergence (when clusters found):")
        print(f"  {fmt_dist(mv_divergences)}%")
        big = sum(1 for d in mv_divergences if d > 10)
        print(f"  Divergence >10%: {big} searches")

    if skewness_values:
        print(f"\nSkewness distribution:")
        print(f"  {fmt_dist(skewness_values)}")
        above_1_5 = sum(1 for s in skewness_values if abs(s) > 1.5)
        above_1_0 = sum(1 for s in skewness_values if abs(s) > 1.0)
        print(f"  |skew| > 1.5 (current threshold): {above_1_5}")
        print(f"  |skew| > 1.0 (if lowered): {above_1_0}")

    if skew_gap:
        print(f"\nMedian-mean gap when skewed:")
        print(f"  {fmt_dist(skew_gap)}%")
    print()


def investigate_step6(sold_logs, supplements):
    """Step 6: Staleness — coefficient distribution, sellers-dreaming rate."""
    print("=" * 70)
    print("STEP 6: Adjust for Staleness")
    print("=" * 70)

    coefficients = []
    suppressed = 0
    ask_bid_ratios = []
    paired_count = 0

    for name, data in sold_logs:
        fmv = data.get("analytics", {}).get("fmv", {})
        if not fmv or not fmv.get("market_value"):
            continue

        analytics_scores = fmv.get("analytics_scores") or {}
        staleness = analytics_scores.get("staleness") or {}
        if staleness:
            coeff = staleness.get("coefficient", 0)
            coefficients.append(coeff)
            if staleness.get("suppressed"):
                suppressed += 1

        # Find matching active log for ask/bid comparison
        stem = name.replace("sold_", "active_")
        # Look for the analytics supplement for paired data
        supp_key = name
        supp = supplements.get(supp_key, {})
        analytics = supp.get("analytics", {})
        if analytics.get("market_value") and analytics.get("median_asking_price"):
            mv = analytics["market_value"]
            ask = analytics["median_asking_price"]
            if mv > 0:
                ask_bid_ratios.append(ask / mv)
                paired_count += 1

    print(f"\nSearches with staleness data: {len(coefficients)}")
    if coefficients:
        print(f"Staleness coefficient distribution:")
        print(f"  {fmt_dist(coefficients)}")
        nonzero = sum(1 for c in coefficients if c != 0)
        print(f"  Non-zero adjustments: {nonzero} ({pct(nonzero, len(coefficients))})")
        big = sum(1 for c in coefficients if abs(c) > 0.05)
        print(f"  |coefficient| > 5%: {big}")
    print(f"  Sellers-dreaming suppressed: {suppressed}")

    print(f"\nPaired ask/bid data (from supplements): {paired_count}")
    if ask_bid_ratios:
        print(f"Ask/Bid ratio distribution:")
        print(f"  {fmt_dist(ask_bid_ratios)}")
        dreamers = sum(1 for r in ask_bid_ratios if r > 2.0)
        print(f"  Ask > 2x Bid (dreaming): {dreamers} ({pct(dreamers, len(ask_bid_ratios))})")
        mild_dreamers = sum(1 for r in ask_bid_ratios if 1.5 < r <= 2.0)
        print(f"  Ask 1.5-2x Bid (mild dreaming, currently ignored): {mild_dreamers}")
    print()


def investigate_step7(sold_logs, supplements):
    """Step 7: Blend — blend impact, tier distribution, collectibility usage."""
    print("=" * 70)
    print("STEP 7: Blend In What Sellers Are Asking")
    print("=" * 70)

    blend_impacts = []
    tier_counts = Counter()
    supply_counts = Counter()
    collectibility_unused = []

    for supp_name, supp in supplements.items():
        analytics = supp.get("analytics", {})
        mv = analytics.get("market_value")
        if not mv:
            continue

        # Tier classification
        if mv <= 5:
            tier = "bulk"
        elif mv <= 100:
            tier = "low"
        elif mv <= 1000:
            tier = "mid"
        else:
            tier = "grail"
        tier_counts[tier] += 1

        # Supply ratio
        sold_ct = analytics.get("sold_item_count", 0)
        active_ct = analytics.get("active_item_count", 0)
        if sold_ct > 0 and active_ct > 0:
            ratio = active_ct / sold_ct
            if ratio > 2.0:
                supply_counts["oversupplied"] += 1
            elif ratio < 0.5:
                supply_counts["scarce"] += 1
            else:
                supply_counts["balanced"] += 1

        # Collectibility
        c_score = analytics.get("collectibility_score")
        c_label = analytics.get("collectibility_label", "")
        if c_score is not None:
            collectibility_unused.append((tier, c_score, c_label, mv))

        # Blend impact (compare bid_ask_spread)
        spread_pct = analytics.get("bid_ask_spread_pct")
        if spread_pct is not None:
            blend_impacts.append(spread_pct)

    print(f"\nAnalytics supplements analyzed: {len(supplements)}")
    print(f"\nPrice tier distribution:")
    for tier in ["bulk", "low", "mid", "grail"]:
        print(f"  {tier}: {tier_counts.get(tier, 0)}")

    print(f"\nSupply/demand distribution:")
    for supply in ["oversupplied", "balanced", "scarce"]:
        print(f"  {supply}: {supply_counts.get(supply, 0)}")

    if blend_impacts:
        print(f"\nBid-ask spread (proxy for blend impact):")
        print(f"  {fmt_dist(blend_impacts)}%")
        big_spread = sum(1 for s in blend_impacts if abs(s) > 20)
        print(f"  |spread| > 20%: {big_spread}")

    # Collectibility vs tier mismatch
    mismatches = []
    for tier, score, label, mv in collectibility_unused:
        if tier in ("bulk", "low") and score >= 7:
            mismatches.append((tier, score, label, mv))
        elif tier in ("mid", "grail") and score <= 3:
            mismatches.append((tier, score, label, mv))

    print(f"\nCollectibility-tier mismatches (unused signal):")
    print(f"  Total with collectibility data: {len(collectibility_unused)}")
    print(f"  Mismatches (high collectibility + low tier, or vice versa): {len(mismatches)}")
    for tier, score, label, mv in mismatches[:5]:
        print(f"    tier={tier} (${mv:.2f}) but collectibility={score} ({label})")
    print()


def investigate_step8(sold_logs, supplements):
    """Step 8: Confidence range scaling — confidence distribution, cluster interaction."""
    print("=" * 70)
    print("STEP 8: Confidence Adjusts the Range Width")
    print("=" * 70)

    confidences = []
    conf_vs_spread = []  # (conf_score, price_spread_pct)

    for supp_name, supp in supplements.items():
        analytics = supp.get("analytics", {})
        conf = analytics.get("market_confidence")
        mv = analytics.get("market_value")
        qs = analytics.get("quick_sale")
        ps = analytics.get("patient_sale")

        if conf is not None:
            confidences.append(conf)
            if mv and qs is not None and ps is not None and mv > 0:
                spread = (ps - qs) / mv * 100
                conf_vs_spread.append((conf, spread))

    print(f"\nConfidence score distribution ({len(confidences)} searches):")
    if confidences:
        print(f"  {fmt_dist(confidences)}")
        bands = Counter()
        for c in confidences:
            if c >= 85: bands["Excellent (85+)"] += 1
            elif c >= 70: bands["Good (70-84)"] += 1
            elif c >= 55: bands["Moderate (55-69)"] += 1
            elif c >= 40: bands["High Variation (40-54)"] += 1
            else: bands["Chaotic (<40)"] += 1
        for band, count in sorted(bands.items()):
            print(f"    {band}: {count}")

    if conf_vs_spread:
        print(f"\nConfidence vs Range width (range / MV):")
        # Group by confidence band
        low_conf = [s for c, s in conf_vs_spread if c < 50]
        mid_conf = [s for c, s in conf_vs_spread if 50 <= c < 75]
        high_conf = [s for c, s in conf_vs_spread if c >= 75]
        if low_conf:
            print(f"  Low confidence (<50): median range = {np.median(low_conf):.1f}% of MV")
        if mid_conf:
            print(f"  Mid confidence (50-74): median range = {np.median(mid_conf):.1f}% of MV")
        if high_conf:
            print(f"  High confidence (75+): median range = {np.median(high_conf):.1f}% of MV")

        # Current formula impact
        print(f"\n  Current formula: multiplier = 1.0 + 0.3 * (1 - score/100)")
        print(f"  At confidence=30: multiplier = {1.0 + 0.3 * (1 - 30/100):.2f} (+21% widening)")
        print(f"  At confidence=50: multiplier = {1.0 + 0.3 * (1 - 50/100):.2f} (+15% widening)")
        print(f"  At confidence=80: multiplier = {1.0 + 0.3 * (1 - 80/100):.2f} (+6% widening)")
    print()


def investigate_step9(sold_logs, supplements):
    """Step 9: Guardrails — firing rates, ceiling/floor analysis."""
    print("=" * 70)
    print("STEP 9: Safety Guardrails")
    print("=" * 70)

    mv_capped = 0
    ps_capped = 0
    qs_floored = 0
    total_with_data = 0
    ceiling_overruns = []  # how far patient_sale would be without cap
    active_floor_gaps = []

    for supp_name, supp in supplements.items():
        analytics = supp.get("analytics", {})
        mv = analytics.get("market_value")
        qs = analytics.get("quick_sale")
        ps = analytics.get("patient_sale")

        if mv is None:
            continue
        total_with_data += 1

        # Find matching sold log for min/max
        linked = supp.get("_meta", {}).get("linked_log", "")
        sold_data = None
        for name, data in sold_logs:
            if name == linked:
                sold_data = data
                break

        if not sold_data:
            continue

        prices = extract_prices(sold_data.get("items", []))
        if not prices:
            continue

        max_sold = max(prices)
        min_sold = min(prices)

        # Check if MV is at ceiling
        if mv and abs(mv - max_sold) < 0.01:
            mv_capped += 1

        # Check if patient_sale is at ceiling
        if ps and abs(ps - max_sold * 1.10) < max_sold * 0.001:
            ps_capped += 1

        # Check if quick_sale is at floor
        if qs and abs(qs - min_sold) < 0.01:
            qs_floored += 1

        # Active floor comparison
        ask_p10 = analytics.get("ask_p10")
        if ask_p10 and qs:
            active_floor_gaps.append(ask_p10 - qs)

    print(f"\nSearches with guardrail data: {total_with_data}")
    print(f"\nGuardrail firing rates:")
    print(f"  MV capped at max sold: {mv_capped} ({pct(mv_capped, total_with_data)})")
    print(f"  Patient sale capped at 110% max sold: {ps_capped} ({pct(ps_capped, total_with_data)})")
    print(f"  Quick sale floored at min sold: {qs_floored} ({pct(qs_floored, total_with_data)})")

    if active_floor_gaps:
        print(f"\nActive floor (P10 asks) vs Quick Sale gap:")
        print(f"  {fmt_dist(active_floor_gaps)}")
        above = sum(1 for g in active_floor_gaps if g > 0)
        print(f"  Active floor > Quick Sale: {above}/{len(active_floor_gaps)} ({pct(above, len(active_floor_gaps))})")
        big_gap = sum(1 for g in active_floor_gaps if g > 5)
        print(f"  Active floor > Quick Sale by >$5: {big_gap}")
    print()


def investigate_pipeline(sold_logs, supplements):
    """Pipeline-level observations spanning multiple steps."""
    print("=" * 70)
    print("PIPELINE-LEVEL OBSERVATIONS")
    print("=" * 70)

    # A. IQR before clusters — how many prices does IQR remove that could be clusters?
    trimmed_by_iqr = []
    for name, data in sold_logs:
        prices = extract_prices(data.get("items", []))
        if len(prices) < 4:
            continue
        arr = np.array(prices)
        q1, q3 = np.percentile(arr, [25, 75])
        iqr = q3 - q1
        before = len(arr)
        after = np.sum((arr >= q1 - 1.5 * iqr) & (arr <= q3 + 1.5 * iqr))
        trimmed_by_iqr.append(before - after)

    if trimmed_by_iqr:
        print(f"\nA. IQR filtering before cluster detection:")
        print(f"   Items removed per search: {fmt_dist(trimmed_by_iqr)}")
        print(f"   Searches losing 5+ items: {sum(1 for t in trimmed_by_iqr if t >= 5)}")
        print(f"   -> These items might have formed valid secondary clusters")

    # B. Gravity vs Confidence interaction
    gravity_conf_pairs = []
    for name, data in sold_logs:
        prices = extract_prices(data.get("items", []))
        if len(prices) < 4:
            continue
        arr = np.array(prices)
        result = detect_clusters_from_prices(arr)
        gravity = result["gravity"] if result else 0

        # Find supplement
        supp = supplements.get(name, {})
        conf = supp.get("analytics", {}).get("market_confidence")
        if conf is not None and gravity > 0:
            gravity_conf_pairs.append((gravity, conf))

    if gravity_conf_pairs:
        print(f"\nC. Gravity-Confidence interaction ({len(gravity_conf_pairs)} paired searches):")
        high_grav_low_conf = sum(1 for g, c in gravity_conf_pairs if g > 0.7 and c < 50)
        low_grav_high_conf = sum(1 for g, c in gravity_conf_pairs if g < 0.4 and c > 70)
        print(f"   High gravity + Low confidence (conflicting): {high_grav_low_conf}")
        print(f"   Low gravity + High confidence (conflicting): {low_grav_high_conf}")
        print(f"   -> These cases may have gravity tightening then confidence widening")
    print()


# ============================================================================
# Main
# ============================================================================

def main():
    print("\n" + "=" * 70)
    print("  FMV PIPELINE AUDIT — INVESTIGATION REPORT")
    print("  Running against search_logs/")
    print("=" * 70 + "\n")

    sold_logs = load_sold_logs()
    supplements = load_analytics_supplements()

    print(f"Loaded {len(sold_logs)} sold logs, {len(supplements)} analytics supplements\n")

    investigate_step1(sold_logs, supplements)
    investigate_step2(sold_logs, supplements)
    investigate_step3(sold_logs, supplements)
    investigate_step4(sold_logs, supplements)
    investigate_step5(sold_logs, supplements)
    investigate_step6(sold_logs, supplements)
    investigate_step7(sold_logs, supplements)
    investigate_step8(sold_logs, supplements)
    investigate_step9(sold_logs, supplements)
    investigate_pipeline(sold_logs, supplements)

    print("=" * 70)
    print("  AUDIT COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
