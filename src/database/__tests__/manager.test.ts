import {describe, expect, it} from 'bun:test';

import {
  createTemporaryDatabasePath,
  removeTemporaryDatabasePath,
} from '../../__tests__/database-test-utils';
import {DatabaseManager} from '../manager';
import {initializeDatabase} from '../schema';

describe('DatabaseManager harness state', () => {
  it('defaults to disabled and persists enable and disable transitions', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    try {
      expect(manager.isHarnessEnabled('ccusage')).toBe(false);

      manager.setHarnessEnabled('ccusage', true);
      db.close();

      const enabledDatabase = initializeDatabase(databasePath);
      const enabledManager = new DatabaseManager(enabledDatabase);
      expect(enabledManager.isHarnessEnabled('ccusage')).toBe(true);

      enabledManager.setHarnessEnabled('ccusage', false);
      enabledDatabase.close();

      const disabledDatabase = initializeDatabase(databasePath);
      const disabledManager = new DatabaseManager(disabledDatabase);
      expect(disabledManager.isHarnessEnabled('ccusage')).toBe(false);
      disabledDatabase.close();
    } finally {
      await removeTemporaryDatabasePath(databasePath);
    }
  });
});
