import {mkdtemp, rm} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';

import {afterEach} from 'bun:test';

const temporaryDirectories: string[] = [];

export const createTemporaryDatabasePath = async (): Promise<string> => {
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
