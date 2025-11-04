import dayjs from 'dayjs';
import {z} from 'zod';

import {normalizeAndLogError} from '../core/error-utils';
import {calculateCost} from '../core/pricing';
import {spawnCommandAndParseJson} from '../core/spawn-utils';
import {
  type UnifiedMessage,
  type UsageProviderAdapter,
  type UsageEntry,
} from '../core/types';

export const CCUsageModelBreakdownSchema = z.object({
  modelName: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  cost: z.number(),
});

export const CCUsageDailySchema = z.object({
  date: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  totalTokens: z.number(),
  totalCost: z.number(),
  modelsUsed: z.array(z.string()),
  modelBreakdowns: z.array(CCUsageModelBreakdownSchema),
});

export const CCUsageTotalsSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  totalCost: z.number(),
  totalTokens: z.number(),
});

export const CCUsageSectionSchema = z.object({
  daily: z.array(CCUsageDailySchema).optional(),
  totals: CCUsageTotalsSchema.optional(),
});

export const CCUsageExportSchema = z
  .object({
    daily: z.array(CCUsageDailySchema).optional(),
    totals: CCUsageTotalsSchema.optional(),
  })
  .catchall(CCUsageSectionSchema);

export type CCUsageExportData = z.infer<typeof CCUsageExportSchema>;

export const detectProviderFromModel = (modelName: string): string => {
  const lower = modelName.toLowerCase();

  if (lower.includes('claude')) {
    return 'anthropic';
  } else if (lower.includes('gpt') || lower.includes('openai')) {
    return 'openai';
  } else if (lower.includes('gemini')) {
    return 'google';
  } else if (lower.includes('qwen')) {
    return 'qwen';
  } else if (
    lower.includes('opus') ||
    lower.includes('sonnet') ||
    lower.includes('haiku')
  ) {
    return 'anthropic';
  } else if (lower.includes('glm')) {
    return 'zhipu';
  } else if (lower.includes('mistral')) {
    return 'mistral';
  } else if (lower.includes('llama')) {
    return 'meta';
  } else if (lower.includes('cohere')) {
    return 'cohere';
  }

  return 'ccusage';
};

/**
 * Collects all daily entries from CCUsage export data
 * Extracts entries from both the top-level daily array and nested sections
 */
function collectDailyEntries(
  ccusageData: CCUsageExportData,
): z.infer<typeof CCUsageDailySchema>[] {
  const dailyEntries: z.infer<typeof CCUsageDailySchema>[] = [];

  if (ccusageData.daily) {
    dailyEntries.push(...ccusageData.daily);
  }

  for (const [key, value] of Object.entries(ccusageData)) {
    if (key === 'daily' || key === 'totals') {
      continue;
    }

    const section = CCUsageSectionSchema.safeParse(value);
    if (section.success && section.data.daily) {
      dailyEntries.push(...section.data.daily);
    }
  }

  return dailyEntries;
}

/**
 * Calculates cost with fallback - uses provided cost if > 0, otherwise calculates it
 */
function calculateCostOrUseFallback(
  existingCost: number,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  provider: string,
): number {
  return existingCost > 0
    ? existingCost
    : calculateCost(
        model,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        provider,
      );
}

export const convertCcUsageExportToMessages = (
  ccusageData: CCUsageExportData,
): UnifiedMessage[] => {
  const unifiedMessages: UnifiedMessage[] = [];
  const dailyEntries = collectDailyEntries(ccusageData);

  for (const dailyEntry of dailyEntries) {
    const breakdowns = dailyEntry.modelBreakdowns;
    for (let i = 0; i < breakdowns.length; i++) {
      const breakdown = breakdowns[i];

      const messageId = `ccusage-${dailyEntry.date}-${breakdown.modelName}-${i}`;
      const sessionId = `ccusage-session-${dailyEntry.date}`;
      const timestamp = dayjs(`${dailyEntry.date} 12:00:00`).valueOf();
      const provider = detectProviderFromModel(breakdown.modelName);

      const cost = calculateCostOrUseFallback(
        breakdown.cost,
        breakdown.modelName,
        breakdown.inputTokens,
        breakdown.outputTokens,
        breakdown.cacheCreationTokens,
        breakdown.cacheReadTokens,
        provider,
      );

      unifiedMessages.push({
        id: messageId,
        sessionId,
        provider,
        model: breakdown.modelName,
        inputTokens: breakdown.inputTokens,
        outputTokens: breakdown.outputTokens,
        reasoningTokens: 0,
        cacheCreationTokens: breakdown.cacheCreationTokens,
        cacheReadTokens: breakdown.cacheReadTokens,
        cost,
        timestamp,
        date: dailyEntry.date,
      });
    }
  }

  return unifiedMessages;
};

export const convertCcUsageExportToUsageEntries = (
  ccusageData: CCUsageExportData,
): UsageEntry[] => {
  const usageEntries: UsageEntry[] = [];
  const dailyEntries = collectDailyEntries(ccusageData);

  for (const dailyEntry of dailyEntries) {
    const breakdowns = dailyEntry.modelBreakdowns;
    for (const breakdown of breakdowns) {
      const provider = detectProviderFromModel(breakdown.modelName);

      const cost = calculateCostOrUseFallback(
        breakdown.cost,
        breakdown.modelName,
        breakdown.inputTokens,
        breakdown.outputTokens,
        breakdown.cacheCreationTokens,
        breakdown.cacheReadTokens,
        provider,
      );

      usageEntries.push({
        date: dailyEntry.date,
        provider,
        model: breakdown.modelName,
        inputTokens: breakdown.inputTokens,
        outputTokens: breakdown.outputTokens,
        reasoningTokens: 0,
        cacheCreationTokens: breakdown.cacheCreationTokens,
        cacheReadTokens: breakdown.cacheReadTokens,
        totalCost: cost,
        entryCount: 1,
      });
    }
  }

  return usageEntries;
};

export class CCUsageAdapter implements UsageProviderAdapter {
  name = 'ccusage' as const;
  dataType = 'usage entries' as const;

  async fetchUsageEntries(): Promise<UsageEntry[]> {
    try {
      const ccusageData = await spawnCommandAndParseJson(
        ['ccusage', 'daily', '--json'],
        CCUsageExportSchema,
      );

      return convertCcUsageExportToUsageEntries(ccusageData);
    } catch (error: unknown) {
      throw normalizeAndLogError('to fetch CCUsage data', error);
    }
  }
}
