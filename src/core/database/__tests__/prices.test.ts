import {describe, expect, it} from 'bun:test';

import {
  calculateTieredCost,
  findFallbackPrice,
  type TieredPrice,
} from '../prices';

describe('calculateTieredCost', () => {
  describe('flat pricing', () => {
    it('calculates cost with flat rate correctly', () => {
      const cost = calculateTieredCost(100_000, 5);
      expect(cost).toBeCloseTo(0.5, 5);
    });

    it('handles zero flat rate', () => {
      const cost = calculateTieredCost(100_000, 0);
      expect(cost).toBe(0);
    });
  });

  describe('tiered pricing without thresholdTotal', () => {
    const tieredPrice: TieredPrice = {
      threshold: 200_000,
      belowOrEqual: 3,
      above: 6,
    };

    it('uses belowOrEqual rate when tokens below threshold', () => {
      const cost = calculateTieredCost(100_000, tieredPrice);
      expect(cost).toBeCloseTo(0.3, 5); // 100K * $3/MTok = $0.30
    });

    it('uses above rate when tokens exceed threshold', () => {
      const cost = calculateTieredCost(250_000, tieredPrice);
      expect(cost).toBeCloseTo(1.5, 5); // 250K * $6/MTok = $1.50
    });

    it('uses belowOrEqual rate at exact threshold', () => {
      const cost = calculateTieredCost(200_000, tieredPrice);
      expect(cost).toBeCloseTo(0.6, 5); // 200K * $3/MTok = $0.60
    });
  });

  describe('tiered pricing with thresholdTotal', () => {
    const tieredPrice: TieredPrice = {
      threshold: 200_000,
      belowOrEqual: 3,
      above: 6,
    };

    it('uses belowOrEqual rate when thresholdTotal below threshold', () => {
      // Token count is 50K, but thresholdTotal (150K) determines tier
      const cost = calculateTieredCost(50_000, tieredPrice, 150_000);
      expect(cost).toBeCloseTo(0.15, 5); // 50K * $3/MTok = $0.15
    });

    it('uses above rate when thresholdTotal exceeds threshold', () => {
      // Token count is 50K, but thresholdTotal (210K) determines tier
      const cost = calculateTieredCost(50_000, tieredPrice, 210_000);
      expect(cost).toBeCloseTo(0.3, 5); // 50K * $6/MTok = $0.30
    });

    it('uses belowOrEqual rate when thresholdTotal at exact threshold', () => {
      const cost = calculateTieredCost(50_000, tieredPrice, 200_000);
      expect(cost).toBeCloseTo(0.15, 5); // 50K * $3/MTok = $0.15
    });
  });

  describe('edge cases', () => {
    it('returns zero for zero tokens', () => {
      const cost = calculateTieredCost(0, 5);
      expect(cost).toBe(0);
    });

    it('returns zero for undefined price', () => {
      const cost = calculateTieredCost(100_000, undefined);
      expect(cost).toBe(0);
    });

    it('handles very large token counts', () => {
      const tieredPrice: TieredPrice = {
        threshold: 200_000,
        belowOrEqual: 3,
        above: 6,
      };
      const cost = calculateTieredCost(10_000_000, tieredPrice);
      expect(cost).toBeCloseTo(60, 5); // 10M * $6/MTok = $60
    });

    it('handles zero tokens with tiered pricing', () => {
      const tieredPrice: TieredPrice = {
        threshold: 200_000,
        belowOrEqual: 3,
        above: 6,
      };
      const cost = calculateTieredCost(0, tieredPrice);
      expect(cost).toBe(0);
    });
  });
});

describe('findFallbackPrice', () => {
  it('finds model by exact name', () => {
    const price = findFallbackPrice('claude-sonnet-4-5');
    expect(price).not.toBeNull();
    const models = Array.isArray(price?.model) ? price.model : [price?.model];
    expect(models).toContain('claude-sonnet-4-5');
  });

  it('finds model by exact match with provider', () => {
    const price = findFallbackPrice('glm-4.5', 'zhipu');
    expect(price).not.toBeNull();
  });

  it('finds model by partial match when exact match not found', () => {
    const price = findFallbackPrice('sonnet-4-5');
    expect(price).not.toBeNull();
    const models = Array.isArray(price?.model) ? price.model : [price?.model];
    expect(models).toContain('claude-sonnet-4-5');
  });

  it('returns null for unknown model', () => {
    const price = findFallbackPrice('unknown-model-xyz');
    expect(price).toBeNull();
  });

  it('prioritizes exact match over partial match', () => {
    const price = findFallbackPrice('claude-opus-4-5');
    expect(price).not.toBeNull();
    const models = Array.isArray(price?.model) ? price.model : [price?.model];
    expect(models).toContain('claude-opus-4-5');
  });
});
