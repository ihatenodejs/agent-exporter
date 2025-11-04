import dayjs from 'dayjs';
import {z} from 'zod';

import {calculateCost} from '../core/pricing';
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

export const convertCcUsageExportToMessages = (
  ccusageData: CCUsageExportData,
): UnifiedMessage[] => {
  const unifiedMessages: UnifiedMessage[] = [];

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

  for (const dailyEntry of dailyEntries) {
    const breakdowns = dailyEntry.modelBreakdowns;
    for (let i = 0; i < breakdowns.length; i++) {
      const breakdown = breakdowns[i];

      const messageId = `ccusage-${dailyEntry.date}-${breakdown.modelName}-${i}`;
      const sessionId = `ccusage-session-${dailyEntry.date}`;
      const timestamp = dayjs(`${dailyEntry.date} 12:00:00`).valueOf();
      const provider = detectProviderFromModel(breakdown.modelName);

      const cost =
        breakdown.cost > 0
          ? breakdown.cost
          : calculateCost(
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

  for (const dailyEntry of dailyEntries) {
    const breakdowns = dailyEntry.modelBreakdowns;
    for (const breakdown of breakdowns) {
      const provider = detectProviderFromModel(breakdown.modelName);

      const cost =
        breakdown.cost > 0
          ? breakdown.cost
          : calculateCost(
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
      const proc = Bun.spawn(['ccusage', 'daily', '--json'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const errorOutput = await new Response(proc.stderr).text();
        throw new Error(
          `ccusage command failed with exit code ${exitCode}: ${errorOutput}`,
        );
      }

      const data: unknown = JSON.parse(output);
      const parsed = CCUsageExportSchema.safeParse(data);

      if (!parsed.success) {
        console.warn('Failed to parse ccusage output:', parsed.error);
        return [];
      }

      return convertCcUsageExportToUsageEntries(parsed.data);
    } catch (error: unknown) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      console.error('Failed to fetch CCUsage data:', normalizedError.message);
      if (normalizedError.stack) {
        console.error(normalizedError.stack);
      }
      throw normalizedError;
    }
  }
}
