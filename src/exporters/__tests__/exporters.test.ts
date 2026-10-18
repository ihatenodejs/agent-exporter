import {mkdtemp, rm} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';

import {afterEach, beforeEach, describe, expect, it} from 'bun:test';

import {type CCUsageExport, type UnifiedMessage} from '../../core/types';
import {DatabaseManager} from '../../database/manager';
import {initializeDatabase} from '../../database/schema';
import {
  CCUsageExportSchema,
  convertCcUsageExportToMessages,
} from '../../providers/ccusage';
import {CCUsageExporter} from '../ccusage';
import {JSONExporter} from '../json';

function createMessage(overrides: Partial<UnifiedMessage>): UnifiedMessage {
  return {
    id: overrides.id ?? 'msg-default',
    sessionId: overrides.sessionId ?? 'session-default',
    provider: overrides.provider ?? 'anthropic',
    model: overrides.model ?? 'claude-3-5-sonnet',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 200,
    reasoningTokens: overrides.reasoningTokens ?? 0,
    cacheCreationTokens: overrides.cacheCreationTokens ?? 0,
    cacheReadTokens: overrides.cacheReadTokens ?? 0,
    cost: overrides.cost ?? 1.0,
    timestamp: overrides.timestamp ?? Date.now(),
    date: overrides.date ?? '2020-01-01',
  };
}

