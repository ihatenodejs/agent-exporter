import {existsSync} from 'fs';
import {homedir} from 'os';
import {join} from 'path';

import dayjs from 'dayjs';
import {z} from 'zod';

import {normalizeAndLogError} from '../core/error-utils';
import {getDirectories, getFiles, readJsonFile} from '../core/fs-utils';
import {calculateCost} from '../core/pricing';
import {type UnifiedMessage, type MessagesProviderAdapter} from '../core/types';

const QwenMessageSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  tokens: z
    .object({
      input: z.number(),
      output: z.number(),
      cached: z.number().optional(),
      thoughts: z.number().optional(),
      tool: z.number().optional(),
      total: z.number().optional(),
    })
    .optional(),
  model: z.string().optional(),
});

const QwenSessionSchema = z.object({
  sessionId: z.string(),
  projectHash: z.string(),
  startTime: z.string(),
  lastUpdated: z.string(),
  messages: z.array(QwenMessageSchema),
});

export class QwenAdapter implements MessagesProviderAdapter {
  name = 'qwen' as const;
  dataType = 'messages' as const;
  private readonly tmpPath: string;

  constructor(tmpPath?: string) {
    this.tmpPath = tmpPath ?? join(homedir(), '.qwen/tmp');
  }

  async fetchMessages(): Promise<UnifiedMessage[]> {
    const unifiedMessages: UnifiedMessage[] = [];

    try {
      const sessionDirs = getDirectories(this.tmpPath);

      for (const sessionDir of sessionDirs) {
        const sessionPath = join(this.tmpPath, sessionDir);
        const chatsPath = join(sessionPath, 'chats');

        if (!existsSync(chatsPath)) {
          continue;
        }

        try {
          const sessionFiles = getFiles(chatsPath, {
            prefix: 'session-',
            suffix: '.json',
          });

          for (const sessionFile of sessionFiles) {
            const sessionFilePath = join(chatsPath, sessionFile);

            try {
              const data = await readJsonFile(sessionFilePath);

              const parsed = QwenSessionSchema.safeParse(data);
              if (!parsed.success) {
                console.warn(
                  `Failed to parse session file ${sessionFile}:`,
                  parsed.error,
                );
                continue;
              }

              const session = parsed.data;

              for (const message of session.messages) {
                if (message.type !== 'qwen' || !message.tokens) {
                  continue;
                }

                const inputTokens = message.tokens.input;
                const outputTokens = message.tokens.output;
                const reasoningTokens = message.tokens.thoughts ?? 0;
                const cacheCreationTokens = 0;
                const cacheReadTokens = message.tokens.cached ?? 0;

                const model = message.model ?? 'unknown';
                const cost = calculateCost(
                  model,
                  inputTokens,
                  outputTokens,
                  cacheCreationTokens,
                  cacheReadTokens,
                  'qwen',
                );

                const timestamp = new Date(message.timestamp).getTime();
                const date = dayjs(timestamp).format('YYYY-MM-DD');

                unifiedMessages.push({
                  id: message.id,
                  sessionId: session.sessionId,
                  provider: 'qwen',
                  model,
                  inputTokens,
                  outputTokens,
                  reasoningTokens,
                  cacheCreationTokens,
                  cacheReadTokens,
                  cost,
                  timestamp,
                  date,
                });
              }
            } catch (error) {
              console.warn(
                `Failed to parse session file ${sessionFile}:`,
                error,
              );
            }
          }
        } catch (error) {
          console.warn(
            `Failed to read chats directory in ${sessionDir}:`,
            error,
          );
        }
      }
    } catch (error: unknown) {
      throw normalizeAndLogError(`to read tmp path ${this.tmpPath}`, error);
    }

    return unifiedMessages;
  }
}
