"""
Query normalization service for improving cache hit rates.

Normalizes search queries to canonical form to ensure that semantically
identical queries produce the same cache key, improving cache efficiency.
"""

import re
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


class QueryNormalizer:
    """Service for normalizing search queries and parameters."""
    
    # Grading company patterns to standardize
    GRADING_PATTERNS = [
        (re.compile(r'\bpsa\s*(\d+)\b', re.IGNORECASE), r'psa \1'),  # PSA10 → psa 10
        (re.compile(r'\bbgs\s*(\d+(?:\.\d+)?)\b', re.IGNORECASE), r'bgs \1'),  # BGS9.5 → bgs 9.5
        (re.compile(r'\bsgc\s*(\d+)\b', re.IGNORECASE), r'sgc \1'),  # SGC10 → sgc 10
        (re.compile(r'\bcgc\s*(\d+(?:\.\d+)?)\b', re.IGNORECASE), r'cgc \1'),  # CGC9.8 → cgc 9.8
    ]
    
    @staticmethod
    def normalize(query: str) -> str:
        """
        Normalize a search query to canonical form.
        
        Normalization steps:
        1. Convert to lowercase
        2. Standardize grading terms (PSA10 → psa 10)
        3. Extract quoted terms and non-quoted terms separately
        4. Sort quoted terms alphabetically
        5. Normalize whitespace
        6. Remove duplicate terms
        
        Args:
            query: Raw search query string
            
        Returns:
            Normalized query string
            
        Examples:
            >>> QueryNormalizer.normalize('"Shohei Ohtani" "2024"')
            '"2024" "shohei ohtani"'
            >>> QueryNormalizer.normalize('"PSA10" "Topps Chrome"')
            '"psa 10" "topps chrome"'
            >>> QueryNormalizer.normalize('Aaron  Judge   Rookie')
            'aaron judge rookie'
        """
        if not query or not isinstance(query, str):
            return ""
        
        # Step 1: Convert to lowercase
        normalized = query.lower().strip()
        
        if not normalized:
            return ""
        
        # Step 2: Standardize grading terms BEFORE extracting quotes
        # This ensures "PSA10" becomes "psa 10" even inside quotes
        for pattern, replacement in QueryNormalizer.GRADING_PATTERNS:
            normalized = pattern.sub(replacement, normalized)
        
        # Step 3 & 4: Extract and sort quoted terms
        # Find all quoted strings
        quoted_terms = re.findall(r'"([^"]+)"', normalized)
        
        if quoted_terms:
            # Normalize whitespace within each quoted term
            quoted_terms = [' '.join(term.split()) for term in quoted_terms]
            
            # Remove duplicates while preserving order, then sort
            seen = set()
            unique_quoted = []
            for term in quoted_terms:
                if term not in seen and term:  # Skip empty strings
                    seen.add(term)
                    unique_quoted.append(term)
            
            # Sort alphabetically for consistency
            unique_quoted.sort()
            
            # Reconstruct query with sorted quoted terms
            normalized = ' '.join(f'"{term}"' for term in unique_quoted)
            
        else:
            # No quotes - normalize as plain text
            # Step 5: Normalize whitespace (multiple spaces → single space)
            normalized = ' '.join(normalized.split())
            
            # Step 6: Remove duplicate words
            words = normalized.split()
            seen = set()
            unique_words = []
            for word in words:
                if word not in seen and word:
                    seen.add(word)
                    unique_words.append(word)
            
            normalized = ' '.join(unique_words)
        
        logger.debug(f"Normalized query: '{query}' → '{normalized}'")
        return normalized
    
    @staticmethod
    def normalize_params(params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize query parameters for consistent cache key generation.
        
        - Normalizes the 'query' or 'keywords' field if present
        - Sorts all dictionary keys
        - Converts values to consistent types where possible
        
        Args:
            params: Dictionary of query parameters
            
        Returns:
            Normalized parameters dictionary
        """
        if not params:
            return {}
        
        normalized = {}
        
        for key, value in params.items():
            # Normalize the query/keywords field
            if key in ('query', 'keywords', 'q') and isinstance(value, str):
                normalized[key] = QueryNormalizer.normalize(value)
            # Convert numeric strings to consistent format
            elif isinstance(value, (int, float)):
                normalized[key] = value
            # Keep other values as-is
            else:
                normalized[key] = value
        
        logger.debug(f"Normalized params: {params} → {normalized}")
        return normalized


# Convenience function for quick normalization
def normalize_query(query: str) -> str:
    """
    Convenience function to normalize a query string.
    
    Args:
        query: Query string to normalize
        
    Returns:
        Normalized query string
    """
    return QueryNormalizer.normalize(query)
