#!/usr/bin/env python3
"""
FMV Investigation Script — Phase 1 Diagnostic Analysis

Replays search logs through FMV calculation at different IQR multipliers,
audits price concentration bins, and checks date fields.

Usage: python3 investigate_fmv.py
"""

import json
import os
import sys
import re
import numpy as np
from pathlib import Path
from collections import defaultdict
from datetime import date

# Add project root to path so we can import backend modules
sys.path.insert(0, str(Path(__file__).parent))

from backend.models.schemas import CompItem
from backend.services.fmv_service import (
    calculate_volume_weight,
    find_weighted_percentile,
    is_representative_sale,
    calculate_robust_std,
    FMVResult,
)
from backend.config import (
    MIN_ITEMS_FOR_OUTLIER_DETECTION,
    MIN_ITEMS_FOR_FMV,
    AUCTION_BASE_WEIGHT,
    BUY_IT_NOW_WEIGHT,
    BEST_OFFER_WEIGHT,
)

SEARCH_LOGS_DIR = Path(__file__).parent / "search_logs"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_sold_logs():
    """Load all sold JSON logs, return list of (filename, data) tuples."""
    logs = []
    for f in sorted(SEARCH_LOGS_DIR.glob("sold_*.json")):
        if "_analytics" in f.name:
            continue
        with open(f) as fh:
            try:
                data = json.load(fh)
                logs.append((f.name, data))
            except json.JSONDecodeError:
                continue
    return logs


def load_active_logs():
    """Load all active JSON logs, return list of (filename, data) tuples."""
    logs = []
    for f in sorted(SEARCH_LOGS_DIR.glob("active_*.json")):
        if "_analytics" in f.name:
            continue
        with open(f) as fh:
            try:
                data = json.load(fh)
                logs.append((f.name, data))
            except json.JSONDecodeError:
                continue
    return logs


def items_to_comp_items(items_data):
    """Convert raw JSON items to CompItem objects."""
    comp_items = []
    for item in items_data:
        try:
            ci = CompItem(**item)
            if ci.total_price and ci.total_price > 0:
                comp_items.append(ci)
        except Exception:
            continue
    return comp_items


def calculate_fmv_with_iqr(items, iqr_multiplier):
    """
    Run the FMV calculation with a specific IQR multiplier.
    Returns dict with market_value, quick_sale, patient_sale, excluded_count, total_count, method.
    """
    price_weight_item_tuples = []
    for item in items:
        if item.total_price is None or item.total_price <= 0:
            continue
        weight = calculate_volume_weight(item)
        price_weight_item_tuples.append((item.total_price, weight, item))

    if len(price_weight_item_tuples) < MIN_ITEMS_FOR_FMV:
        return None

    all_prices = np.array([t[0] for t in price_weight_item_tuples])
    all_weights = np.array([t[1] for t in price_weight_item_tuples])
    all_items = [t[2] for t in price_weight_item_tuples]

    excluded_count = 0

    if len(all_prices) >= MIN_ITEMS_FOR_OUTLIER_DETECTION:
        q1 = np.percentile(all_prices, 25)
        q3 = np.percentile(all_prices, 75)
        iqr = q3 - q1

        lower_bound = q1 - iqr_multiplier * iqr
        upper_bound = q3 + iqr_multiplier * iqr

        mask = []
        for i, price in enumerate(all_prices):
            within_bounds = lower_bound <= price <= upper_bound
            if within_bounds:
                mask.append(True)
            else:
                is_rep = is_representative_sale(all_items[i], q1, q3, iqr)
                mask.append(is_rep)
                if not is_rep:
                    excluded_count += 1

        mask = np.array(mask, dtype=bool)
        prices = all_prices[mask]
        weights = all_weights[mask]
    else:
        prices = all_prices
        weights = all_weights

    if len(prices) < MIN_ITEMS_FOR_FMV:
        return None

    weighted_mean = np.average(prices, weights=weights)

    sorted_indices = np.argsort(prices)
    sorted_prices = prices[sorted_indices]
    sorted_weights = weights[sorted_indices]
    cumulative_weights = np.cumsum(sorted_weights)
    total_weight = cumulative_weights[-1]

    p25 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.25)
    p50 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.50)
    p75 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.75)

    # Detect concentration
    from scipy.stats import skew as scipy_skew
    distribution_skewness = scipy_skew(prices, axis=0)

    concentration_price = detect_concentration_scaled(prices, np.median(prices))

    if concentration_price:
        market_value = concentration_price
        method = "concentration"
    elif abs(distribution_skewness) > 1.5:
        market_value = p50
        method = "median"
    else:
        market_value = weighted_mean
        method = "mean"

    # MAD-based range
    robust_std = calculate_robust_std(prices, weights, p50)
    fmv_low = max(0, weighted_mean - robust_std)
    fmv_high = weighted_mean + robust_std

    # Percentile-based range (proposed improvement)
    p20 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.20)
    p80 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.80)

    cv = np.std(prices) / np.mean(prices) if np.mean(prices) > 0 else 0

    return {
        "market_value": round(market_value, 2),
        "quick_sale": round(max(0, p25), 2),
        "patient_sale": round(p75, 2),
        "weighted_mean": round(weighted_mean, 2),
        "weighted_median": round(p50, 2),
        "fmv_low_mad": round(fmv_low, 2),
        "fmv_high_mad": round(fmv_high, 2),
        "fmv_low_p20": round(p20, 2),
        "fmv_high_p80": round(p80, 2),
        "excluded_count": excluded_count,
        "total_count": len(all_prices),
        "kept_count": len(prices),
        "method": method,
        "cv": round(cv, 3),
        "skewness": round(float(distribution_skewness), 3),
    }


