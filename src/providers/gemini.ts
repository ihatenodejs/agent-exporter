import {existsSync} from 'fs';
import {homedir} from 'os';
import {join} from 'path';

import dayjs from 'dayjs';
import {z} from 'zod';

import {
  logProviderError,
  handleProviderError,
  ErrorSeverity,
} from '../core/error-utils';
import {getDirectories, getFiles, readJsonFile} from '../core/fs-utils';
import {validateHomeDirectoryPath} from '../core/path-validation';
import {calculateCost} from '../core/pricing';
import {type UnifiedMessage, type MessagesProviderAdapter} from '../core/types';

const GeminiMessageSchema = z.object({
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

const GeminiSessionSchema = z.object({
  sessionId: z.string(),
  projectHash: z.string(),
  startTime: z.string(),
  lastUpdated: z.string(),
  messages: z.array(GeminiMessageSchema),
});

export class GeminiAdapter implements MessagesProviderAdapter {
  name = 'gemini' as const;
  dataType = 'messages' as const;
  private readonly tmpPath: string;

  constructor(tmpPath?: string) {
    this.tmpPath = tmpPath ?? join(homedir(), '.gemini/tmp');
  }

  async fetchMessages(): Promise<UnifiedMessage[]> {
    const unifiedMessages: UnifiedMessage[] = [];

    try {
      const pathValidation = validateHomeDirectoryPath(this.tmpPath, [
        '.gemini',
      ]);

      if (!pathValidation.isValid || !pathValidation.resolvedPath) {
        throw new Error(pathValidation.error ?? 'Path validation failed');
      }

      const sessionDirs = await getDirectories(pathValidation.resolvedPath);

      for (const sessionDir of sessionDirs) {
        const sessionPath = join(pathValidation.resolvedPath, sessionDir);
        const chatsPath = join(sessionPath, 'chats');

        if (!existsSync(chatsPath)) {
          continue;
        }

        try {
          const sessionFiles = await getFiles(chatsPath, {
            prefix: 'session-',
            suffix: '.json',
          });

          for (const sessionFile of sessionFiles) {
            const sessionFilePath = join(chatsPath, sessionFile);

            try {
              const data = await readJsonFile(sessionFilePath);

              const parsed = GeminiSessionSchema.safeParse(data);
              if (!parsed.success) {
                logProviderError(
                  {
                    context: `parse session file ${sessionFile}`,
                    provider: 'gemini',
                    severity: ErrorSeverity.LOW,
                    shouldContinue: true,
                  },
                  parsed.error,
                );
                continue;
              }

              const session = parsed.data;

              let prevCumulativeInput = 0;

              for (const message of session.messages) {
                if (message.type !== 'gemini' || !message.tokens) {
                  continue;
                }

                const cumulativeInput = message.tokens.input;
                const deltaInput = cumulativeInput - prevCumulativeInput;
                const outputTokens = message.tokens.output;
                const reasoningTokens = message.tokens.thoughts ?? 0;
                const cacheCreationTokens = 0;
                const cacheReadTokens = message.tokens.cached ?? 0;

                const model = message.model ?? 'unknown';
                const cost = calculateCost(
                  model,
                  deltaInput,
                  outputTokens,
                  cacheCreationTokens,
                  cacheReadTokens,
                  'gemini',
                );

                const timestamp = new Date(message.timestamp).getTime();
                const date = dayjs(timestamp).format('YYYY-MM-DD');

                unifiedMessages.push({
                  id: message.id,
                  sessionId: session.sessionId,
                  provider: 'gemini',
                  model,
                  inputTokens: deltaInput,
                  outputTokens,
                  reasoningTokens,
                  cacheCreationTokens,
                  cacheReadTokens,
                  cost,
                  timestamp,
                  date,
                });

                prevCumulativeInput = cumulativeInput;
              }
            } catch (error) {
              logProviderError(
                {
                  context: `parse session file ${sessionFile}`,
                  provider: 'gemini',
                  severity: ErrorSeverity.LOW,
                  shouldContinue: true,
                },
                error,
              );
            }
          }
        } catch (error) {
          logProviderError(
            {
              context: `read chats directory in ${sessionDir}`,
              provider: 'gemini',
              severity: ErrorSeverity.LOW,
              shouldContinue: true,
            },
            error,
          );
        }
      }
    } catch (error: unknown) {
      const userMessage = handleProviderError(
        'gemini',
        'fetch messages',
        error,
      );
      throw new Error(userMessage);
    }

    return unifiedMessages;
  }
}
