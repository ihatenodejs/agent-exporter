import {describe, expect, it} from 'bun:test';
import dayjs from 'dayjs';

import {
  CCUsageExportSchema,
  convertCcUsageExportToMessages,
} from '../providers/ccusage';

const loadSample = async (): Promise<unknown> => {
  const file = Bun.file(new URL('./sample-cc.json', import.meta.url));
  return (await file.json()) as unknown;
};

describe('CLI ccusage ingestion sample', () => {
  it('validates the bundled sample against CCUsageExportSchema', async () => {
    const sample = await loadSample();
    const parsed = CCUsageExportSchema.safeParse(sample);

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error(
        `Validation failed: ${JSON.stringify(parsed.error, null, 2)}`,
      );
    }

    const [dailyEntry] = parsed.data.daily ?? [];
    expect(dailyEntry).toBeDefined();
    expect(dailyEntry.modelsUsed).toContain('claude-sonnet-4-5-20250929');
    expect(dailyEntry.totalCost).toBeCloseTo(4.2);

    const breakdown = dailyEntry.modelBreakdowns[0];
    expect(breakdown).toBeDefined();
    expect(breakdown.modelName).toBe('claude-sonnet-4-5-20250929');
    expect(breakdown.inputTokens).toBe(120);
    expect(breakdown.outputTokens).toBe(240);
    expect(breakdown.cacheCreationTokens).toBe(30);
    expect(breakdown.cacheReadTokens).toBe(10);
    expect(breakdown.cost).toBeCloseTo(4.2);

    expect(parsed.data.totals?.totalCost).toBeCloseTo(4.2);
    expect(parsed.data.totals?.totalTokens).toBe(400);
  });

  it('produces the expected unified message from the sample data', async () => {
    const sample = await loadSample();
    const parsed = CCUsageExportSchema.parse(sample);

    const messages = convertCcUsageExportToMessages(parsed);
    expect(messages).toHaveLength(1);

    const message = messages[0];
    const expectedTimestamp = dayjs('2025-01-01 12:00:00').valueOf();

    expect(message).toMatchObject({
      id: 'ccusage-2025-01-01-claude-sonnet-4-5-20250929-0',
      sessionId: 'ccusage-session-2025-01-01',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      inputTokens: 120,
      outputTokens: 240,
      reasoningTokens: 0,
      cacheCreationTokens: 30,
      cacheReadTokens: 10,
      cost: 4.2,
      date: '2025-01-01',
    });
    expect(message.timestamp).toBe(expectedTimestamp);
  });
});
