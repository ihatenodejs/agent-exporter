import {readdirSync} from 'fs';
import {homedir} from 'os';
import {join} from 'path';

import dayjs from 'dayjs';

import {calculateCost} from '../core/pricing';
import {
  MessageSchema,
  type UnifiedMessage,
  type ProviderAdapter,
} from '../core/types';

export class OpenCodeAdapter implements ProviderAdapter {
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
      const entries = readdirSync(this.messagesPath, {withFileTypes: true});
      const sessionDirs = entries
        .filter((e) => e.isDirectory() && e.name.startsWith('ses_'))
        .map((e) => e.name);

      for (const sessionDir of sessionDirs) {
        const sessionPath = join(this.messagesPath, sessionDir);

        try {
          const messageEntries = readdirSync(sessionPath, {
            withFileTypes: true,
          });
          const messageFiles = messageEntries
            .filter(
              (e) =>
                e.isFile() &&
                e.name.startsWith('msg_') &&
                e.name.endsWith('.json'),
            )
            .map((e) => e.name);

          for (const messageFile of messageFiles) {
            const messagePath = join(sessionPath, messageFile);

            try {
              const file = Bun.file(messagePath);
              const data: unknown = await file.json();

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
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      console.error(
        `Failed to read messages path ${this.messagesPath}:`,
        normalizedError.message,
      );
      if (normalizedError.stack) {
        console.error(normalizedError.stack);
      }
      throw normalizedError;
    }

    return unifiedMessages;
  }
}