def detect_concentration_scaled(prices, median_price):
    """Price concentration with scaled bins based on price tier."""
    if len(prices) < 4:
        return None

    if median_price <= 10:
        bin_size = 0.50
    elif median_price <= 100:
        bin_size = 2.00
    elif median_price <= 1000:
        bin_size = median_price * 0.05
    else:
        bin_size = median_price * 0.03

    min_price = np.min(prices)
    max_price = np.max(prices)
    bins = np.arange(min_price, max_price + bin_size, bin_size)

    if len(bins) < 2:
        return None

    counts, edges = np.histogram(prices, bins=bins)
    max_count = np.max(counts)
    max_bin_idx = np.argmax(counts)

    concentration_ratio = max_count / len(prices)
    if concentration_ratio >= 0.25:
        return (edges[max_bin_idx] + edges[max_bin_idx + 1]) / 2

    return None


def detect_concentration_fixed(prices):
    """Original fixed $0.50 bin concentration detection."""
    if len(prices) < 4:
        return None

    bin_size = 0.50
    min_price = np.min(prices)
    max_price = np.max(prices)
    bins = np.arange(min_price, max_price + bin_size, bin_size)

    if len(bins) < 2:
        return None

    counts, edges = np.histogram(prices, bins=bins)
    max_count = np.max(counts)
    max_bin_idx = np.argmax(counts)

    concentration_ratio = max_count / len(prices)
    if concentration_ratio >= 0.25:
        return (edges[max_bin_idx] + edges[max_bin_idx + 1]) / 2

    return None


# ---------------------------------------------------------------------------
# Investigation 1A: IQR Multiplier Audit
# ---------------------------------------------------------------------------

