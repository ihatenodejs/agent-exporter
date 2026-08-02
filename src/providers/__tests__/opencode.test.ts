import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {describe, expect, it, vi} from 'bun:test';
import dayjs from 'dayjs';

import {OpenCodeAdapter} from '../opencode';

const createOpencodeSession = (root: string): void => {
  const sessionDir = join(root, 'ses_001');
  mkdirSync(sessionDir, {recursive: true});

  const assistantMessage = {
    id: 'msg_assistant',
    role: 'assistant' as const,
    sessionID: 'ses_001',
    modelID: 'claude-3-sonnet',
    providerID: 'anthropic',
    tokens: {
      input: 50,
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
    JSON.stringify(assistantMessage),
    'utf8',
  );
  writeFileSync(
    join(sessionDir, 'msg_002.json'),
    JSON.stringify(userMessage),
    'utf8',
  );
};

describe('OpenCodeAdapter', () => {
  it('returns no messages when the OpenCode storage path is absent', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'opencode-storage-'));
    try {
      const adapter = new OpenCodeAdapter(join(tmpRoot, 'missing'));

      expect(await adapter.fetchMessages()).toEqual([]);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });

  it('normalizes filesystem failures for an existing non-directory path', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'opencode-storage-'));
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const messagesPath = join(tmpRoot, 'messages.json');
      writeFileSync(messagesPath, '{}', 'utf8');
      const adapter = new OpenCodeAdapter(messagesPath);

      try {
        await adapter.fetchMessages();
        throw new Error('Expected fetchMessages to reject');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('ENOTDIR');
      }
      expect(errorSpy).toHaveBeenCalledWith(
        `Failed to read messages path ${messagesPath}:`,
        expect.stringContaining('ENOTDIR'),
      );
    } finally {
      errorSpy.mockRestore();
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });

  it('reads assistant messages and preserves provided costs', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'opencode-storage-'));
    try {
      createOpencodeSession(tmpRoot);

      const adapter = new OpenCodeAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(1);
      const message = messages[0];

      const timestamp = 1_700_000_100_000;
      const expectedDate = dayjs(timestamp).format('YYYY-MM-DD');

      expect(message).toMatchObject({
        id: 'msg_assistant',
        sessionId: 'ses_001',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        inputTokens: 50,
        outputTokens: 80,
        reasoningTokens: 12,
        cacheCreationTokens: 4,
        cacheReadTokens: 3,
        cost: 1.25,
        date: expectedDate,
      });
      expect(message.timestamp).toBe(timestamp);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });
});
