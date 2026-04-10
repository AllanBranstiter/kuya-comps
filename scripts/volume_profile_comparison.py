"""
Diagnostic: Volume-Profile-based Buyer/Seller zones using search log data.

Buyer's Zone = high-volume node of SOLD prices (support/demand)
Seller's Zone = high-volume node of ACTIVE listing prices (resistance/supply)
Overlap = where both zones intersect (negotiation sweet spot)
"""
import json
import glob
import sys
import os
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.fmv_service import (
    calculate_volume_weight,
    calculate_buyer_seller_ranges,
    detect_price_clusters,
)
from backend.models.schemas import CompItem


def load_json(filepath):
    with open(filepath) as f:
        return json.load(f)


def extract_prices(items):
    """Extract valid prices from items."""
    prices = []
    for item in items:
        p = item.get("total_price") or 0
        if p > 0:
            prices.append(p)
    return np.array(prices)


def extract_prices_and_weights(items):
    """Extract prices and volume weights from sold items."""
    prices, weights = [], []
    for item in items:
        p = item.get("total_price") or 0
        if p <= 0:
            continue
        comp = CompItem(
            title=item.get("title", ""),
            total_price=p,
            is_auction=item.get("is_auction", False),
            bids=item.get("bids"),
            buying_format=item.get("buying_format", ""),
            is_best_offer=item.get("is_best_offer", False),
            is_buy_it_now=item.get("is_buy_it_now", False),
        )
        from backend.services.fmv_service import calculate_volume_weight
        weights.append(calculate_volume_weight(comp))
        prices.append(p)
    return np.array(prices), np.array(weights)


def find_value_area(prices, pct=0.70):
    """
    Volume-profile Value Area: find the contiguous price zone containing
    `pct` (default 70%) of volume, centered on the highest-volume bin.

    Returns (zone_low, zone_high, poc) or None if insufficient data.
    POC = Point of Control (price level with highest volume).
    """
    if len(prices) < 3:
        return None

    # Adaptive bin sizing based on price tier
    median_price = float(np.median(prices))
    if median_price <= 5:
        bin_size = 0.50
    elif median_price <= 50:
        bin_size = max(1.0, median_price * 0.05)
    elif median_price <= 500:
        bin_size = max(5.0, median_price * 0.05)
    else:
        bin_size = max(25.0, median_price * 0.05)

    min_p, max_p = float(np.min(prices)), float(np.max(prices))

    # Need at least 2 bins
    if max_p - min_p < bin_size:
        bin_size = (max_p - min_p) / 3 if max_p > min_p else 1.0

    bins = np.arange(min_p, max_p + bin_size, bin_size)
    if len(bins) < 2:
        return None

    counts, edges = np.histogram(prices, bins=bins)
    total_volume = counts.sum()
    if total_volume == 0:
        return None

    # Find POC bin (highest volume)
    poc_idx = int(np.argmax(counts))
    poc_price = (edges[poc_idx] + edges[poc_idx + 1]) / 2

    # Expand outward from POC until we capture `pct` of volume
    target = total_volume * pct
    captured = counts[poc_idx]
    lo, hi = poc_idx, poc_idx

    while captured < target and (lo > 0 or hi < len(counts) - 1):
        # Look left and right, add whichever has more volume
        left_vol = counts[lo - 1] if lo > 0 else -1
        right_vol = counts[hi + 1] if hi < len(counts) - 1 else -1

        if left_vol >= right_vol and left_vol >= 0:
            lo -= 1
            captured += counts[lo]
        elif right_vol >= 0:
            hi += 1
            captured += counts[hi]
        else:
            break

    zone_low = float(edges[lo])
    zone_high = float(edges[hi + 1])

    return {
        "zone_low": zone_low,
        "zone_high": zone_high,
        "poc": poc_price,
        "volume_in_zone": int(captured),
        "total_volume": int(total_volume),
        "pct_captured": captured / total_volume * 100,
        "num_bins_in_zone": hi - lo + 1,
        "total_bins": len(counts),
    }