def investigate_iqr_multiplier(sold_logs):
    print("=" * 80)
    print("INVESTIGATION 1A: IQR MULTIPLIER AUDIT")
    print("=" * 80)
    print()

    multipliers = [0.5, 1.0, 1.5]
    results = []

    for filename, data in sold_logs:
        items = items_to_comp_items(data.get("items", []))
        if len(items) < 4:
            continue

        query = data.get("query", filename)
        row = {"query": query, "filename": filename, "n_items": len(items)}

        for mult in multipliers:
            result = calculate_fmv_with_iqr(items, mult)
            if result:
                row[f"mv_{mult}"] = result["market_value"]
                row[f"qs_{mult}"] = result["quick_sale"]
                row[f"ps_{mult}"] = result["patient_sale"]
                row[f"excl_{mult}"] = result["excluded_count"]
                row[f"kept_{mult}"] = result["kept_count"]
                row[f"cv_{mult}"] = result["cv"]
                row[f"method_{mult}"] = result["method"]
            else:
                row[f"mv_{mult}"] = None

        results.append(row)

    # Summary statistics
    print(f"Analyzed {len(results)} sold logs with 4+ items\n")

    # Exclusion comparison
    print("--- Exclusion Rates ---")
    for mult in multipliers:
        excl_rates = []
        for r in results:
            excl = r.get(f"excl_{mult}")
            total = r.get("n_items")
            if excl is not None and total > 0:
                excl_rates.append(excl / total * 100)
        if excl_rates:
            print(f"  IQR {mult}x: avg {np.mean(excl_rates):.1f}% excluded, "
                  f"max {np.max(excl_rates):.1f}%, "
                  f"median {np.median(excl_rates):.1f}%")

    # Market value comparison
    print("\n--- Market Value Deltas (0.5x vs 1.5x) ---")
    deltas = []
    big_deltas = []
    for r in results:
        mv05 = r.get("mv_0.5")
        mv15 = r.get("mv_1.5")
        if mv05 is not None and mv15 is not None and mv15 > 0:
            pct_diff = (mv05 - mv15) / mv15 * 100
            deltas.append(pct_diff)
            if abs(pct_diff) > 10:
                big_deltas.append((r["query"][:50], mv05, mv15, pct_diff))

    if deltas:
        print(f"  Mean delta: {np.mean(deltas):+.1f}%")
        print(f"  Median delta: {np.median(deltas):+.1f}%")
        print(f"  Std delta: {np.std(deltas):.1f}%")
        print(f"  Cards with >10% difference: {len(big_deltas)}/{len(deltas)}")

        if big_deltas:
            print("\n  Cards with biggest impact:")
            for query, mv05, mv15, pct in sorted(big_deltas, key=lambda x: abs(x[3]), reverse=True)[:10]:
                print(f"    {query}")
                print(f"      0.5x MV: ${mv05:.2f}  |  1.5x MV: ${mv15:.2f}  |  Delta: {pct:+.1f}%")

    # Method selection comparison
    print("\n--- Central Tendency Method Used ---")
    for mult in multipliers:
        methods = defaultdict(int)
        for r in results:
            m = r.get(f"method_{mult}")
            if m:
                methods[m] += 1
        total = sum(methods.values())
        print(f"  IQR {mult}x: ", end="")
        print(", ".join(f"{k}={v} ({v/total*100:.0f}%)" for k, v in sorted(methods.items())))

    # CV distribution
    print("\n--- Price Volatility (CV) ---")
    for mult in multipliers:
        cvs = [r.get(f"cv_{mult}") for r in results if r.get(f"cv_{mult}") is not None]
        if cvs:
            high_cv = sum(1 for c in cvs if c > 0.5)
            print(f"  IQR {mult}x: mean CV={np.mean(cvs):.3f}, "
                  f"high volatility (>0.5): {high_cv}/{len(cvs)}")

    return results


# ---------------------------------------------------------------------------
# Investigation 1B: Price Concentration Bin Audit
# ---------------------------------------------------------------------------

