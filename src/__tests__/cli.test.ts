import {mkdtemp, readFile, rm} from 'fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'os';
import {join} from 'path';

import {describe, expect, it} from 'bun:test';
import dayjs from 'dayjs';

import {
  createTemporaryDatabasePath,
  removeTemporaryDatabasePath,
} from './database-test-utils';
import {DatabaseManager} from '../database/manager';
import {initializeDatabase} from '../database/schema';
import {
  CCUsageExportSchema,
  convertCcUsageExportToMessages,
} from '../providers/ccusage';

import type {UnifiedMessage} from '../core/types';
const cliPath = fileURLToPath(new URL('../cli.ts', import.meta.url));

const runCli = async (
  ...args: string[]
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
}> => {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return {exitCode, stdout, stderr, output: stdout + stderr};
};

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

describe('CLI range', () => {
  it('queries ISO dates and rejects non-ISO bounds', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const databaseManager = new DatabaseManager(
      initializeDatabase(databasePath),
    );
    const message: UnifiedMessage = {
      id: 'range-regression-message',
      sessionId: 'range-regression-session',
      provider: 'openai',
      model: 'range-regression-model',
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0.01,
      timestamp: Date.UTC(2026, 7, 16),
      date: '2026-08-16',
    };
    let databaseClosed = false;

    try {
      databaseManager.insertMessage(message);
      databaseManager.close();
      databaseClosed = true;

      const validRange = await runCli(
        'range',
        '--start',
        '2026-08-16',
        '--end',
        '2026-08-22',
        '--db',
        databasePath,
      );

      expect(validRange.exitCode).toBe(0);
      expect(validRange.output).toContain('Messages 1');
      expect(validRange.output).toContain(message.model);

      const invalidRange = await runCli(
        'range',
        '--start',
        '08-16-2026',
        '--end',
        '2026-08-22',
        '--db',
        databasePath,
      );

      expect(invalidRange.exitCode).not.toBe(0);
      expect(invalidRange.output).toContain('08-16-2026');
    } finally {
      if (!databaseClosed) databaseManager.close();
      await removeTemporaryDatabasePath(databasePath);
    }
  });
});

