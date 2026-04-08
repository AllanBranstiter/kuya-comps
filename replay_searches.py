#!/usr/bin/env python3
"""
Replay archived searches against the local Kuya Comps server.

Reads unique queries from search_logs/replay_queries.json, hits both
/comps (sold) and /active endpoints for each query, and lets the app's
built-in search_log_service save the results to search_logs/.

Usage:
    1. Start the app:  uvicorn main:app --reload
    2. Run this:       python3 replay_searches.py

The 10/min rate limit is per-endpoint, so we pace calls at ~7s apart.
Total runtime for 80 queries: ~19 minutes.
"""

import asyncio
import json
import sys
import time
import urllib.parse
from pathlib import Path

import httpx

BASE_URL = "http://127.0.0.1:8000"
QUERIES_FILE = Path(__file__).parent / "search_logs" / "replay_queries.json"
DELAY_BETWEEN_CALLS = 7  # seconds — keeps us under 10/min per endpoint


async def replay_query(client: httpx.AsyncClient, query: str, index: int, total: int):
    """Hit /comps and /active for a single query."""
    encoded = urllib.parse.quote(query)
    label = query if len(query) < 80 else query[:77] + "..."

    # --- Sold ---
    print(f"[{index}/{total}] SOLD  | {label}")
    try:
        r = await client.get(f"{BASE_URL}/comps", params={"query": query}, timeout=120)
        if r.status_code == 200:
            data = r.json()
            print(f"         -> {len(data.get('items', []))} items, avg ${data.get('avg_price') or 0:.2f}")
        else:
            print(f"         -> HTTP {r.status_code}: {r.text[:120]}")
    except Exception as e:
        print(f"         -> ERROR: {e}")

    await asyncio.sleep(DELAY_BETWEEN_CALLS)

    # --- Active ---
    print(f"[{index}/{total}] ACTIVE| {label}")
    try:
        r = await client.get(f"{BASE_URL}/active", params={"query": query}, timeout=120)
        if r.status_code == 200:
            data = r.json()
            print(f"         -> {len(data.get('items', []))} items, avg ${data.get('avg_price') or 0:.2f}")
        else:
            print(f"         -> HTTP {r.status_code}: {r.text[:120]}")
    except Exception as e:
        print(f"         -> ERROR: {e}")

    await asyncio.sleep(DELAY_BETWEEN_CALLS)


async def main():
    if not QUERIES_FILE.exists():
        print(f"ERROR: {QUERIES_FILE} not found. Run the query extraction step first.")
        sys.exit(1)

    queries = json.loads(QUERIES_FILE.read_text())
    total = len(queries)
    print(f"Replaying {total} queries against {BASE_URL}")
    print(f"Delay between calls: {DELAY_BETWEEN_CALLS}s (~{60 // DELAY_BETWEEN_CALLS} calls/min)")
    print(f"Estimated time: ~{(total * 2 * DELAY_BETWEEN_CALLS) // 60} minutes")
    print("=" * 60)

    # Quick health check
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{BASE_URL}/health", timeout=5)
            if r.status_code != 200:
                print(f"WARNING: /health returned {r.status_code}")
        except httpx.ConnectError:
            print(f"ERROR: Cannot connect to {BASE_URL}. Is the app running?")
            print("Start it with:  uvicorn main:app --reload")
            sys.exit(1)

        start = time.time()
        for i, query in enumerate(queries, 1):
            await replay_query(client, query, i, total)

        elapsed = time.time() - start
        print("=" * 60)
        print(f"Done. {total} queries replayed in {elapsed / 60:.1f} minutes.")
        print(f"New search logs saved to: search_logs/")


if __name__ == "__main__":
    asyncio.run(main())
