import {type Database} from 'bun:sqlite';

import {calculateCost} from '../core/pricing';
import {
  type UnifiedMessage,
  type DailyUsage,
  type ModelBreakdown,
} from '../core/types';

interface MessageRow {
  id: string;
  session_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost: number;
  timestamp: number;
  date: string;
}

interface SyncStateRow {
  last_sync_timestamp: number;
  last_message_id: string | null;
}

interface CostRow {
  id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export class DatabaseManager {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  insertMessage(message: UnifiedMessage): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (
        id, session_id, provider, model, input_tokens, output_tokens,
        reasoning_tokens, cache_creation_tokens, cache_read_tokens,
        cost, timestamp, date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.sessionId,
      message.provider,
      message.model,
      message.inputTokens,
      message.outputTokens,
      message.reasoningTokens,
      message.cacheCreationTokens,
      message.cacheReadTokens,
      message.cost,
      message.timestamp,
      message.date,
    );
  }

  insertMessages(messages: UnifiedMessage[]): void {
    this.db.run('BEGIN TRANSACTION');
    try {
      for (const msg of messages) {
        this.insertMessage(msg);
      }
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  getMessagesByDateRange(startDate: string, endDate: string): UnifiedMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE date >= ? AND date <= ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(startDate, endDate) as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      provider: row.provider,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      reasoningTokens: row.reasoning_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cost: row.cost,
      timestamp: row.timestamp,
      date: row.date,
    }));
  }

  getDailyUsage(startDate: string, endDate: string): DailyUsage[] {
    const messages = this.getMessagesByDateRange(startDate, endDate);
    const dailyMap = new Map<string, Map<string, ModelBreakdown>>();

    for (const msg of messages) {
      let modelMap = dailyMap.get(msg.date);
      if (modelMap === undefined) {
        modelMap = new Map<string, ModelBreakdown>();
        dailyMap.set(msg.date, modelMap);
      }

      let breakdown = modelMap.get(msg.model);
      if (breakdown === undefined) {
        breakdown = {
          modelName: msg.model,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          cost: 0,
        };
        modelMap.set(msg.model, breakdown);
      }

      breakdown.inputTokens += msg.inputTokens;
      breakdown.outputTokens += msg.outputTokens;
      breakdown.cacheCreationTokens += msg.cacheCreationTokens;
      breakdown.cacheReadTokens += msg.cacheReadTokens;
      breakdown.cost += msg.cost;
    }

    const dailyUsage: DailyUsage[] = [];
    for (const [date, modelMap] of dailyMap.entries()) {
      const modelBreakdowns = Array.from(modelMap.values());
      const daily: DailyUsage = {
        date,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        modelsUsed: [],
        modelBreakdowns,
      };

      for (const breakdown of modelBreakdowns) {
        daily.inputTokens += breakdown.inputTokens;
        daily.outputTokens += breakdown.outputTokens;
        daily.cacheCreationTokens += breakdown.cacheCreationTokens;
        daily.cacheReadTokens += breakdown.cacheReadTokens;
        daily.totalCost += breakdown.cost;
        daily.modelsUsed.push(breakdown.modelName);
      }

      daily.totalTokens =
        daily.inputTokens +
        daily.outputTokens +
        daily.cacheCreationTokens +
        daily.cacheReadTokens;

      dailyUsage.push(daily);
    }

    return dailyUsage.sort((a, b) => a.date.localeCompare(b.date));
  }

  getSyncState(
    provider: string,
  ): {lastSyncTimestamp: number; lastMessageId: string | null} | null {
    const stmt = this.db.prepare(`
      SELECT last_sync_timestamp, last_message_id
      FROM sync_state
      WHERE provider = ?
    `);

    const row = stmt.get(provider) as SyncStateRow | null;
    if (!row) return null;

    return {
      lastSyncTimestamp: row.last_sync_timestamp,
      lastMessageId: row.last_message_id,
    };
  }

  updateSyncState(
    provider: string,
    timestamp: number,
    lastMessageId: string,
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sync_state (provider, last_sync_timestamp, last_message_id)
      VALUES (?, ?, ?)
    `);

    stmt.run(provider, timestamp, lastMessageId);
  }

  /**
   * Recalculate costs for all messages in the database
   * Useful when pricing data has been updated
   * @param recalculateAll - If true, recalculate costs for ALL messages, not just those with missing costs
   */
  recalculateCosts(recalculateAll = false): number {
    const stmt = this.db.prepare(`
      SELECT id, provider, model, input_tokens, output_tokens,
             cache_creation_tokens, cache_read_tokens, cost
      FROM messages
    `);

    const messages = stmt.all() as CostRow[];
    let updatedCount = 0;

    const updateStmt = this.db.prepare(`
      UPDATE messages
      SET cost = ?
      WHERE id = ?
    `);

    this.db.run('BEGIN TRANSACTION');
    try {
      for (const msg of messages) {
        // Skip messages that already have costs unless recalculateAll is true
        if (!recalculateAll && msg.cost > 0) {
          continue;
        }

        const newCost = calculateCost(
          msg.model,
          msg.input_tokens,
          msg.output_tokens,
          msg.cache_creation_tokens,
          msg.cache_read_tokens,
          msg.provider,
        );

        updateStmt.run(newCost, msg.id);
        updatedCount++;
      }
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }

    return updatedCount;
  }

  close(): void {
    this.db.close();
  }
}
