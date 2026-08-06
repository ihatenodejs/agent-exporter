import {existsSync, readdirSync} from 'fs';
import {homedir} from 'os';
import {join, parse} from 'path';

import {Database} from 'bun:sqlite';
import dayjs from 'dayjs';

import {normalizeAndLogError} from '../core/error-utils';
import {calculateCost} from '../core/pricing';
import {type MessagesProviderAdapter, type UnifiedMessage} from '../core/types';

type WireValue = number | Uint8Array;

interface WireField {
  readonly number: number;
  readonly wireType: number;
  readonly value: WireValue;
}

interface Usage {
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
  readonly identity?: string;
}

interface Invocation {
  readonly usage: Usage;
  readonly timestamp?: number;
  readonly model?: string;
  readonly sourceIndex: number;
  readonly usageIndex: number;
}

const decoder = new TextDecoder();

function readVarint(
  data: Uint8Array,
  offset: number,
): [number, number] | undefined {
  let value = 0;
  let multiplier = 1;

  for (let index = 0; index < 10; index += 1) {
    const byte = data.at(offset + index);
    if (byte === undefined || (index === 9 && byte > 1)) return undefined;

    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) {
      return Number.isSafeInteger(value)
        ? [value, offset + index + 1]
        : undefined;
    }
    multiplier *= 128;
  }

  return undefined;
}

function readFields(data: Uint8Array): WireField[] | undefined {
  const fields: WireField[] = [];
  let offset = 0;

  while (offset < data.length) {
    const tag = readVarint(data, offset);
    if (!tag) return undefined;
    const [rawTag, tagEnd] = tag;
    const number = Math.floor(rawTag / 8);
    const wireType = rawTag % 8;
    if (
      number === 0 ||
      number > 0x1fffffff ||
      wireType === 3 ||
      wireType === 4 ||
      wireType > 5
    )
      return undefined;
    offset = tagEnd;

    if (wireType === 0) {
      const value = readVarint(data, offset);
      if (!value) return undefined;
      fields.push({number, wireType, value: value[0]});
      offset = value[1];
      continue;
    }

    const width = wireType === 1 ? 8 : wireType === 5 ? 4 : undefined;
    if (width !== undefined) {
      if (offset + width > data.length) return undefined;
      fields.push({
        number,
        wireType,
        value: data.slice(offset, offset + width),
      });
      offset += width;
      continue;
    }

    const length = readVarint(data, offset);
    if (!length) return undefined;
    const end = length[1] + length[0];
    if (end > data.length) return undefined;
    fields.push({number, wireType, value: data.slice(length[1], end)});
    offset = end;
  }

  return fields;
}

function bytes(field: WireField | undefined): Uint8Array | undefined {
  return field?.value instanceof Uint8Array ? field.value : undefined;
}

function text(field: WireField | undefined): string | undefined {
  const value = bytes(field);
  if (!value) return undefined;
  const decoded = decoder.decode(value);
  return decoded.length > 0 ? decoded : undefined;
}

function numberValue(field: WireField | undefined): number {
  return typeof field?.value === 'number' ? field.value : 0;
}

function nested(field: WireField | undefined): WireField[] | undefined {
  const value = bytes(field);
  return value ? readFields(value) : undefined;
}

function timestampFrom(fields: readonly WireField[]): number | undefined {
  const seconds = numberValue(fields.find((field) => field.number === 1));
  const nanos = numberValue(fields.find((field) => field.number === 2));
  if (seconds <= 0 || nanos >= 1_000_000_000) return undefined;
  return seconds * 1_000 + Math.floor(nanos / 1_000_000);
}

function parseUsage(data: Uint8Array): Usage | undefined {
  const fields = readFields(data);
  if (!fields) return undefined;

  const totalOutput = numberValue(fields.find((field) => field.number === 3));
  const thinkingOutput = numberValue(
    fields.find((field) => field.number === 9),
  );
  const responseOutput = numberValue(
    fields.find((field) => field.number === 10),
  );
  const identity = [11, 12, 7]
    .map((number) => text(fields.find((field) => field.number === number)))
    .find((value) => value !== undefined);

  return {
    modelId: text(fields.find((field) => field.number === 1)) ?? 'unknown',
    inputTokens: numberValue(fields.find((field) => field.number === 2)),
    outputTokens:
      totalOutput === 0 ? thinkingOutput + responseOutput : totalOutput,
    reasoningTokens: thinkingOutput,
    cacheCreationTokens: numberValue(
      fields.find((field) => field.number === 4),
    ),
    cacheReadTokens: numberValue(fields.find((field) => field.number === 5)),
    identity,
  };
}

function parseStepInvocations(
  data: Uint8Array,
  sourceIndex: number,
): Invocation[] | undefined {
  const fields = readFields(data);
  if (!fields) return undefined;
  const timestamp =
    timestampFrom(nested(fields.find((field) => field.number === 1)) ?? []) ??
    timestampFrom(nested(fields.find((field) => field.number === 32)) ?? []);
  const invocations: Invocation[] = [];

  const primary = bytes(fields.find((field) => field.number === 9));
  if (primary) {
    const usage = parseUsage(primary);
    if (usage) invocations.push({usage, timestamp, sourceIndex, usageIndex: 0});
  }

  let usageIndex = invocations.length;
  for (const retry of fields.filter((field) => field.number === 28)) {
    const retryFields = nested(retry);
    const usageBlob = retryFields
      ? bytes(retryFields.find((field) => field.number === 2))
      : undefined;
    if (!usageBlob) continue;
    const usage = parseUsage(usageBlob);
    if (usage)
      invocations.push({
        usage,
        timestamp,
        sourceIndex,
        usageIndex: usageIndex++,
      });
  }

  return invocations;
}

