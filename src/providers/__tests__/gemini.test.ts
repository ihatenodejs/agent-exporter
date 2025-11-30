import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {describe, expect, it} from 'bun:test';
import dayjs from 'dayjs';

import {calculateCost} from '../../core/pricing';
import {GeminiAdapter} from '../gemini';

const createGeminiSession = (root: string): string => {
  const sessionDir = join(root, 'session-123');
  const chatsDir = join(sessionDir, 'chats');
  mkdirSync(chatsDir, {recursive: true});

  const session = {
    sessionId: 'session-abc',
    projectHash: 'proj-hash',
    startTime: '2024-03-01T09:00:00.000Z',
    lastUpdated: '2024-03-01T10:05:00.000Z',
    messages: [
      {
        id: 'msg-1',
        timestamp: '2024-03-01T10:00:00.000Z',
        type: 'gemini',
        tokens: {
          input: 100,
          output: 20,
          cached: 5,
          thoughts: 3,
        },
        model: 'gemini-pro',
      },
      {
        id: 'msg-2',
        timestamp: '2024-03-01T10:02:00.000Z',
        type: 'gemini',
        tokens: {
          input: 150,
          output: 30,
          cached: 10,
          thoughts: 5,
        },
        model: 'gemini-pro',
      },
      {
        id: 'msg-3',
        timestamp: '2024-03-01T10:03:00.000Z',
        type: 'analysis',
        tokens: {
          input: 200,
          output: 5,
        },
        model: 'gemini-pro',
      },
    ],
  };

  const filePath = join(chatsDir, 'session-test.json');
  writeFileSync(filePath, JSON.stringify(session), 'utf8');
  return filePath;
};

describe('GeminiAdapter', () => {
  it('calculates delta input tokens and uses cumulative for cost', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'gemini-adapter-'));
    try {
      const sessionFile = createGeminiSession(tmpRoot);
      expect(sessionFile).toBeTruthy();

      const adapter = new GeminiAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(2);

      const msg1 = messages[0];
      const expectedTimestamp1 = new Date('2024-03-01T10:00:00.000Z').getTime();
      const expectedDate1 = dayjs(expectedTimestamp1).format('YYYY-MM-DD');
      const expectedCost1 = calculateCost(
        'gemini-pro',
        100,
        20,
        0,
        5,
        'gemini',
      );

      expect(msg1).toMatchObject({
        id: 'msg-1',
        sessionId: 'session-abc',
        provider: 'gemini',
        model: 'gemini-pro',
        inputTokens: 100,
        outputTokens: 20,
        reasoningTokens: 3,
        cacheCreationTokens: 0,
        cacheReadTokens: 5,
        date: expectedDate1,
      });
      expect(msg1.timestamp).toBe(expectedTimestamp1);
      expect(msg1.cost).toBeCloseTo(expectedCost1);

      const msg2 = messages[1];
      const expectedTimestamp2 = new Date('2024-03-01T10:02:00.000Z').getTime();
      const expectedDate2 = dayjs(expectedTimestamp2).format('YYYY-MM-DD');
      const expectedCost2 = calculateCost(
        'gemini-pro',
        150,
        30,
        0,
        10,
        'gemini',
      );

      expect(msg2).toMatchObject({
        id: 'msg-2',
        sessionId: 'session-abc',
        provider: 'gemini',
        model: 'gemini-pro',
        inputTokens: 50,
        outputTokens: 30,
        reasoningTokens: 5,
        cacheCreationTokens: 0,
        cacheReadTokens: 10,
        date: expectedDate2,
      });
      expect(msg2.timestamp).toBe(expectedTimestamp2);
      expect(msg2.cost).toBeCloseTo(expectedCost2);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });
});
