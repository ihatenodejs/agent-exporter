#!/usr/bin/env node

import {readFile} from 'fs/promises';
import {homedir} from 'os';
import {join, resolve} from 'path';

import {Command} from 'commander';
import React from 'react';

import {fillMissingDates} from './core/aggregator';
import {
  getDateRangeDescription,
  getDateRangeForPeriod,
  isValidDateString,
  type TimePeriod,
} from './core/date-utils';
import {computeUsageSummary, type UsageSummary} from './core/statistics';
import {DatabaseManager} from './database/manager';
import {initializeDatabase} from './database/schema';
import {CCUsageExporter} from './exporters/ccusage';
import {JSONExporter} from './exporters/json';
import {
  CCUsageAdapter,
  CCUsageExportSchema,
  convertCcUsageExportToMessages,
} from './providers/ccusage';
import {CodexAdapter} from './providers/codex';
import {GeminiAdapter} from './providers/gemini';
import {OpenCodeAdapter} from './providers/opencode';
import {QwenAdapter} from './providers/qwen';

import type {ProviderAdapter, UnifiedMessage} from './core/types';

const program = new Command();

const DEFAULT_DB_PATH = join(homedir(), '.agent-exporter.db');

type ProviderOption =
  | 'opencode'
  | 'qwen'
  | 'gemini'
  | 'ccusage'
  | 'codex'
  | 'all';

interface DatabaseOption {
  readonly db: string;
}

interface SyncCommandOptions extends DatabaseOption {
  readonly provider: ProviderOption;
  readonly recalculateCosts?: boolean;
}

interface DateRangeOptions extends DatabaseOption {
  readonly start?: string;
  readonly end?: string;
  readonly period?: string;
}

interface ExportCommandOptions extends DateRangeOptions {
  readonly output?: string;
}

type JsonCommandOptions = ExportCommandOptions;

interface StatsCommandOptions extends DatabaseOption {
  readonly useRawLabels?: boolean;
  readonly showHidden?: boolean;
}

interface RangeCommandOptions extends StatsCommandOptions {
  readonly start: string;
  readonly end: string;
}

const VALID_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
const ALLOWED_PERIODS_TEXT = VALID_PERIODS.join(', ');

type SingleProvider = Exclude<ProviderOption, 'all'>;

const createProviderAdapter: Record<SingleProvider, () => ProviderAdapter> = {
  opencode: () => new OpenCodeAdapter(),
  qwen: () => new QwenAdapter(),
  gemini: () => new GeminiAdapter(),
  ccusage: () => new CCUsageAdapter(),
  codex: () => new CodexAdapter(),
};

const buildAdapters = (provider: ProviderOption): ProviderAdapter[] => {
  if (provider === 'all') {
    return (Object.keys(createProviderAdapter) as SingleProvider[]).map(
      (providerKey) => createProviderAdapter[providerKey](),
    );
  }

  return [createProviderAdapter[provider]()];
};

const isTimePeriod = (value: string): value is TimePeriod =>
  (VALID_PERIODS as readonly string[]).includes(value);

const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === 'string') {
    return new Error(value);
  }

  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Unknown error');
  }
};

const logError = (context: string, value: unknown): void => {
  const error = toError(value);
  const message = `${context}: ${error.message}`;
  console.error(message);

  if (error.stack) {
    console.error(error.stack);
  }
};

program
  .name('agent-exporter')
  .description('AI agent usage exporter for tracking and analyzing LLM costs')
  .version('1.0.0');

const VALID_PROVIDERS = [
  'opencode',
  'qwen',
  'gemini',
  'ccusage',
  'codex',
  'all',
];

