import {generateDateRange, generateCCUsageExport} from '../core/aggregator';
import {
  type ExportOptions,
  type DailyUsage,
  type CCUsageExport,
} from '../core/types';
import {type DatabaseManager} from '../database/manager';

type JSONExport = Record<string, CCUsageExport>;

export class JSONExporter {
  constructor(private readonly dbManager: DatabaseManager) {}

  async export(options: ExportOptions = {}): Promise<string> {
    const exportData = this.generateExport(options);
    const outputPath = options.outputPath ?? this.generateOutputPath(options);

    await Bun.write(outputPath, JSON.stringify(exportData, null, 2));

    return outputPath;
  }

  exportToString(options: ExportOptions = {}): string {
    const exportData = this.generateExport(options);
    return JSON.stringify(exportData, null, 2);
  }

  private generateExport(options: ExportOptions = {}): JSONExport {
    const {start, end} = generateDateRange(options.startDate, options.endDate);

    const messages = this.dbManager.getMessagesByDateRange(start, end);

    const providerMessagesMap = new Map<string, typeof messages>();

    for (const msg of messages) {
      let providerMessages = providerMessagesMap.get(msg.provider);
      if (providerMessages === undefined) {
        providerMessages = [];
        providerMessagesMap.set(msg.provider, providerMessages);
      }
      providerMessages.push(msg);
    }

    const providerData: Record<string, CCUsageExport> = {};

    for (const [provider, providerMessages] of providerMessagesMap.entries()) {
      const dailyMap = new Map<string, DailyUsage>();

      for (const msg of providerMessages) {
        let daily = dailyMap.get(msg.date);
        if (daily === undefined) {
          daily = {
            date: msg.date,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 0,
            totalCost: 0,
            modelsUsed: [],
            modelBreakdowns: [],
          };
          dailyMap.set(msg.date, daily);
        }
        daily.inputTokens += msg.inputTokens;
        daily.outputTokens += msg.outputTokens;
        daily.cacheCreationTokens += msg.cacheCreationTokens;
        daily.cacheReadTokens += msg.cacheReadTokens;
        daily.totalTokens +=
          msg.inputTokens +
          msg.outputTokens +
          msg.cacheCreationTokens +
          msg.cacheReadTokens;
        daily.totalCost += msg.cost;

        if (!daily.modelsUsed.includes(msg.model)) {
          daily.modelsUsed.push(msg.model);
        }

        let modelBreakdown = daily.modelBreakdowns.find(
          (mb) => mb.modelName === msg.model,
        );
        if (modelBreakdown === undefined) {
          modelBreakdown = {
            modelName: msg.model,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            cost: 0,
          };
          daily.modelBreakdowns.push(modelBreakdown);
        }

        modelBreakdown.inputTokens += msg.inputTokens;
        modelBreakdown.outputTokens += msg.outputTokens;
        modelBreakdown.cacheCreationTokens += msg.cacheCreationTokens;
        modelBreakdown.cacheReadTokens += msg.cacheReadTokens;
        modelBreakdown.cost += msg.cost;
      }

      const dailyUsage = Array.from(dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );

      providerData[provider] = generateCCUsageExport(dailyUsage);
    }

    return providerData;
  }

  private generateOutputPath(options: ExportOptions): string {
    const {start, end} = generateDateRange(options.startDate, options.endDate);
    return `usage-export-${start}-to-${end}.json`;
  }
}
