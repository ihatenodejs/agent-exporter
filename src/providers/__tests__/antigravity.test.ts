import {mkdtempSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import {Database} from 'bun:sqlite';
import {describe, expect, it, spyOn} from 'bun:test';
import dayjs from 'dayjs';

import {AntigravityAdapter} from '../antigravity';

const utf8 = new TextEncoder();

const varint = (value: number): number[] => {
  const bytes: number[] = [];
  do {
    const byte = value & 0x7f;
    value = Math.floor(value / 128);
    bytes.push(value === 0 ? byte : byte | 0x80);
  } while (value !== 0);
  return bytes;
};

const field = (
  number: number,
  value: number | string | Uint8Array,
): number[] => {
  if (typeof value === 'number')
    return [...varint(number << 3), ...varint(value)];
  const bytes = typeof value === 'string' ? utf8.encode(value) : value;
  return [...varint((number << 3) | 2), ...varint(bytes.length), ...bytes];
};

const blob = (...fields: number[][]): Uint8Array =>
  Uint8Array.from(fields.flat());
const timestamp = (seconds: number, nanos = 0): Uint8Array =>
  blob(field(1, seconds), field(2, nanos));

const usage = (options: {
  modelId?: string;
  input?: number;
  output?: number;
  cacheWrite?: number;
  cacheRead?: number;
  thinking?: number;
  response?: number;
  responseId?: string;
  providerMessageId?: string;
  messageId?: string;
}): Uint8Array =>
  blob(
    field(1, options.modelId ?? '42'),
    field(2, options.input ?? 0),
    field(3, options.output ?? 0),
    field(4, options.cacheWrite ?? 0),
    field(5, options.cacheRead ?? 0),
    field(9, options.thinking ?? 0),
    field(10, options.response ?? 0),
    ...(options.responseId ? [field(11, options.responseId)] : []),
    ...(options.providerMessageId
      ? [field(12, options.providerMessageId)]
      : []),
    ...(options.messageId ? [field(7, options.messageId)] : []),
  );

const step = (
  createdAt: Uint8Array | undefined,
  primary: Uint8Array,
  retries: Uint8Array[] = [],
): Uint8Array =>
  blob(
    ...(createdAt ? [field(1, createdAt)] : []),
    field(9, primary),
    ...retries.map((retry) => field(28, blob(field(2, retry)))),
  );

const genMetadata = (
  model: string,
  requestTime: Uint8Array,
  primary: Uint8Array,
  retries: Uint8Array[] = [],
): Uint8Array => {
  const chat = blob(
    field(4, primary),
    ...retries.map((retry) => field(17, retry)),
    field(19, model),
    field(9, blob(field(4, requestTime))),
  );
  return blob(field(2, Uint8Array.from([0xff, 0xff])), field(1, chat));
};

const createDatabase = (root: string, name: string): Database => {
  const database = new Database(join(root, name));
  database.run('CREATE TABLE steps (idx INTEGER, metadata BLOB)');
  database.run('CREATE TABLE gen_metadata (data BLOB)');
  return database;
};

describe('AntigravityAdapter', () => {
  it('normalizes named step usage with every token bucket and joined model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'antigravity-adapter-'));
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const database = createDatabase(root, 'conversation-123.db');
      const usedAt = 1_710_000_000;
      const invocation = usage({
        input: 10,
        output: 20,
        cacheWrite: 3,
        cacheRead: 5,
        responseId: 'response-1',
      });
      database
        .prepare('INSERT INTO steps VALUES (?, ?)')
        .run(1, step(timestamp(usedAt), invocation));
      database
        .prepare('INSERT INTO gen_metadata VALUES (?)')
        .run(genMetadata('gemini-3.6-flash', timestamp(usedAt), invocation));
      database.close();

      const messages = await new AntigravityAdapter(root).fetchMessages();
      const expectedTimestamp = usedAt * 1_000;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        id: 'response-1',
        sessionId: 'conversation-123',
        provider: 'antigravity',
        model: 'gemini-3.6-flash',
        inputTokens: 10,
        outputTokens: 20,
        reasoningTokens: 0,
        cacheCreationTokens: 3,
        cacheReadTokens: 5,
        timestamp: expectedTimestamp,
        date: dayjs(expectedTimestamp).format('YYYY-MM-DD'),
      });
      expect(messages[0]?.cost).toBeCloseTo(0.00016575, 10);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      rmSync(root, {recursive: true, force: true});
      warn.mockRestore();
    }
  });

  it('uses thinking plus response when total output is absent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'antigravity-adapter-'));
    try {
      const database = createDatabase(root, 'split.db');
      database
        .prepare('INSERT INTO steps VALUES (?, ?)')
        .run(
          1,
          step(
            timestamp(1_710_000_000),
            usage({thinking: 7, response: 11, messageId: 'split'}),
            [usage({input: 2, output: 3, messageId: 'retry'})],
          ),
        );
      database.close();
      const messages = await new AntigravityAdapter(root).fetchMessages();

      expect(messages).toHaveLength(2);
      expect(
        messages.find((message) => message.id === 'split')?.outputTokens,
      ).toBe(18);
      expect(
        messages.find((message) => message.id === 'split')?.reasoningTokens,
      ).toBe(7);
      expect(
        messages.find((message) => message.id === 'retry')?.outputTokens,
      ).toBe(3);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('suppresses gen metadata duplicates while retaining gen-only invocations', async () => {
    const root = mkdtempSync(join(tmpdir(), 'antigravity-adapter-'));
    try {
      const database = createDatabase(root, 'dedupe.db');
      const usedAt = 1_710_000_000;
      const duplicate = usage({input: 2, output: 3, responseId: 'duplicate'});
      const retained = usage({
        input: 5,
        output: 8,
        providerMessageId: 'gen-only',
      });
      database
        .prepare('INSERT INTO steps VALUES (?, ?)')
        .run(1, step(timestamp(usedAt), duplicate));
      database
        .prepare('INSERT INTO gen_metadata VALUES (?)')
        .run(genMetadata('named-model', timestamp(usedAt), duplicate));
      database
        .prepare('INSERT INTO gen_metadata VALUES (?)')
        .run(genMetadata('retained-model', timestamp(usedAt), retained));
      database.close();

      const messages = await new AntigravityAdapter(root).fetchMessages();
      expect(messages).toHaveLength(2);
      expect(messages.map((message) => message.id).sort()).toEqual([
        'duplicate',
        'gen-only',
      ]);
      expect(
        messages.find((message) => message.id === 'duplicate')?.model,
      ).toBe('named-model');
      expect(messages.find((message) => message.id === 'gen-only')?.model).toBe(
        'retained-model',
      );
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('returns no messages when the conversations directory is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'antigravity-adapter-'));
    try {
      rmSync(root, {recursive: true, force: true});

      expect(await new AntigravityAdapter(root).fetchMessages()).toEqual([]);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('skips malformed, unreadable, zero-token, and untimestamped rows without losing another database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'antigravity-adapter-'));
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const invalid = createDatabase(root, 'invalid.db');
      invalid
        .prepare('INSERT INTO steps VALUES (?, ?)')
        .run(1, Uint8Array.from([0x09]));
      invalid
        .prepare('INSERT INTO steps VALUES (?, ?)')
        .run(2, step(timestamp(1_710_000_000), usage({messageId: 'zero'})));
      invalid
        .prepare('INSERT INTO steps VALUES (?, ?)')
        .run(3, step(undefined, usage({input: 1, messageId: 'untimestamped'})));
      invalid.close();
      new Database(join(root, 'unreadable.db')).close();
      const valid = createDatabase(root, 'valid.db');
      valid
        .prepare('INSERT INTO steps VALUES (?, ?)')
        .run(
          1,
          step(timestamp(1_710_000_000), usage({input: 1, messageId: 'valid'})),
        );
      valid.close();

      const messages = await new AntigravityAdapter(root).fetchMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]?.id).toBe('valid');
      expect(warn).toHaveBeenCalledWith(
        `Failed to parse Antigravity metadata in ${join(root, 'invalid.db')}`,
      );
      expect(error).toHaveBeenCalledWith(
        `Failed to import Antigravity database ${join(root, 'unreadable.db')}:`,
        expect.any(String),
      );
    } finally {
      error.mockRestore();
      warn.mockRestore();
      rmSync(root, {recursive: true, force: true});
    }
  });
  it('silently skips a database removed after discovery and syncs others', async () => {
    const root = mkdtempSync(join(tmpdir(), 'antigravity-adapter-'));
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    const vanishedPath = join(root, 'vanished.db');
    try {
      new Database(vanishedPath).close();
      const valid = createDatabase(root, 'valid.db');
      valid
        .prepare('INSERT INTO steps VALUES (?, ?)')
        .run(
          1,
          step(timestamp(1_710_000_000), usage({input: 1, messageId: 'valid'})),
        );
      valid.close();

      class DeletingAdapter extends AntigravityAdapter {
        protected override openDatabase(databasePath: string): Database {
          if (databasePath === vanishedPath) {
            rmSync(databasePath);
          }
          return super.openDatabase(databasePath);
        }
      }

      const messages = await new DeletingAdapter(root).fetchMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]?.id).toBe('valid');
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      rmSync(root, {recursive: true, force: true});
    }
  });
  it('silently skips an existing database SQLite cannot open', async () => {
    const root = mkdtempSync(join(tmpdir(), 'antigravity-adapter-'));
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    const unavailablePath = join(root, 'unavailable.db');
    try {
      createDatabase(root, 'unavailable.db').close();
      const valid = createDatabase(root, 'valid.db');
      valid
        .prepare('INSERT INTO steps VALUES (?, ?)')
        .run(
          1,
          step(timestamp(1_710_000_000), usage({input: 1, messageId: 'valid'})),
        );
      valid.close();

      class CannotOpenAdapter extends AntigravityAdapter {
        protected override openDatabase(databasePath: string): Database {
          if (databasePath === unavailablePath) {
            throw Object.assign(new Error('unable to open database file'), {
              code: 'SQLITE_CANTOPEN',
            });
          }
          return super.openDatabase(databasePath);
        }
      }

      const messages = await new CannotOpenAdapter(root).fetchMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]?.id).toBe('valid');
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      rmSync(root, {recursive: true, force: true});
    }
  });
});
