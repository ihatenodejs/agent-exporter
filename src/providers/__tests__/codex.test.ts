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

  it('transforms codex JSON output into unified messages', async () => {
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

    const messages = usageEntries.flatMap((entry) => ({
      id: `codex-${entry.date}-${entry.model}`,
      sessionId: `codex-session-${entry.date}`,
      provider: entry.provider,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      reasoningTokens: entry.reasoningTokens,
      cacheCreationTokens: entry.cacheCreationTokens,
      cacheReadTokens: entry.cacheReadTokens,
      cost: entry.totalCost,
      timestamp: new Date(entry.date).getTime(),
      date: entry.date,
    }));

    expect(spawnSpy).toHaveBeenCalledWith(
      ['bunx', '@ccusage/codex@latest', '--json'],
      {stdout: 'pipe', stderr: 'pipe'},
    );

    expect(messages).toHaveLength(2);

    expect(messages[0]).toMatchObject({
      id: 'codex-2024-01-05-gpt-4.1-mini',
      sessionId: 'codex-session-2024-01-05',
      provider: 'codex',
      model: 'gpt-4.1-mini',
      inputTokens: 500,
      outputTokens: 400,
      reasoningTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 100,
      cost: (1150 / 2100) * 4.0,
      date: '2024-01-05',
    });
    expect(messages[0].timestamp).toBe(new Date('2024-01-05').getTime());

    expect(messages[1]).toMatchObject({
      id: 'codex-2024-01-05-gpt-4o',
      sessionId: 'codex-session-2024-01-05',
      provider: 'codex',
      model: 'gpt-4o',
      inputTokens: 500,
      outputTokens: 400,
      reasoningTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 100,
      cost: (950 / 2100) * 4.0,
      date: '2024-01-05',
    });
    expect(messages[1].timestamp).toBe(new Date('2024-01-05').getTime());
  });

  it('throws when the codex command exits with an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      // Mock implementation intentionally empty
    });
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
    expect(errorSpy).toHaveBeenCalled();
  });
});
