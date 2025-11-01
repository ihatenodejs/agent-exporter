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
          input: 32,
          output: 48,
          cached: 6,
          thoughts: 4,
        },
        model: 'qwen2.5-coder',
      },
      {
        id: 'msg-qwen-2',
        timestamp: '2024-04-10T08:10:00.000Z',
        type: 'tool',
        tokens: {
          input: 5,
          output: 5,
        },
      },
    ],
  };

  const filePath = join(chatsDir, 'session-qwen.json');
  writeFileSync(filePath, JSON.stringify(session), 'utf8');
};

describe('QwenAdapter', () => {
  it('normalizes qwen messages from cached session files', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'qwen-adapter-'));
    try {
      createQwenSession(tmpRoot);

      const adapter = new QwenAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(1);
      const message = messages[0];

      const expectedTimestamp = new Date('2024-04-10T08:05:00.000Z').getTime();
      const expectedDate = dayjs(expectedTimestamp).format('YYYY-MM-DD');
      const expectedCost = calculateCost('qwen2.5-coder', 32, 48, 0, 6, 'qwen');

      expect(message).toMatchObject({
        id: 'msg-qwen-1',
        sessionId: 'session-qwen',
        provider: 'qwen',
        model: 'qwen2.5-coder',
        inputTokens: 32,
        outputTokens: 48,
        reasoningTokens: 4,
        cacheCreationTokens: 0,
        cacheReadTokens: 6,
        date: expectedDate,
      });
      expect(message.timestamp).toBe(expectedTimestamp);
      expect(message.cost).toBeCloseTo(expectedCost);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });
});
