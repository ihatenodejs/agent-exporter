import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {describe, expect, it} from 'bun:test';
import dayjs from 'dayjs';

import {OpenCodeAdapter} from '../opencode';

const createOpencodeSession = (root: string): void => {
  const sessionDir = join(root, 'ses_001');
  mkdirSync(sessionDir, {recursive: true});

  const assistantMessage1 = {
    id: 'msg_assistant_1',
    role: 'assistant' as const,
    sessionID: 'ses_001',
    modelID: 'claude-3-sonnet',
    providerID: 'anthropic',
    tokens: {
      input: 1000,
      output: 80,
      reasoning: 12,
      cache: {
        write: 4,
        read: 3,
      },
    },
    cost: 1.25,
    time: {
      created: 1_700_000_000_000,
      completed: 1_700_000_100_000,
    },
  };

  const assistantMessage2 = {
    id: 'msg_assistant_2',
    role: 'assistant' as const,
    sessionID: 'ses_001',
    modelID: 'claude-3-sonnet',
    providerID: 'anthropic',
    tokens: {
      input: 1200,
      output: 100,
      reasoning: 15,
      cache: {
        write: 5,
        read: 10,
      },
    },
    cost: 1.5,
    time: {
      created: 1_700_000_200_000,
      completed: 1_700_000_300_000,
    },
  };

  const userMessage = {
    id: 'msg_user',
    role: 'user' as const,
    sessionID: 'ses_001',
    modelID: 'claude-3-sonnet',
    time: {
      created: 1_700_000_050_000,
    },
  };

  writeFileSync(
    join(sessionDir, 'msg_001.json'),
    JSON.stringify(assistantMessage1),
    'utf8',
  );
  writeFileSync(
    join(sessionDir, 'msg_002.json'),
    JSON.stringify(assistantMessage2),
    'utf8',
  );
  writeFileSync(
    join(sessionDir, 'msg_003.json'),
    JSON.stringify(userMessage),
    'utf8',
  );
};

describe('OpenCodeAdapter', () => {
  it('calculates delta input tokens and preserves cumulative costs', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'opencode-storage-'));
    try {
      createOpencodeSession(tmpRoot);

      const adapter = new OpenCodeAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(2);

      const msg1 = messages[0];
      const timestamp1 = 1_700_000_100_000;
      const expectedDate1 = dayjs(timestamp1).format('YYYY-MM-DD');

      expect(msg1).toMatchObject({
        id: 'msg_assistant_1',
        sessionId: 'ses_001',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        inputTokens: 1000,
        outputTokens: 80,
        reasoningTokens: 12,
        cacheCreationTokens: 4,
        cacheReadTokens: 3,
        cost: 1.25,
        date: expectedDate1,
      });
      expect(msg1.timestamp).toBe(timestamp1);

      const msg2 = messages[1];
      const timestamp2 = 1_700_000_300_000;
      const expectedDate2 = dayjs(timestamp2).format('YYYY-MM-DD');

      expect(msg2).toMatchObject({
        id: 'msg_assistant_2',
        sessionId: 'ses_001',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        inputTokens: 200,
        outputTokens: 100,
        reasoningTokens: 15,
        cacheCreationTokens: 5,
        cacheReadTokens: 10,
        cost: 1.5,
        date: expectedDate2,
      });
      expect(msg2.timestamp).toBe(timestamp2);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });
});