def investigate_concentration_bins(sold_logs):
    print("\n" + "=" * 80)
    print("INVESTIGATION 1B: PRICE CONCENTRATION BIN AUDIT")
    print("=" * 80)
    print()

    fixed_triggers = 0
    scaled_triggers = 0
    both_triggers = 0
    total_eligible = 0

    tier_stats = defaultdict(lambda: {"fixed": 0, "scaled": 0, "total": 0})

    details = []

    for filename, data in sold_logs:
        items = items_to_comp_items(data.get("items", []))
        prices = np.array([i.total_price for i in items if i.total_price and i.total_price > 0])

        if len(prices) < 4:
            continue

        total_eligible += 1
        median_price = np.median(prices)

        # Determine tier
        if median_price <= 5:
            tier = "bulk"
        elif median_price <= 100:
            tier = "low"
        elif median_price <= 1000:
            tier = "mid"
        else:
            tier = "grail"

        tier_stats[tier]["total"] += 1

        fixed_result = detect_concentration_fixed(prices)
        scaled_result = detect_concentration_scaled(prices, median_price)

        if fixed_result:
            fixed_triggers += 1
            tier_stats[tier]["fixed"] += 1
        if scaled_result:
            scaled_triggers += 1
            tier_stats[tier]["scaled"] += 1
        if fixed_result and scaled_result:
            both_triggers += 1

        if fixed_result != scaled_result:
            details.append({
                "query": data.get("query", filename)[:50],
                "tier": tier,
                "median": median_price,
                "n": len(prices),
                "fixed": fixed_result,
                "scaled": scaled_result,
            })

    print(f"Eligible logs (4+ items): {total_eligible}")
    print(f"\nConcentration detection triggers:")
    print(f"  Fixed ($0.50 bins): {fixed_triggers}/{total_eligible} ({fixed_triggers/total_eligible*100:.0f}%)")
    print(f"  Scaled (tier-based): {scaled_triggers}/{total_eligible} ({scaled_triggers/total_eligible*100:.0f}%)")
    print(f"  Both agree: {both_triggers}")

    print(f"\nBy price tier:")
    for tier in ["bulk", "low", "mid", "grail"]:
        s = tier_stats[tier]
        if s["total"] > 0:
            print(f"  {tier:6s}: {s['total']:3d} logs | fixed={s['fixed']:2d} | scaled={s['scaled']:2d}")

    if details:
        print(f"\nDifferences (fixed != scaled): {len(details)} cases")
        for d in details[:10]:
            print(f"  [{d['tier']}] {d['query']} (median=${d['median']:.2f}, n={d['n']})")
            fixed_str = f"${d['fixed']:.2f}" if d['fixed'] else 'None'
            scaled_str = f"${d['scaled']:.2f}" if d['scaled'] else 'None'
            print(f"    Fixed: {fixed_str} | Scaled: {scaled_str}")


# ---------------------------------------------------------------------------
# Investigation 1C: FMV Range Comparison (MAD vs Percentile)
# ---------------------------------------------------------------------------

def investigate_fmv_range(sold_logs):
    print("\n" + "=" * 80)
    print("INVESTIGATION 1C: FMV RANGE — MAD vs PERCENTILE-BASED")
    print("=" * 80)
    print()

    comparisons = []

    for filename, data in sold_logs:
        items = items_to_comp_items(data.get("items", []))
        if len(items) < 4:
            continue

        result = calculate_fmv_with_iqr(items, 0.5)  # current production IQR
        if not result:
            continue

        query = data.get("query", filename)[:50]
        mad_width = result["fmv_high_mad"] - result["fmv_low_mad"]
        pct_width = result["fmv_high_p80"] - result["fmv_low_p20"]
        mv = result["market_value"]

        if mv > 0:
            mad_pct = mad_width / mv * 100
            pct_pct = pct_width / mv * 100
        else:
            mad_pct = pct_pct = 0

        comparisons.append({
            "query": query,
            "mv": mv,
            "mad_low": result["fmv_low_mad"],
            "mad_high": result["fmv_high_mad"],
            "mad_width": mad_width,
            "mad_pct": mad_pct,
            "pct_low": result["fmv_low_p20"],
            "pct_high": result["fmv_high_p80"],
            "pct_width": pct_width,
            "pct_pct": pct_pct,
            "cv": result["cv"],
            "skewness": result["skewness"],
        })

    print(f"Analyzed {len(comparisons)} logs\n")

    mad_pcts = [c["mad_pct"] for c in comparisons]
    pct_pcts = [c["pct_pct"] for c in comparisons]

    print("--- Range Width as % of Market Value ---")
    print(f"  MAD-based:        mean={np.mean(mad_pcts):.1f}%, median={np.median(mad_pcts):.1f}%, std={np.std(mad_pcts):.1f}%")
    print(f"  Percentile-based: mean={np.mean(pct_pcts):.1f}%, median={np.median(pct_pcts):.1f}%, std={np.std(pct_pcts):.1f}%")

    # Cases where the two methods diverge significantly
    big_diff = []
    for c in comparisons:
        ratio = c["mad_pct"] / c["pct_pct"] if c["pct_pct"] > 0 else 1
        if ratio > 1.5 or ratio < 0.67:
            big_diff.append((c, ratio))

    print(f"\n  Cases where MAD/Percentile width ratio > 1.5x or < 0.67x: {len(big_diff)}/{len(comparisons)}")
    if big_diff:
        print("\n  Examples of divergence:")
        for c, ratio in sorted(big_diff, key=lambda x: abs(x[1] - 1), reverse=True)[:8]:
            print(f"    {c['query']}")
            print(f"      MV=${c['mv']:.2f} | MAD range: ${c['mad_low']:.2f}-${c['mad_high']:.2f} ({c['mad_pct']:.0f}%) | "
                  f"P20-P80: ${c['pct_low']:.2f}-${c['pct_high']:.2f} ({c['pct_pct']:.0f}%) | ratio={ratio:.2f}")

    # Skewness impact
    print("\n--- Skewness Impact on Range Methods ---")
    skewed = [c for c in comparisons if abs(c["skewness"]) > 1.0]
    symmetric = [c for c in comparisons if abs(c["skewness"]) <= 1.0]

    for label, group in [("Skewed (|skew|>1)", skewed), ("Symmetric (|skew|<=1)", symmetric)]:
        if group:
            mad_p = [c["mad_pct"] for c in group]
            pct_p = [c["pct_pct"] for c in group]
            print(f"  {label} ({len(group)} cards):")
            print(f"    MAD range: mean={np.mean(mad_p):.1f}% | Percentile range: mean={np.mean(pct_p):.1f}%")


