import {afterEach, beforeEach, describe, expect, it} from 'bun:test';

import {type UnifiedMessage} from '../../core/types';
import {DatabaseManager} from '../manager';
import {initializeDatabase} from '../schema';

import type {Database} from 'bun:sqlite';

const createTestMessage = (
  overrides: Partial<UnifiedMessage> = {},
): UnifiedMessage => ({
  id: 'test-msg-1',
  sessionId: 'test-session-1',
  provider: 'anthropic',
  model: 'claude-3-sonnet',
  inputTokens: 100,
  outputTokens: 200,
  reasoningTokens: 10,
  cacheCreationTokens: 5,
  cacheReadTokens: 3,
  cost: 0.05,
  timestamp: 1700000000000,
  date: '2024-01-15',
  ...overrides,
});

describe('DatabaseManager', () => {
  let db: Database;
  let manager: DatabaseManager;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    manager = new DatabaseManager(db);
  });

  afterEach(() => {
    manager.close();
  });

  describe('insertMessage', () => {
    it('inserts a single message and allows retrieval', () => {
      const message = createTestMessage();
      manager.insertMessage(message);

      const results = manager.getMessagesByDateRange(
        '2024-01-15',
        '2024-01-15',
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'test-msg-1',
        sessionId: 'test-session-1',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        inputTokens: 100,
        outputTokens: 200,
        reasoningTokens: 10,
        cacheCreationTokens: 5,
        cacheReadTokens: 3,
        cost: 0.05,
        date: '2024-01-15',
      });
    });

    it('replaces existing message with same id', () => {
      const message1 = createTestMessage({cost: 0.05});
      const message2 = createTestMessage({cost: 0.1});

      manager.insertMessage(message1);
      manager.insertMessage(message2);

      const results = manager.getMessagesByDateRange(
        '2024-01-15',
        '2024-01-15',
      );

      expect(results).toHaveLength(1);
      expect(results[0].cost).toBe(0.1);
    });
  });

  describe('insertMessages', () => {
    it('inserts multiple messages in a transaction', () => {
      const messages = [
        createTestMessage({id: 'msg-1', date: '2024-01-15'}),
        createTestMessage({id: 'msg-2', date: '2024-01-16'}),
        createTestMessage({id: 'msg-3', date: '2024-01-17'}),
      ];

      manager.insertMessages(messages);

      const results = manager.getMessagesByDateRange(
        '2024-01-15',
        '2024-01-17',
      );

      expect(results).toHaveLength(3);
    });

    it('rolls back transaction on error', () => {
      const validMessage = createTestMessage({id: 'msg-valid'});
      manager.insertMessage(validMessage);

      const invalidMessages = [
        createTestMessage({id: 'msg-new-1'}),
        {id: null} as unknown as UnifiedMessage,
      ];

      expect(() => manager.insertMessages(invalidMessages)).toThrow();

      const results = manager.getMessagesByDateRange(
        '2024-01-15',
        '2024-01-15',
      );
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('msg-valid');
    });
  });

  describe('getMessagesByDateRange', () => {
    it('returns messages within date range', () => {
      const messages = [
        createTestMessage({
          id: 'msg-1',
          date: '2024-01-10',
          timestamp: 1704844800000,
        }),
        createTestMessage({
          id: 'msg-2',
          date: '2024-01-15',
          timestamp: 1705276800000,
        }),
        createTestMessage({
          id: 'msg-3',
          date: '2024-01-20',
          timestamp: 1705708800000,
        }),
        createTestMessage({
          id: 'msg-4',
          date: '2024-01-25',
          timestamp: 1706140800000,
        }),
      ];

      manager.insertMessages(messages);

      const results = manager.getMessagesByDateRange(
        '2024-01-12',
        '2024-01-22',
      );

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toEqual(['msg-2', 'msg-3']);
    });

    it('returns empty array when no messages match', () => {
      const message = createTestMessage({date: '2024-01-15'});
      manager.insertMessage(message);

      const results = manager.getMessagesByDateRange(
        '2024-02-01',
        '2024-02-28',
      );

      expect(results).toHaveLength(0);
    });

    it('returns messages ordered by timestamp ascending', () => {
      const messages = [
        createTestMessage({
          id: 'msg-3',
          date: '2024-01-15',
          timestamp: 1705330000000,
        }),
        createTestMessage({
          id: 'msg-1',
          date: '2024-01-15',
          timestamp: 1705310000000,
        }),
        createTestMessage({
          id: 'msg-2',
          date: '2024-01-15',
          timestamp: 1705320000000,
        }),
      ];

      manager.insertMessages(messages);

      const results = manager.getMessagesByDateRange(
        '2024-01-15',
        '2024-01-15',
      );

      expect(results.map((r) => r.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });
  });

  describe('getDailyUsage', () => {
    it('returns aggregated daily usage', () => {
      const messages = [
        createTestMessage({
          id: 'msg-1',
          date: '2024-01-15',
          inputTokens: 100,
          outputTokens: 200,
          cost: 0.05,
        }),
        createTestMessage({
          id: 'msg-2',
          date: '2024-01-15',
          inputTokens: 150,
          outputTokens: 250,
          cost: 0.08,
        }),
      ];

      manager.insertMessages(messages);

      const usage = manager.getDailyUsage('2024-01-15', '2024-01-15');

      expect(usage).toHaveLength(1);
      expect(usage[0].date).toBe('2024-01-15');
      expect(usage[0].inputTokens).toBe(250);
      expect(usage[0].outputTokens).toBe(450);
      expect(usage[0].totalCost).toBeCloseTo(0.13);
    });
  });

  describe('getSyncState and updateSyncState', () => {
    it('returns null when no sync state exists', () => {
      const state = manager.getSyncState('opencode');

      expect(state).toBeNull();
    });

    it('stores and retrieves sync state', () => {
      manager.updateSyncState('opencode', 1700000000000, 'msg-123');

      const state = manager.getSyncState('opencode');

      expect(state).not.toBeNull();
      expect(state?.lastSyncTimestamp).toBe(1700000000000);
      expect(state?.lastMessageId).toBe('msg-123');
    });

    it('updates existing sync state', () => {
      manager.updateSyncState('opencode', 1700000000000, 'msg-123');
      manager.updateSyncState('opencode', 1700000100000, 'msg-456');

      const state = manager.getSyncState('opencode');

      expect(state?.lastSyncTimestamp).toBe(1700000100000);
      expect(state?.lastMessageId).toBe('msg-456');
    });

    it('maintains separate sync states per provider', () => {
      manager.updateSyncState('opencode', 1700000000000, 'msg-oc');
      manager.updateSyncState('gemini', 1700000100000, 'msg-gem');

      const openCodeState = manager.getSyncState('opencode');
      const geminiState = manager.getSyncState('gemini');

      expect(openCodeState?.lastMessageId).toBe('msg-oc');
      expect(geminiState?.lastMessageId).toBe('msg-gem');
    });
  });

  describe('recalculateCosts', () => {
    it('recalculates costs for messages with zero cost', () => {
      const message = createTestMessage({
        id: 'msg-1',
        cost: 0,
        model: 'claude-3-sonnet-20240229',
        inputTokens: 1000,
        outputTokens: 2000,
      });

      manager.insertMessage(message);

      const updatedCount = manager.recalculateCosts();

      expect(updatedCount).toBe(1);

      const results = manager.getMessagesByDateRange(
        '2024-01-15',
        '2024-01-15',
      );
      expect(results[0].cost).toBeGreaterThanOrEqual(0);
    });

    it('skips messages with existing cost when recalculateAll is false', () => {
      const messages = [
        createTestMessage({id: 'msg-1', cost: 0.05}),
        createTestMessage({id: 'msg-2', cost: 0}),
      ];

      manager.insertMessages(messages);

      const updatedCount = manager.recalculateCosts(false);

      expect(updatedCount).toBe(1);
    });

    it('recalculates all costs when recalculateAll is true', () => {
      const messages = [
        createTestMessage({id: 'msg-1', cost: 0.05}),
        createTestMessage({id: 'msg-2', cost: 0.1}),
      ];

      manager.insertMessages(messages);

      const updatedCount = manager.recalculateCosts(true);

      expect(updatedCount).toBe(2);
    });
  });

  describe('close', () => {
    it('closes the database connection', () => {
      const testDb = initializeDatabase(':memory:');
      const testManager = new DatabaseManager(testDb);

      testManager.close();

      expect(() => testDb.prepare('SELECT 1').run()).toThrow();
    });
  });
});
