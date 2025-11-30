import {existsSync, statSync} from 'fs';
import {readFile} from 'fs/promises';
import {homedir} from 'os';
import {join} from 'path';

import dayjs from 'dayjs';
import {z} from 'zod';

import {handleProviderError} from '../core/error-utils';
import {getDirectories} from '../core/fs-utils';
import {validateHomeDirectoryPath} from '../core/path-validation';
import {calculateCost} from '../core/pricing';
import {type UnifiedMessage, type MessagesProviderAdapter} from '../core/types';

interface KimiContextLine {
  role: string;
  token_count?: number;
}

const KimiConfigSchema = z.object({
  default_model: z.string().optional(),
  models: z.record(z.string(), z.unknown()).optional(),
});

export class KimiCliAdapter implements MessagesProviderAdapter {
  name = 'kimi-cli' as const;
  dataType = 'messages' as const;
  private readonly dataPath: string;
  private readonly configPath: string;

  constructor(dataPath?: string, configPath?: string) {
    const kimiHome = join(homedir(), '.kimi');
    this.dataPath = dataPath ?? join(kimiHome, 'sessions');
    this.configPath = configPath ?? join(kimiHome, 'config.json');
  }

  /**
   * Read the default model from Kimi CLI config.json
   * Falls back to 'kimi-for-coding' if config is not found or invalid
   */
  private async getDefaultModel(): Promise<string> {
    try {
      if (!existsSync(this.configPath)) {
        return 'kimi-for-coding';
      }

      const configContent = await readFile(this.configPath, 'utf-8');
      const configData: unknown = JSON.parse(configContent);
      const parsed = KimiConfigSchema.safeParse(configData);

      if (parsed.success && parsed.data.default_model) {
        return parsed.data.default_model;
      }

      return 'kimi-for-coding';
    } catch {
      return 'kimi-for-coding';
    }
  }

  async fetchMessages(): Promise<UnifiedMessage[]> {
    const unifiedMessages: UnifiedMessage[] = [];
    const model = await this.getDefaultModel();

    try {
      const pathValidation = validateHomeDirectoryPath(this.dataPath, [
        '.kimi',
      ]);

      if (!pathValidation.isValid || !pathValidation.resolvedPath) {
        throw new Error(pathValidation.error ?? 'Path validation failed');
      }

      const workdirDirs = await getDirectories(pathValidation.resolvedPath);

      for (const workdirDir of workdirDirs) {
        const workdirPath = join(pathValidation.resolvedPath, workdirDir);

        try {
          const sessionDirs = await getDirectories(workdirPath);

          for (const sessionDir of sessionDirs) {
            const sessionPath = join(workdirPath, sessionDir);
            const contextFilePath = join(sessionPath, 'context.jsonl');

            try {
              const fileContent = await readFile(contextFilePath, 'utf-8');
              const lines = fileContent.trim().split('\n');

              const stats = statSync(contextFilePath);
              const timestamp = stats.mtimeMs;
              const date = dayjs(timestamp).format('YYYY-MM-DD');

              let prevTokenCount = 0;
              let prevRole: 'user' | 'assistant' | 'tool' | null = null;
              let turnNumber = 0;
              let turnInputTokensDelta = 0;
              let turnOutputTokens = 0;

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  const parsed = JSON.parse(line) as KimiContextLine;

                  if (parsed.role === '_usage' && parsed.token_count) {
                    const delta = parsed.token_count - prevTokenCount;
                    prevTokenCount = parsed.token_count;

                    if (prevRole === 'assistant') {
                      turnOutputTokens += delta;

                      if (turnInputTokensDelta > 0 || turnOutputTokens > 0) {
                        const cost = calculateCost(
                          model,
                          turnInputTokensDelta,
                          turnOutputTokens,
                          0, // cacheCreationTokens
                          0, // cacheReadTokens
                          'kimi',
                        );

                        unifiedMessages.push({
                          id: `${sessionDir}-turn-${turnNumber}`,
                          sessionId: sessionDir,
                          provider: this.name,
                          model,
                          inputTokens: turnInputTokensDelta,
                          outputTokens: turnOutputTokens,
                          reasoningTokens: 0,
                          cacheCreationTokens: 0,
                          cacheReadTokens: 0,
                          cost,
                          timestamp,
                          date,
                        });

                        turnNumber++;
                        turnInputTokensDelta = 0;
                        turnOutputTokens = 0;
                      }
                    } else if (prevRole === 'user' || prevRole === 'tool') {
                      turnInputTokensDelta += delta;
                    }
                    prevRole = null;
                  } else if (
                    parsed.role === 'user' ||
                    parsed.role === 'assistant' ||
                    parsed.role === 'tool'
                  ) {
                    prevRole = parsed.role;
                  }
                } catch (lineError: unknown) {
                  const errorMessage = handleProviderError(
                    'kimi-cli',
                    `parse context.jsonl line in session ${sessionDir}`,
                    lineError,
                  );
                  if (errorMessage) {
                    console.error(errorMessage);
                  }
                }
              }
            } catch (fileError: unknown) {
              const errorMessage = handleProviderError(
                'kimi-cli',
                `read context.jsonl in session ${sessionDir}`,
                fileError,
              );
              if (errorMessage) {
                console.error(errorMessage);
              }
            }
          }
        } catch (dirError: unknown) {
          const errorMessage = handleProviderError(
            'kimi-cli',
            `read workdir directory ${workdirDir}`,
            dirError,
          );
          if (errorMessage) {
            console.error(errorMessage);
          }
        }
      }
    } catch (error: unknown) {
      const userMessage = handleProviderError(
        'kimi-cli',
        'fetch messages',
        error,
      );
      throw new Error(userMessage);
    }

    return unifiedMessages;
  }
}
