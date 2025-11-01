import dayjs from 'dayjs';

import {type DailyUsage, type CCUsageExport} from './types';

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
      result.push({
        date: dateStr,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        modelsUsed: [],
        modelBreakdowns: [],
      });
    }

    current = current.add(1, 'day');
  }

  return result;
}
