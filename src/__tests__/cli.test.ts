import {fileURLToPath} from 'node:url';

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
): Promise<{exitCode: number; output: string}> => {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, output, errorOutput] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return {exitCode, output: output + errorOutput};
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
      expect(invalidRange.output).toContain(
        'Invalid start date: 08-16-2026. Use YYYY-MM-DD format.',
      );
    } finally {
      if (!databaseClosed) databaseManager.close();
      await removeTemporaryDatabasePath(databasePath);
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
