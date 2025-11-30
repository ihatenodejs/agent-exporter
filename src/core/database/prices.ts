/**
 * Fallback pricing database for models not found in @pydantic/genai-prices
 *
 * This serves as a secondary source when genai-prices doesn't have pricing data.
 * Prices are per million (1M) tokens.
 */

export interface TieredPrice {
  /** Threshold in tokens (e.g., 200000 for 200K) */
  threshold: number;
  /** Price per 1M tokens when below or equal to threshold */
  belowOrEqual: number;
  /** Price per 1M tokens when above threshold */
  above: number;
}

export interface FallbackModelPrice {
  /** Model identifier(s) - supports aliases like model-labels.ts */
  model: string | string[];
  /** Provider identifier (optional) */
  provider?: string;
  /** Input tokens cost per 1M tokens (USD) - can be a number or tiered pricing */
  inputPer1M: number | TieredPrice;
  /** Output tokens cost per 1M tokens (USD) - can be a number or tiered pricing */
  outputPer1M: number | TieredPrice;
  /** Cache write cost per 1M tokens (USD) - can be a number or tiered pricing */
  cacheWritePer1M?: number | TieredPrice;
  /** Cache read cost per 1M tokens (USD) - can be a number or tiered pricing */
  cacheReadPer1M?: number | TieredPrice;
}

/**
 * Fallback pricing database
 *
 * Add models here that are not available in genai-prices or have custom pricing.
 */
export const FALLBACK_PRICES: FallbackModelPrice[] = [
  // GLM Models (ZhipuAI)
  {
    model: 'glm-4.6',
    inputPer1M: 0.6,
    outputPer1M: 2.2,
    cacheReadPer1M: 0.11,
  },
  {
    model: 'glm-4.5',
    inputPer1M: 0.35,
    outputPer1M: 1.55,
    cacheReadPer1M: 0.11,
  },
  {
    model: 'glm-4.5-air',
    inputPer1M: 0.2,
    outputPer1M: 1.1,
    cacheReadPer1M: 0.03,
  },

  // Qwen Models (Alibaba Cloud)
  {
    model: 'qwen/qwen3-coder-30b',
    inputPer1M: 0.06,
    outputPer1M: 0.25,
  },
  {
    model: 'coder-model',
    inputPer1M: 1.0,
    outputPer1M: 5.0,
  },

  // Gemini Models (Google)
  {
    model: 'gemini-2.5-pro',
    inputPer1M: {
      threshold: 200_000,
      belowOrEqual: 1.25,
      above: 2.5,
    },
    outputPer1M: {
      threshold: 200_000,
      belowOrEqual: 10,
      above: 15,
    },
    cacheReadPer1M: {
      threshold: 200_000,
      belowOrEqual: 0.125,
      above: 0.25,
    },
    cacheWritePer1M: 1.625,
  },
  {
    model: 'gemini-2.5-flash',
    inputPer1M: 0.3,
    outputPer1M: 2.5,
    cacheReadPer1M: 0.03,
    cacheWritePer1M: 0.3833,
  },
  {
    model: 'gemini-2.5-pro-preview-06-05',
    inputPer1M: {
      threshold: 200_000,
      belowOrEqual: 1.25,
      above: 2.5,
    },
    outputPer1M: {
      threshold: 200_000,
      belowOrEqual: 10,
      above: 15,
    },
    cacheReadPer1M: {
      threshold: 200_000,
      belowOrEqual: 0.125,
      above: 0.25,
    },
    cacheWritePer1M: 1.625,
  },

  // Anthropic Models
  {
    model: ['claude-sonnet-4-5', 'claude-sonnet-4.5'],
    inputPer1M: {
      threshold: 200_000,
      belowOrEqual: 3,
      above: 6,
    },
    outputPer1M: {
      threshold: 200_000,
      belowOrEqual: 15,
      above: 22.5,
    },
    cacheWritePer1M: {
      threshold: 200_000,
      belowOrEqual: 3.75,
      above: 7.5,
    },
    cacheReadPer1M: {
      threshold: 200_000,
      belowOrEqual: 0.3,
      above: 0.6,
    },
  },
  {
    model: ['claude-opus-4-5', 'claude-opus-4.5'],
    inputPer1M: 5,
    outputPer1M: 25,
    cacheWritePer1M: 6.25,
    cacheReadPer1M: 0.5,
  },
  {
    model: ['claude-haiku-4-5', 'claude-haiku-4.5'],
    inputPer1M: 1,
    outputPer1M: 5,
    cacheWritePer1M: 1.25,
    cacheReadPer1M: 0.1,
  },
];

