import {describe, expect, it} from 'bun:test';
import dayjs from 'dayjs';

import {
  CCUsageExportSchema,
  convertCcUsageExportToMessages,
  detectProviderFromModel,
} from '../ccusage';

describe('CCUsage utilities', () => {
  it('detects providers from various model names', () => {
    expect(detectProviderFromModel('claude-3-opus')).toBe('anthropic');
    expect(detectProviderFromModel('GPT-4.1 Turbo')).toBe('openai');
    expect(detectProviderFromModel('Gemini-Pro')).toBe('google');
    expect(detectProviderFromModel('qwen2.5-coder')).toBe('qwen');
    expect(detectProviderFromModel('glm-4')).toBe('zhipu');
    expect(detectProviderFromModel('llama3')).toBe('meta');
    expect(detectProviderFromModel('rails-model')).toBe('ccusage');
  });

  it('flattens daily usage across sections into unified messages', () => {
    const exportData = {
      daily: [
        {
          date: '2024-02-01',
          inputTokens: 150,
          outputTokens: 300,
          cacheCreationTokens: 20,
          cacheReadTokens: 5,
          totalTokens: 475,
          totalCost: 7.5,
          modelsUsed: ['claude-3-opus-20240229'],
          modelBreakdowns: [
            {
              modelName: 'claude-3-opus-20240229',
              inputTokens: 150,
              outputTokens: 300,
              cacheCreationTokens: 20,
              cacheReadTokens: 5,
              cost: 7.5,
            },
          ],
        },
      ],
      enterprise: {
        daily: [
          {
            date: '2024-02-02',
            inputTokens: 80,
            outputTokens: 160,
            cacheCreationTokens: 10,
            cacheReadTokens: 4,
            totalTokens: 254,
            totalCost: 3.2,
            modelsUsed: ['gpt-4.1-mini'],
            modelBreakdowns: [
              {
                modelName: 'gpt-4.1-mini',
                inputTokens: 80,
                outputTokens: 160,
                cacheCreationTokens: 10,
                cacheReadTokens: 4,
                cost: 3.2,
              },
            ],
          },
        ],
      },
      totals: {
        inputTokens: 230,
        outputTokens: 460,
        cacheCreationTokens: 30,
        cacheReadTokens: 9,
        totalTokens: 729,
        totalCost: 10.7,
      },
    } satisfies unknown;

    const parsed = CCUsageExportSchema.parse(exportData);
    const messages = convertCcUsageExportToMessages(parsed);

    expect(messages).toHaveLength(2);

    const first = messages[0];
    const second = messages[1];

    const firstTimestamp = dayjs('2024-02-01 12:00:00').valueOf();
    const secondTimestamp = dayjs('2024-02-02 12:00:00').valueOf();

    expect(first).toMatchObject({
      id: 'ccusage-2024-02-01-claude-3-opus-20240229-0',
      sessionId: 'ccusage-session-2024-02-01',
      provider: 'anthropic',
      model: 'claude-3-opus-20240229',
      inputTokens: 150,
      outputTokens: 300,
      cacheCreationTokens: 20,
      cacheReadTokens: 5,
      cost: 7.5,
      date: '2024-02-01',
    });
    expect(first.reasoningTokens).toBe(0);
    expect(first.timestamp).toBe(firstTimestamp);

    expect(second).toMatchObject({
      id: 'ccusage-2024-02-02-gpt-4.1-mini-0',
      sessionId: 'ccusage-session-2024-02-02',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      inputTokens: 80,
      outputTokens: 160,
      cacheCreationTokens: 10,
      cacheReadTokens: 4,
      cost: 3.2,
      date: '2024-02-02',
    });
    expect(second.reasoningTokens).toBe(0);
    expect(second.timestamp).toBe(secondTimestamp);
  });
});
