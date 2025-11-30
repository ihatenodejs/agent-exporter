import {afterEach, beforeAll, describe, expect, it, mock} from 'bun:test';

import {FALLBACK_PRICES, type TieredPrice} from '../database/prices';
import {
  calculateCost,
  calculateDetailedCost,
  getModelPricing,
} from '../pricing';

type CalcPriceResult = {
  total_price: number;
  input_price?: number;
  output_price?: number;
  provider: {name: string};
  model: {
    name: string;
    prices: {
      input_mtok?: number;
      output_mtok?: number;
      cache_write_mtok?: number;
      cache_read_mtok?: number;
    };
  };
} | null;

const calcPriceMock = mock<(...args: unknown[]) => CalcPriceResult>(() => null);

await mock.module('@pydantic/genai-prices', () => ({
  calcPrice: calcPriceMock,
}));

afterEach(() => {
  calcPriceMock.mockReset();
});

describe('calculateCost', () => {
  it('uses genai pricing data and augments cache costs', () => {
    calcPriceMock.mockImplementation(() => {
      const result: CalcPriceResult = {
        total_price: 1.0,
        provider: {name: 'OpenAI'},
        model: {
          name: 'gpt-4',
          prices: {
            cache_write_mtok: 2,
            cache_read_mtok: 1,
          },
        },
      };
      return result;
    });

    const total = calculateCost('gpt-4', 1000, 500, 500_000, 250_000, 'openai');

    expect(calcPriceMock).toHaveBeenCalledWith(
      {input_tokens: 1000, output_tokens: 500},
      'gpt-4',
      {providerId: 'openai'},
    );
    expect(total).toBeCloseTo(2.25, 5);
  });

  it('falls back to internal pricing when genai data is missing', () => {
    calcPriceMock.mockReturnValue(null as CalcPriceResult);

    const total = calculateCost('glm-4.5', 1_000_000, 1_000_000, 0, 0);

    expect(total).toBeCloseTo(1.9, 5);
  });

  it('returns zero cost when neither genai nor fallback prices exist', () => {
    calcPriceMock.mockReturnValue(null as CalcPriceResult);

    const total = calculateCost('unknown-model', 1000, 1000, 0, 0);

    expect(total).toBe(0);
  });
});

describe('calculateDetailedCost', () => {
  it('provides component costs and metadata from genai pricing', () => {
    calcPriceMock.mockImplementation(() => {
      const result: CalcPriceResult = {
        total_price: 1.0,
        input_price: 0.6,
        output_price: 0.4,
        provider: {name: 'OpenAI'},
        model: {
          name: 'gpt-4',
          prices: {
            input_mtok: 12,
            output_mtok: 34,
            cache_write_mtok: 2,
            cache_read_mtok: 1,
          },
        },
      };
      return result;
    });

    const cost = calculateDetailedCost(
      'gpt-4',
      1000,
      500,
      500_000,
      250_000,
      'openai',
    );

    expect(cost).toEqual({
      totalCost: 2.25,
      inputCost: 0.6,
      outputCost: 0.4,
      cacheWriteCost: 1.0,
      cacheReadCost: 0.25,
      providerName: 'OpenAI',
      modelName: 'gpt-4',
      source: 'genai-prices',
    });
  });

  it('falls back to internal pricing database when genai data is missing', () => {
    calcPriceMock.mockReturnValue(null as CalcPriceResult);

    const cost = calculateDetailedCost('glm-4.5', 1_000_000, 500_000, 0, 0);

    expect(cost).toEqual({
      totalCost: 1.125,
      inputCost: 0.35,
      outputCost: 0.775,
      cacheWriteCost: 0,
      cacheReadCost: 0,
      providerName: undefined,
      modelName: 'glm-4.5',
      source: 'fallback',
    });
  });

  it('returns zeroed costs when no pricing information is available', () => {
    calcPriceMock.mockReturnValue(null as CalcPriceResult);

    const cost = calculateDetailedCost('unknown-model', 500, 500, 0, 0);

    expect(cost).toEqual({
      totalCost: 0,
      inputCost: 0,
      outputCost: 0,
      cacheWriteCost: 0,
      cacheReadCost: 0,
      source: 'none',
    });
  });
});

