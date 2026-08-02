import {existsSync} from 'fs';
import {homedir, platform} from 'os';
import {join} from 'path';

import dayjs from 'dayjs';
import {z} from 'zod';

import {normalizeAndLogError} from '../core/error-utils';
import {getDirectories, getFiles} from '../core/fs-utils';
import {calculateCost, calculateOhMyPiCatalogCost} from '../core/pricing';

import type {MessagesProviderAdapter, UnifiedMessage} from '../core/types';

const SessionHeaderSchema = z.object({
  type: z.literal('session'),
  id: z.string(),
});

const AssistantMessageSchema = z.object({
  type: z.literal('message'),
  id: z.string(),
  timestamp: z.string(),
  message: z.object({
    role: z.literal('assistant'),
    provider: z.string(),
    model: z.string(),
    timestamp: z.number(),
    usage: z.object({
      input: z.number(),
      output: z.number(),
      cacheRead: z.number(),
      cacheWrite: z.number(),
      totalTokens: z.number(),
      cost: z.object({total: z.number()}).optional(),
    }),
  }),
});

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

function getSessionsRoot(): string {
  const profileSelector = process.env.OMP_PROFILE ?? process.env.PI_PROFILE;
  const profile = profileSelector?.trim();
  const isDefaultProfile = !profile || profile === 'default';
  let configDirectory = '.omp';
  const specifiedConfigDirectory = process.env.PI_CONFIG_DIR;
  if (specifiedConfigDirectory) {
    configDirectory = specifiedConfigDirectory;
  }
  const configRoot = join(homedir(), configDirectory);
  const agentDirectory = isDefaultProfile
    ? (process.env.PI_CODING_AGENT_DIR ?? join(configRoot, 'agent'))
    : join(configRoot, 'profiles', profile, 'agent');

  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome && (platform() === 'darwin' || platform() === 'linux')) {
    const dataRoot = isDefaultProfile
      ? join(xdgDataHome, 'omp')
      : join(xdgDataHome, 'omp', 'profiles', profile);

    if (existsSync(dataRoot)) {
      return join(dataRoot, 'sessions');
    }
  }

  return join(agentDirectory, 'sessions');
}

export class OhMyPiAdapter implements MessagesProviderAdapter {
  name = 'oh-my-pi' as const;
  dataType = 'messages' as const;
  private readonly sessionsRoot: string;

  constructor(sessionsRoot?: string) {
    this.sessionsRoot = sessionsRoot ?? getSessionsRoot();
  }

  async fetchMessages(): Promise<UnifiedMessage[]> {
    const unifiedMessages: UnifiedMessage[] = [];

    if (!existsSync(this.sessionsRoot)) {
      return unifiedMessages;
    }

    try {
      for (const sessionDirectory of getDirectories(this.sessionsRoot)) {
        const sessionPath = join(this.sessionsRoot, sessionDirectory);

        try {
          for (const sessionFile of getFiles(sessionPath, {suffix: '.jsonl'})) {
            const sessionFilePath = join(sessionPath, sessionFile);

            try {
              const sessionContent = await Bun.file(sessionFilePath).text();
              const lines = sessionContent.split(/\r?\n/);
              let sessionId: string | undefined;
              const assistantEntries: z.infer<typeof AssistantMessageSchema>[] =
                [];

              for (const line of lines) {
                if (!line.trim()) {
                  continue;
                }

                let entry: unknown;
                try {
                  entry = JSON.parse(line);
                } catch (error) {
                  console.warn(
                    `Failed to parse Oh My Pi session file ${sessionFile}:`,
                    error,
                  );
                  continue;
                }

                const header = SessionHeaderSchema.safeParse(entry);
                if (header.success) {
                  sessionId ??= header.data.id;
                  continue;
                }

                const assistantEntry = AssistantMessageSchema.safeParse(entry);
                if (assistantEntry.success) {
                  assistantEntries.push(assistantEntry.data);
                }
              }

              if (!sessionId) {
                if (assistantEntries.length > 0) {
                  console.warn(
                    `Skipping Oh My Pi assistant entries without a session header in ${sessionFile}`,
                  );
                }
                continue;
              }

              for (const assistantEntry of assistantEntries) {
                const message = assistantEntry.message;
                const {usage} = message;
                const providedCost = usage.cost?.total;
                const numericValues = [
                  message.timestamp,
                  usage.input,
                  usage.output,
                  usage.cacheRead,
                  usage.cacheWrite,
                  usage.totalTokens,
                ];

                if (
                  !numericValues.every(isFiniteNumber) ||
                  (providedCost !== undefined && !isFiniteNumber(providedCost))
                ) {
                  console.warn(
                    `Skipping invalid Oh My Pi assistant entry in ${sessionFile}`,
                  );
                  continue;
                }

                const catalogCost = calculateOhMyPiCatalogCost(
                  message.provider,
                  message.model,
                  usage.input,
                  usage.output,
                  usage.cacheWrite,
                  usage.cacheRead,
                );
                const cost =
                  providedCost !== undefined && providedCost !== 0
                    ? providedCost
                    : (catalogCost ??
                      calculateCost(
                        message.model,
                        usage.input,
                        usage.output,
                        usage.cacheWrite,
                        usage.cacheRead,
                        message.provider,
                      ));

                unifiedMessages.push({
                  id: assistantEntry.id,
                  sessionId,
                  provider: 'oh-my-pi',
                  model: message.model,
                  inputTokens: usage.input,
                  outputTokens: usage.output,
                  reasoningTokens: 0,
                  cacheCreationTokens: usage.cacheWrite,
                  cacheReadTokens: usage.cacheRead,
                  cost,
                  timestamp: message.timestamp,
                  date: dayjs(message.timestamp).format('YYYY-MM-DD'),
                });
              }
            } catch (error) {
              console.warn(
                `Failed to read Oh My Pi session file ${sessionFile}:`,
                error,
              );
            }
          }
        } catch (error) {
          console.warn(
            `Failed to read Oh My Pi session directory ${sessionDirectory}:`,
            error,
          );
        }
      }
    } catch (error: unknown) {
      throw normalizeAndLogError('to fetch Oh My Pi data', error);
    }

    return unifiedMessages;
  }
}
