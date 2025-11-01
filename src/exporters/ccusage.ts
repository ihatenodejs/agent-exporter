import {generateCCUsageExport, generateDateRange} from '../core/aggregator';
import {type ExportOptions} from '../core/types';
import {type DatabaseManager} from '../database/manager';

export class CCUsageExporter {
  constructor(private readonly dbManager: DatabaseManager) {}

  async export(options: ExportOptions = {}): Promise<string> {
    const {start, end} = generateDateRange(options.startDate, options.endDate);

    const dailyUsage = this.dbManager.getDailyUsage(start, end);

    const exportData = generateCCUsageExport(dailyUsage);

    const outputPath =
      options.outputPath ?? `usage-export-${start}-to-${end}.json`;

    await Bun.write(outputPath, JSON.stringify(exportData, null, 2));

    return outputPath;
  }

  exportToString(options: ExportOptions = {}): string {
    const {start, end} = generateDateRange(options.startDate, options.endDate);

    const dailyUsage = this.dbManager.getDailyUsage(start, end);

    const exportData = generateCCUsageExport(dailyUsage);

    return JSON.stringify(exportData, null, 2);
  }
}
