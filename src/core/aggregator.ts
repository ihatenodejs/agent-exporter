import dayjs from 'dayjs';

import {
  type DailyUsage,
  type CCUsageExport,
  type ModelBreakdown,
  type UnifiedMessage,
} from './types';

export function generateCCUsageExport(dailyUsage: DailyUsage[]): CCUsageExport {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0,
    totalTokens: 0,
  };

  for (const day of dailyUsage) {
    totals.inputTokens += day.inputTokens;
    totals.outputTokens += day.outputTokens;
    totals.cacheCreationTokens += day.cacheCreationTokens;
    totals.cacheReadTokens += day.cacheReadTokens;
    totals.totalCost += day.totalCost;
    totals.totalTokens += day.totalTokens;
  }

  return {
    daily: dailyUsage,
    totals,
  };
}

export function generateDateRange(
  startDate?: string,
  endDate?: string,
): {start: string; end: string} {
  const end = endDate ? dayjs(endDate) : dayjs();
  const start = startDate ? dayjs(startDate) : end.subtract(30, 'day');

  return {
    start: start.format('YYYY-MM-DD'),
    end: end.format('YYYY-MM-DD'),
  };
}

export function fillMissingDates(
  dailyUsage: DailyUsage[],
  startDate: string,
  endDate: string,
): DailyUsage[] {
  const result: DailyUsage[] = [];
  const usageMap = new Map(dailyUsage.map((d) => [d.date, d]));

  let current = dayjs(startDate);
  const end = dayjs(endDate);

  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const dateStr = current.format('YYYY-MM-DD');

    const existingUsage = usageMap.get(dateStr);

    if (existingUsage !== undefined) {
      result.push(existingUsage);
    } else {
      result.push(createEmptyDailyUsage(dateStr));
    }

    current = current.add(1, 'day');
  }

  return result;
}

/**
 * Factory function to create an empty DailyUsage object
 * @param date - The date string in YYYY-MM-DD format
 * @returns Empty DailyUsage object initialized with zeros
 */
export function createEmptyDailyUsage(date: string): DailyUsage {
  return {
    date,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    modelsUsed: [],
    modelBreakdowns: [],
  };
}

/**
 * Factory function to create an empty ModelBreakdown object
 * @param modelName - The name of the model
 * @returns Empty ModelBreakdown object initialized with zeros
 */
export function createEmptyModelBreakdown(modelName: string): ModelBreakdown {
  return {
    modelName,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
  };
}

/**
 * Aggregates messages into daily usage statistics
 * Uses a two-level Map structure for efficient aggregation by date and model
 * @param messages - Array of unified messages to aggregate
 * @returns Array of DailyUsage objects sorted by date
 */
export function aggregateMessagesByDailyUsage(
  messages: UnifiedMessage[],
): DailyUsage[] {
  const dailyMap = new Map<string, Map<string, ModelBreakdown>>();

  for (const msg of messages) {
    let modelMap = dailyMap.get(msg.date);
    if (modelMap === undefined) {
      modelMap = new Map<string, ModelBreakdown>();
      dailyMap.set(msg.date, modelMap);
    }

    let breakdown = modelMap.get(msg.model);
    if (breakdown === undefined) {
      breakdown = createEmptyModelBreakdown(msg.model);
      modelMap.set(msg.model, breakdown);
    }

    breakdown.inputTokens += msg.inputTokens;
    breakdown.outputTokens += msg.outputTokens;
    breakdown.cacheCreationTokens += msg.cacheCreationTokens;
    breakdown.cacheReadTokens += msg.cacheReadTokens;
    breakdown.cost += msg.cost;
  }

  const dailyUsage: DailyUsage[] = [];
  for (const [date, modelMap] of dailyMap.entries()) {
    const modelBreakdowns = Array.from(modelMap.values());
    const daily = createEmptyDailyUsage(date);
    daily.modelBreakdowns = modelBreakdowns;

    for (const breakdown of modelBreakdowns) {
      daily.inputTokens += breakdown.inputTokens;
      daily.outputTokens += breakdown.outputTokens;
      daily.cacheCreationTokens += breakdown.cacheCreationTokens;
      daily.cacheReadTokens += breakdown.cacheReadTokens;
      daily.totalCost += breakdown.cost;
      daily.modelsUsed.push(breakdown.modelName);
    }

    daily.totalTokens =
      daily.inputTokens +
      daily.outputTokens +
      daily.cacheCreationTokens +
      daily.cacheReadTokens;

    dailyUsage.push(daily);
  }

  return dailyUsage.sort((a, b) => a.date.localeCompare(b.date));
}