describe('getModelPricing', () => {
  it('reads per-million prices from genai data', () => {
    calcPriceMock.mockImplementation(() => {
      const result: CalcPriceResult = {
        total_price: 0,
        provider: {name: 'OpenAI'},
        model: {
          name: 'gpt-4',
          prices: {
            input_mtok: 10,
            output_mtok: 20,
            cache_write_mtok: 2,
            cache_read_mtok: 1,
          },
        },
      };
      return result;
    });

    const pricing = getModelPricing('gpt-4', 'openai');

    expect(pricing).toEqual({
      inputPer1M: 10,
      outputPer1M: 20,
      cacheWritePer1M: 2,
      cacheReadPer1M: 1,
    });
  });

  it('falls back to internal pricing when genai data is unavailable', () => {
    calcPriceMock.mockReturnValue(null as CalcPriceResult);

    const pricing = getModelPricing('glm-4.5');

    expect(pricing).toEqual({
      inputPer1M: 0.35,
      outputPer1M: 1.55,
      cacheWritePer1M: 0,
      cacheReadPer1M: 0.11,
    });
  });

  it('returns null when no pricing information can be found', () => {
    calcPriceMock.mockReturnValue(null as CalcPriceResult);

    const pricing = getModelPricing('unknown-model');

    expect(pricing).toBeNull();
  });
});

