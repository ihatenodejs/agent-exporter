import {generateCCUsageExport} from './aggregator';

import type {CCUsageExport, DailyUsage, UnifiedMessage} from './types';

const PROVIDER_ALIASES = new Map<string, string>([['openai', 'codex']]);

const getCanonicalProviderName = (provider: string): string => {
  const alias = PROVIDER_ALIASES.get(provider.toLowerCase());
  return alias ?? provider;
};

export interface AggregatedUsageRow {
  name: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  activeDays: number;
}

export interface UsageSummary {
  totals: CCUsageExport['totals'];
  providerRows: AggregatedUsageRow[];
  modelRows: AggregatedUsageRow[];
  messageCount: number;
  activeDays: number;
  totalDays: number;
  averageDailyCost: number;
  averageDailyTokens: number;
}

function createEmptyRow(name: string): AggregatedUsageRow {
  return {
    name,
    messageCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    activeDays: 0,
  };
}

function finalizeRow(row: AggregatedUsageRow): void {
  row.totalTokens =
    row.inputTokens +
    row.outputTokens +
    row.cacheCreationTokens +
    row.cacheReadTokens;
}

function accumulateMessage(
  row: AggregatedUsageRow,
  message: UnifiedMessage,
): void {
  row.messageCount += 1;
  row.inputTokens += Number.isFinite(message.inputTokens)
    ? message.inputTokens
    : 0;
  row.outputTokens += Number.isFinite(message.outputTokens)
    ? message.outputTokens
    : 0;
  row.cacheCreationTokens += Number.isFinite(message.cacheCreationTokens)
    ? message.cacheCreationTokens
    : 0;
  row.cacheReadTokens += Number.isFinite(message.cacheReadTokens)
    ? message.cacheReadTokens
    : 0;
  row.totalCost += Number.isFinite(message.cost) ? message.cost : 0;
}

function mapToSortedRows(
  usageMap: Map<string, AggregatedUsageRow>,
): AggregatedUsageRow[] {
  const rows = Array.from(usageMap.values());
  for (const row of rows) {
    finalizeRow(row);
  }
  rows.sort((a, b) => {
    if (b.totalCost === a.totalCost) {
      return b.totalTokens - a.totalTokens;
    }
    return b.totalCost - a.totalCost;
  });
  return rows;
}

export function computeUsageSummary(
  messages: UnifiedMessage[],
  dailyUsage: DailyUsage[],
): UsageSummary {
  const providerMap = new Map<string, AggregatedUsageRow>();
  const modelMap = new Map<string, AggregatedUsageRow>();
  const providerDayTracker = new Map<string, Set<string>>();
  const modelDayTracker = new Map<string, Set<string>>();

  for (const message of messages) {
    const providerName = getCanonicalProviderName(message.provider);
    const modelName = message.model;
    const date = message.date;

    let providerRow = providerMap.get(providerName);
    if (providerRow === undefined) {
      providerRow = createEmptyRow(providerName);
      providerMap.set(providerName, providerRow);
      providerDayTracker.set(providerName, new Set());
    }

    let modelRow = modelMap.get(modelName);
    if (modelRow === undefined) {
      modelRow = createEmptyRow(modelName);
      modelMap.set(modelName, modelRow);
      modelDayTracker.set(modelName, new Set());
    }

    accumulateMessage(providerRow, message);
    accumulateMessage(modelRow, message);

    if (date) {
      const providerDates = providerDayTracker.get(providerName);
      const modelDates = modelDayTracker.get(modelName);
      if (providerDates) providerDates.add(date);
      if (modelDates) modelDates.add(date);
    }
  }

  for (const [providerName, dates] of providerDayTracker.entries()) {
    const providerRow = providerMap.get(providerName);
    if (providerRow) providerRow.activeDays = dates.size;
  }

  for (const [modelName, dates] of modelDayTracker.entries()) {
    const modelRow = modelMap.get(modelName);
    if (modelRow) modelRow.activeDays = dates.size;
  }

  const providerRows = mapToSortedRows(providerMap);
  const modelRows = mapToSortedRows(modelMap);

  const exportData = generateCCUsageExport(dailyUsage);
  const totals = exportData.totals;

  const totalDays = dailyUsage.length;
  const activeDays = dailyUsage.filter((day) => day.totalCost > 0).length;

  const averageDailyCost = totalDays > 0 ? totals.totalCost / totalDays : 0;
  const averageDailyTokens = totalDays > 0 ? totals.totalTokens / totalDays : 0;

  return {
    totals,
    providerRows,
    modelRows,
    messageCount: messages.length,
    activeDays,
    totalDays,
    averageDailyCost,
    averageDailyTokens,
  };
}