describe('CCUsageExporter', () => {
  let dbManager: DatabaseManager;
  let exporter: CCUsageExporter;
  let tempDir: string;

  beforeEach(async () => {
    const db = initializeDatabase(':memory:');
    dbManager = new DatabaseManager(db);
    exporter = new CCUsageExporter(dbManager);
    tempDir = await mkdtemp(join(tmpdir(), 'ccusage-exporter-test-'));

    dbManager.insertMessages([
      createMessage({
        id: 'msg-1',
        cost: 1.0,
        date: '2020-01-01',
        timestamp: 1577836800000,
      }),
      createMessage({
        id: 'msg-2',
        cost: 2.0,
        date: '2020-01-02',
        timestamp: 1577923200000,
      }),
      createMessage({
        id: 'msg-3',
        cost: 4.0,
        date: '2026-01-01',
        timestamp: 1767225600000,
      }),
    ]);
  });

  afterEach(async () => {
    dbManager.close();
    await rm(tempDir, {force: true, recursive: true});
  });

  it('exportToString with no bounds exports all stored history totalling 7 across all dates', () => {
    const exportString = exporter.exportToString();
    const data = JSON.parse(exportString) as CCUsageExport;

    expect(data.totals.totalCost).toBe(7);
    expect(data.daily).toHaveLength(3);
    const dates = data.daily.map((d: {date: string}) => d.date);
    expect(dates).toEqual(['2020-01-01', '2020-01-02', '2026-01-01']);
  });

  it('export file method with no bounds writes full history and returns output path', async () => {
    const outputPath = join(tempDir, 'ccusage-all.json');
    const returnedPath = await exporter.export({outputPath});

    expect(returnedPath).toBe(outputPath);
    const content = await Bun.file(outputPath).text();
    const data = JSON.parse(content) as CCUsageExport;

    expect(data.totals.totalCost).toBe(7);
    expect(data.daily).toHaveLength(3);
  });

  it('filters by lower-only bound selecting dates on or after startDate', () => {
    const exportString = exporter.exportToString({startDate: '2020-01-02'});
    const data = JSON.parse(exportString) as CCUsageExport;

    expect(data.totals.totalCost).toBe(6);
    expect(data.daily).toHaveLength(2);
    expect(data.daily.map((d: {date: string}) => d.date)).toEqual([
      '2020-01-02',
      '2026-01-01',
    ]);
  });

  it('filters by upper-only bound selecting dates on or before endDate', () => {
    const exportString = exporter.exportToString({endDate: '2020-01-02'});
    const data = JSON.parse(exportString) as CCUsageExport;

    expect(data.totals.totalCost).toBe(3);
    expect(data.daily).toHaveLength(2);
    expect(data.daily.map((d: {date: string}) => d.date)).toEqual([
      '2020-01-01',
      '2020-01-02',
    ]);
  });

  it('equal bounds includes only the single matching date', () => {
    const exportString = exporter.exportToString({
      startDate: '2020-01-02',
      endDate: '2020-01-02',
    });
    const data = JSON.parse(exportString) as CCUsageExport;

    expect(data.totals.totalCost).toBe(2);
    expect(data.daily).toHaveLength(1);
    expect(data.daily[0].date).toBe('2020-01-02');
  });

  it('outside-range bounds yields empty daily entries and zero total cost', () => {
    const exportString = exporter.exportToString({
      startDate: '2022-01-01',
      endDate: '2023-01-01',
    });
    const data = JSON.parse(exportString) as CCUsageExport;

    expect(data.totals.totalCost).toBe(0);
    expect(data.daily).toEqual([]);
  });

  it('empty database emits valid empty export structure with zero totals', () => {
    const emptyDb = initializeDatabase(':memory:');
    const emptyManager = new DatabaseManager(emptyDb);
    try {
      const emptyExporter = new CCUsageExporter(emptyManager);

      const exportString = emptyExporter.exportToString();
      const data = JSON.parse(exportString) as CCUsageExport;

      expect(data.daily).toEqual([]);
      expect(data.totals.totalCost).toBe(0);
      expect(data.totals.totalTokens).toBe(0);
    } finally {
      emptyManager.close();
    }
  });

  it('aggregates multiple providers into unified daily and overall totals', () => {
    const multiDb = initializeDatabase(':memory:');
    const multiManager = new DatabaseManager(multiDb);
    try {
      const multiExporter = new CCUsageExporter(multiManager);

      multiManager.insertMessages([
        createMessage({
          id: 'msg-p1',
          provider: 'anthropic',
          cost: 3.0,
          date: '2025-06-01',
          timestamp: 1748736000000,
        }),
        createMessage({
          id: 'msg-p2',
          provider: 'openai',
          cost: 5.0,
          date: '2025-06-01',
          timestamp: 1748736100000,
        }),
      ]);

      const data = JSON.parse(multiExporter.exportToString()) as CCUsageExport;
      expect(data.totals.totalCost).toBe(8.0);
      expect(data.daily).toHaveLength(1);
      expect(data.daily[0].totalCost).toBe(8.0);
    } finally {
      multiManager.close();
    }
  });
  it('preserves financial and token totals across export and restore roundtrip with repeated import idempotency', () => {
    const sourceDb = initializeDatabase(':memory:');
    const sourceManager = new DatabaseManager(sourceDb);
    const targetDb = initializeDatabase(':memory:');
    const targetManager = new DatabaseManager(targetDb);

    try {
      sourceManager.insertMessages([
        createMessage({
          id: 'cc-msg-1',
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          cost: 2.5,
          inputTokens: 1500,
          outputTokens: 750,
          cacheCreationTokens: 300,
          cacheReadTokens: 120,
          date: '2025-03-10',
          timestamp: 1741564800000,
        }),
      ]);

      const exp = new CCUsageExporter(sourceManager);
      const jsonString = exp.exportToString();
      const parsed = CCUsageExportSchema.parse(JSON.parse(jsonString));
      const messages = convertCcUsageExportToMessages(parsed);

      targetManager.insertMessages(messages);

      let rows = targetManager.getMessagesByDateRange(
        '2025-03-10',
        '2025-03-10',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].cost).toBe(2.5);
      expect(rows[0].inputTokens).toBe(1500);
      expect(rows[0].outputTokens).toBe(750);
      expect(rows[0].cacheCreationTokens).toBe(300);
      expect(rows[0].cacheReadTokens).toBe(120);

      // Repeat import
      targetManager.insertMessages(messages);

      rows = targetManager.getMessagesByDateRange('2025-03-10', '2025-03-10');
      expect(rows).toHaveLength(1);
      expect(rows[0].cost).toBe(2.5);
    } finally {
      sourceManager.close();
      targetManager.close();
    }
  });
});