function parseChatMetadata(
  data: Uint8Array,
  sourceIndex: number,
): Invocation[] | undefined {
  const fields = readFields(data);
  if (!fields) return undefined;
  const model = text(fields.find((field) => field.number === 19));
  const timestamp = timestampFrom(
    nested(
      nested(fields.find((field) => field.number === 9))?.find(
        (field) => field.number === 4,
      ),
    ) ?? [],
  );
  if (!model) return [];

  const invocations: Invocation[] = [];
  const usageFields = [
    ...fields.filter((field) => field.number === 4),
    ...fields.filter((field) => field.number === 17),
  ];
  for (const [usageIndex, usageField] of usageFields.entries()) {
    const usageBlob = bytes(usageField);
    if (!usageBlob) continue;
    const usage = parseUsage(usageBlob);
    if (usage?.identity) {
      invocations.push({usage, timestamp, model, sourceIndex, usageIndex});
    }
  }
  return invocations;
}

function parseGenInvocations(
  data: Uint8Array,
  sourceIndex: number,
): Invocation[] | undefined {
  const fields = readFields(data);
  if (!fields) return undefined;
  const invocations: Invocation[] = [];
  for (const field of fields) {
    const wrapper = bytes(field);
    if (!wrapper) continue;
    const parsed = parseChatMetadata(wrapper, sourceIndex);
    if (parsed) invocations.push(...parsed);
  }
  return invocations;
}

function isTokenBearing(usage: Usage): boolean {
  return (
    usage.inputTokens !== 0 ||
    usage.outputTokens !== 0 ||
    usage.cacheCreationTokens !== 0 ||
    usage.cacheReadTokens !== 0
  );
}

export class AntigravityAdapter implements MessagesProviderAdapter {
  name = 'antigravity' as const;
  dataType = 'messages' as const;
  private readonly conversationsPath: string;

  constructor(conversationsPath?: string) {
    this.conversationsPath =
      conversationsPath ??
      join(homedir(), '.gemini/antigravity-cli/conversations');
  }

  fetchMessages(): Promise<UnifiedMessage[]> {
    if (!existsSync(this.conversationsPath)) {
      return Promise.resolve([]);
    }

    let databaseNames: string[];
    try {
      databaseNames = readdirSync(this.conversationsPath, {withFileTypes: true})
        .filter((entry) => entry.isFile() && entry.name.endsWith('.db'))
        .map((entry) => entry.name);
    } catch (error: unknown) {
      throw normalizeAndLogError(
        `to read conversations path ${this.conversationsPath}`,
        error,
      );
    }

    const messages: UnifiedMessage[] = [];
    const seenIdentities = new Set<string>();

    for (const databaseName of databaseNames) {
      const databasePath = join(this.conversationsPath, databaseName);
      const sessionId = parse(databaseName).name;
      let database: Database | undefined;
      try {
        database = new Database(databasePath, {readonly: true});
        const genRows = database
          .query<{data: Uint8Array}, []>('SELECT data FROM gen_metadata')
          .all();
        const genInvocations: Invocation[] = [];
        for (const [rowIndex, row] of genRows.entries()) {
          const parsed = parseGenInvocations(row.data, rowIndex);
          if (!parsed) {
            console.warn(
              `Failed to parse Antigravity metadata in ${databasePath}`,
            );
            continue;
          }
          genInvocations.push(...parsed);
        }
        const modelsByIdentity = new Map(
          genInvocations.flatMap((invocation) =>
            invocation.usage.identity && invocation.model
              ? [[invocation.usage.identity, invocation.model] as const]
              : [],
          ),
        );
        const stepRows = database
          .query<{metadata: Uint8Array}, []>(
            'SELECT metadata FROM steps ORDER BY idx',
          )
          .all();
        const stepInvocations: Invocation[] = [];
        for (const [rowIndex, row] of stepRows.entries()) {
          const parsed = parseStepInvocations(row.metadata, rowIndex);
          if (!parsed) {
            console.warn(
              `Failed to parse Antigravity metadata in ${databasePath}`,
            );
            continue;
          }
          stepInvocations.push(...parsed);
        }

        for (const invocation of [...stepInvocations, ...genInvocations]) {
          const {usage, timestamp} = invocation;
          if (!timestamp || !isTokenBearing(usage)) continue;
          if (usage.identity && seenIdentities.has(usage.identity)) continue;
          if (usage.identity) seenIdentities.add(usage.identity);

          const model =
            modelsByIdentity.get(usage.identity ?? '') ??
            invocation.model ??
            `antigravity-model-${usage.modelId}`;
          messages.push({
            id:
              usage.identity ??
              `${sessionId}-${invocation.sourceIndex}-${invocation.usageIndex}`,
            sessionId,
            provider: 'antigravity',
            model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            reasoningTokens: usage.reasoningTokens,
            cacheCreationTokens: usage.cacheCreationTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cost: calculateCost(
              model,
              usage.inputTokens,
              usage.outputTokens,
              usage.cacheCreationTokens,
              usage.cacheReadTokens,
              'antigravity',
            ),
            timestamp,
            date: dayjs(timestamp).format('YYYY-MM-DD'),
          });
        }
      } catch (error: unknown) {
        normalizeAndLogError(
          `to import Antigravity database ${databasePath}`,
          error,
        );
      } finally {
        database?.close();
      }
    }

    return Promise.resolve(messages);
  }
}
