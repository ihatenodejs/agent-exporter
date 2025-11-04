import dayjs from 'dayjs';
import {z} from 'zod';

import {normalizeAndLogError} from '../core/error-utils';
import {spawnCommandAndParseJson} from '../core/spawn-utils';
import {type UsageProviderAdapter, type UsageEntry} from '../core/types';

const CodexModelSchema = z.object({
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
  totalTokens: z.number(),
  isFallback: z.boolean(),
});

const CodexDailySchema = z.object({
  date: z.string(),
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
  totalTokens: z.number(),
  costUSD: z.number(),
  models: z.record(z.string(), CodexModelSchema),
});

const CodexExportSchema = z.object({
  daily: z.array(CodexDailySchema),
  totals: z.object({
    inputTokens: z.number(),
    cachedInputTokens: z.number(),
    outputTokens: z.number(),
    reasoningOutputTokens: z.number(),
    totalTokens: z.number(),
    costUSD: z.number(),
  }),
});

export class CodexAdapter implements UsageProviderAdapter {
  name = 'codex' as const;
  dataType = 'usage entries' as const;

  async fetchUsageEntries(): Promise<UsageEntry[]> {
    const usageEntries: UsageEntry[] = [];

    try {
      const codexData = await spawnCommandAndParseJson(
        ['bunx', '@ccusage/codex@latest', '--json'],
        CodexExportSchema,
      );

      for (const dailyEntry of codexData.daily) {
        const modelEntries = Object.entries(dailyEntry.models);

        for (const [modelName, modelData] of modelEntries) {
          const timestamp = dayjs(dailyEntry.date, 'MMM DD, YYYY').valueOf();
          const date = dayjs(timestamp).format('YYYY-MM-DD');

          const cacheReadTokens = modelData.cachedInputTokens;
          const actualInputTokens =
            modelData.inputTokens - modelData.cachedInputTokens;

          const cost = dailyEntry.costUSD / modelEntries.length;

          usageEntries.push({
            date,
            provider: 'codex',
            model: modelName,
            inputTokens: actualInputTokens,
            outputTokens: modelData.outputTokens,
            reasoningTokens: modelData.reasoningOutputTokens,
            cacheCreationTokens: 0,
            cacheReadTokens,
            totalCost: cost,
            entryCount: 1, // Each entry represents aggregated usage for that model/day
          });
        }
      }
    } catch (error: unknown) {
      throw normalizeAndLogError('to fetch Codex data', error);
    }

    return usageEntries;
  }
}
