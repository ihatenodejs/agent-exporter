import {mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {describe, expect, it} from 'bun:test';
import dayjs from 'dayjs';

import {calculateCost} from '../../core/pricing';
import {KimiCliAdapter} from '../kimi-cli';

const createKimiSession = (
  root: string,
  workdirHash: string,
  sessionUuid: string,
  contextLines: object[],
  fileTime?: Date,
): string => {
  const sessionDir = join(root, workdirHash, sessionUuid);
  mkdirSync(sessionDir, {recursive: true});

  const contextFilePath = join(sessionDir, 'context.jsonl');
  const content = contextLines.map((line) => JSON.stringify(line)).join('\n');
  writeFileSync(contextFilePath, content, 'utf8');

  if (fileTime) {
    utimesSync(contextFilePath, fileTime, fileTime);
  }

  return contextFilePath;
};

describe('KimiCliAdapter', () => {
  it('stores delta tokens and uses delta input for cost', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'kimi-sessions-'));
    const fileTime = new Date('2024-05-15T10:30:00.000Z');

    try {
      const contextLines = [
        {role: 'user', content: 'Hello'},
        {role: '_usage', token_count: 100},
        {role: 'assistant', content: 'Hi there!'},
        {role: '_usage', token_count: 150},
        {role: 'user', content: 'How are you?'},
        {role: '_usage', token_count: 200},
        {role: 'assistant', content: 'I am fine.'},
        {role: '_usage', token_count: 280},
      ];

      createKimiSession(
        tmpRoot,
        'workdir-abc123',
        'session-uuid-001',
        contextLines,
        fileTime,
      );

      const adapter = new KimiCliAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(2);
      const expectedDate = dayjs(fileTime).format('YYYY-MM-DD');

      const msg1 = messages[0];
      const expectedInputTokens1 = 100;
      const expectedOutputTokens1 = 50;

      const expectedCost1 = calculateCost(
        'kimi-for-coding',
        expectedInputTokens1, // Delta input
        expectedOutputTokens1,
        0,
        0,
        'kimi',
      );

      expect(msg1).toMatchObject({
        id: 'session-uuid-001-turn-0',
        sessionId: 'session-uuid-001',
        provider: 'kimi-cli',
        model: 'kimi-for-coding',
        inputTokens: expectedInputTokens1,
        outputTokens: expectedOutputTokens1,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        date: expectedDate,
      });
      expect(msg1.timestamp).toBe(fileTime.getTime());
      expect(msg1.cost).toBeCloseTo(expectedCost1);

      const msg2 = messages[1];
      const expectedInputTokens2 = 50;
      const expectedOutputTokens2 = 80;

      const expectedCost2 = calculateCost(
        'kimi-for-coding',
        expectedInputTokens2, // Delta input
        expectedOutputTokens2,
        0,
        0,
        'kimi',
      );

      expect(msg2).toMatchObject({
        id: 'session-uuid-001-turn-1',
        sessionId: 'session-uuid-001',
        provider: 'kimi-cli',
        model: 'kimi-for-coding',
        inputTokens: expectedInputTokens2,
        outputTokens: expectedOutputTokens2,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        date: expectedDate,
      });
      expect(msg2.timestamp).toBe(fileTime.getTime());
      expect(msg2.cost).toBeCloseTo(expectedCost2);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });

  it('handles tool messages as input tokens', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'kimi-sessions-'));
    const fileTime = new Date('2024-06-20T14:00:00.000Z');

    try {
      const contextLines = [
        {role: 'user', content: 'Run a command'},
        {role: '_usage', token_count: 50},
        {role: 'assistant', content: 'Running...'},
        {role: '_usage', token_count: 100},
        {role: 'tool', content: 'Command output'},
        {role: '_usage', token_count: 180},
        {role: 'assistant', content: 'Done!'},
        {role: '_usage', token_count: 200},
      ];

      createKimiSession(
        tmpRoot,
        'workdir-def456',
        'session-uuid-002',
        contextLines,
        fileTime,
      );

      const adapter = new KimiCliAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(2);

      // First turn: user -> assistant
      const msg1 = messages[0];
      expect(msg1.inputTokens).toBe(50); // Delta from user
      expect(msg1.outputTokens).toBe(50); // Delta from assistant

      // Second turn: tool -> assistant
      const msg2 = messages[1];
      expect(msg2.inputTokens).toBe(80); // Delta from tool
      expect(msg2.outputTokens).toBe(20); // Delta from assistant
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });

  it('handles multiple sessions across workdirs', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'kimi-sessions-'));
    const fileTime1 = new Date('2024-07-01T09:00:00.000Z');
    const fileTime2 = new Date('2024-07-02T10:00:00.000Z');

    try {
      // Session 1 in workdir 1
      createKimiSession(
        tmpRoot,
        'workdir-aaa',
        'session-001',
        [
          {role: 'user', content: 'Hello'},
          {role: '_usage', token_count: 100}, // Cumulative
          {role: 'assistant', content: 'Hi'},
          {role: '_usage', token_count: 150}, // Delta: 50
        ],
        fileTime1,
      );

      // Session 2 in workdir 2
      createKimiSession(
        tmpRoot,
        'workdir-bbb',
        'session-002',
        [
          {role: 'user', content: 'Test'},
          {role: '_usage', token_count: 200}, // Cumulative
          {role: 'assistant', content: 'Response'},
          {role: '_usage', token_count: 300}, // Delta: 100
        ],
        fileTime2,
      );

      const adapter = new KimiCliAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(2);

      messages.sort((a, b) => a.sessionId.localeCompare(b.sessionId));

      expect(messages[0].sessionId).toBe('session-001');
      expect(messages[0].inputTokens).toBe(100); // Delta
      expect(messages[0].outputTokens).toBe(50); // Delta

      expect(messages[1].sessionId).toBe('session-002');
      expect(messages[1].inputTokens).toBe(200); // Delta
      expect(messages[1].outputTokens).toBe(100); // Delta
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });

  it('skips sessions with no tokens', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'kimi-sessions-'));

    try {
      createKimiSession(tmpRoot, 'workdir-empty', 'session-empty', [
        {role: 'user', content: 'Hello'},
      ]);

      const adapter = new KimiCliAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(0);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });

  it('handles malformed lines gracefully', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'kimi-sessions-'));
    const fileTime = new Date('2024-08-10T12:00:00.000Z');

    try {
      const sessionDir = join(tmpRoot, 'workdir-mal', 'session-malformed');
      mkdirSync(sessionDir, {recursive: true});

      const contextFilePath = join(sessionDir, 'context.jsonl');
      const content = [
        JSON.stringify({role: 'user', content: 'Hello'}),
        'not valid json',
        JSON.stringify({role: '_usage', token_count: 100}),
        '{incomplete json',
        JSON.stringify({role: 'assistant', content: 'Hi'}),
        JSON.stringify({role: '_usage', token_count: 150}),
      ].join('\n');

      writeFileSync(contextFilePath, content, 'utf8');
      utimesSync(contextFilePath, fileTime, fileTime);

      const adapter = new KimiCliAdapter(tmpRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].inputTokens).toBe(100);
      expect(messages[0].outputTokens).toBe(50);
    } finally {
      rmSync(tmpRoot, {recursive: true, force: true});
    }
  });

  it('returns empty array for non-existent data path', async () => {
    const nonExistentPath = join(tmpdir(), 'non-existent-kimi-path-12345');

    const adapter = new KimiCliAdapter(nonExistentPath);
    const messages = await adapter.fetchMessages();

    expect(messages).toHaveLength(0);
  });
});
