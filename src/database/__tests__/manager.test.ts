import {mkdtemp, rm} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';

import {afterEach, describe, expect, it} from 'bun:test';

import {DatabaseManager} from '../manager';
import {initializeDatabase} from '../schema';

const temporaryDirectories: string[] = [];

const createDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-exporter-'));
  temporaryDirectories.push(directory);
  return join(directory, 'harness.db');
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

describe('DatabaseManager harness state', () => {
  it('defaults to disabled and persists enable and disable transitions', async () => {
    const databasePath = await createDatabasePath();
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
