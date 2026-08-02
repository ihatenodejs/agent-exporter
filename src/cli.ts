#!/usr/bin/env node

import {readFile} from 'fs/promises';
import {homedir} from 'os';
import {join, resolve} from 'path';

import chalk from 'chalk';
import {Command} from 'commander';
import React from 'react';

import packageJson from '../package.json';
import {fillMissingDates} from './core/aggregator';
import {
  getDateRangeDescription,
  getDateRangeForPeriod,
  isValidDateString,
  validateAndResolveDateRange,
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
import {OhMyPiAdapter} from './providers/oh-my-pi';
import {OpenCodeAdapter} from './providers/opencode';
import {QwenAdapter} from './providers/qwen';

import type {ProviderAdapter, UnifiedMessage, UsageEntry} from './core/types';

const program = new Command();

const DEFAULT_DB_PATH = join(homedir(), '.agent-exporter.db');

const HARNESS_NAMES = [
  'opencode',
  'qwen',
  'gemini',
  'ccusage',
  'codex',
  'oh-my-pi',
] as const;

type HarnessName = (typeof HARNESS_NAMES)[number];
type ProviderOption = HarnessName | 'all';

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

const createProviderAdapter: Record<HarnessName, () => ProviderAdapter> = {
  opencode: () => new OpenCodeAdapter(),
  qwen: () => new QwenAdapter(),
  gemini: () => new GeminiAdapter(),
  ccusage: () => new CCUsageAdapter(),
  codex: () => new CodexAdapter(),
  'oh-my-pi': () => new OhMyPiAdapter(),
};

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

const logDisabledHarnessWarning = (
  harness: HarnessName,
  databasePath: string,
): void => {
  console.error(
    chalk.hex('#f97316')(
      `Harness "${harness}" is disabled. Enable it with: agent-exporter harness ${harness} enable --db ${databasePath}`,
    ),
  );
};

/**
 * Transform usage entries to unified messages
 */
const transformUsageEntriesToMessages = (
  adapter: {name: string},
  usageEntries: UsageEntry[],
): UnifiedMessage[] => {
  return usageEntries.flatMap((entry) => {
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
};

program
  .name(packageJson.name)
  .description(packageJson.description)
  .version(packageJson.version);

const VALID_PROVIDERS = [...HARNESS_NAMES, 'all'];

const harnessCommand = program
  .command('harness [name] [state]')
  .description('Enable or disable a harness for sync')
  .option('-d, --db <path>', 'Database path', DEFAULT_DB_PATH)
  .addHelpText(
    'after',
    `
Supported harnesses (disabled by default):
  opencode
  qwen
  gemini
  ccusage
  codex
  oh-my-pi

Harness state is stored in the selected database.

Examples:
  agent-exporter harness opencode enable
  agent-exporter harness ccusage disable --db ./usage.db`,
  );

harnessCommand.action(
  (
    name: string | undefined,
    state: string | undefined,
    options: DatabaseOption,
    command: Command,
  ): void => {
    if (!name || !state) {
      command.help();
      return;
    }

    if (!HARNESS_NAMES.includes(name as HarnessName)) {
      console.error(
        `Invalid harness: ${name}. Expected one of: ${HARNESS_NAMES.join(', ')}.`,
      );
      process.exitCode = 1;
      return;
    }

    if (state !== 'enable' && state !== 'disable') {
      console.error(
        `Invalid harness state: ${state}. Expected "enable" or "disable".`,
      );
      process.exitCode = 1;
      return;
    }

    const dbManager = new DatabaseManager(initializeDatabase(options.db));
    try {
      const enabled = state === 'enable';
      dbManager.setHarnessEnabled(name, enabled);
      console.log(`Harness "${name}" ${enabled ? 'enabled' : 'disabled'}.`);
    } finally {
      dbManager.close();
    }
  },
);

program
  .command('sync')
  .description('Sync data from providers to database')
  .option(
    '-p, --provider <provider>',
    'Provider to sync (opencode, qwen, gemini, ccusage, codex, oh-my-pi, or all)',
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

      const db = initializeDatabase(options.db);
      const dbManager = new DatabaseManager(db);
      const requestedHarnesses =
        options.provider === 'all' ? HARNESS_NAMES : [options.provider];
      const disabledHarnesses = requestedHarnesses.filter(
        (name) => !dbManager.isHarnessEnabled(name),
      );

      if (options.provider !== 'all' && disabledHarnesses.length > 0) {
        dbManager.close();
        for (const name of disabledHarnesses) {
          logDisabledHarnessWarning(name, options.db);
        }
        process.exitCode = 1;
        return;
      }

      for (const name of disabledHarnesses) {
        logDisabledHarnessWarning(name, options.db);
      }

      console.log(`Syncing data from ${options.provider}...`);
      const enabledHarnesses = requestedHarnesses.filter(
        (name) => !disabledHarnesses.includes(name),
      );
      const adapters = enabledHarnesses.map((name) =>
        createProviderAdapter[name](),
      );

      let totalMessages = 0;
      for (const adapter of adapters) {
        console.log(`\nSyncing ${adapter.name}...`);

        let messages: UnifiedMessage[];
        let itemCount: number;

        if (adapter.dataType === 'usage entries') {
          const usageEntries = await adapter.fetchUsageEntries();
          messages = transformUsageEntriesToMessages(adapter, usageEntries);
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

        const {period} = options;
        let dateRange;
        try {
          dateRange = validateAndResolveDateRange(
            period,
            options.start,
            options.end,
          );
        } catch (err) {
          console.error((err as Error).message);
          process.exit(1);
        }
        const startDate = dateRange.startDate;
        const endDate = dateRange.endDate;

        if (period) {
          console.log(
            `Exporting ${period} data (${getDateRangeDescription(startDate, endDate)})...`,
          );
        } else if (startDate && endDate) {
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
      const {period} = options;
      let dateRange;
      try {
        dateRange = validateAndResolveDateRange(
          period,
          options.start,
          options.end,
        );
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
      const startDate = dateRange.startDate;
      const endDate = dateRange.endDate;

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
    let isSyncing = false;
    let lastSyncTime = 0;

    const updatePeriod = (period: TimePeriod): void => {
      currentPeriod = period;
      const range = getDateRangeForPeriod(period);
      currentStartDate = range.start;
      currentEndDate = range.end;
    };

    const getCurrentRangeDescription = (): string => {
      return getDateRangeDescription(currentStartDate, currentEndDate);
    };

    const syncFromProviders = async (
      refreshIntervalSeconds = 30,
      isManualRefresh = false,
    ): Promise<void> => {
      if (isSyncing) {
        // Don't sync if already syncing
        return;
      }

      // Only rate limit automatic refreshes, manual refreshes always sync
      if (
        !isManualRefresh &&
        Date.now() - lastSyncTime < refreshIntervalSeconds * 1000
      ) {
        // Don't sync if synced within the refresh interval
        return;
      }

      isSyncing = true;
      try {
        const manager = dbManager;
        if (!manager) throw new Error('Database manager not initialized');
        const adapters = HARNESS_NAMES.filter((name) =>
          manager.isHarnessEnabled(name),
        ).map((name) => createProviderAdapter[name]());

        for (const adapter of adapters) {
          let messages: UnifiedMessage[];

          if (adapter.dataType === 'usage entries') {
            const usageEntries = await adapter.fetchUsageEntries();
            messages = transformUsageEntriesToMessages(adapter, usageEntries);
          } else {
            messages = await adapter.fetchMessages();
          }

          if (messages.length > 0) {
            if (!dbManager) throw new Error('Database manager not initialized');
            dbManager.insertMessages(messages);
            const lastMessage = messages[messages.length - 1];
            dbManager.updateSyncState(adapter.name, Date.now(), lastMessage.id);
          }
        }

        if (!dbManager) throw new Error('Database manager not initialized');
        dbManager.recalculateCosts();
        lastSyncTime = Date.now();
      } catch (error) {
        logError('Background sync failed', error);
      } finally {
        isSyncing = false;
      }
    };

    const fetchDashboardData = async (
      isManualRefresh = false,
      refreshIntervalSeconds = 30,
    ): Promise<{
      summary: UsageSummary;
      lastUpdated: Date;
      isSyncing: boolean;
    }> => {
      if (!dbManager) {
        throw new Error('Database manager not initialized');
      }

      await syncFromProviders(refreshIntervalSeconds, isManualRefresh);

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
      return {summary, lastUpdated: new Date(), isSyncing};
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
