import {describe, expect, it} from 'bun:test';

import {createTemporaryDatabasePath} from '../../__tests__/database-test-utils';
import {DatabaseManager} from '../manager';
import {initializeDatabase} from '../schema';

describe('DatabaseManager harness state', () => {
  it('defaults to disabled and persists enable and disable transitions', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const db = initializeDatabase(databasePath);
    const manager = new DatabaseManager(db);

    expect(manager.isHarnessEnabled('ccusage')).toBe(false);

    manager.setHarnessEnabled('ccusage', true);
    expect(manager.isHarnessEnabled('ccusage')).toBe(true);

    manager.setHarnessEnabled('ccusage', false);
    expect(manager.isHarnessEnabled('ccusage')).toBe(false);
    db.close();

    const reopenedDatabase = initializeDatabase(databasePath);
    const reopenedManager = new DatabaseManager(reopenedDatabase);
    expect(reopenedManager.isHarnessEnabled('ccusage')).toBe(false);
    reopenedDatabase.close();
  });
});