describe('CLI exporter date bounds and history', () => {
  it('covers all-history, lone bounds, and equal bounds for JSON stdout and CCUsage file exports', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const databaseManager = new DatabaseManager(
      initializeDatabase(databasePath),
    );
    const tempDir = await mkdtemp(join(tmpdir(), 'agent-exporter-cli-'));

    const oldMessage: UnifiedMessage = {
      id: 'old-history-message',
      sessionId: 'old-history-session',
      provider: 'anthropic',
      model: 'claude-3-opus',
      inputTokens: 1000,
      outputTokens: 500,
      reasoningTokens: 0,
      cacheCreationTokens: 100,
      cacheReadTokens: 50,
      cost: 1.0,
      timestamp: Date.UTC(2020, 0, 1, 12, 0, 0),
      date: '2020-01-01',
    };

    const recentMessage: UnifiedMessage = {
      id: 'recent-history-message',
      sessionId: 'recent-history-session',
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 2000,
      outputTokens: 1000,
      reasoningTokens: 0,
      cacheCreationTokens: 200,
      cacheReadTokens: 100,
      cost: 2.0,
      timestamp: Date.UTC(2026, 7, 16, 12, 0, 0),
      date: '2026-08-16',
    };

    let databaseClosed = false;

    try {
      databaseManager.insertMessage(oldMessage);
      databaseManager.insertMessage(recentMessage);
      databaseManager.close();
      databaseClosed = true;

      // 1. JSON stdout - all history
      const allJson = await runCli('json', '--db', databasePath);
      expect(allJson.exitCode).toBe(0);
      const allJsonData = JSON.parse(allJson.stdout) as Record<
        string,
        {totals?: {totalCost: number}; daily?: {date: string}[]}
      >;
      const allJsonTotal = Object.values(allJsonData).reduce(
        (sum, p) => sum + (p.totals?.totalCost ?? 0),
        0,
      );
      expect(allJsonTotal).toBeCloseTo(3.0, 2);
      expect(allJsonData.anthropic.daily?.[0]?.date).toBe('2020-01-01');
      expect(allJsonData.openai.daily?.[0]?.date).toBe('2026-08-16');

      // 2. JSON stdout - lower-only bound
      const lowerJson = await runCli(
        'json',
        '--start',
        '2026-01-01',
        '--db',
        databasePath,
      );
      expect(lowerJson.exitCode).toBe(0);
      const lowerJsonData = JSON.parse(lowerJson.stdout) as Record<
        string,
        {totals?: {totalCost: number}}
      >;
      const lowerJsonTotal = Object.values(lowerJsonData).reduce(
        (sum, p) => sum + (p.totals?.totalCost ?? 0),
        0,
      );
      expect(lowerJsonTotal).toBeCloseTo(2.0, 2);
      expect(lowerJsonData.openai).toBeDefined();
      expect(lowerJsonData.anthropic).toBeUndefined();

      // 3. JSON stdout - upper-only bound
      const upperJson = await runCli(
        'json',
        '--end',
        '2025-12-31',
        '--db',
        databasePath,
      );
      expect(upperJson.exitCode).toBe(0);
      const upperJsonData = JSON.parse(upperJson.stdout) as Record<
        string,
        {totals?: {totalCost: number}}
      >;
      const upperJsonTotal = Object.values(upperJsonData).reduce(
        (sum, p) => sum + (p.totals?.totalCost ?? 0),
        0,
      );
      expect(upperJsonTotal).toBeCloseTo(1.0, 2);
      expect(upperJsonData.anthropic).toBeDefined();
      expect(upperJsonData.openai).toBeUndefined();

      // 4. JSON stdout - equal bounds
      const equalJson = await runCli(
        'json',
        '--start',
        '2026-08-16',
        '--end',
        '2026-08-16',
        '--db',
        databasePath,
      );
      expect(equalJson.exitCode).toBe(0);
      const equalJsonData = JSON.parse(equalJson.stdout) as Record<
        string,
        {totals?: {totalCost: number}}
      >;
      const equalJsonTotal = Object.values(equalJsonData).reduce(
        (sum, p) => sum + (p.totals?.totalCost ?? 0),
        0,
      );
      expect(equalJsonTotal).toBeCloseTo(2.0, 2);

      // 5. CCUsage export - all history
      const allCcusagePath = join(tempDir, 'all-ccusage.json');
      const allCcusage = await runCli(
        'export',
        'ccusage',
        '--output',
        allCcusagePath,
        '--db',
        databasePath,
      );
      expect(allCcusage.exitCode).toBe(0);
      expect(allCcusage.output).toContain('Exporting all usage data...');
      const allCcusageData = JSON.parse(
        await readFile(allCcusagePath, 'utf8'),
      ) as {totals: {totalCost: number}};
      expect(allCcusageData.totals.totalCost).toBeCloseTo(3.0, 2);

      // 6. CCUsage export - lower-only bound
      const lowerCcusagePath = join(tempDir, 'lower-ccusage.json');
      const lowerCcusage = await runCli(
        'export',
        'ccusage',
        '--start',
        '2026-01-01',
        '--output',
        lowerCcusagePath,
        '--db',
        databasePath,
      );
      expect(lowerCcusage.exitCode).toBe(0);
      expect(lowerCcusage.output).toContain(
        'Exporting data from 2026-01-01...',
      );
      expect(lowerCcusage.output).not.toContain('Exporting all usage data');
      const lowerCcusageData = JSON.parse(
        await readFile(lowerCcusagePath, 'utf8'),
      ) as {totals: {totalCost: number}};
      expect(lowerCcusageData.totals.totalCost).toBeCloseTo(2.0, 2);

      // 7. CCUsage export - upper-only bound
      const upperCcusagePath = join(tempDir, 'upper-ccusage.json');
      const upperCcusage = await runCli(
        'export',
        'ccusage',
        '--end',
        '2025-12-31',
        '--output',
        upperCcusagePath,
        '--db',
        databasePath,
      );
      expect(upperCcusage.exitCode).toBe(0);
      expect(upperCcusage.output).toContain(
        'Exporting data through 2025-12-31...',
      );
      expect(upperCcusage.output).not.toContain('Exporting all usage data');
      const upperCcusageData = JSON.parse(
        await readFile(upperCcusagePath, 'utf8'),
      ) as {totals: {totalCost: number}};
      expect(upperCcusageData.totals.totalCost).toBeCloseTo(1.0, 2);

      // 8. CCUsage export - equal bounds
      const equalCcusagePath = join(tempDir, 'equal-ccusage.json');
      const equalCcusage = await runCli(
        'export',
        'ccusage',
        '--start',
        '2026-08-16',
        '--end',
        '2026-08-16',
        '--output',
        equalCcusagePath,
        '--db',
        databasePath,
      );
      expect(equalCcusage.exitCode).toBe(0);
      const equalCcusageData = JSON.parse(
        await readFile(equalCcusagePath, 'utf8'),
      ) as {totals: {totalCost: number}};
      expect(equalCcusageData.totals.totalCost).toBeCloseTo(2.0, 2);
    } finally {
      if (!databaseClosed) databaseManager.close();
      await removeTemporaryDatabasePath(databasePath);
      await rm(tempDir, {force: true, recursive: true});
    }
  });

  it('enforces validation errors, reversed bounds, and period precedence across CLI commands', async () => {
    const databasePath = await createTemporaryDatabasePath();

    try {
      // Invalid lone start date
      const invalidStart = await runCli(
        'json',
        '--start',
        'not-a-date',
        '--db',
        databasePath,
      );
      expect(invalidStart.exitCode).not.toBe(0);
      expect(invalidStart.output).toContain('not-a-date');

      // Invalid lone end date
      const invalidEnd = await runCli(
        'json',
        '--end',
        'not-a-date',
        '--db',
        databasePath,
      );
      expect(invalidEnd.exitCode).not.toBe(0);
      expect(invalidEnd.output).toContain('not-a-date');

      // Impossible calendar date
      const impossibleDate = await runCli(
        'json',
        '--start',
        '2026-02-30',
        '--db',
        databasePath,
      );
      expect(impossibleDate.exitCode).not.toBe(0);
      expect(impossibleDate.output).toContain('2026-02-30');

      // Explicit empty string bound
      const emptyBound = await runCli(
        'json',
        '--start',
        '',
        '--db',
        databasePath,
      );
      expect(emptyBound.exitCode).not.toBe(0);
      expect(emptyBound.output.toLowerCase()).toContain('invalid');

      // Reversed bounds for json
      const reversedJson = await runCli(
        'json',
        '--start',
        '2026-08-20',
        '--end',
        '2026-08-10',
        '--db',
        databasePath,
      );
      expect(reversedJson.exitCode).not.toBe(0);
      expect(reversedJson.output.toLowerCase()).toContain('before');

      // Reversed bounds for export ccusage
      const reversedCcusage = await runCli(
        'export',
        'ccusage',
        '--start',
        '2026-08-20',
        '--end',
        '2026-08-10',
        '--db',
        databasePath,
      );
      expect(reversedCcusage.exitCode).not.toBe(0);
      expect(reversedCcusage.output.toLowerCase()).toContain('before');

      // Range reversed bounds error
      const reversedRange = await runCli(
        'range',
        '--start',
        '2026-08-20',
        '--end',
        '2026-08-10',
        '--db',
        databasePath,
      );
      expect(reversedRange.exitCode).not.toBe(0);
      expect(reversedRange.output.toLowerCase()).toContain('before');

      // Range impossible date error
      const impossibleRange = await runCli(
        'range',
        '--start',
        '2026-02-30',
        '--end',
        '2026-03-01',
        '--db',
        databasePath,
      );
      expect(impossibleRange.exitCode).not.toBe(0);
      expect(impossibleRange.output).toContain('2026-02-30');

      // Period precedence over accompanying invalid bounds
      const periodPrecedence = await runCli(
        'json',
        '--period',
        'daily',
        '--start',
        'not-a-date',
        '--end',
        'not-a-date',
        '--db',
        databasePath,
      );
      expect(periodPrecedence.exitCode).toBe(0);
    } finally {
      await removeTemporaryDatabasePath(databasePath);
    }
  });
});

