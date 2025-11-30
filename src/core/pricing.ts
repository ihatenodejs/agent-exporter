import {calcPrice} from '@pydantic/genai-prices';

import {
  calculateTieredCost,
  findFallbackPrice,
  type FallbackModelPrice,
  type TieredPrice,
} from './database/prices';

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheWritePer1M: number;
  cacheReadPer1M: number;
}

export interface CalculatedCost {
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  cacheReadCost: number;
  providerName?: string;
  modelName?: string;
  source: 'genai-prices' | 'fallback' | 'none';
}

const isTieredPrice = (value: unknown): value is {base: number} =>
  typeof value === 'object' &&
  value !== null &&
  'base' in value &&
  typeof (value as {base: unknown}).base === 'number';

function extractPrice(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (isTieredPrice(value)) {
    return value.base;
  }

  return 0;
}

function calculateFromFallback(
  fallbackPrice: FallbackModelPrice,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
): number {
  const thresholdTotal = inputTokens + cacheCreationTokens + cacheReadTokens;

  const inputCost = calculateTieredCost(
    inputTokens,
    fallbackPrice.inputPer1M,
    thresholdTotal,
  );
  const outputCost = calculateTieredCost(
    outputTokens,
    fallbackPrice.outputPer1M,
    thresholdTotal,
  );
  const cacheWriteCost = calculateTieredCost(
    cacheCreationTokens,
    fallbackPrice.cacheWritePer1M,
    thresholdTotal,
  );
  const cacheReadCost = calculateTieredCost(
    cacheReadTokens,
    fallbackPrice.cacheReadPer1M,
    thresholdTotal,
  );

  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  providerId?: string,
): number {
  if (!model || model.trim() === '') {
    return 0;
  }

  const fallbackPrice = findFallbackPrice(model, providerId);
  if (fallbackPrice) {
    return calculateFromFallback(
      fallbackPrice,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
    );
  }

  const usage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };

  const result = calcPrice(usage, model, providerId ? {providerId} : undefined);

  if (result) {
    let totalCost = result.total_price;

    if (cacheCreationTokens > 0 || cacheReadTokens > 0) {
      const prices = result.model.prices;
      if (!Array.isArray(prices) && 'cache_write_mtok' in prices) {
        const cacheWritePrice = extractPrice(prices.cache_write_mtok);
        const cacheReadPrice = extractPrice(prices.cache_read_mtok);
        const cacheWriteCost =
          (cacheCreationTokens / 1_000_000) * cacheWritePrice;
        const cacheReadCost = (cacheReadTokens / 1_000_000) * cacheReadPrice;
        totalCost += cacheWriteCost + cacheReadCost;
      }
    }

    return totalCost;
  }

  return 0;
}

export function calculateDetailedCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  providerId?: string,
): CalculatedCost {
  if (!model || model.trim() === '') {
    return {
      inputCost: 0,
      outputCost: 0,
      cacheWriteCost: 0,
      cacheReadCost: 0,
      totalCost: 0,
      source: 'none',
    };
  }

  const fallbackPrice = findFallbackPrice(model, providerId);
  if (fallbackPrice) {
    const thresholdTotal = inputTokens + cacheCreationTokens + cacheReadTokens;

    const inputCost = calculateTieredCost(
      inputTokens,
      fallbackPrice.inputPer1M,
      thresholdTotal,
    );
    const outputCost = calculateTieredCost(
      outputTokens,
      fallbackPrice.outputPer1M,
      thresholdTotal,
    );
    const cacheWriteCost = calculateTieredCost(
      cacheCreationTokens,
      fallbackPrice.cacheWritePer1M,
      thresholdTotal,
    );
    const cacheReadCost = calculateTieredCost(
      cacheReadTokens,
      fallbackPrice.cacheReadPer1M,
      thresholdTotal,
    );

    return {
      totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost,
      inputCost,
      outputCost,
      cacheWriteCost,
      cacheReadCost,
      providerName: fallbackPrice.provider,
      modelName: Array.isArray(fallbackPrice.model)
        ? fallbackPrice.model[0]
        : fallbackPrice.model,
      source: 'fallback',
    };
  }

  const usage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };

  const result = calcPrice(usage, model, providerId ? {providerId} : undefined);

  if (result) {
    const inputCost = result.input_price;
    const outputCost = result.output_price;

    let cacheWriteCost = 0;
    let cacheReadCost = 0;

    const prices = result.model.prices;
    if (!Array.isArray(prices) && 'cache_write_mtok' in prices) {
      const cacheWritePrice = extractPrice(prices.cache_write_mtok);
      const cacheReadPrice = extractPrice(prices.cache_read_mtok);
      cacheWriteCost = (cacheCreationTokens / 1_000_000) * cacheWritePrice;
      cacheReadCost = (cacheReadTokens / 1_000_000) * cacheReadPrice;
    }

    return {
      totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost,
      inputCost,
      outputCost,
      cacheWriteCost,
      cacheReadCost,
      providerName: result.provider.name,
      modelName: result.model.name,
      source: 'genai-prices',
    };
  }

  return {
    totalCost: 0,
    inputCost: 0,
    outputCost: 0,
    cacheWriteCost: 0,
    cacheReadCost: 0,
    source: 'none',
  };
}

export function getModelPricing(
  model: string,
  providerId?: string,
): ModelPricing | null {
  if (!model || model.trim() === '') {
    return null;
  }

  const testUsage = {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  };

  const result = calcPrice(
    testUsage,
    model,
    providerId ? {providerId} : undefined,
  );

  if (result) {
    const prices = result.model.prices;
    if (!Array.isArray(prices) && 'input_mtok' in prices) {
      return {
        inputPer1M: extractPrice(prices.input_mtok),
        outputPer1M: extractPrice(prices.output_mtok),
        cacheWritePer1M: extractPrice(prices.cache_write_mtok),
        cacheReadPer1M: extractPrice(prices.cache_read_mtok),
      };
    }
  }

  const fallbackPrice = findFallbackPrice(model, providerId);
  if (fallbackPrice) {
    const extractBaseRate = (
      price: number | TieredPrice | undefined,
    ): number => {
      if (!price) return 0;
      if (typeof price === 'number') return price;
      return price.belowOrEqual;
    };

    return {
      inputPer1M: extractBaseRate(fallbackPrice.inputPer1M),
      outputPer1M: extractBaseRate(fallbackPrice.outputPer1M),
      cacheWritePer1M: extractBaseRate(fallbackPrice.cacheWritePer1M),
      cacheReadPer1M: extractBaseRate(fallbackPrice.cacheReadPer1M),
    };
  }

  return null;
}
