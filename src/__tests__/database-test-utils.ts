import {mkdtemp, rm} from 'fs/promises';
import {tmpdir} from 'os';
import {dirname, join} from 'path';

export const createTemporaryDatabasePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-exporter-'));
  return join(directory, 'harness.db');
};

export const removeTemporaryDatabasePath = async (
  databasePath: string,
): Promise<void> => {
  await rm(dirname(databasePath), {force: true, recursive: true});
};