describe('CLI grouped JSON roundtrip and ingest', () => {
  it('exports grouped actual JSON and ingests into fresh target twice preserving provider totals, cache, cost 3, and row count 2', async () => {
    const sourceDbPath = await createTemporaryDatabasePath();
    const targetDbPath = await createTemporaryDatabasePath();
    const tempDir = await mkdtemp(join(tmpdir(), 'agent-exporter-roundtrip-'));
    const exportJsonFile = join(tempDir, 'grouped-export.json');

    const sourceManager = new DatabaseManager(initializeDatabase(sourceDbPath));

    const msgOhMyPi: UnifiedMessage = {
      id: 'roundtrip-oh-my-pi-msg',
      sessionId: 'roundtrip-sess-1',
      provider: 'oh-my-pi',
      model: 'claude-sonnet-4-5',
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 0,
      cacheCreationTokens: 10,
      cacheReadTokens: 5,
      cost: 1.0,
      timestamp: Date.UTC(2026, 7, 16, 12, 0, 0),
      date: '2026-08-16',
    };

    const msgAnthropic: UnifiedMessage = {
      id: 'roundtrip-anthropic-msg',
      sessionId: 'roundtrip-sess-2',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      inputTokens: 200,
      outputTokens: 100,
      reasoningTokens: 0,
      cacheCreationTokens: 20,
      cacheReadTokens: 10,
      cost: 2.0,
      timestamp: Date.UTC(2026, 7, 16, 12, 0, 0),
      date: '2026-08-16',
    };

    let sourceClosed = false;

    try {
      sourceManager.insertMessage(msgOhMyPi);
      sourceManager.insertMessage(msgAnthropic);
      sourceManager.close();
      sourceClosed = true;

      // 1. Export grouped JSON using CLI
      const exportResult = await runCli(
        'json',
        '--output',
        exportJsonFile,
        '--db',
        sourceDbPath,
      );
      expect(exportResult.exitCode).toBe(0);

      // 2. Ingest into fresh target database first time
      const firstIngest = await runCli(
        'ingest',
        exportJsonFile,
        '--db',
        targetDbPath,
      );
      expect(firstIngest.exitCode).toBe(0);

      // 3. Ingest into same target database second time (repeat)
      const secondIngest = await runCli(
        'ingest',
        exportJsonFile,
        '--db',
        targetDbPath,
      );
      expect(secondIngest.exitCode).toBe(0);

      // 4. Inspect target database
      const targetManager = new DatabaseManager(
        initializeDatabase(targetDbPath),
      );
      try {
        const messages = targetManager.getMessagesByDateRange(
          '0001-01-01',
          '9999-12-31',
        );
        expect(messages).toHaveLength(2);

        const totalCost = messages.reduce((sum, m) => sum + m.cost, 0);
        expect(totalCost).toBeCloseTo(3.0, 2);

        const ohMyPi = messages.find((m) => m.provider === 'oh-my-pi');
        const anthropic = messages.find((m) => m.provider === 'anthropic');

        expect(ohMyPi).toBeDefined();
        expect(anthropic).toBeDefined();
        if (ohMyPi === undefined || anthropic === undefined) {
          throw new Error(
            'Expected both oh-my-pi and anthropic messages to be present',
          );
        }

        expect(ohMyPi.cost).toBeCloseTo(1.0, 2);
        expect(ohMyPi.inputTokens).toBe(100);
        expect(ohMyPi.outputTokens).toBe(50);
        expect(ohMyPi.cacheCreationTokens).toBe(10);
        expect(ohMyPi.cacheReadTokens).toBe(5);

        expect(anthropic.cost).toBeCloseTo(2.0, 2);
        expect(anthropic.inputTokens).toBe(200);
        expect(anthropic.outputTokens).toBe(100);
        expect(anthropic.cacheCreationTokens).toBe(20);
        expect(anthropic.cacheReadTokens).toBe(10);
      } finally {
        targetManager.close();
      }
    } finally {
      if (!sourceClosed) sourceManager.close();
      await removeTemporaryDatabasePath(sourceDbPath);
      await removeTemporaryDatabasePath(targetDbPath);
      await rm(tempDir, {force: true, recursive: true});
    }
  });
});

describe('CLI help', () => {
  it('displays top-level help successfully with no arguments', async () => {
    const {exitCode, output} = await runCli();

    expect(exitCode).toBe(0);
    expect(output).toContain('Usage: agent-exporter [options] [command]');
    expect(output).toContain('Commands:');
  });

  it.each([
    'harness',
    'sync',
    'ingest',
    'export',
    'json',
    'live',
    'daily',
    'weekly',
    'monthly',
    'yearly',
    'range',
  ])('displays --help for %s', async (command) => {
    const {exitCode, output} = await runCli(command, '--help');

    expect(exitCode).toBe(0);
    expect(output).toContain(`Usage: agent-exporter ${command}`);
    expect(output).toContain('-h, --help');
  });
});
