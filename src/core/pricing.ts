import {calcPrice} from '@pydantic/genai-prices';

import {findFallbackPrice, type FallbackModelPrice} from './database/prices';

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
  const inputCost = (inputTokens / 1_000_000) * fallbackPrice.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * fallbackPrice.outputPer1M;
  const cacheWriteCost =
    (cacheCreationTokens / 1_000_000) * (fallbackPrice.cacheWritePer1M ?? 0);
  const cacheReadCost =
    (cacheReadTokens / 1_000_000) * (fallbackPrice.cacheReadPer1M ?? 0);

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

  const fallbackPrice = findFallbackPrice(model, providerId);
  if (fallbackPrice) {
    const inputCost = (inputTokens / 1_000_000) * fallbackPrice.inputPer1M;
    const outputCost = (outputTokens / 1_000_000) * fallbackPrice.outputPer1M;
    const cacheWriteCost =
      (cacheCreationTokens / 1_000_000) * (fallbackPrice.cacheWritePer1M ?? 0);
    const cacheReadCost =
      (cacheReadTokens / 1_000_000) * (fallbackPrice.cacheReadPer1M ?? 0);

    return {
      totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost,
      inputCost,
      outputCost,
      cacheWriteCost,
      cacheReadCost,
      providerName: fallbackPrice.provider,
      modelName: fallbackPrice.model,
      source: 'fallback',
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
    return {
      inputPer1M: fallbackPrice.inputPer1M,
      outputPer1M: fallbackPrice.outputPer1M,
      cacheWritePer1M: fallbackPrice.cacheWritePer1M ?? 0,
      cacheReadPer1M: fallbackPrice.cacheReadPer1M ?? 0,
    };
  }

  return null;
}