# ---------------------------------------------------------------------------
# Investigation 1D: Date Field Check
# ---------------------------------------------------------------------------

def investigate_date_fields(sold_logs):
    print("\n" + "=" * 80)
    print("INVESTIGATION 1D: DATE FIELD CHECK")
    print("=" * 80)
    print()

    date_patterns_found = defaultdict(int)
    sample_count = 0
    items_with_end_time = 0
    items_with_extensions_date = 0

    for filename, data in sold_logs[:20]:  # Sample 20 logs
        items = data.get("items", [])
        for item in items[:5]:  # First 5 items per log
            sample_count += 1

            # Check end_time
            et = item.get("end_time")
            if et:
                items_with_end_time += 1
                date_patterns_found[f"end_time: {et[:30]}"] += 1

            # Check extensions for date info
            exts = item.get("extensions", [])
            if exts:
                for ext in exts:
                    if ext and any(kw in str(ext).lower() for kw in ["sold", "end", "date", "ago", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]):
                        items_with_extensions_date += 1
                        date_patterns_found[f"extension: {str(ext)[:50]}"] += 1
                        break

            # Check tag
            tag = item.get("tag")
            if tag and any(kw in str(tag).lower() for kw in ["sold", "end", "date"]):
                date_patterns_found[f"tag: {str(tag)[:50]}"] += 1

    print(f"Sampled {sample_count} items from {min(20, len(sold_logs))} logs\n")
    print(f"  Items with end_time: {items_with_end_time}/{sample_count}")
    print(f"  Items with date in extensions: {items_with_extensions_date}/{sample_count}")

    if date_patterns_found:
        print(f"\n  Date-related patterns found:")
        for pattern, count in sorted(date_patterns_found.items(), key=lambda x: -x[1])[:15]:
            print(f"    [{count:2d}x] {pattern}")
    else:
        print("\n  No date-related patterns found in sampled items.")
        print("  Recency weighting will need sale date parsing from eBay response.")

    # Check if date_scraped varies within a log
    print("\n--- date_scraped variation within logs ---")
    for filename, data in sold_logs[:5]:
        dates = set()
        for item in data.get("items", []):
            ds = item.get("date_scraped")
            if ds:
                dates.add(ds)
        print(f"  {data.get('query', filename)[:40]}: {len(dates)} unique date(s): {dates}")


