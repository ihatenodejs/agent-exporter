/**
 * Friendly display labels for common models.
 *
 * This database mirrors the fallback pricing approach, allowing mapping of
 * verbose internal identifiers to human-readable names in the CLI.
 */

export interface ModelLabelEntry {
  /** Raw model identifier as reported by providers */
  model: string;
  /** Provider identifier (optional) */
  provider?: string;
  /** Friendly name to display in the CLI */
  label: string;
  /** Additional context about the label */
  notes?: string;
}

export const MODEL_LABELS: ModelLabelEntry[] = [
  // Anthropic
  {
    model: 'claude-opus-4-1-20250805',
    label: 'Claude Opus 4.1 (2025-08-05)',
  },
  {
    model: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5 Sonnet (2025-09-29)',
  },
  {
    model: 'claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
  },
  {
    model: 'claude-sonnet-4-20250514',
    label: 'Claude Sonnet 4 Sonnet (2025-05-14)',
  },
  {
    model: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5 (2025-10-01)',
  },

  // OpenAI
  {
    model: 'gpt-5',
    label: 'GPT-5',
  },
  {
    model: 'gpt-5-codex',
    label: 'GPT-5 Codex',
  },

  // Google Gemini
  {
    model: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
  },
  {
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
  },
  {
    model: 'gemini-2.5-pro-preview-06-05',
    label: 'Gemini 2.5 Pro Preview (2025-06-05)',
  },

  // Alibaba Qwen
  {
    model: 'qwen/qwen3-coder-30b',
    label: 'Qwen3 Coder 30B',
  },

  // Zhipu GLM
  {
    model: 'glm-4.6',
    label: 'GLM 4.6',
  },
  {
    model: 'glm-4.5',
    label: 'GLM 4.5',
  },
  {
    model: 'glm-4.5-air',
    label: 'GLM 4.5 Air',
  },

  {
    model: 'coder-model',
    label: 'Qwen Coder',
  },
];

const MODEL_LOOKUP = new Map(
  MODEL_LABELS.map((entry) => {
    const key =
      entry.provider !== undefined
        ? `${entry.provider.toLowerCase()}::${entry.model.toLowerCase()}`
        : entry.model.toLowerCase();
    return [key, entry.label];
  }),
);

/**
 * Resolve a friendly label for a model name.
 *
 * Preference order:
 * 1. Exact match with provider
 * 2. Exact match regardless of provider
 */
export function findModelLabel(
  modelName: string,
  provider?: string,
): string | null {
  if (!modelName) {
    return null;
  }

  if (provider) {
    const providerKey = `${provider.toLowerCase()}::${modelName.toLowerCase()}`;
    const withProvider = MODEL_LOOKUP.get(providerKey);
    if (withProvider) {
      return withProvider;
    }
  }

  const baseKey = modelName.toLowerCase();
  return MODEL_LOOKUP.get(baseKey) ?? null;
}

/**
 * Get the display label for a model, falling back to the raw identifier.
 */
export function getModelDisplayName(
  modelName: string,
  provider?: string,
): string {
  const label = findModelLabel(modelName, provider);
  return label ?? modelName;
}
