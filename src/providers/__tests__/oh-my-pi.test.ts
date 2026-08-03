import {copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {describe, expect, it, mock} from 'bun:test';

import {OhMyPiAdapter} from '../oh-my-pi';

const fixturePath = join(import.meta.dir, 'fixtures', 'oh-my-pi-session.jsonl');

await mock.module('@oh-my-pi/pi-catalog/models.json', () => ({
  default: {
    'google-antigravity': {
      'gemini-3.6-flash': {
        cost: {input: 3, output: 4.5, cacheRead: 1.65, cacheWrite: 0},
      },
    },
  },
}));

const createOhMyPiSession = (root: string): void => {
  const sessionDirectory = join(root, '-fixture');
  const sessionFile = '2023-11-14_omp-session-1.jsonl';

  mkdirSync(join(sessionDirectory, 'artifact'), {recursive: true});
  copyFileSync(fixturePath, join(sessionDirectory, sessionFile));
  copyFileSync(fixturePath, join(sessionDirectory, 'artifact', sessionFile));
};

const createZeroCostCatalogSession = (root: string): void => {
  const sessionDirectory = join(root, '-catalog');
  mkdirSync(sessionDirectory, {recursive: true});
  writeFileSync(
    join(sessionDirectory, '2023-11-14_omp-catalog-1.jsonl'),
    [
      '{"type":"session","id":"omp-catalog-1"}',
      '{"type":"message","id":"omp-catalog-message-1","timestamp":"2023-11-14T22:13:20.000Z","message":{"role":"assistant","provider":"google-antigravity","model":"gemini-3.6-flash","timestamp":1700000000000,"usage":{"input":1000000,"output":1000000,"cacheWrite":0,"cacheRead":1000000,"totalTokens":3000000,"cost":{"total":0}}}}',
    ].join('\n'),
  );
};

describe('OhMyPiAdapter', () => {
  it('returns no messages when the sessions root is absent', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'oh-my-pi-sessions-'));
    try {
      const adapter = new OhMyPiAdapter(join(tempRoot, 'missing'));

      expect(await adapter.fetchMessages()).toEqual([]);
    } finally {
      rmSync(tempRoot, {recursive: true, force: true});
    }
  });

  it('reads top-level assistant messages from session JSONL files', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'oh-my-pi-sessions-'));
    try {
      createOhMyPiSession(tempRoot);

      const adapter = new OhMyPiAdapter(tempRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        id: 'omp-message-1',
        sessionId: 'omp-session-1',
        provider: 'oh-my-pi',
        model: 'claude-sonnet-4-5',
        inputTokens: 120,
        outputTokens: 240,
        reasoningTokens: 0,
        cacheCreationTokens: 30,
        cacheReadTokens: 10,
        cost: 4.2,
        timestamp: 1_700_000_000_000,
        date: '2023-11-14',
      });
    } finally {
      rmSync(tempRoot, {recursive: true, force: true});
    }
  });

  it('prices zero-cost assistant entries from the Oh My Pi catalog', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'oh-my-pi-sessions-'));
    try {
      createZeroCostCatalogSession(tempRoot);

      const adapter = new OhMyPiAdapter(tempRoot);
      const messages = await adapter.fetchMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]?.cost).toBe(9.15);
    } finally {
      rmSync(tempRoot, {recursive: true, force: true});
    }
  });
});