def extract_slug(filepath):
    """Extract the query slug from a filename, stripping prefix and timestamp."""
    basename = os.path.basename(filepath)
    # Remove sold_/active_ prefix
    if basename.startswith("sold_"):
        rest = basename[5:]
    elif basename.startswith("active_"):
        rest = basename[7:]
    else:
        return basename
    # Remove trailing _YYYYMMDD_HHMMSS.json (16 chars + .json = 21)
    # Pattern: _20260407_200332.json
    import re
    slug = re.sub(r'_\d{8}_\d{6}\.json$', '', rest)
    return slug


def find_active_for_sold(sold_path, active_files_by_slug):
    """Find the matching active file for a sold file."""
    slug = extract_slug(sold_path)
    return active_files_by_slug.get(slug)


def fmt(v):
    return f"${v:.2f}" if v is not None else "N/A"


def main():
    log_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "search_logs")
    sold_files = sorted(glob.glob(os.path.join(log_dir, "sold_*.json")))
    active_files = sorted(glob.glob(os.path.join(log_dir, "active_*.json")))

    # Build slug -> active filepath lookup
    active_files_by_slug = {}
    for af in active_files:
        slug = extract_slug(af)
        active_files_by_slug[slug] = af

    print(f"{'='*130}")
    print("VOLUME PROFILE RANGES: Buyer Zone (sold volume) vs. Seller Zone (active volume)")
    print(f"{'='*130}")
    print(f"Sold files: {len(sold_files)}  |  Active files: {len(active_files)}  |  Matched pairs: {sum(1 for sf in sold_files if extract_slug(sf) in active_files_by_slug)}\n")

    results = []

    for sold_path in sold_files:
        # Find matching active file by slug
        active_path = find_active_for_sold(sold_path, active_files_by_slug)

        sold_data = load_json(sold_path)
        query = sold_data.get("query", "")[:65]
        sold_items = sold_data.get("items", [])
        sold_prices = extract_prices(sold_items)

        active_items = []
        if active_path and os.path.exists(active_path):
            active_data = load_json(active_path)
            active_items = active_data.get("items", [])
        active_prices = extract_prices(active_items)

        if len(sold_prices) < 3:
            continue

        # Volume profile zones
        buyer_zone = find_value_area(sold_prices, pct=0.70)
        seller_zone = find_value_area(active_prices, pct=0.70) if len(active_prices) >= 3 else None

        # Current algorithm for comparison
        sold_prices_w, sold_weights = extract_prices_and_weights(sold_items)
        clusters = detect_price_clusters(sold_prices_w)
        current = calculate_buyer_seller_ranges(sold_prices_w, sold_weights, cluster_result=clusters)

        # Compute overlap
        overlap = None
        overlap_pct = None
        if buyer_zone and seller_zone:
            o_low = max(buyer_zone["zone_low"], seller_zone["zone_low"])
            o_high = min(buyer_zone["zone_high"], seller_zone["zone_high"])
            if o_high > o_low:
                total_span = max(buyer_zone["zone_high"], seller_zone["zone_high"]) - min(buyer_zone["zone_low"], seller_zone["zone_low"])
                overlap = (o_low, o_high)
                overlap_pct = (o_high - o_low) / total_span * 100 if total_span > 0 else 0

        results.append({
            "query": query,
            "n_sold": len(sold_prices),
            "n_active": len(active_prices),
            "buyer_zone": buyer_zone,
            "seller_zone": seller_zone,
            "current": current,
            "overlap": overlap,
            "overlap_pct": overlap_pct,
        })

    # Print results
    for r in results:
        bz = r["buyer_zone"]
        sz = r["seller_zone"]
        c = r["current"]

        print(f"--- {r['query']}")
        print(f"    Sold: {r['n_sold']} items  |  Active: {r['n_active']} items")

        if c:
            print(f"    CURRENT    Buyer: {fmt(c['buyer_low'])} - {fmt(c['buyer_high'])}  |  Seller: {fmt(c['seller_low'])} - {fmt(c['seller_high'])}")

        if bz:
            print(f"    VP BUYER   {fmt(bz['zone_low'])} - {fmt(bz['zone_high'])}  (POC: {fmt(bz['poc'])}, {bz['volume_in_zone']}/{bz['total_volume']} items = {bz['pct_captured']:.0f}%)")
        else:
            print(f"    VP BUYER   (insufficient sold data)")

        if sz:
            print(f"    VP SELLER  {fmt(sz['zone_low'])} - {fmt(sz['zone_high'])}  (POC: {fmt(sz['poc'])}, {sz['volume_in_zone']}/{sz['total_volume']} items = {sz['pct_captured']:.0f}%)")
        else:
            print(f"    VP SELLER  (insufficient active data, {r['n_active']} listings)")

        if r["overlap"]:
            print(f"    OVERLAP    {fmt(r['overlap'][0])} - {fmt(r['overlap'][1])} ({r['overlap_pct']:.1f}% of span)")
        elif bz and sz:
            gap = sz["zone_low"] - bz["zone_high"]
            if gap > 0:
                print(f"    GAP        ${gap:.2f} — sellers asking above where buyers transact")
            else:
                print(f"    NO OVERLAP (buyer ceiling below seller floor)")
        else:
            print(f"    OVERLAP    N/A (missing one side)")
        print()

    # Summary
    print(f"{'='*130}")
    print("SUMMARY")
    print(f"{'='*130}")
    total = len(results)
    both = [r for r in results if r["buyer_zone"] and r["seller_zone"]]
    buyer_only = [r for r in results if r["buyer_zone"] and not r["seller_zone"]]
    neither = [r for r in results if not r["buyer_zone"]]
    overlapping = [r for r in both if r["overlap"]]
    gapped = [r for r in both if not r["overlap"]]

    print(f"  Total searches analyzed:         {total}")
    print(f"  Buyer zone computable:           {len([r for r in results if r['buyer_zone']])} ({len([r for r in results if r['buyer_zone']])/total*100:.0f}%)")
    print(f"  Seller zone computable:          {len([r for r in results if r['seller_zone']])} ({len([r for r in results if r['seller_zone']])/total*100:.0f}%)")
    print(f"  Both sides computable:           {len(both)} ({len(both)/total*100:.0f}%)")
    print(f"    - With natural overlap:        {len(overlapping)} ({len(overlapping)/total*100:.0f}%)")
    print(f"    - With gap (sellers above):    {len(gapped)} ({len(gapped)/total*100:.0f}%)")
    print(f"  Buyer zone only (no active):     {len(buyer_only)} ({len(buyer_only)/total*100:.0f}%)")

    if overlapping:
        pcts = [r["overlap_pct"] for r in overlapping]
        print(f"\n  Overlap stats:")
        print(f"    Mean: {np.mean(pcts):.1f}% of span")
        print(f"    Median: {np.median(pcts):.1f}%")
        print(f"    Min: {np.min(pcts):.1f}%")
        print(f"    Max: {np.max(pcts):.1f}%")

    # Compare buyer zone POC vs current buyer_high
    print(f"\n  Buyer Zone POC vs Current P50 (median):")
    comparisons = []
    for r in results:
        if r["buyer_zone"] and r["current"]:
            poc = r["buyer_zone"]["poc"]
            p50 = r["current"]["buyer_high"]  # buyer_high = P50 in current
            if p50 > 0:
                diff_pct = (poc - p50) / p50 * 100
                comparisons.append(diff_pct)
    if comparisons:
        print(f"    Mean POC vs P50 difference: {np.mean(comparisons):+.1f}%")
        print(f"    POC below P50: {sum(1 for d in comparisons if d < -5)}/{len(comparisons)}")
        print(f"    POC near P50 (within 5%): {sum(1 for d in comparisons if abs(d) <= 5)}/{len(comparisons)}")
        print(f"    POC above P50: {sum(1 for d in comparisons if d > 5)}/{len(comparisons)}")


if __name__ == "__main__":
    main()
