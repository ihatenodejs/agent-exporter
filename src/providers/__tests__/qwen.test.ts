import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {describe, expect, it} from 'bun:test';
import dayjs from 'dayjs';

import {calculateCost} from '../../core/pricing';
import {QwenAdapter} from '../qwen';

const createQwenSession = (root: string): void => {
  const sessionDir = join(root, 'session-999');
  const chatsDir = join(sessionDir, 'chats');
  mkdirSync(chatsDir, {recursive: true});

  const session = {
    sessionId: 'session-qwen',
    projectHash: 'proj-qwen',
    startTime: '2024-04-10T08:00:00.000Z',
    lastUpdated: '2024-04-10T08:30:00.000Z',
    messages: [
      {
        id: 'msg-qwen-1',
        timestamp: '2024-04-10T08:05:00.000Z',
        type: 'qwen',
        tokens: {
          input: 200,
          output: 48,
          cached: 6,
          thoughts: 4,
        },
        model: 'qwen2.5-coder',
      },
      {
        id: 'msg-qwen-2',
        timestamp: '2024-04-10T08:10:00.000Z',
        type: 'qwen',
        tokens: {
          input: 280,
          output: 60,
          cached: 12,
          thoughts: 8,
        },
        model: 'qwen2.5-coder',
      },
      {
        id: 'msg-qwen-3',
        timestamp: '2024-04-10T08:12:00.000Z',
        type: 'tool',
        tokens: {
          input: 300,
          output: 5,
        },
      },
    ],
  };

  const filePath = join(chatsDir, 'session-qwen.json');
  writeFileSync(filePath, JSON.stringify(session), 'utf8');
};

describe('QwenAdapter', () => {
  it('calculates delta input tokens and uses cumulative for cost', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'qwen-adapter-'));
    try {
      createQwenSession(tmpRoot);

      const adapter = new QwenAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(2);

      const msg1 = messages[0];
      const expectedTimestamp1 = new Date('2024-04-10T08:05:00.000Z').getTime();
      const expectedDate1 = dayjs(expectedTimestamp1).format('YYYY-MM-DD');
      const expectedCost1 = calculateCost(
        'qwen2.5-coder',
        200,
        48,
        0,
        6,
        'qwen',
      );

      expect(msg1).toMatchObject({
        id: 'msg-qwen-1',
        sessionId: 'session-qwen',
        provider: 'qwen',
        model: 'qwen2.5-coder',
        inputTokens: 200,
        outputTokens: 48,
        reasoningTokens: 4,
        cacheCreationTokens: 0,
        cacheReadTokens: 6,
        date: expectedDate1,
      });
      expect(msg1.timestamp).toBe(expectedTimestamp1);
      expect(msg1.cost).toBeCloseTo(expectedCost1);

      const msg2 = messages[1];
      const expectedTimestamp2 = new Date('2024-04-10T08:10:00.000Z').getTime();
      const expectedDate2 = dayjs(expectedTimestamp2).format('YYYY-MM-DD');
      const expectedCost2 = calculateCost(
        'qwen2.5-coder',
        280,
        60,
        0,
        12,
        'qwen',
      );

      expect(msg2).toMatchObject({
        id: 'msg-qwen-2',
        sessionId: 'session-qwen',
        provider: 'qwen',
        model: 'qwen2.5-coder',
        inputTokens: 80,
        outputTokens: 60,
        reasoningTokens: 8,
        cacheCreationTokens: 0,
        cacheReadTokens: 12,
        date: expectedDate2,
      });
      expect(msg2.timestamp).toBe(expectedTimestamp2);
      expect(msg2.cost).toBeCloseTo(expectedCost2);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });
});
