import {describe, expect, it} from 'bun:test';

import {computeUsageSummary} from '../statistics';

import type {DailyUsage, UnifiedMessage} from '../types';

describe('computeUsageSummary', () => {
  it('aggregates message usage and merges it with daily summaries', () => {
    const messages: UnifiedMessage[] = [
      {
        id: 'm1',
        sessionId: 's1',
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 60,
        reasoningTokens: 0,
        cacheCreationTokens: 5,
        cacheReadTokens: 0,
        cost: 0.25,
        timestamp: Date.UTC(2024, 0, 1),
        date: '2024-01-01',
      },
      {
        id: 'm2',
        sessionId: 's1',
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 70,
        outputTokens: 40,
        reasoningTokens: 0,
        cacheCreationTokens: 5,
        cacheReadTokens: 0,
        cost: 0.25,
        timestamp: Date.UTC(2024, 0, 2),
        date: '2024-01-02',
      },
      {
        id: 'm3',
        sessionId: 's2',
        provider: 'anthropic',
        model: 'claude-3',
        inputTokens: 80,
        outputTokens: 60,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 0.75,
        timestamp: Date.UTC(2024, 0, 3),
        date: '2024-01-03',
      },
      {
        id: 'm4',
        sessionId: 's3',
        provider: 'openai',
        model: 'gpt-4.1',
        inputTokens: 40,
        outputTokens: 20,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 10,
        cost: 0.25,
        timestamp: Date.UTC(2024, 0, 3),
        date: '2024-01-03',
      },
    ];

    const dailyUsage: DailyUsage[] = [
      {
        date: '2024-01-01',
        inputTokens: 150,
        outputTokens: 100,
        cacheCreationTokens: 10,
        cacheReadTokens: 5,
        totalTokens: 265,
        totalCost: 1.2,
        modelsUsed: ['openai:gpt-4'],
        modelBreakdowns: [],
      },
      {
        date: '2024-01-02',
        inputTokens: 80,
        outputTokens: 40,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 120,
        totalCost: 0,
        modelsUsed: [],
        modelBreakdowns: [],
      },
      {
        date: '2024-01-03',
        inputTokens: 60,
        outputTokens: 50,
        cacheCreationTokens: 5,
        cacheReadTokens: 0,
        totalTokens: 115,
        totalCost: 0.9,
        modelsUsed: ['anthropic:claude-3'],
        modelBreakdowns: [],
      },
    ];

    const summary = computeUsageSummary(messages, dailyUsage);

    expect(summary.messageCount).toBe(4);
    expect(summary.totals.totalCost).toBeCloseTo(2.1, 5);
    expect(summary.totals.totalTokens).toBe(500);
    expect(summary.activeDays).toBe(2);
    expect(summary.totalDays).toBe(3);
    expect(summary.averageDailyCost).toBeCloseTo(0.7, 5);
    expect(summary.averageDailyTokens).toBeCloseTo(166.6667, 4);

    expect(summary.providerRows).toHaveLength(2);
    expect(summary.providerRows[0]).toMatchObject({
      name: 'codex',
      messageCount: 3,
      inputTokens: 210,
      outputTokens: 120,
      cacheCreationTokens: 10,
      cacheReadTokens: 10,
      totalTokens: 350,
      totalCost: 0.75,
    });
    expect(summary.providerRows[1]).toMatchObject({
      name: 'anthropic',
      messageCount: 1,
      totalTokens: 140,
      totalCost: 0.75,
    });

    expect(summary.modelRows.map((row) => row.name)).toEqual([
      'claude-3',
      'gpt-4',
      'gpt-4.1',
    ]);
    expect(summary.modelRows[1]).toMatchObject({
      name: 'gpt-4',
      messageCount: 2,
      totalTokens: 280,
      totalCost: 0.5,
    });
  });
});