program
  .command('sync')
  .description('Sync data from providers to database')
  .option(
    '-p, --provider <provider>',
    'Provider to sync (opencode, qwen, gemini, ccusage, codex, or all)',
    'all',
  )
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .option(
    '--recalculate-costs',
    'Recalculate costs for all messages in the database',
  )
  .action(async (options: SyncCommandOptions): Promise<void> => {
    try {
      if (!VALID_PROVIDERS.includes(options.provider)) {
        console.error(`Invalid provider: ${options.provider}`);
        process.exit(1);
      }

      console.log(`Syncing data from ${options.provider}...`);

      const db = initializeDatabase(options.db);
      const dbManager = new DatabaseManager(db);

      const adapters = buildAdapters(options.provider);

      let totalMessages = 0;
      for (const adapter of adapters) {
        console.log(`\nSyncing ${adapter.name}...`);

        let messages: UnifiedMessage[];
        let itemCount: number;

        if (adapter.dataType === 'usage entries') {
          const usageEntries = await adapter.fetchUsageEntries();
          messages = usageEntries.flatMap((entry) => {
            const message: UnifiedMessage = {
              id: `${adapter.name}-${entry.date}-${entry.model}`,
              sessionId: `${adapter.name}-session-${entry.date}`,
              provider: entry.provider,
              model: entry.model,
              inputTokens: entry.inputTokens,
              outputTokens: entry.outputTokens,
              reasoningTokens: entry.reasoningTokens,
              cacheCreationTokens: entry.cacheCreationTokens,
              cacheReadTokens: entry.cacheReadTokens,
              cost: entry.totalCost,
              timestamp: new Date(entry.date).getTime(),
              date: entry.date,
            };
            return entry.entryCount
              ? Array(entry.entryCount)
                  .fill(message)
                  .map((_, i) => ({
                    ...message,
                    id: `${message.id}-${i}`,
                  }))
              : [message];
          });
          itemCount = usageEntries.length;
        } else {
          messages = await adapter.fetchMessages();
          itemCount = messages.length;
        }

        console.log(
          `Found ${itemCount} ${adapter.dataType} from ${adapter.name}`,
        );

        if (messages.length > 0) {
          dbManager.insertMessages(messages);
          console.log(
            `✓ Synced ${messages.length} ${adapter.dataType} to database`,
          );

          const lastMessage = messages[messages.length - 1];
          dbManager.updateSyncState(adapter.name, Date.now(), lastMessage.id);
          totalMessages += messages.length;
        } else {
          console.log(`No ${adapter.dataType} to sync from ${adapter.name}`);
        }
      }

      if (adapters.length > 1) {
        console.log(
          `\n✓ Total synced: ${totalMessages} entries from ${adapters.length} providers`,
        );
      }

      if (options.recalculateCosts) {
        console.log(
          '\nRecalculating costs for ALL messages in the database...',
        );
        const updatedCount = dbManager.recalculateCosts(true);
        console.log(`✓ Recalculated costs for ${updatedCount} messages`);
      } else {
        console.log('\nRecalculating costs for messages with missing costs...');
        const updatedCount = dbManager.recalculateCosts();
        if (updatedCount > 0) {
          console.log(`✓ Recalculated costs for ${updatedCount} messages`);
        } else {
          console.log(`✓ All messages already have costs`);
        }
      }

      dbManager.close();
    } catch (error: unknown) {
      logError('Sync failed', error);
      process.exit(1);
    }
  });

program
  .command('ingest')
  .description('Ingest usage data from a cc.json export')
  .argument('<file>', 'Path to cc.json file')
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .action(async (file: string, options: DatabaseOption): Promise<void> => {
    let dbManager: DatabaseManager | undefined;

    try {
      const filePath = resolve(file);
      const raw = await readFile(filePath, 'utf8');
      const parsedData: unknown = JSON.parse(raw);
      const parsed = CCUsageExportSchema.safeParse(parsedData);

      if (!parsed.success) {
        console.error('Invalid cc.json file:');
        console.error(JSON.stringify(parsed.error, null, 2));
        process.exit(1);
      }

      const messages = convertCcUsageExportToMessages(parsed.data);

      if (messages.length === 0) {
        console.log('No usage entries found in the provided cc.json file.');
        return;
      }

      const db = initializeDatabase(options.db);
      dbManager = new DatabaseManager(db);

      dbManager.insertMessages(messages);

      console.log(
        `✓ Ingested ${messages.length} usage entries from ${filePath}`,
      );
    } catch (error: unknown) {
      logError('Ingest failed', error);
      process.exit(1);
    } finally {
      dbManager?.close();
    }
  });