# ---------------------------------------------------------------------------
# Investigation 1E: Blended FMV — Paired Log Analysis
# ---------------------------------------------------------------------------

def investigate_blended_pairs(sold_logs, active_logs):
    print("\n" + "=" * 80)
    print("INVESTIGATION 1E: BLENDED FMV — SOLD+ACTIVE PAIRING")
    print("=" * 80)
    print()

    # Group logs by query stem (strip timestamp)
    def query_stem(filename):
        # Remove timestamp suffix and extension
        parts = filename.rsplit("_", 2)
        if len(parts) >= 3:
            return parts[0]
        return filename

    sold_by_stem = defaultdict(list)
    for fn, data in sold_logs:
        stem = query_stem(fn.replace("sold_", ""))
        sold_by_stem[stem].append((fn, data))

    active_by_stem = defaultdict(list)
    for fn, data in active_logs:
        stem = query_stem(fn.replace("active_", ""))
        active_by_stem[stem].append((fn, data))

    # Find stems with both sold and active
    paired_stems = set(sold_by_stem.keys()) & set(active_by_stem.keys())
    print(f"Total sold log stems: {len(sold_by_stem)}")
    print(f"Total active log stems: {len(active_by_stem)}")
    print(f"Paired (both sold + active): {len(paired_stems)}")

    # For each pair, compare sold-only FMV vs blended FMV
    pair_results = []
    for stem in sorted(paired_stems):
        sold_fn, sold_data = sold_by_stem[stem][0]
        active_fn, active_data = active_by_stem[stem][0]

        sold_items = items_to_comp_items(sold_data.get("items", []))
        active_items = items_to_comp_items(active_data.get("items", []))

        if len(sold_items) < 4:
            continue

        # Sold-only FMV
        sold_result = calculate_fmv_with_iqr(sold_items, 0.5)
        if not sold_result:
            continue

        # For blended, we need active prices
        active_prices = sorted([i.total_price for i in active_items if i.total_price and i.total_price > 0])
        if not active_prices:
            continue

        bid_center = sold_result["market_value"]
        ask_center = active_prices[len(active_prices) // 2]
        sold_count = len(sold_items)
        active_count = len(active_prices)

        # Price tier
        if bid_center <= 5:
            tier = "bulk"
        elif bid_center <= 100:
            tier = "low"
        elif bid_center <= 1000:
            tier = "mid"
        else:
            tier = "grail"

        # Supply ratio
        ratio = active_count / sold_count if sold_count > 0 else 10.0
        if ratio > 2.0:
            supply = "oversupplied"
        elif ratio < 0.5:
            supply = "scarce"
        else:
            supply = "balanced"

        weight_table = {
            "bulk":  {"oversupplied": 0.25, "balanced": 0.50, "scarce": 0.70},
            "low":   {"oversupplied": 0.40, "balanced": 0.65, "scarce": 0.80},
            "mid":   {"oversupplied": 0.55, "balanced": 0.75, "scarce": 0.90},
            "grail": {"oversupplied": 0.70, "balanced": 0.85, "scarce": 0.95},
        }
        bid_weight = weight_table[tier][supply]

        if ask_center > bid_center * 2.0:
            bid_weight = max(bid_weight, 0.85)
            supply = "sellers_dreaming"

        blended_mv = bid_center * bid_weight + ask_center * (1 - bid_weight)
        delta_pct = (blended_mv - bid_center) / bid_center * 100 if bid_center > 0 else 0

        pair_results.append({
            "query": sold_data.get("query", stem)[:50],
            "tier": tier,
            "supply": supply,
            "bid_weight": bid_weight,
            "sold_mv": bid_center,
            "ask_median": round(ask_center, 2),
            "blended_mv": round(blended_mv, 2),
            "delta_pct": round(delta_pct, 1),
            "sold_n": sold_count,
            "active_n": active_count,
            "ratio": round(ratio, 2),
        })

    print(f"\nAnalyzed {len(pair_results)} paired logs\n")

    if not pair_results:
        print("  No paired results to analyze.")
        return

    # Summary by tier
    print("--- Blend Impact by Tier ---")
    for tier in ["bulk", "low", "mid", "grail"]:
        tier_results = [r for r in pair_results if r["tier"] == tier]
        if tier_results:
            deltas = [r["delta_pct"] for r in tier_results]
            print(f"  {tier:6s}: n={len(tier_results)}, "
                  f"mean delta={np.mean(deltas):+.1f}%, "
                  f"median={np.median(deltas):+.1f}%")

    # Summary by supply
    print("\n--- Blend Impact by Supply ---")
    for supply in ["oversupplied", "balanced", "scarce", "sellers_dreaming"]:
        supply_results = [r for r in pair_results if r["supply"] == supply]
        if supply_results:
            deltas = [r["delta_pct"] for r in supply_results]
            print(f"  {supply:18s}: n={len(supply_results)}, "
                  f"mean delta={np.mean(deltas):+.1f}%")

    # Biggest movers
    print("\n--- Biggest Blended vs Sold-Only Deltas ---")
    for r in sorted(pair_results, key=lambda x: abs(x["delta_pct"]), reverse=True)[:10]:
        print(f"  {r['query']}")
        print(f"    Sold MV=${r['sold_mv']:.2f} | Ask median=${r['ask_median']:.2f} | "
              f"Blended=${r['blended_mv']:.2f} ({r['delta_pct']:+.1f}%) "
              f"[{r['tier']}/{r['supply']}, {r['sold_n']}s/{r['active_n']}a]")


# ---------------------------------------------------------------------------
# Investigation 2: Analytics Feedback Impact
# ---------------------------------------------------------------------------

def investigate_analytics_feedback(sold_logs, active_logs):
    print("\n" + "=" * 80)
    print("INVESTIGATION 2: ANALYTICS FEEDBACK IMPACT ON FMV")
    print("=" * 80)
    print()

    from backend.services.fmv_service import calculate_fmv, calculate_fmv_blended

    def query_stem(filename):
        parts = filename.rsplit("_", 2)
        return parts[0] if len(parts) >= 3 else filename

    sold_by_stem = defaultdict(list)
    for fn, data in sold_logs:
        stem = query_stem(fn.replace("sold_", ""))
        sold_by_stem[stem].append((fn, data))

    active_by_stem = defaultdict(list)
    for fn, data in active_logs:
        stem = query_stem(fn.replace("active_", ""))
        active_by_stem[stem].append((fn, data))

    paired_stems = set(sold_by_stem.keys()) & set(active_by_stem.keys())
    results = []

    for stem in sorted(paired_stems):
        sold_fn, sold_data = sold_by_stem[stem][0]
        active_fn, active_data = active_by_stem[stem][0]

        sold_items = items_to_comp_items(sold_data.get("items", []))
        active_items = items_to_comp_items(active_data.get("items", []))

        if len(sold_items) < 4:
            continue

        # Sold-only (no analytics adjustments)
        sold_result = calculate_fmv(sold_items)
        if not sold_result.market_value:
            continue

        # Blended with analytics
        blended = calculate_fmv_blended(sold_items, active_items)
        if not blended.market_value:
            continue

        scores = blended.analytics_scores or {}
        conf = scores.get("confidence", {})
        pres = scores.get("pressure", {})
        liq = scores.get("liquidity", {})
        coll = scores.get("collectibility", {})

        mv_delta = (blended.market_value - sold_result.market_value) / sold_result.market_value * 100 if sold_result.market_value else 0
        range_sold = (sold_result.patient_sale or 0) - (sold_result.quick_sale or 0)
        range_blended = (blended.patient_sale or 0) - (blended.quick_sale or 0)
        range_delta = (range_blended - range_sold) / range_sold * 100 if range_sold > 0 else 0

        results.append({
            "query": sold_data.get("query", stem)[:45],
            "sold_mv": sold_result.market_value,
            "sold_qs": sold_result.quick_sale,
            "sold_ps": sold_result.patient_sale,
            "blended_mv": blended.market_value,
            "blended_qs": blended.quick_sale,
            "blended_ps": blended.patient_sale,
            "mv_delta": round(mv_delta, 1),
            "range_delta": round(range_delta, 1),
            "conf": conf.get("score"),
            "conf_band": conf.get("band", ""),
            "pressure": pres.get("pressure_pct"),
            "pressure_status": pres.get("status", ""),
            "liq": liq.get("score"),
            "coll": coll.get("score"),
        })

    print(f"Analyzed {len(results)} paired logs\n")

    # Score distribution
    print("--- Score Distributions ---")
    for label, key in [("Confidence", "conf"), ("Liquidity", "liq"), ("Collectibility", "coll")]:
        vals = [r[key] for r in results if r[key] is not None]
        if vals:
            print(f"  {label:15s}: mean={np.mean(vals):.0f}, median={np.median(vals):.0f}, min={np.min(vals):.0f}, max={np.max(vals):.0f}")

    pressure_vals = [r["pressure"] for r in results if r["pressure"] is not None]
    if pressure_vals:
        print(f"  {'Pressure':15s}: mean={np.mean(pressure_vals):+.0f}%, median={np.median(pressure_vals):+.0f}%")

    # Pressure status breakdown
    print("\n--- Pressure Status Breakdown ---")
    status_counts = defaultdict(int)
    for r in results:
        status_counts[r["pressure_status"]] += 1
    for status, count in sorted(status_counts.items(), key=lambda x: -x[1]):
        print(f"  {str(status):18s}: {count}")

    # Range width impact
    print("\n--- Range Width Impact (blended vs sold-only) ---")
    range_deltas = [r["range_delta"] for r in results]
    print(f"  Mean change: {np.mean(range_deltas):+.1f}%")
    print(f"  Median change: {np.median(range_deltas):+.1f}%")

    # By confidence band
    print("\n--- Range Width by Confidence Band ---")
    for band in ["Excellent", "Good", "Moderate", "High Variation", "Chaotic"]:
        band_results = [r for r in results if r["conf_band"] == band]
        if band_results:
            deltas = [r["range_delta"] for r in band_results]
            print(f"  {band:16s} (n={len(band_results)}): range delta={np.mean(deltas):+.1f}%")

    # Detailed per-card view
    print("\n--- Per-Card Details (sorted by range delta) ---")
    for r in sorted(results, key=lambda x: abs(x["range_delta"]), reverse=True)[:12]:
        print(f"  {r['query']}")
        print(f"    Sold:    MV=${r['sold_mv']:.2f}  QS=${r['sold_qs']:.2f}  PS=${r['sold_ps']:.2f}")
        print(f"    Blended: MV=${r['blended_mv']:.2f}  QS=${r['blended_qs']:.2f}  PS=${r['blended_ps']:.2f}")
        pres_val = r['pressure'] or 0
        print(f"    Scores:  Conf={r['conf']}({r['conf_band']}) Pres={pres_val:+.0f}%({r['pressure_status']}) Liq={r['liq']} Coll={r['coll']}")
        print(f"    MV delta={r['mv_delta']:+.1f}% | Range delta={r['range_delta']:+.1f}%")
        print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # Suppress FMV service print statements for cleaner output
    import io
    from contextlib import redirect_stdout

    sold_logs = load_sold_logs()
    active_logs = load_active_logs()
    print(f"Loaded {len(sold_logs)} sold logs, {len(active_logs)} active logs\n")

    # Redirect stdout during FMV calculations to suppress [FMV] debug prints
    real_stdout = sys.stdout

    class FilteredStdout:
        def __init__(self, real):
            self.real = real
        def write(self, text):
            if not text.startswith("[FMV"):
                self.real.write(text)
        def flush(self):
            self.real.flush()

    sys.stdout = FilteredStdout(real_stdout)

    investigate_iqr_multiplier(sold_logs)
    investigate_concentration_bins(sold_logs)
    investigate_fmv_range(sold_logs)
    investigate_date_fields(sold_logs)
    investigate_blended_pairs(sold_logs, active_logs)
    investigate_analytics_feedback(sold_logs, active_logs)

    sys.stdout = real_stdout
    print("\n" + "=" * 80)
    print("INVESTIGATION COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
