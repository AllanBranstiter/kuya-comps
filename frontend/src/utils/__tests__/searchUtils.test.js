import { describe, it, expect } from 'vitest';
import { 
  formatMoney, 
  filterOutliers, 
  buildSearchQuery,
  getItemPrice,
  calculateStdDev,
  calculateMarketConfidence,
  calculateWeightedMedian,
  toNinetyNine,
  calculateDataQuality
} from '../searchUtils';

describe('formatMoney', () => {
  it('formats positive numbers', () => {
    expect(formatMoney(1234.56)).toBe('$1,234.56');
  });

  it('formats small numbers', () => {
    expect(formatMoney(5.5)).toBe('$5.50');
  });

  it('handles zero', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('handles null/undefined', () => {
    expect(formatMoney(null)).toBe('$-.--');
    expect(formatMoney(undefined)).toBe('$-.--');
  });

  it('handles NaN', () => {
    expect(formatMoney(NaN)).toBe('$-.--');
  });

  it('formats large numbers with commas', () => {
    expect(formatMoney(1000000)).toBe('$1,000,000.00');
  });
});

describe('filterOutliers', () => {
  it('returns empty array for empty input', () => {
    expect(filterOutliers([])).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(filterOutliers(null)).toEqual([]);
  });

  it('returns copy for small arrays (< 4 items)', () => {
    const prices = [10, 15, 20];
    const result = filterOutliers(prices);
    expect(result).toEqual([10, 15, 20]);
    // Should be a copy, not the same reference
    expect(result).not.toBe(prices);
  });

  it('filters extreme outliers', () => {
    const prices = [10, 12, 11, 13, 14, 100]; // 100 is outlier
    const filtered = filterOutliers(prices);
    expect(filtered).not.toContain(100);
    expect(filtered).toContain(10);
    expect(filtered).toContain(12);
  });

  it('keeps values within IQR bounds', () => {
    const prices = [10, 11, 12, 13, 14, 15];
    const filtered = filterOutliers(prices);
    expect(filtered).toEqual(prices);
  });
});

describe('buildSearchQuery', () => {
  it('returns original query when no filters', () => {
    const result = buildSearchQuery('Mike Trout 2011');
    expect(result).toBe('Mike Trout 2011');
  });

  it('appends lot exclusions when excludeLots is true', () => {
    const result = buildSearchQuery('Mike Trout', { excludeLots: true });
    expect(result).toContain('-lot');
    expect(result).toContain('-bulk');
    expect(result).toContain('-bundle');
  });

  it('appends grading exclusions when ungradedOnly is true', () => {
    const result = buildSearchQuery('Mike Trout', { ungradedOnly: true });
    expect(result).toContain('-psa');
    expect(result).toContain('-bgs');
    expect(result).toContain('-sgc');
    expect(result).toContain('-graded');
  });

  it('appends variation exclusions when baseOnly is true', () => {
    const result = buildSearchQuery('Mike Trout', { baseOnly: true });
    expect(result).toContain('-refractor');
    expect(result).toContain('-prizm');
    expect(result).toContain('-gold');
  });

  it('combines multiple filter exclusions', () => {
    const result = buildSearchQuery('Mike Trout', { 
      excludeLots: true, 
      ungradedOnly: true 
    });
    expect(result).toContain('-lot');
    expect(result).toContain('-psa');
  });
});

describe('getItemPrice', () => {
  it('returns 0 for null item', () => {
    expect(getItemPrice(null)).toBe(0);
  });

  it('returns total_price when available', () => {
    const item = { total_price: 50 };
    expect(getItemPrice(item)).toBe(50);
  });

  it('calculates from extracted_price and shipping', () => {
    const item = { extracted_price: 40, extracted_shipping: 5 };
    expect(getItemPrice(item)).toBe(45);
  });

  it('handles missing shipping', () => {
    const item = { extracted_price: 40 };
    expect(getItemPrice(item)).toBe(40);
  });
});

describe('calculateStdDev', () => {
  it('returns 0 for empty array', () => {
    expect(calculateStdDev([])).toBe(0);
  });

  it('returns 0 for single value', () => {
    expect(calculateStdDev([10])).toBe(0);
  });

  it('calculates standard deviation correctly', () => {
    // For [2, 4, 6]: mean=4, variance=((4+0+4)/3)=8/3, stddev=sqrt(8/3)≈1.633
    const stdDev = calculateStdDev([2, 4, 6]);
    expect(stdDev).toBeCloseTo(1.633, 2);
  });
});

describe('calculateMarketConfidence', () => {
  it('returns 0 for empty array', () => {
    expect(calculateMarketConfidence([])).toBe(0);
  });

  it('returns high confidence for consistent prices', () => {
    const confidence = calculateMarketConfidence([100, 100, 100, 100]);
    expect(confidence).toBe(100);
  });

  it('returns lower confidence for variable prices', () => {
    const confidence = calculateMarketConfidence([50, 100, 150, 200]);
    expect(confidence).toBeLessThan(70);
    expect(confidence).toBeGreaterThan(0);
  });
});

describe('calculateWeightedMedian', () => {
  it('returns null for empty array', () => {
    expect(calculateWeightedMedian([])).toBeNull();
  });

  it('returns single value for single item', () => {
    expect(calculateWeightedMedian([50])).toBe(50);
  });

  it('calculates weighted median correctly', () => {
    // More values at 50 should weight median towards 50
    const prices = [50, 50, 50, 100, 200];
    const median = calculateWeightedMedian(prices);
    expect(median).toBe(50);
  });
});

describe('toNinetyNine', () => {
  it('returns null for null input', () => {
    expect(toNinetyNine(null)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(toNinetyNine(NaN)).toBeNull();
  });

  it('rounds up and subtracts 0.01', () => {
    expect(toNinetyNine(45.50)).toBe(45.99);
  });

  it('handles values that need ceiling', () => {
    expect(toNinetyNine(45.01)).toBe(45.99);
  });

  it('handles minimum value of 1', () => {
    expect(toNinetyNine(0.5)).toBe(0.99);
  });
});

describe('calculateDataQuality', () => {
  it('returns high score for large sample sizes', () => {
    const quality = calculateDataQuality(25, 15, 80);
    expect(quality).toBeGreaterThan(80);
  });

  it('returns medium score for medium sample sizes', () => {
    const quality = calculateDataQuality(12, 6, 60);
    expect(quality).toBeGreaterThan(50);
    expect(quality).toBeLessThan(90);
  });

  it('returns low score for small sample sizes', () => {
    const quality = calculateDataQuality(3, 2, 30);
    expect(quality).toBeLessThan(50);
  });

  it('handles zero confidence', () => {
    const quality = calculateDataQuality(20, 10, 0);
    expect(quality).toBe(60); // 100 * 0.6 + 0 * 0.4
  });
});
