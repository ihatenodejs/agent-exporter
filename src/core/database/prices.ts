/**
 * Fallback pricing database for models not found in @pydantic/genai-prices
 *
 * This serves as a secondary source when genai-prices doesn't have pricing data.
 * Prices are per million (1M) tokens.
 */

export interface FallbackModelPrice {
  /** Model identifier */
  model: string;
  /** Provider identifier (optional) */
  provider?: string;
  /** Input tokens cost per 1M tokens (USD) */
  inputPer1M: number;
  /** Output tokens cost per 1M tokens (USD) */
  outputPer1M: number;
  /** Cache write cost per 1M tokens (USD) */
  cacheWritePer1M?: number;
  /** Cache read cost per 1M tokens (USD) */
  cacheReadPer1M?: number;
  /** Notes about this pricing */
  notes?: string;
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
    inputPer1M: 1.25,
    outputPer1M: 10,
    cacheReadPer1M: 0.125,
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
    inputPer1M: 1.25,
    outputPer1M: 10,
    cacheReadPer1M: 0.125,
    cacheWritePer1M: 1.625,
  },
];

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
      (p) => p.model === modelName && p.provider === providerId,
    );
    if (exactMatch) return exactMatch;
  }

  const modelMatch = FALLBACK_PRICES.find((p) => p.model === modelName);
  if (modelMatch) return modelMatch;

  const lowerModelName = modelName.toLowerCase();
  const partialMatch = FALLBACK_PRICES.find(
    (p) =>
      p.model.toLowerCase().includes(lowerModelName) ||
      lowerModelName.includes(p.model.toLowerCase()),
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
  return FALLBACK_PRICES.map((p) => p.model);
}

/**
 * Get fallback models by provider
 *
 * @param providerId - Provider identifier
 * @returns Array of model identifiers for the specified provider
 */
export function getFallbackModelsByProvider(providerId: string): string[] {
  return FALLBACK_PRICES.filter((p) => p.provider === providerId).map(
    (p) => p.model,
  );
}
