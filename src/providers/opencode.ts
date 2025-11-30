import {homedir} from 'os';
import {join} from 'path';

import dayjs from 'dayjs';

import {
  logProviderError,
  handleProviderError,
  ErrorSeverity,
} from '../core/error-utils';
import {getDirectories, getFiles, readJsonFile} from '../core/fs-utils';
import {validateHomeDirectoryPath} from '../core/path-validation';
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
    const defaultPath = join(
      homedir(),
      '.local/share/opencode/storage/message',
    );
    this.messagesPath = messagesPath ?? defaultPath;
  }

  async fetchMessages(): Promise<UnifiedMessage[]> {
    const unifiedMessages: UnifiedMessage[] = [];

    try {
      const pathValidation = validateHomeDirectoryPath(this.messagesPath, [
        '.local/share/opencode',
      ]);

      if (!pathValidation.isValid || !pathValidation.resolvedPath) {
        throw new Error(pathValidation.error ?? 'Path validation failed');
      }

      const allDirs = await getDirectories(pathValidation.resolvedPath);
      const sessionDirs = allDirs.filter((name) => name.startsWith('ses_'));

      const messagesBySession = new Map<
        string,
        {
          data: ReturnType<typeof MessageSchema.parse>;
          timestamp: number;
          cumulativeInput: number;
        }[]
      >();

      for (const sessionDir of sessionDirs) {
        const sessionPath = join(pathValidation.resolvedPath, sessionDir);

        try {
          const messageFiles = await getFiles(sessionPath, {
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

              const timestamp = message.time.completed ?? message.time.created;
              const sessionId = message.sessionID;

              if (!messagesBySession.has(sessionId)) {
                messagesBySession.set(sessionId, []);
              }

              const sessionMessages = messagesBySession.get(sessionId);
              if (sessionMessages) {
                sessionMessages.push({
                  data: message,
                  timestamp,
                  cumulativeInput: message.tokens.input,
                });
              }
            } catch (error) {
              logProviderError(
                {
                  context: `parse message file ${messageFile}`,
                  provider: 'opencode',
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
              context: `read session directory ${sessionDir}`,
              provider: 'opencode',
              severity: ErrorSeverity.LOW,
              shouldContinue: true,
            },
            error,
          );
        }
      }

      for (const [sessionId, messages] of messagesBySession) {
        messages.sort((a, b) => a.timestamp - b.timestamp);

        let prevCumulativeInput = 0;

        for (const {data: message, timestamp, cumulativeInput} of messages) {
          // tokens is guaranteed to exist because we filtered for it earlier
          if (!message.tokens) continue;

          const deltaInput = cumulativeInput - prevCumulativeInput;
          const outputTokens = message.tokens.output;
          const reasoningTokens = message.tokens.reasoning ?? 0;
          const cacheCreationTokens = message.tokens.cache?.write ?? 0;
          const cacheReadTokens = message.tokens.cache?.read ?? 0;

          const model = message.modelID ?? 'unknown';
          const cost =
            message.cost ??
            calculateCost(
              model,
              deltaInput,
              outputTokens,
              cacheCreationTokens,
              cacheReadTokens,
            );

          const date = dayjs(timestamp).format('YYYY-MM-DD');

          unifiedMessages.push({
            id: message.id,
            sessionId,
            provider: message.providerID ?? 'opencode',
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
      }
    } catch (error: unknown) {
      const userMessage = handleProviderError(
        'opencode',
        'fetch messages',
        error,
      );
      throw new Error(userMessage);
    }

    return unifiedMessages;
  }
}
