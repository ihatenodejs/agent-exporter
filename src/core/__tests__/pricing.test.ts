import {afterAll, afterEach, describe, expect, it, mock} from 'bun:test';

import {
  calculateCost,
  calculateDetailedCost,
  calculateOhMyPiCatalogCost,
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

interface CatalogModel {
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

type CatalogModels = Record<string, Record<string, CatalogModel>>;

const {default: actualCatalogModels} =
  await import('@oh-my-pi/pi-catalog/models.json');
const catalogOverrides = new Map<string, Record<string, CatalogModel>>();
const catalogModels = new Proxy<CatalogModels>(actualCatalogModels, {
  get(target, provider: string) {
    return catalogOverrides.get(provider) ?? target[provider];
  },
});

const setCatalogModel = (
  provider: string,
  model: string,
  cost: CatalogModel['cost'],
): void => {
  catalogOverrides.set(provider, {[model]: {cost}});
};

await mock.module('@pydantic/genai-prices', () => ({
  calcPrice: calcPriceMock,
}));

await mock.module('@oh-my-pi/pi-catalog/models.json', () => ({
  default: catalogModels,
}));

afterEach(() => {
  calcPriceMock.mockReset();
  catalogOverrides.clear();
});

afterAll(() => {
  mock.restore();
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

  it('searches genai pricing without the Oh My Pi wrapper provider', () => {
    calcPriceMock.mockReturnValue({
      total_price: 3.75,
      provider: {name: 'xAI'},
      model: {name: 'Grok 4.3', prices: {}},
    });

    const total = calculateCost(
      'grok-4.3',
      1_000_000,
      1_000_000,
      0,
      0,
      'oh-my-pi',
    );

    expect(calcPriceMock).toHaveBeenCalledWith(
      {input_tokens: 1_000_000, output_tokens: 1_000_000},
      'grok-4.3',
      undefined,
    );
    expect(total).toBe(3.75);
  });

  it('falls back to internal pricing when genai data is missing', () => {
    calcPriceMock.mockReturnValue(null as CalcPriceResult);

    const total = calculateCost('glm-4.5', 1_000_000, 1_000_000, 0, 0);

    expect(total).toBeCloseTo(1.9, 5);
  });

  it('matches MiMo V2.5 variants with their cache-read rates', () => {
    calcPriceMock.mockReturnValue(null as CalcPriceResult);

    expect(
      calculateCost('mimo-v2.5-20260101', 1_000_000, 1_000_000, 0, 1_000_000),
    ).toBeCloseTo(0.4228, 5);
    expect(
      calculateCost(
        'MiMo-V2.5-Pro-20260101',
        1_000_000,
        1_000_000,
        0,
        1_000_000,
      ),
    ).toBeCloseTo(1.3086, 5);
  });

  it('uses the Antigravity catalog price for imported model usage', () => {
    setCatalogModel('google-antigravity', 'gemini-3.6-flash', {
      input: 1.5,
      output: 7.5,
      cacheRead: 0.15,
      cacheWrite: 0,
    });

    expect(
      calculateCost(
        'gemini-3.6-flash',
        69_834,
        27_974,
        0,
        248_611,
        'antigravity',
      ),
    ).toBeCloseTo(0.35184765, 8);
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

describe('calculateOhMyPiCatalogCost', () => {
  it('calculates all four persisted token buckets', () => {
    setCatalogModel('google-antigravity', 'gemini-3.6-flash', {
      input: 1.5,
      output: 7.5,
      cacheRead: 0.15,
      cacheWrite: 2,
    });

    const cost = calculateOhMyPiCatalogCost(
      'google-antigravity',
      'gemini-3.6-flash',
      1_000_000,
      1_000_000,
      1_000_000,
      1_000_000,
    );

    expect(cost).toBeCloseTo(11.15, 5);
  });

  it('returns null for an all-zero catalog entry', () => {
    setCatalogModel('google-antigravity', 'free-model', {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });

    expect(
      calculateOhMyPiCatalogCost(
        'google-antigravity',
        'free-model',
        1,
        1,
        1,
        1,
      ),
    ).toBeNull();
  });

  it('falls back from OpenAI Codex to OpenAI', () => {
    setCatalogModel('openai-codex', 'gpt-5', {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    setCatalogModel('openai', 'gpt-5', {
      input: 1,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
    });

    const cost = calculateOhMyPiCatalogCost(
      'openai-codex',
      'gpt-5',
      1_000_000,
      1_000_000,
      1_000_000,
      1_000_000,
    );

    expect(catalogOverrides.get('openai-codex')).toBeDefined();
    expect(catalogOverrides.get('openai')).toBeDefined();
    expect(cost).toBe(10);
  });
});
