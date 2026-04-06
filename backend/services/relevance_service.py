# backend/services/relevance_service.py
"""
AI-powered listing relevance scoring using OpenRouter (Llama 3.1 8B).

Scores each listing title 0.0-1.0 for how well it matches the user's search
intent. The score is used as a weight multiplier in FMV calculation so
irrelevant listings (wrong variant, wrong grade, wrong card) have minimal
influence on the price estimate.
"""
import json
import os
import re
import time
from typing import List, Optional

import httpx

from backend.logging_config import get_logger

logger = get_logger(__name__)


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "google/gemini-2.0-flash-lite-001"       # used for >40 listings
OPENROUTER_MODEL_LITE = "google/gemini-1.5-flash-8b"        # used for <=40 listings
OPENROUTER_SMALL_THRESHOLD = 40
OPENROUTER_TIMEOUT = 15  # seconds
CHUNK_SIZE = 20  # max listings per LLM call (smaller = more reliable parsing)


def _extract_json_array(text: str) -> Optional[list]:
    """Extract a JSON array from LLM output, handling extra text/markdown."""
    # Strip markdown code fences
    if "```" in text:
        text = re.sub(r"```(?:json)?\s*", "", text)
        text = text.replace("```", "")
    text = text.strip()

    # Try direct parse first
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    # Find the first [ ... ] in the text
    match = re.search(r'\[[\d\s.,\n]+\]', text)
    if match:
        try:
            result = json.loads(match.group(0))
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    # Handle truncated arrays (output cut off by max_tokens, no closing ])
    match = re.search(r'\[([\d\s.,\n]+)', text)
    if match:
        # Strip trailing comma/whitespace and close the array
        inner = match.group(1).rstrip(', \n')
        try:
            result = json.loads(f'[{inner}]')
            if isinstance(result, list) and len(result) >= 2:
                return result
        except json.JSONDecodeError:
            pass

    return None


def _score_chunk(query: str, titles: List[str], key: str, model: str) -> Optional[List[float]]:
    """Score a single chunk of titles. Returns None on failure."""
    titles_block = "\n".join(f"{i}: {t}" for i, t in enumerate(titles))
    prompt = (
        f"You are a baseball card listing classifier. The user searched for:\n"
        f'"{query}"\n\n'
        f"Score each listing title 0.0 to 1.0 for how well it matches the search intent.\n"
        f"- 1.0 = exact match (same card, same variant, same grade if specified)\n"
        f"- 0.7-0.9 = close match (same card, minor difference like shipping variant)\n"
        f"- 0.3-0.6 = partial match (same player but different card/year/set, or wrong grade)\n"
        f"- 0.0-0.2 = poor match (different card, lot, reprint, digital, or clearly wrong item)\n\n"
        f"Listings:\n{titles_block}\n\n"
        f"Return ONLY a JSON array of numbers, one per listing, in order. Example: [1.0, 0.8, 0.3]\n"
        f"No explanation, just the JSON array."
    )

    response = httpx.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "max_tokens": len(titles) * 12 + 50,
        },
        timeout=OPENROUTER_TIMEOUT,
    )

    if response.status_code != 200:
        return None

    data = response.json()
    content = data["choices"][0]["message"]["content"].strip()

    scores = _extract_json_array(content)
    if scores is None:
        logger.error(f"Could not extract JSON array from LLM response ({len(content)} chars): {content[:200]}")
        return None
    if not isinstance(scores, list):
        return None

    # Handle length mismatches
    if len(scores) < len(titles):
        scores.extend([1.0] * (len(titles) - len(scores)))
    elif len(scores) > len(titles):
        scores = scores[:len(titles)]

    return [max(0.0, min(1.0, float(s))) for s in scores]


def score_listing_relevance(
    query: str,
    items: List,
    api_key: Optional[str] = None,
) -> List[float]:
    """
    Score each listing's relevance to the search query using an LLM.

    Args:
        query: The user's original search query (e.g., "1984 Donruss Mattingly #248 PSA 10")
        items: List of CompItem objects with titles
        api_key: OpenRouter API key (defaults to OPENROUTER_API_KEY env var)

    Returns:
        List of floats (0.0-1.0), one per item. 1.0 = perfect match, 0.0 = irrelevant.
        Returns all 1.0s on any failure (graceful degradation).
    """
    if not items:
        return []

    fallback = [1.0] * len(items)

    # Get API key
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        logger.warning("No OPENROUTER_API_KEY found, skipping AI scoring")
        return fallback

    # Extract titles
    titles = []
    for item in items:
        title = getattr(item, "title", None) or ""
        titles.append(title[:120])  # truncate long titles

    if not any(titles):
        return fallback

    # Select model based on result count
    model = OPENROUTER_MODEL_LITE if len(items) <= OPENROUTER_SMALL_THRESHOLD else OPENROUTER_MODEL
    logger.info(f"Using model: {model} ({len(items)} listings)")

    # Process in chunks to avoid LLM output length issues
    all_scores = []
    start = time.time()
    chunks_succeeded = 0
    chunks_failed = 0

    for chunk_start in range(0, len(titles), CHUNK_SIZE):
        chunk_titles = titles[chunk_start:chunk_start + CHUNK_SIZE]
        try:
            chunk_scores = _score_chunk(query, chunk_titles, key, model)
            if chunk_scores:
                all_scores.extend(chunk_scores)
                chunks_succeeded += 1
            else:
                all_scores.extend([1.0] * len(chunk_titles))
                chunks_failed += 1
        except (httpx.TimeoutException, json.JSONDecodeError, KeyError,
                IndexError, ValueError) as e:
            logger.error(f"Chunk {chunk_start}-{chunk_start+len(chunk_titles)} failed: {e}")
            all_scores.extend([1.0] * len(chunk_titles))
            chunks_failed += 1
        except Exception as e:
            logger.error(f"Chunk {chunk_start}-{chunk_start+len(chunk_titles)} unexpected error: {e}")
            all_scores.extend([1.0] * len(chunk_titles))
            chunks_failed += 1

    elapsed = time.time() - start
    total_chunks = chunks_succeeded + chunks_failed
    low_scores = sum(1 for s in all_scores if s < 0.5)
    mean_score = sum(all_scores) / len(all_scores) if all_scores else 1.0

    logger.info(f"Scored {len(all_scores)} listings in {elapsed:.1f}s "
                f"({total_chunks} chunks, {chunks_failed} failed, "
                f"mean={mean_score:.2f}, {low_scores} below 0.5)")

    return all_scores
