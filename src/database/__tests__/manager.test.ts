import {describe, expect, it} from 'bun:test';

import {
  createTemporaryDatabasePath,
  removeTemporaryDatabasePath,
} from '../../__tests__/database-test-utils';
import {calculateCost} from '../../core/pricing';
import {type UnifiedMessage} from '../../core/types';
import {DatabaseManager} from '../manager';
import {initializeDatabase} from '../schema';

function createTestMessage(
  overrides: Partial<UnifiedMessage> = {},
): UnifiedMessage {
  return {
    id: 'msg-default-1',
    sessionId: 'session-default-1',
    provider: 'isolated-test-provider',
    model: 'coder-model',
    inputTokens: 100_000,
    outputTokens: 50_000,
    reasoningTokens: 10_000,
    cacheCreationTokens: 5_000,
    cacheReadTokens: 2_000,
    cost: 0.35,
    timestamp: 1_776_000_000,
    date: '2026-04-12',
    ...overrides,
  };
}

describe('DatabaseManager harness state', () => {
  it('defaults to disabled and persists enable and disable transitions', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      expect(manager.isHarnessEnabled('ccusage')).toBe(false);

      manager.setHarnessEnabled('ccusage', true);
      db.close();

      const enabledDatabase = initializeDatabase(databasePath);
      const enabledManager = new DatabaseManager(enabledDatabase);
      expect(enabledManager.isHarnessEnabled('ccusage')).toBe(true);

      enabledManager.setHarnessEnabled('ccusage', false);
      enabledDatabase.close();

      const disabledDatabase = initializeDatabase(databasePath);
      const disabledManager = new DatabaseManager(disabledDatabase);
      expect(disabledManager.isHarnessEnabled('ccusage')).toBe(false);
      disabledDatabase.close();
    } finally {
      await removeTemporaryDatabasePath(databasePath);
    }
  });
});

describe('DatabaseManager financial persistence and range invariants', () => {
  it('persists all message fields durably across database reopen', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      const message = createTestMessage({
        id: 'msg-durable-1',
        sessionId: 'session-durable-1',
        provider: 'isolated-provider',
        model: 'coder-model',
        inputTokens: 120_000,
        outputTokens: 45_000,
        reasoningTokens: 5_000,
        cacheCreationTokens: 10_000,
        cacheReadTokens: 25_000,
        cost: 0.345,
        timestamp: 1_776_000_000,
        date: '2026-04-12',
      });

      try {
        manager.insertMessage(message);
      } finally {
        manager.close();
      }

      const reopenedDb = initializeDatabase(databasePath);
      const reopenedManager = new DatabaseManager(reopenedDb);
      try {
        const persisted = reopenedManager.getMessagesByDateRange(
          '2026-04-12',
          '2026-04-12',
        );
        expect(persisted).toHaveLength(1);
        expect(persisted[0]).toEqual(message);
      } finally {
        reopenedManager.close();
      }
    } finally {
      await removeTemporaryDatabasePath(databasePath);
    }
  });

  it('reimports identical message without duplicating rows', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      const message = createTestMessage({
        id: 'msg-reimport-1',
        cost: 0.12,
        date: '2026-04-12',
      });

      manager.insertMessage(message);
      manager.insertMessage(message);

      const rows = manager.getMessagesByDateRange('2026-04-12', '2026-04-12');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(message);
    } finally {
      manager.close();
      await removeTemporaryDatabasePath(databasePath);
    }
  });

  it('replaces stored values when importing an updated message with an existing ID', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      const initialMessage = createTestMessage({
        id: 'msg-replace-1',
        sessionId: 'session-initial',
        outputTokens: 100,
        cost: 0.1,
        date: '2026-04-12',
      });
      const updatedMessage = createTestMessage({
        id: 'msg-replace-1',
        sessionId: 'session-updated',
        outputTokens: 500,
        cost: 0.95,
        date: '2026-04-12',
      });

      manager.insertMessage(initialMessage);
      manager.insertMessage(updatedMessage);

      const rows = manager.getMessagesByDateRange('2026-04-12', '2026-04-12');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(updatedMessage);
    } finally {
      manager.close();
      await removeTemporaryDatabasePath(databasePath);
    }
  });

  it('leaves existing rows unchanged when inserting an empty batch', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      const message = createTestMessage({
        id: 'msg-empty-batch-1',
        date: '2026-04-12',
      });

      manager.insertMessage(message);
      manager.insertMessages([]);

      const rows = manager.getMessagesByDateRange('2026-04-12', '2026-04-12');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(message);
    } finally {
      manager.close();
      await removeTemporaryDatabasePath(databasePath);
    }
  });

  it('respects inclusive date boundaries, excludes out-of-range rows, and orders by timestamp ascending', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      const beforeRange = createTestMessage({
        id: 'msg-date-before',
        date: '2026-04-09',
        timestamp: 100,
      });
      const lowerBoundary = createTestMessage({
        id: 'msg-date-lower',
        date: '2026-04-10',
        timestamp: 200,
      });
      const middleLater = createTestMessage({
        id: 'msg-date-mid-later',
        date: '2026-04-11',
        timestamp: 350,
      });
      const middleEarlier = createTestMessage({
        id: 'msg-date-mid-earlier',
        date: '2026-04-11',
        timestamp: 300,
      });
      const upperBoundary = createTestMessage({
        id: 'msg-date-upper',
        date: '2026-04-12',
        timestamp: 400,
      });
      const afterRange = createTestMessage({
        id: 'msg-date-after',
        date: '2026-04-13',
        timestamp: 500,
      });

      manager.insertMessages([
        beforeRange,
        lowerBoundary,
        middleLater,
        middleEarlier,
        upperBoundary,
        afterRange,
      ]);

      const inRange = manager.getMessagesByDateRange(
        '2026-04-10',
        '2026-04-12',
      );

      expect(inRange).toHaveLength(4);
      expect(inRange.map((m) => m.id)).toEqual([
        'msg-date-lower',
        'msg-date-mid-earlier',
        'msg-date-mid-later',
        'msg-date-upper',
      ]);
      expect(inRange.map((m) => m.timestamp)).toEqual([200, 300, 350, 400]);
    } finally {
      manager.close();
      await removeTemporaryDatabasePath(databasePath);
    }
  });
});

