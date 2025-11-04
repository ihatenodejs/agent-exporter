import dayjs from 'dayjs';
import {z} from 'zod';

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
      const proc = Bun.spawn(['bunx', '@ccusage/codex@latest', '--json'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const errorOutput = await new Response(proc.stderr).text();
        throw new Error(
          `codex command failed with exit code ${exitCode}: ${errorOutput}`,
        );
      }

      const data: unknown = JSON.parse(output);
      const parsed = CodexExportSchema.safeParse(data);

      if (!parsed.success) {
        console.warn('Failed to parse codex output:', parsed.error);
        return usageEntries;
      }

      const codexData = parsed.data;

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
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      console.error('Failed to fetch Codex data:', normalizedError.message);
      if (normalizedError.stack) {
        console.error(normalizedError.stack);
      }
      throw normalizedError;
    }

    return usageEntries;
  }
}
