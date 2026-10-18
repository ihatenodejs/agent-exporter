import {describe, expect, it, vi} from 'bun:test';
import dayjs from 'dayjs';

import {DatabaseManager} from '../../database/manager';
import {initializeDatabase} from '../../database/schema';
import {
  CCUsageAdapter,
  CCUsageExportSchema,
  convertCcUsageExportToMessages,
  convertCcUsageExportToUsageEntries,
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
      id: `ccusage-grouped:${JSON.stringify(['enterprise', '2024-02-02', 'gpt-4.1-mini', 0])}`,
      sessionId: `ccusage-session-grouped:${JSON.stringify(['enterprise', '2024-02-02'])}`,
      provider: 'enterprise',
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
  it('preserves two providers on the same model and day in actual SQLite with cost 3 across repeated imports', () => {
    const db = initializeDatabase(':memory:');
    const dbManager = new DatabaseManager(db);

    try {
      const exportData = {
        'oh-my-pi': {
          daily: [
            {
              date: '2025-01-01',
              inputTokens: 100,
              outputTokens: 200,
              cacheCreationTokens: 50,
              cacheReadTokens: 10,
              totalTokens: 360,
              totalCost: 1.0,
              modelsUsed: ['claude-sonnet-4-5'],
              modelBreakdowns: [
                {
                  modelName: 'claude-sonnet-4-5',
                  inputTokens: 100,
                  outputTokens: 200,
                  cacheCreationTokens: 50,
                  cacheReadTokens: 10,
                  cost: 1.0,
                },
              ],
            },
          ],
        },
        anthropic: {
          daily: [
            {
              date: '2025-01-01',
              inputTokens: 300,
              outputTokens: 400,
              cacheCreationTokens: 150,
              cacheReadTokens: 20,
              totalTokens: 870,
              totalCost: 2.0,
              modelsUsed: ['claude-sonnet-4-5'],
              modelBreakdowns: [
                {
                  modelName: 'claude-sonnet-4-5',
                  inputTokens: 300,
                  outputTokens: 400,
                  cacheCreationTokens: 150,
                  cacheReadTokens: 20,
                  cost: 2.0,
                },
              ],
            },
          ],
        },
      };

      const parsed = CCUsageExportSchema.parse(exportData);
      const messages = convertCcUsageExportToMessages(parsed);

      expect(messages).toHaveLength(2);

      // First import
      dbManager.insertMessages(messages);

      const rowsAfterFirst = dbManager.getMessagesByDateRange(
        '2025-01-01',
        '2025-01-01',
      );
      expect(rowsAfterFirst).toHaveLength(2);

      const totalCostFirst = rowsAfterFirst.reduce((sum, r) => sum + r.cost, 0);
      expect(totalCostFirst).toBe(3.0);

      const providersFirst = rowsAfterFirst.map((r) => r.provider).sort();
      expect(providersFirst).toEqual(['anthropic', 'oh-my-pi']);

      // Repeated import (must stay 2 rows with total cost 3.0)
      dbManager.insertMessages(messages);

      const rowsAfterSecond = dbManager.getMessagesByDateRange(
        '2025-01-01',
        '2025-01-01',
      );
      expect(rowsAfterSecond).toHaveLength(2);

      const totalCostSecond = rowsAfterSecond.reduce(
        (sum, r) => sum + r.cost,
        0,
      );
      expect(totalCostSecond).toBe(3.0);

      const providersSecond = rowsAfterSecond.map((r) => r.provider).sort();
      expect(providersSecond).toEqual(['anthropic', 'oh-my-pi']);
    } finally {
      dbManager.close();
    }
  });

  it('preserves explicit group provenance, totals, and cache tokens in convertCcUsageExportToUsageEntries', () => {
    const exportData = {
      'custom-gateway': {
        daily: [
          {
            date: '2025-02-15',
            inputTokens: 500,
            outputTokens: 1000,
            cacheCreationTokens: 250,
            cacheReadTokens: 75,
            totalTokens: 1825,
            totalCost: 4.5,
            modelsUsed: ['claude-3-5-sonnet-20241022'],
            modelBreakdowns: [
              {
                modelName: 'claude-3-5-sonnet-20241022',
                inputTokens: 500,
                outputTokens: 1000,
                cacheCreationTokens: 250,
                cacheReadTokens: 75,
                cost: 4.5,
              },
            ],
          },
        ],
      },
    };

    const parsed = CCUsageExportSchema.parse(exportData);
    const entries = convertCcUsageExportToUsageEntries(parsed);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      date: '2025-02-15',
      provider: 'custom-gateway',
      model: 'claude-3-5-sonnet-20241022',
      inputTokens: 500,
      outputTokens: 1000,
      reasoningTokens: 0,
      cacheCreationTokens: 250,
      cacheReadTokens: 75,
      totalCost: 4.5,
      entryCount: 1,
    });
  });

  it('safely distinguishes group keys and models that contain delimiters without tuple aliasing', () => {
    const exportData = {
      'team:alpha-beta,v1': {
        daily: [
          {
            date: '2025-01-01',
            inputTokens: 10,
            outputTokens: 20,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 30,
            totalCost: 0.1,
            modelsUsed: ['model-x'],
            modelBreakdowns: [
              {
                modelName: 'model-x',
                inputTokens: 10,
                outputTokens: 20,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                cost: 0.1,
              },
            ],
          },
        ],
      },
      team: {
        daily: [
          {
            date: '2025-01-01',
            inputTokens: 10,
            outputTokens: 20,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 30,
            totalCost: 0.1,
            modelsUsed: ['alpha-beta,v1:model-x'],
            modelBreakdowns: [
              {
                modelName: 'alpha-beta,v1:model-x',
                inputTokens: 10,
                outputTokens: 20,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                cost: 0.1,
              },
            ],
          },
        ],
      },
    };

    const parsed = CCUsageExportSchema.parse(exportData);
    const messages = convertCcUsageExportToMessages(parsed);

    expect(messages).toHaveLength(2);
    expect(messages[0].id).not.toBe(messages[1].id);
    expect(messages[0].sessionId).not.toBe(messages[1].sessionId);

    const repeatParsed = CCUsageExportSchema.parse(exportData);
    const repeatMessages = convertCcUsageExportToMessages(repeatParsed);
    expect(repeatMessages.map((m) => m.id)).toEqual(messages.map((m) => m.id));
    expect(repeatMessages.map((m) => m.sessionId)).toEqual(
      messages.map((m) => m.sessionId),
    );

    const usageEntries = convertCcUsageExportToUsageEntries(parsed);
    expect(usageEntries).toHaveLength(2);
    const sortedEntries = usageEntries
      .map((e) => ({
        provider: e.provider,
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        totalCost: e.totalCost,
      }))
      .sort((a, b) => a.provider.localeCompare(b.provider));
    expect(sortedEntries).toEqual([
      {
        provider: 'team',
        model: 'alpha-beta,v1:model-x',
        inputTokens: 10,
        outputTokens: 20,
        totalCost: 0.1,
      },
      {
        provider: 'team:alpha-beta,v1',
        model: 'model-x',
        inputTokens: 10,
        outputTokens: 20,
        totalCost: 0.1,
      },
    ]);

    const db = initializeDatabase(':memory:');
    const dbManager = new DatabaseManager(db);

    try {
      dbManager.insertMessages(messages);

      const rowsAfterFirst = dbManager.getMessagesByDateRange(
        '2025-01-01',
        '2025-01-01',
      );
      expect(rowsAfterFirst).toHaveLength(2);

      const totalTokensFirst = rowsAfterFirst.reduce(
        (sum, r) => sum + r.inputTokens + r.outputTokens,
        0,
      );
      expect(totalTokensFirst).toBe(60);

      const totalCostFirst = rowsAfterFirst.reduce((sum, r) => sum + r.cost, 0);
      expect(totalCostFirst).toBeCloseTo(0.2);

      const tuplesFirst = rowsAfterFirst
        .map((r) => ({
          provider: r.provider,
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          cost: r.cost,
        }))
        .sort((a, b) => a.provider.localeCompare(b.provider));

      expect(tuplesFirst).toEqual([
        {
          provider: 'team',
          model: 'alpha-beta,v1:model-x',
          inputTokens: 10,
          outputTokens: 20,
          cost: 0.1,
        },
        {
          provider: 'team:alpha-beta,v1',
          model: 'model-x',
          inputTokens: 10,
          outputTokens: 20,
          cost: 0.1,
        },
      ]);

      // Repeat ingest does not grow or change totals
      dbManager.insertMessages(repeatMessages);

      const rowsAfterSecond = dbManager.getMessagesByDateRange(
        '2025-01-01',
        '2025-01-01',
      );
      expect(rowsAfterSecond).toHaveLength(2);

      const totalTokensSecond = rowsAfterSecond.reduce(
        (sum, r) => sum + r.inputTokens + r.outputTokens,
        0,
      );
      expect(totalTokensSecond).toBe(60);

      const totalCostSecond = rowsAfterSecond.reduce(
        (sum, r) => sum + r.cost,
        0,
      );
      expect(totalCostSecond).toBeCloseTo(0.2);

      const tuplesSecond = rowsAfterSecond
        .map((r) => ({
          provider: r.provider,
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          cost: r.cost,
        }))
        .sort((a, b) => a.provider.localeCompare(b.provider));

      expect(tuplesSecond).toEqual(tuplesFirst);
    } finally {
      dbManager.close();
    }
  });

  it('preserves legacy top-level ID format and inferred provider when no groups are present', () => {
    const exportData = {
      daily: [
        {
          date: '2025-03-01',
          inputTokens: 100,
          outputTokens: 200,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 300,
          totalCost: 0.5,
          modelsUsed: ['gpt-4.1-turbo'],
          modelBreakdowns: [
            {
              modelName: 'gpt-4.1-turbo',
              inputTokens: 100,
              outputTokens: 200,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
              cost: 0.5,
            },
          ],
        },
      ],
    };

    const parsed = CCUsageExportSchema.parse(exportData);
    const messages = convertCcUsageExportToMessages(parsed);

    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('ccusage-2025-03-01-gpt-4.1-turbo-0');
    expect(messages[0].sessionId).toBe('ccusage-session-2025-03-01');
    expect(messages[0].provider).toBe('openai');

    const usageEntries = convertCcUsageExportToUsageEntries(parsed);
    expect(usageEntries).toHaveLength(1);
    expect(usageEntries[0].provider).toBe('openai');
  });

  it('handles empty groups and empty daily sections gracefully', () => {
    const exportData = {
      emptyProviderA: {
        daily: [],
      },
      emptyProviderB: {},
      validProvider: {
        daily: [
          {
            date: '2025-04-01',
            inputTokens: 50,
            outputTokens: 50,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 100,
            totalCost: 0.25,
            modelsUsed: ['gemini-pro'],
            modelBreakdowns: [
              {
                modelName: 'gemini-pro',
                inputTokens: 50,
                outputTokens: 50,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                cost: 0.25,
              },
            ],
          },
        ],
      },
    };

    const parsed = CCUsageExportSchema.parse(exportData);
    const messages = convertCcUsageExportToMessages(parsed);

    expect(messages).toHaveLength(1);
    expect(messages[0].provider).toBe('validProvider');
    expect(messages[0].id).toBe(
      `ccusage-grouped:${JSON.stringify(['validProvider', '2025-04-01', 'gemini-pro', 0])}`,
    );

    const usageEntries = convertCcUsageExportToUsageEntries(parsed);
    expect(usageEntries).toHaveLength(1);
    expect(usageEntries[0].provider).toBe('validProvider');
  });
});

describe('CCUsageAdapter', () => {
  it('uses bunx when ccusage is not installed', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"daily":[]}'));
        controller.close();
      },
    });
    const which = vi
      .spyOn(Bun, 'which')
      .mockImplementation((executable) =>
        executable === 'bunx' ? '/bin/bunx' : null,
      );
    const spawn = vi.spyOn(Bun, 'spawn').mockImplementation(
      () =>
        ({
          stdout: stream,
          stderr: stream,
          exited: Promise.resolve(0),
        }) as never,
    );

    try {
      const entries = await new CCUsageAdapter().fetchUsageEntries();
      expect(entries).toEqual([]);
      expect(spawn).toHaveBeenCalledWith(
        ['bunx', 'ccusage', 'daily', '--json'],
        {stdout: 'pipe', stderr: 'pipe'},
      );
    } finally {
      spawn.mockRestore();
      which.mockRestore();
    }
  });
});
