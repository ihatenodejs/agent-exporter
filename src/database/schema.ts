import {Database} from 'bun:sqlite';

export function initializeDatabase(dbPath: string): Database {
  const db = new Database(dbPath);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date);
    CREATE INDEX IF NOT EXISTS idx_messages_provider ON messages(provider);
    CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

    CREATE TABLE IF NOT EXISTS sync_state (
      provider TEXT PRIMARY KEY,
      last_sync_timestamp INTEGER NOT NULL,
      last_message_id TEXT
    );
  `);

  return db;
}