describe('DatabaseManager batch and recalculation rollback invariants', () => {
  it('rolls back all messages in a failing batch and allows subsequent batch inserts after trigger removal', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      const existing = createTestMessage({
        id: 'msg-batch-preexisting',
        date: '2026-04-12',
      });
      manager.insertMessage(existing);

      const batchFirst = createTestMessage({
        id: 'msg-batch-first',
        date: '2026-04-12',
      });
      const batchSecond = createTestMessage({
        id: 'msg-batch-abort-target',
        date: '2026-04-12',
      });

      db.run(`
        CREATE TEMP TRIGGER abort_second_insert
        BEFORE INSERT ON messages
        FOR EACH ROW
        WHEN NEW.id = 'msg-batch-abort-target'
        BEGIN
          SELECT RAISE(ABORT, 'forced insert failure');
        END;
      `);

      expect(() => {
        manager.insertMessages([batchFirst, batchSecond]);
      }).toThrow('forced insert failure');

      const rowsAfterRollback = manager.getMessagesByDateRange(
        '2026-04-12',
        '2026-04-12',
      );
      expect(rowsAfterRollback).toHaveLength(1);
      expect(rowsAfterRollback[0]).toEqual(existing);

      db.run('DROP TRIGGER abort_second_insert;');

      manager.insertMessages([batchFirst, batchSecond]);

      const rowsAfterRecovery = manager.getMessagesByDateRange(
        '2026-04-12',
        '2026-04-12',
      );
      expect(rowsAfterRecovery).toHaveLength(3);
      const recoveredById = new Map(rowsAfterRecovery.map((m) => [m.id, m]));
      expect(recoveredById.get('msg-batch-preexisting')).toEqual(existing);
      expect(recoveredById.get('msg-batch-first')).toEqual(batchFirst);
      expect(recoveredById.get('msg-batch-abort-target')).toEqual(batchSecond);
    } finally {
      manager.close();
      await removeTemporaryDatabasePath(databasePath);
    }
  });

  it('repairs missing costs under default mode and updates all costs under forced mode', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      const inputTokens = 1_000_000;
      const outputTokens = 500_000;
      const expectedCalculatedCost = calculateCost(
        'coder-model',
        inputTokens,
        outputTokens,
        0,
        0,
        'isolated-test-provider',
      );
      expect(expectedCalculatedCost).toBe(3.5);

      const missingCostMessage = createTestMessage({
        id: 'msg-recalc-missing',
        provider: 'isolated-test-provider',
        model: 'coder-model',
        inputTokens,
        outputTokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        date: '2026-04-12',
      });
      const positiveCostMessage = createTestMessage({
        id: 'msg-recalc-positive',
        provider: 'isolated-test-provider',
        model: 'coder-model',
        inputTokens,
        outputTokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 99.99,
        date: '2026-04-12',
      });

      manager.insertMessages([missingCostMessage, positiveCostMessage]);

      const defaultUpdated = manager.recalculateCosts(false);
      expect(defaultUpdated).toBe(1);

      const rowsAfterDefault = manager.getMessagesByDateRange(
        '2026-04-12',
        '2026-04-12',
      );
      const missingAfterDefault = rowsAfterDefault.find(
        (m) => m.id === 'msg-recalc-missing',
      );
      const positiveAfterDefault = rowsAfterDefault.find(
        (m) => m.id === 'msg-recalc-positive',
      );
      expect(missingAfterDefault?.cost).toBe(expectedCalculatedCost);
      expect(positiveAfterDefault?.cost).toBe(99.99);

      const forcedUpdated = manager.recalculateCosts(true);
      expect(forcedUpdated).toBe(2);

      const rowsAfterForced = manager.getMessagesByDateRange(
        '2026-04-12',
        '2026-04-12',
      );
      const missingAfterForced = rowsAfterForced.find(
        (m) => m.id === 'msg-recalc-missing',
      );
      const positiveAfterForced = rowsAfterForced.find(
        (m) => m.id === 'msg-recalc-positive',
      );
      expect(missingAfterForced?.cost).toBe(expectedCalculatedCost);
      expect(positiveAfterForced?.cost).toBe(expectedCalculatedCost);
    } finally {
      manager.close();
      await removeTemporaryDatabasePath(databasePath);
    }
  });

  it('rolls back all cost recalculations when an update fails and preserves sentinel costs', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      const inputTokens = 1_000_000;
      const outputTokens = 500_000;
      const expectedCalculatedCost = calculateCost(
        'coder-model',
        inputTokens,
        outputTokens,
        0,
        0,
        'isolated-test-provider',
      );
      expect(expectedCalculatedCost).toBe(3.5);

      const sentinelA = 11.11;
      const sentinelB = 22.22;

      const messageA = createTestMessage({
        id: 'msg-recalc-rollback-a',
        provider: 'isolated-test-provider',
        model: 'coder-model',
        inputTokens,
        outputTokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: sentinelA,
        date: '2026-04-12',
      });
      const messageB = createTestMessage({
        id: 'msg-recalc-rollback-b',
        provider: 'isolated-test-provider',
        model: 'coder-model',
        inputTokens,
        outputTokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: sentinelB,
        date: '2026-04-12',
      });

      manager.insertMessages([messageA, messageB]);

      db.run(`
        CREATE TEMP TRIGGER abort_recalc_update
        BEFORE UPDATE OF cost ON messages
        FOR EACH ROW
        WHEN NEW.id = 'msg-recalc-rollback-b'
        BEGIN
          SELECT RAISE(ABORT, 'forced recalculation update failure');
        END;
      `);

      expect(() => {
        manager.recalculateCosts(true);
      }).toThrow('forced recalculation update failure');

      const rowsAfterRollback = manager.getMessagesByDateRange(
        '2026-04-12',
        '2026-04-12',
      );
      const rowAAfterRollback = rowsAfterRollback.find(
        (m) => m.id === 'msg-recalc-rollback-a',
      );
      const rowBAfterRollback = rowsAfterRollback.find(
        (m) => m.id === 'msg-recalc-rollback-b',
      );
      expect(rowAAfterRollback?.cost).toBe(sentinelA);
      expect(rowBAfterRollback?.cost).toBe(sentinelB);

      db.run('DROP TRIGGER abort_recalc_update;');

      const recoveredUpdated = manager.recalculateCosts(true);
      expect(recoveredUpdated).toBe(2);

      const rowsAfterRecovery = manager.getMessagesByDateRange(
        '2026-04-12',
        '2026-04-12',
      );
      const rowAAfterRecovery = rowsAfterRecovery.find(
        (m) => m.id === 'msg-recalc-rollback-a',
      );
      const rowBAfterRecovery = rowsAfterRecovery.find(
        (m) => m.id === 'msg-recalc-rollback-b',
      );
      expect(rowAAfterRecovery?.cost).toBe(expectedCalculatedCost);
      expect(rowBAfterRecovery?.cost).toBe(expectedCalculatedCost);
    } finally {
      manager.close();
      await removeTemporaryDatabasePath(databasePath);
    }
  });
});
