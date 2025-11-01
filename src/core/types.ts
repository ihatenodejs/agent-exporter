import {z} from 'zod';

export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  sessionID: z.string(),
  modelID: z.string().optional(),
  providerID: z.string().optional(),
  tokens: z
    .object({
      input: z.number(),
      output: z.number(),
      reasoning: z.number().optional(),
      cache: z
        .object({
          write: z.number(),
          read: z.number(),
        })
        .optional(),
    })
    .optional(),
  cost: z.number().optional(),
  time: z.object({
    created: z.number(),
    completed: z.number().optional(),
  }),
});

export type Message = z.infer<typeof MessageSchema>;

export interface UnifiedMessage {
  id: string;
  sessionId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  timestamp: number;
  date: string;
}

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface CCUsageExport {
  daily: DailyUsage[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCost: number;
    totalTokens: number;
  };
}

export type DataType = 'messages' | 'usage entries';

export interface ProviderAdapter {
  name: string;
  dataType: DataType;
  fetchMessages(): Promise<UnifiedMessage[]>;
}

export interface ExportOptions {
  startDate?: string;
  endDate?: string;
  outputPath?: string;
}
