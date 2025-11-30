import {afterEach, describe, expect, it, vi} from 'bun:test';

import {CodexAdapter} from '../codex';

const encoder = new TextEncoder();

const createStream = (text: string): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });

describe('CodexAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('transforms codex JSON output into usage entries', async () => {
    const payload = {
      daily: [
        {
          date: 'Jan 05, 2024',
          inputTokens: 1200,
          cachedInputTokens: 200,
          outputTokens: 800,
          reasoningOutputTokens: 100,
          totalTokens: 2100,
          costUSD: 4.0,
          models: {
            'gpt-4.1-mini': {
              inputTokens: 600,
              cachedInputTokens: 100,
              outputTokens: 400,
              reasoningOutputTokens: 50,
              totalTokens: 1150,
              isFallback: false,
            },
            'gpt-4o': {
              inputTokens: 600,
              cachedInputTokens: 100,
              outputTokens: 400,
              reasoningOutputTokens: 50,
              totalTokens: 950,
              isFallback: false,
            },
          },
        },
      ],
      totals: {
        inputTokens: 1200,
        cachedInputTokens: 200,
        outputTokens: 800,
        reasoningOutputTokens: 100,
        totalTokens: 2100,
        costUSD: 4.0,
      },
    };

    const spawnSpy = vi.spyOn(Bun, 'spawn').mockImplementation(() => {
      return {
        stdout: createStream(JSON.stringify(payload)),
        stderr: createStream(''),
        exited: Promise.resolve(0),
      } as unknown as ReturnType<typeof Bun.spawn>;
    });

    const adapter = new CodexAdapter();
    const usageEntries = await adapter.fetchUsageEntries();

    expect(spawnSpy).toHaveBeenCalledWith(
      ['bunx', '@ccusage/codex@latest', '--json'],
      {stdout: 'pipe', stderr: 'pipe'},
    );

    expect(usageEntries).toHaveLength(2);

    expect(usageEntries[0]).toMatchObject({
      date: '2024-01-05',
      provider: 'codex',
      model: 'gpt-4.1-mini',
      inputTokens: 500,
      outputTokens: 400,
      reasoningTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 100,
      totalCost: (1150 / 2100) * 4.0,
      entryCount: 1,
    });

    expect(usageEntries[1]).toMatchObject({
      date: '2024-01-05',
      provider: 'codex',
      model: 'gpt-4o',
      inputTokens: 500,
      outputTokens: 400,
      reasoningTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 100,
      totalCost: (950 / 2100) * 4.0,
      entryCount: 1,
    });
  });

  it('throws when the codex command exits with an error', async () => {
    const spawnSpy = vi.spyOn(Bun, 'spawn').mockImplementation(() => {
      return {
        stdout: createStream(''),
        stderr: createStream('unexpected failure'),
        exited: Promise.resolve(1),
      } as unknown as ReturnType<typeof Bun.spawn>;
    });

    const adapter = new CodexAdapter();

    let errorThrown = false;
    try {
      await adapter.fetchUsageEntries();
    } catch (error) {
      errorThrown = true;
      expect((error as Error).message).toMatch(
        /bunx command failed with exit code 1/,
      );
    }

    expect(errorThrown).toBe(true);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });
});
