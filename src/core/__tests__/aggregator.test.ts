import {describe, expect, it} from 'bun:test';
import dayjs from 'dayjs';

import {
  fillMissingDates,
  generateCCUsageExport,
  generateDateRange,
} from '../aggregator';

import type {DailyUsage} from '../types';

describe('generateCCUsageExport', () => {
  it('sums daily usage totals without cloning the input array', () => {
    const dailyUsage: DailyUsage[] = [
      {
        date: '2024-01-01',
        inputTokens: 100,
        outputTokens: 200,
        cacheCreationTokens: 10,
        cacheReadTokens: 5,
        totalTokens: 315,
        totalCost: 1.5,
        modelsUsed: ['model-a'],
        modelBreakdowns: [],
      },
      {
        date: '2024-01-02',
        inputTokens: 50,
        outputTokens: 25,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 75,
        totalCost: 0.5,
        modelsUsed: ['model-b'],
        modelBreakdowns: [],
      },
    ];

    const result = generateCCUsageExport(dailyUsage);

    expect(result.daily).toBe(dailyUsage);
    expect(result.totals).toEqual({
      inputTokens: 150,
      outputTokens: 225,
      cacheCreationTokens: 10,
      cacheReadTokens: 5,
      totalTokens: 390,
      totalCost: 2.0,
    });
  });
});

describe('generateDateRange', () => {
  it('defaults to a 30-day window ending today', () => {
    const before = dayjs();
    const range = generateDateRange();
    const after = dayjs();

    const start = dayjs(range.start);
    const end = dayjs(range.end);

    expect(end.diff(start, 'day')).toBe(30);
    expect(end.isSame(before, 'day') || end.isSame(after, 'day')).toBe(true);
  });

  it('returns provided start and end dates without modification', () => {
    const range = generateDateRange('2024-01-01', '2024-02-01');
    expect(range).toEqual({start: '2024-01-01', end: '2024-02-01'});
  });
});

describe('fillMissingDates', () => {
  it('fills gaps with zeroed usage entries while preserving existing references', () => {
    const startDate = '2024-01-01';
    const endDate = '2024-01-05';

    const day1: DailyUsage = {
      date: '2024-01-01',
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 30,
      totalCost: 0.2,
      modelsUsed: ['model-a'],
      modelBreakdowns: [],
    };

    const day3: DailyUsage = {
      date: '2024-01-03',
      inputTokens: 5,
      outputTokens: 10,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 15,
      totalCost: 0.1,
      modelsUsed: ['model-b'],
      modelBreakdowns: [],
    };

    const day5: DailyUsage = {
      date: '2024-01-05',
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      modelsUsed: [],
      modelBreakdowns: [],
    };

    const result = fillMissingDates([day1, day3, day5], startDate, endDate);

    expect(result).toHaveLength(5);
    expect(result[0]).toBe(day1);
    expect(result[1]).toEqual({
      date: '2024-01-02',
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      modelsUsed: [],
      modelBreakdowns: [],
    });
    expect(result[2]).toBe(day3);
    expect(result[3]).toEqual({
      date: '2024-01-04',
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      modelsUsed: [],
      modelBreakdowns: [],
    });
    expect(result[4]).toBe(day5);
  });
});