describe('tiered pricing', () => {
  beforeAll(() => {
    calcPriceMock.mockReturnValue(null as CalcPriceResult);
  });

  function isTieredPrice(
    value: number | TieredPrice | undefined,
  ): value is TieredPrice {
    return (
      typeof value === 'object' &&
      'threshold' in value &&
      'belowOrEqual' in value &&
      'above' in value
    );
  }

  function toTestRate(price: number | TieredPrice | undefined): {
    below: number;
    above: number;
  } {
    if (!price) {
      return {below: 0, above: 0};
    }
    if (isTieredPrice(price)) {
      return {below: price.belowOrEqual, above: price.above};
    }
    return {below: price, above: price};
  }

  describe('models with 200K threshold', () => {
    const tieredModels = FALLBACK_PRICES.filter((entry) =>
      isTieredPrice(entry.inputPer1M),
    ).map((entry) => ({
      name: Array.isArray(entry.model) ? entry.model[0] : entry.model,
      rates: {
        input: toTestRate(entry.inputPer1M),
        output: toTestRate(entry.outputPer1M),
        cacheWrite: toTestRate(entry.cacheWritePer1M),
        cacheRead: toTestRate(entry.cacheReadPer1M),
      },
    }));

    tieredModels.forEach(({name, rates}) => {
      describe(name, () => {
        it('uses lower tier rates when below 200K threshold', () => {
          // Threshold total: 100K + 30K + 20K = 150K (below 200K)
          const cost = calculateCost(
            name,
            100_000, // input
            50_000, // output
            30_000, // cache write
            20_000, // cache read
          );

          const expected =
            (100_000 / 1_000_000) * rates.input.below +
            (50_000 / 1_000_000) * rates.output.below +
            (30_000 / 1_000_000) * rates.cacheWrite.below +
            (20_000 / 1_000_000) * rates.cacheRead.below;

          expect(cost).toBeCloseTo(expected, 5);
        });

        it('uses higher tier rates when above 200K threshold', () => {
          // Threshold total: 150K + 40K + 20K = 210K (above 200K)
          const cost = calculateCost(
            name,
            150_000, // input
            100_000, // output
            40_000, // cache write
            20_000, // cache read
          );

          const expected =
            (150_000 / 1_000_000) * rates.input.above +
            (100_000 / 1_000_000) * rates.output.above +
            (40_000 / 1_000_000) * rates.cacheWrite.above +
            (20_000 / 1_000_000) * rates.cacheRead.above;

          expect(cost).toBeCloseTo(expected, 5);
        });
      });
    });

    it('uses belowOrEqual rate at exact 200K threshold', () => {
      // Threshold total: 150K + 30K + 20K = 200K (exactly at threshold)
      const cost = calculateCost(
        'claude-sonnet-4-5',
        150_000, // input
        50_000, // output
        30_000, // cache write
        20_000, // cache read
      );

      expect(cost).toBeCloseTo(1.3185, 5);
    });

    it('excludes output tokens from threshold calculation', () => {
      // Threshold total: 100K + 20K + 10K = 130K (below 200K)
      // Even though output is 500K, it doesn't affect tier
      const cost = calculateCost(
        'claude-sonnet-4-5',
        100_000, // input
        500_000, // output (very large)
        20_000, // cache write
        10_000, // cache read
      );

      expect(cost).toBeCloseTo(7.878, 5);
    });
  });

  describe('calculateDetailedCost with tiered pricing', () => {
    it('provides correct cost breakdown below threshold', () => {
      const cost = calculateDetailedCost(
        'claude-sonnet-4-5',
        100_000,
        50_000,
        30_000,
        20_000,
      );

      expect(cost.inputCost).toBeCloseTo(0.3, 5);
      expect(cost.outputCost).toBeCloseTo(0.75, 5);
      expect(cost.cacheWriteCost).toBeCloseTo(0.1125, 5);
      expect(cost.cacheReadCost).toBeCloseTo(0.006, 5);
      expect(cost.totalCost).toBeCloseTo(1.1685, 5);
      expect(cost.source).toBe('fallback');
      expect(cost.modelName).toBe('claude-sonnet-4-5');
    });

    it('provides correct cost breakdown above threshold', () => {
      const cost = calculateDetailedCost(
        'gemini-2.5-pro',
        150_000,
        100_000,
        40_000,
        20_000,
      );

      expect(cost.inputCost).toBeCloseTo(0.375, 5);
      expect(cost.outputCost).toBeCloseTo(1.5, 5);
      expect(cost.cacheWriteCost).toBeCloseTo(0.065, 5);
      expect(cost.cacheReadCost).toBeCloseTo(0.005, 5);
      expect(cost.totalCost).toBeCloseTo(1.945, 5);
      expect(cost.source).toBe('fallback');
      expect(cost.modelName).toBe('gemini-2.5-pro');
    });

    it('uses fallback source for tiered models', () => {
      const cost = calculateDetailedCost(
        'claude-sonnet-4-5',
        100_000,
        50_000,
        0,
        0,
      );

      expect(cost.source).toBe('fallback');
    });
  });

  describe('models with flat pricing', () => {
    it('uses flat rates regardless of token count (claude-opus-4-5)', () => {
      const cost = calculateCost(
        'claude-opus-4-5',
        250_000, // input
        100_000, // output
        0, // cache write
        0, // cache read
      );

      expect(cost).toBeCloseTo(3.75, 5);
    });

    it('uses flat rates regardless of token count (claude-haiku-4-5)', () => {
      const cost = calculateCost(
        'claude-haiku-4-5',
        1_000_000, // input
        500_000, // output
        0, // cache write
        0, // cache read
      );

      expect(cost).toBeCloseTo(3.5, 5);
    });
  });

  describe('edge cases', () => {
    it('handles zero tokens for all types', () => {
      const cost = calculateCost('claude-sonnet-4-5', 0, 0, 0, 0);
      expect(cost).toBe(0);
    });

    it('handles very large token counts correctly', () => {
      // Threshold total: 10M + 0 + 0 = 10M (far above 200K)
      const cost = calculateCost(
        'claude-sonnet-4-5',
        10_000_000, // 10M input
        0,
        0,
        0,
      );

      // Input: 10M × $6/MTok = $60 (uses higher tier)
      expect(cost).toBeCloseTo(60, 5);
    });

    it('handles threshold calculation with only cache read tokens', () => {
      // Threshold total: 0 + 0 + 250K = 250K (above 200K)
      const cost = calculateCost(
        'claude-sonnet-4-5',
        0, // input
        100_000, // output
        0, // cache write
        250_000, // cache read
      );

      // Input: 0
      // Output: 100K × $22.50/MTok = $2.25 (uses higher tier)
      // Cache read: 250K × $0.60/MTok = $0.15 (uses higher tier)
      // Total: $2.40
      expect(cost).toBeCloseTo(2.4, 5);
    });

    it('returns zero for unknown model', () => {
      const cost = calculateCost('unknown-model', 100_000, 100_000, 0, 0);
      expect(cost).toBe(0);
    });

    it('returns zero for empty model name', () => {
      const cost = calculateCost('', 100_000, 100_000, 0, 0);
      expect(cost).toBe(0);
    });

    it('returns zeroed costs with source=none for unknown model in detailed calculation', () => {
      const cost = calculateDetailedCost('unknown-model', 500, 500, 0, 0);

      expect(cost).toEqual({
        totalCost: 0,
        inputCost: 0,
        outputCost: 0,
        cacheWriteCost: 0,
        cacheReadCost: 0,
        source: 'none',
      });
    });
  });
});