describe('JSONExporter', () => {
  let dbManager: DatabaseManager;
  let exporter: JSONExporter;
  let tempDir: string;

  beforeEach(async () => {
    const db = initializeDatabase(':memory:');
    dbManager = new DatabaseManager(db);
    exporter = new JSONExporter(dbManager);
    tempDir = await mkdtemp(join(tmpdir(), 'json-exporter-test-'));

    dbManager.insertMessages([
      createMessage({
        id: 'msg-1',
        provider: 'anthropic',
        cost: 1.0,
        date: '2020-01-01',
        timestamp: 1577836800000,
      }),
      createMessage({
        id: 'msg-2',
        provider: 'openai',
        cost: 2.0,
        date: '2020-01-02',
        timestamp: 1577923200000,
      }),
      createMessage({
        id: 'msg-3',
        provider: 'anthropic',
        cost: 4.0,
        date: '2026-01-01',
        timestamp: 1767225600000,
      }),
    ]);
  });

  afterEach(async () => {
    dbManager.close();
    await rm(tempDir, {force: true, recursive: true});
  });

  it('exportToString with no bounds exports all stored history grouped by provider totalling 7', () => {
    const exportString = exporter.exportToString();
    const data = JSON.parse(exportString) as Record<string, CCUsageExport>;

    expect(data.anthropic.totals.totalCost).toBe(5);
    expect(data.openai.totals.totalCost).toBe(2);
    expect(data.anthropic.totals.totalCost + data.openai.totals.totalCost).toBe(
      7,
    );

    const anthropicDates = data.anthropic.daily.map(
      (d: {date: string}) => d.date,
    );
    expect(anthropicDates).toEqual(['2020-01-01', '2026-01-01']);
    expect(data.openai.daily.map((d: {date: string}) => d.date)).toEqual([
      '2020-01-02',
    ]);
  });

  it('export file method with no bounds writes full history and returns output path', async () => {
    const outputPath = join(tempDir, 'json-all.json');
    const returnedPath = await exporter.export({outputPath});

    expect(returnedPath).toBe(outputPath);
    const content = await Bun.file(outputPath).text();
    const data = JSON.parse(content) as Record<string, CCUsageExport>;

    expect(data.anthropic.totals.totalCost).toBe(5);
    expect(data.openai.totals.totalCost).toBe(2);
  });

  it('filters by lower-only bound selecting dates on or after startDate', () => {
    const exportString = exporter.exportToString({startDate: '2020-01-02'});
    const data = JSON.parse(exportString) as Record<string, CCUsageExport>;

    expect(data.anthropic.totals.totalCost).toBe(4);
    expect(data.openai.totals.totalCost).toBe(2);
    expect(data.anthropic.daily.map((d: {date: string}) => d.date)).toEqual([
      '2026-01-01',
    ]);
    expect(data.openai.daily.map((d: {date: string}) => d.date)).toEqual([
      '2020-01-02',
    ]);
  });

  it('filters by upper-only bound selecting dates on or before endDate', () => {
    const exportString = exporter.exportToString({endDate: '2020-01-02'});
    const data = JSON.parse(exportString) as Record<string, CCUsageExport>;

    expect(data.anthropic.totals.totalCost).toBe(1);
    expect(data.openai.totals.totalCost).toBe(2);
    expect(data.anthropic.daily.map((d: {date: string}) => d.date)).toEqual([
      '2020-01-01',
    ]);
    expect(data.openai.daily.map((d: {date: string}) => d.date)).toEqual([
      '2020-01-02',
    ]);
  });

  it('equal bounds includes only the matching date across providers', () => {
    const exportString = exporter.exportToString({
      startDate: '2020-01-02',
      endDate: '2020-01-02',
    });
    const data = JSON.parse(exportString) as Record<string, CCUsageExport>;

    expect(data.openai.totals.totalCost).toBe(2);
    expect(data.anthropic).toBeUndefined();
    expect(data.openai.daily).toHaveLength(1);
    expect(data.openai.daily[0].date).toBe('2020-01-02');
  });

  it('outside-range bounds yields empty provider dictionary', () => {
    const exportString = exporter.exportToString({
      startDate: '2022-01-01',
      endDate: '2023-01-01',
    });
    const data = JSON.parse(exportString) as Record<string, CCUsageExport>;

    expect(data).toEqual({});
  });

  it('empty database emits valid empty export object', () => {
    const emptyDb = initializeDatabase(':memory:');
    const emptyManager = new DatabaseManager(emptyDb);
    try {
      const emptyExporter = new JSONExporter(emptyManager);

      const exportString = emptyExporter.exportToString();
      const data = JSON.parse(exportString) as Record<string, CCUsageExport>;

      expect(data).toEqual({});
    } finally {
      emptyManager.close();
    }
  });
  it('preserves per-provider financial and token totals across grouped export and restore roundtrip with repeated import idempotency', () => {
    const sourceDb = initializeDatabase(':memory:');
    const sourceManager = new DatabaseManager(sourceDb);
    const targetDb = initializeDatabase(':memory:');
    const targetManager = new DatabaseManager(targetDb);

    try {
      sourceManager.insertMessages([
        createMessage({
          id: 'grp-msg-1',
          provider: 'oh-my-pi',
          model: 'claude-sonnet-4-5',
          cost: 1.0,
          inputTokens: 1200,
          outputTokens: 600,
          cacheCreationTokens: 250,
          cacheReadTokens: 50,
          date: '2025-01-15',
          timestamp: 1736899200000,
        }),
        createMessage({
          id: 'grp-msg-2',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          cost: 2.0,
          inputTokens: 2400,
          outputTokens: 1200,
          cacheCreationTokens: 500,
          cacheReadTokens: 100,
          date: '2025-01-15',
          timestamp: 1736899200000,
        }),
      ]);

      const jsonExp = new JSONExporter(sourceManager);
      const jsonString = jsonExp.exportToString();
      const parsed = CCUsageExportSchema.parse(JSON.parse(jsonString));
      const messages = convertCcUsageExportToMessages(parsed);

      expect(messages).toHaveLength(2);

      // First ingestion into fresh target database
      targetManager.insertMessages(messages);

      let rows = targetManager.getMessagesByDateRange(
        '2025-01-15',
        '2025-01-15',
      );
      expect(rows).toHaveLength(2);

      const omp = rows.find((r) => r.provider === 'oh-my-pi');
      if (!omp) throw new Error('Missing restored Oh My Pi provider');
      expect(omp.cost).toBe(1.0);
      expect(omp.inputTokens).toBe(1200);
      expect(omp.outputTokens).toBe(600);
      expect(omp.cacheCreationTokens).toBe(250);
      expect(omp.cacheReadTokens).toBe(50);

      const ant = rows.find((r) => r.provider === 'anthropic');
      if (!ant) throw new Error('Missing restored Anthropic provider');
      expect(ant.cost).toBe(2.0);
      expect(ant.inputTokens).toBe(2400);
      expect(ant.outputTokens).toBe(1200);
      expect(ant.cacheCreationTokens).toBe(500);
      expect(ant.cacheReadTokens).toBe(100);

      const totalCost = rows.reduce((sum, r) => sum + r.cost, 0);
      expect(totalCost).toBe(3.0);

      // Repeated ingestion must not duplicate rows or inflate totals
      targetManager.insertMessages(messages);

      rows = targetManager.getMessagesByDateRange('2025-01-15', '2025-01-15');
      expect(rows).toHaveLength(2);

      const totalCostRepeated = rows.reduce((sum, r) => sum + r.cost, 0);
      expect(totalCostRepeated).toBe(3.0);
    } finally {
      sourceManager.close();
      targetManager.close();
    }
  });
});