program
  .command('export')
  .description('Export usage data')
  .argument('<format>', 'Export format (ccusage)')
  .option('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .option('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option(
    '-p, --period <period>',
    'Time period (daily, weekly, monthly, yearly)',
  )
  .option('-o, --output <path>', 'Output file path')
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .action(
    async (format: string, options: ExportCommandOptions): Promise<void> => {
      try {
        if (format !== 'ccusage') {
          console.error(`Unknown export format: ${format}`);
          process.exit(1);
        }

        let startDate = options.start;
        let endDate = options.end;
        const {period} = options;

        if (period) {
          if (!isTimePeriod(period)) {
            console.error(
              `Invalid period: ${period}. Must be one of: ${ALLOWED_PERIODS_TEXT}`,
            );
            process.exit(1);
          }

          const range = getDateRangeForPeriod(period);
          startDate = range.start;
          endDate = range.end;
          console.log(
            `Exporting ${period} data (${getDateRangeDescription(range.start, range.end)})...`,
          );
        } else if (startDate && endDate) {
          if (!isValidDateString(startDate)) {
            console.error(
              `Invalid start date: ${startDate}. Use YYYY-MM-DD format.`,
            );
            process.exit(1);
          }
          if (!isValidDateString(endDate)) {
            console.error(
              `Invalid end date: ${endDate}. Use YYYY-MM-DD format.`,
            );
            process.exit(1);
          }
          console.log(
            `Exporting data for ${getDateRangeDescription(startDate, endDate)}...`,
          );
        } else {
          console.log('Exporting all usage data...');
        }

        const db = initializeDatabase(options.db);
        const dbManager = new DatabaseManager(db);
        const exporter = new CCUsageExporter(dbManager);

        const outputPath = await exporter.export({
          startDate,
          endDate,
          outputPath: options.output,
        });

        console.log(`✓ Exported to ${outputPath}`);
        dbManager.close();
      } catch (error: unknown) {
        logError('Export failed', error);
        process.exit(1);
      }
    },
  );

program
  .command('json')
  .description('Export usage data grouped by provider in JSON format')
  .option('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .option('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option(
    '-p, --period <period>',
    'Time period (daily, weekly, monthly, yearly)',
  )
  .option('-o, --output <path>', 'Output file path (or output to console)')
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .action(async (options: JsonCommandOptions): Promise<void> => {
    try {
      let startDate = options.start;
      let endDate = options.end;
      const {period} = options;

      if (period) {
        if (!isTimePeriod(period)) {
          console.error(
            `Invalid period: ${period}. Must be one of: ${ALLOWED_PERIODS_TEXT}`,
          );
          process.exit(1);
        }

        const range = getDateRangeForPeriod(period);
        startDate = range.start;
        endDate = range.end;
      } else if (startDate && endDate) {
        if (!isValidDateString(startDate)) {
          console.error(
            `Invalid start date: ${startDate}. Use YYYY-MM-DD format.`,
          );
          process.exit(1);
        }
        if (!isValidDateString(endDate)) {
          console.error(`Invalid end date: ${endDate}. Use YYYY-MM-DD format.`);
          process.exit(1);
        }
      }

      const db = initializeDatabase(options.db);
      const dbManager = new DatabaseManager(db);
      const exporter = new JSONExporter(dbManager);

      if (options.output) {
        const outputPath = await exporter.export({
          startDate,
          endDate,
          outputPath: options.output,
        });
        console.log(`✓ Exported to ${outputPath}`);
      } else {
        const jsonStr = exporter.exportToString({
          startDate,
          endDate,
        });
        console.log(jsonStr);
      }

      dbManager.close();
    } catch (error: unknown) {
      logError('JSON export failed', error);
      process.exit(1);
    }
  });

/**
 * Display usage statistics for a given date range
 */
async function displayStats(
  startDate: string,
  endDate: string,
  dbPath: string,
  periodLabel?: string,
  useRawLabels = false,
  showHidden = false,
): Promise<void> {
  let dbManager: DatabaseManager | undefined;

  try {
    const db = initializeDatabase(dbPath);
    dbManager = new DatabaseManager(db);

    const rangeDescription = getDateRangeDescription(startDate, endDate);
    const messages = dbManager.getMessagesByDateRange(startDate, endDate);
    const dailyUsage = dbManager.getDailyUsage(startDate, endDate);
    const normalizedDailyUsage = fillMissingDates(
      dailyUsage,
      startDate,
      endDate,
    );
    const summary = computeUsageSummary(messages, normalizedDailyUsage);

    const {StatsApp} = await import('./ui/stats-app');
    const {render} = await import('ink');
    const {waitUntilExit} = render(
      React.createElement(StatsApp, {
        summary,
        periodLabel,
        rangeDescription,
        useRawLabels,
        showHidden,
      }),
    );

    await waitUntilExit();
  } catch (error: unknown) {
    logError('Stats failed', error);
    process.exit(1);
  } finally {
    dbManager?.close();
  }
}

/**
 * Display interactive dashboard with real-time updates
 */
async function displayDashboard(
  startDate: string,
  endDate: string,
  dbPath: string,
  useRawLabels = false,
): Promise<void> {
  let dbManager: DatabaseManager | undefined;

  if (process.stdout.isTTY) {
    process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
  } else {
    console.clear();
  }

  try {
    const db = initializeDatabase(dbPath);
    dbManager = new DatabaseManager(db);

    let currentPeriod: TimePeriod = 'monthly';
    let currentStartDate = startDate;
    let currentEndDate = endDate;

    const updatePeriod = (period: TimePeriod): void => {
      currentPeriod = period;
      const range = getDateRangeForPeriod(period);
      currentStartDate = range.start;
      currentEndDate = range.end;
    };

    const getCurrentRangeDescription = (): string => {
      return getDateRangeDescription(currentStartDate, currentEndDate);
    };

    const fetchDashboardData = (): {
      summary: UsageSummary;
      lastUpdated: Date;
    } => {
      if (!dbManager) {
        throw new Error('Database manager not initialized');
      }
      const messages = dbManager.getMessagesByDateRange(
        currentStartDate,
        currentEndDate,
      );
      const dailyUsage = dbManager.getDailyUsage(
        currentStartDate,
        currentEndDate,
      );
      const normalizedDailyUsage = fillMissingDates(
        dailyUsage,
        currentStartDate,
        currentEndDate,
      );
      const summary = computeUsageSummary(messages, normalizedDailyUsage);
      return {summary, lastUpdated: new Date()};
    };

    const {DashboardContainer} = await import('./ui/DashboardContainer');
    const {render} = await import('ink');

    const renderResult = render(
      React.createElement(DashboardContainer, {
        rangeDescription: getCurrentRangeDescription(),
        useRawLabels,
        fetchData: fetchDashboardData,
        onPeriodChange: updatePeriod,
        currentPeriod,
        onExit: () => {
          // Clean up will happen in finally block
        },
      }),
    );

    await renderResult.waitUntilExit();
  } catch (error: unknown) {
    logError('Dashboard failed', error);
    process.exit(1);
  } finally {
    dbManager?.close();
  }
}

program
  .command('live')
  .description('Launch interactive live view with real-time updates')
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .option(
    '--use-raw-labels',
    'Display raw model identifiers instead of friendly labels',
  )
  .action(async (options: StatsCommandOptions): Promise<void> => {
    const {start, end} = getDateRangeForPeriod('monthly');
    await displayDashboard(
      start,
      end,
      options.db,
      Boolean(options.useRawLabels),
    );
  });

program
  .command('daily')
  .description("Display today's usage statistics")
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .option(
    '--use-raw-labels',
    'Display raw model identifiers instead of friendly labels',
  )
  .option('--show-hidden', 'Display rows hidden by default in tables')
  .action(async (options: StatsCommandOptions): Promise<void> => {
    const {start, end} = getDateRangeForPeriod('daily');
    await displayStats(
      start,
      end,
      options.db,
      'Today',
      Boolean(options.useRawLabels),
      Boolean(options.showHidden),
    );
  });

program
  .command('weekly')
  .description("Display this week's usage statistics")
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .option(
    '--use-raw-labels',
    'Display raw model identifiers instead of friendly labels',
  )
  .option('--show-hidden', 'Display rows hidden by default in tables')
  .action(async (options: StatsCommandOptions): Promise<void> => {
    const {start, end} = getDateRangeForPeriod('weekly');
    await displayStats(
      start,
      end,
      options.db,
      'This Week',
      Boolean(options.useRawLabels),
      Boolean(options.showHidden),
    );
  });

program
  .command('monthly')
  .description("Display this month's usage statistics")
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .option(
    '--use-raw-labels',
    'Display raw model identifiers instead of friendly labels',
  )
  .option('--show-hidden', 'Display rows hidden by default in tables')
  .action(async (options: StatsCommandOptions): Promise<void> => {
    const {start, end} = getDateRangeForPeriod('monthly');
    await displayStats(
      start,
      end,
      options.db,
      'This Month',
      Boolean(options.useRawLabels),
      Boolean(options.showHidden),
    );
  });

program
  .command('yearly')
  .description("Display this year's usage statistics")
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .option(
    '--use-raw-labels',
    'Display raw model identifiers instead of friendly labels',
  )
  .option('--show-hidden', 'Display rows hidden by default in tables')
  .action(async (options: StatsCommandOptions): Promise<void> => {
    const {start, end} = getDateRangeForPeriod('yearly');
    await displayStats(
      start,
      end,
      options.db,
      'This Year',
      Boolean(options.useRawLabels),
      Boolean(options.showHidden),
    );
  });

program
  .command('range')
  .description('Display usage statistics for a custom date range')
  .requiredOption('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .option(
    '--use-raw-labels',
    'Display raw model identifiers instead of friendly labels',
  )
  .option('--show-hidden', 'Display rows hidden by default in tables')
  .action(async (options: RangeCommandOptions): Promise<void> => {
    if (!isValidDateString(options.start)) {
      console.error(
        `Invalid start date: ${options.start}. Use YYYY-MM-DD format.`,
      );
      process.exit(1);
    }
    if (!isValidDateString(options.end)) {
      console.error(`Invalid end date: ${options.end}. Use YYYY-MM-DD format.`);
      process.exit(1);
    }

    await displayStats(
      options.start,
      options.end,
      options.db,
      'Custom Range',
      Boolean(options.useRawLabels),
      Boolean(options.showHidden),
    );
  });

program.parse();
