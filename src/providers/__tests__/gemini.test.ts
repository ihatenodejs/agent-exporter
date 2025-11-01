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
          input: 10,
          output: 20,
          cached: 5,
          thoughts: 3,
        },
        model: 'gemini-pro',
      },
      {
        id: 'msg-2',
        timestamp: '2024-03-01T10:02:00.000Z',
        type: 'analysis',
        tokens: {
          input: 5,
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
  it('reads Gemini tmp data and normalizes assistant messages', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'gemini-adapter-'));
    try {
      const sessionFile = createGeminiSession(tmpRoot);
      expect(sessionFile).toBeTruthy();

      const adapter = new GeminiAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(1);
      const message = messages[0];

      const expectedTimestamp = new Date('2024-03-01T10:00:00.000Z').getTime();
      const expectedDate = dayjs(expectedTimestamp).format('YYYY-MM-DD');
      const expectedCost = calculateCost('gemini-pro', 10, 20, 0, 5, 'gemini');

      expect(message).toMatchObject({
        id: 'msg-1',
        sessionId: 'session-abc',
        provider: 'gemini',
        model: 'gemini-pro',
        inputTokens: 10,
        outputTokens: 20,
        reasoningTokens: 3,
        cacheCreationTokens: 0,
        cacheReadTokens: 5,
        date: expectedDate,
      });
      expect(message.timestamp).toBe(expectedTimestamp);
      expect(message.cost).toBeCloseTo(expectedCost);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });
});