/**
 * Helper to check if a price is tiered
 */
function isTieredPrice(value: number | TieredPrice): value is TieredPrice {
  return (
    typeof value === 'object' &&
    'threshold' in value &&
    'belowOrEqual' in value &&
    'above' in value
  );
}

/**
 * Calculate cost for a given token count with potentially tiered pricing
 *
 * @param tokens - Number of tokens to calculate cost for
 * @param pricePerMillion - Either a flat rate or tiered pricing structure
 * @param thresholdTotal - Optional combined total for tier determination (for Anthropic chat token pricing)
 * @returns Cost in USD
 */
export function calculateTieredCost(
  tokens: number,
  pricePerMillion: number | TieredPrice | undefined,
  thresholdTotal?: number,
): number {
  if (!pricePerMillion || pricePerMillion === 0) {
    return 0;
  }

  if (typeof pricePerMillion === 'number') {
    return (tokens / 1_000_000) * pricePerMillion;
  }

  if (isTieredPrice(pricePerMillion)) {
    const tierBasis = thresholdTotal ?? tokens;
    const rate =
      tierBasis <= pricePerMillion.threshold
        ? pricePerMillion.belowOrEqual
        : pricePerMillion.above;
    return (tokens / 1_000_000) * rate;
  }

  return 0;
}

/**
 * Helper to check if a model name matches an entry (supports aliases)
 */
function modelMatches(entry: FallbackModelPrice, modelName: string): boolean {
  const models = Array.isArray(entry.model) ? entry.model : [entry.model];
  return models.some((m) => m === modelName);
}

/**
 * Helper to check if a model name partially matches an entry
 */
function modelPartiallyMatches(
  entry: FallbackModelPrice,
  modelName: string,
): boolean {
  const models = Array.isArray(entry.model) ? entry.model : [entry.model];
  const lowerModelName = modelName.toLowerCase();
  return models.some(
    (m) =>
      m.toLowerCase().includes(lowerModelName) ||
      lowerModelName.includes(m.toLowerCase()),
  );
}

/**
 * Find fallback pricing for a model
 *
 * @param modelName - The model identifier to search for
 * @param providerId - Optional provider to narrow the search
 * @returns Pricing information if found, null otherwise
 */
export function findFallbackPrice(
  modelName: string,
  providerId?: string,
): FallbackModelPrice | null {
  if (providerId) {
    const exactMatch = FALLBACK_PRICES.find(
      (p) => modelMatches(p, modelName) && p.provider === providerId,
    );
    if (exactMatch) return exactMatch;
  }

  const modelMatch = FALLBACK_PRICES.find((p) => modelMatches(p, modelName));
  if (modelMatch) return modelMatch;

  const partialMatch = FALLBACK_PRICES.find((p) =>
    modelPartiallyMatches(p, modelName),
  );
  if (partialMatch) return partialMatch;

  return null;
}

/**
 * Get all available fallback models
 *
 * @returns Array of all model identifiers in the fallback database
 */
export function getAllFallbackModels(): string[] {
  return FALLBACK_PRICES.flatMap((p) =>
    Array.isArray(p.model) ? p.model : [p.model],
  );
}

/**
 * Get fallback models by provider
 *
 * @param providerId - Provider identifier
 * @returns Array of model identifiers for the specified provider
 */
export function getFallbackModelsByProvider(providerId: string): string[] {
  return FALLBACK_PRICES.filter((p) => p.provider === providerId).flatMap(
    (p) => (Array.isArray(p.model) ? p.model : [p.model]),
  );
}
