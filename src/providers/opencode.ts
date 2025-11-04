import {homedir} from 'os';
import {join} from 'path';

import dayjs from 'dayjs';

import {normalizeAndLogError} from '../core/error-utils';
import {getDirectories, getFiles, readJsonFile} from '../core/fs-utils';
import {calculateCost} from '../core/pricing';
import {
  MessageSchema,
  type UnifiedMessage,
  type MessagesProviderAdapter,
} from '../core/types';

export class OpenCodeAdapter implements MessagesProviderAdapter {
  name = 'opencode' as const;
  dataType = 'messages' as const;
  private readonly messagesPath: string;

  constructor(messagesPath?: string) {
    this.messagesPath =
      messagesPath ?? join(homedir(), '.local/share/opencode/storage/message');
  }

  async fetchMessages(): Promise<UnifiedMessage[]> {
    const unifiedMessages: UnifiedMessage[] = [];

    try {
      const allDirs = getDirectories(this.messagesPath);
      const sessionDirs = allDirs.filter((name) => name.startsWith('ses_'));

      for (const sessionDir of sessionDirs) {
        const sessionPath = join(this.messagesPath, sessionDir);

        try {
          const messageFiles = getFiles(sessionPath, {
            prefix: 'msg_',
            suffix: '.json',
          });

          for (const messageFile of messageFiles) {
            const messagePath = join(sessionPath, messageFile);

            try {
              const data = await readJsonFile(messagePath);

              const parsed = MessageSchema.safeParse(data);
              if (!parsed.success) {
                continue;
              }

              const message = parsed.data;

              if (message.role !== 'assistant' || !message.tokens) {
                continue;
              }

              const inputTokens = message.tokens.input;
              const outputTokens = message.tokens.output;
              const reasoningTokens = message.tokens.reasoning ?? 0;
              const cacheCreationTokens = message.tokens.cache?.write ?? 0;
              const cacheReadTokens = message.tokens.cache?.read ?? 0;

              const model = message.modelID ?? 'unknown';
              const cost =
                message.cost ??
                calculateCost(
                  model,
                  inputTokens,
                  outputTokens,
                  cacheCreationTokens,
                  cacheReadTokens,
                );

              const timestamp = message.time.completed ?? message.time.created;
              const date = dayjs(timestamp).format('YYYY-MM-DD');

              unifiedMessages.push({
                id: message.id,
                sessionId: message.sessionID,
                provider: message.providerID ?? 'opencode',
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
            } catch (error) {
              console.warn(
                `Failed to parse message file ${messageFile}:`,
                error,
              );
            }
          }
        } catch (error) {
          console.warn(
            `Failed to read session directory ${sessionDir}:`,
            error,
          );
        }
      }
    } catch (error: unknown) {
      throw normalizeAndLogError(
        `to read messages path ${this.messagesPath}`,
        error,
      );
    }

    return unifiedMessages;
  }
}
