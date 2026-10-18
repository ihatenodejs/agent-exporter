import {describe, expect, it} from 'bun:test';

import {
  createTemporaryDatabasePath,
  removeTemporaryDatabasePath,
} from './database-test-utils';
import {DatabaseManager} from '../database/manager';
import {initializeDatabase} from '../database/schema';

const runCli = async (
  ...arguments_: string[]
): Promise<{exitCode: number; stderr: string; stdout: string}> => {
  const child = Bun.spawn(['bun', 'run', 'src/cli.ts', ...arguments_], {
    cwd: process.cwd(),
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return {exitCode, stderr, stdout};
};

const runCliWithoutHarnesses = async (
  ...arguments_: string[]
): Promise<{exitCode: number; stderr: string; stdout: string}> => {
  const child = Bun.spawn([process.execPath, 'src/cli.ts', ...arguments_], {
    cwd: process.cwd(),
    env: {...process.env, PATH: ''},
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return {exitCode, stderr, stdout};
};

describe('harness CLI command', () => {
  it('shows harness guidance when invoked without arguments or with help', async () => {
    const bare = await runCli('harness');
    const help = await runCli('harness', '--help');

    expect(bare.exitCode).toBe(0);
    expect(help.exitCode).toBe(0);
    expect(bare.stderr).toBe('');
    expect(help.stderr).toBe('');
    expect(bare.stdout).toBe(help.stdout);
    expect(bare.stdout).toContain('Supported harnesses (disabled by default):');
    expect(bare.stdout).toContain('  opencode');
    expect(bare.stdout).toContain('  qwen');
    expect(bare.stdout).toContain('  antigravity');
    expect(bare.stdout).toContain('  ccusage');
    expect(bare.stdout).toContain('  codex');
    expect(bare.stdout).toContain('  oh-my-pi');
    expect(bare.stdout).toContain(
      'Harness state is stored in the selected database.',
    );
  });

  it('skips disabled harnesses when syncing all providers', async () => {
    const databasePath = await createTemporaryDatabasePath();
    try {
      const sync = await runCliWithoutHarnesses(
        'sync',
        '--provider',
        'all',
        '--db',
        databasePath,
      );

      expect(sync.exitCode).toBe(0);
      expect(sync.stdout).toContain('Syncing data from all...');
      for (const name of [
        'opencode',
        'qwen',
        'antigravity',
        'ccusage',
        'codex',
        'oh-my-pi',
      ]) {
        expect(sync.stdout).not.toContain(`Syncing ${name}...`);
      }
      expect(sync.stderr).toBe('');
    } finally {
      await removeTemporaryDatabasePath(databasePath);
    }
  });

  it('persists state and blocks disabled harnesses before sync', async () => {
    const databasePath = await createTemporaryDatabasePath();
    try {
      const enabled = await runCli(
        'harness',
        'ccusage',
        'enable',
        '--db',
        databasePath,
      );

      expect(enabled.exitCode).toBe(0);
      expect(enabled.stdout.trim()).toBe('Harness "ccusage" enabled.');

      const database = initializeDatabase(databasePath);
      const manager = new DatabaseManager(database);
      expect(manager.isHarnessEnabled('ccusage')).toBe(true);
      database.close();

      const disabled = await runCli(
        'harness',
        'ccusage',
        'disable',
        '--db',
        databasePath,
      );
      expect(disabled.exitCode).toBe(0);
      expect(disabled.stdout.trim()).toBe('Harness "ccusage" disabled.');

      const sync = await runCliWithoutHarnesses(
        'sync',
        '--provider',
        'ccusage',
        '--db',
        databasePath,
      );
      const remediation = `Harness "ccusage" is disabled. Enable it with: agent-exporter harness ccusage enable --db ${databasePath}`;

      expect(sync.exitCode).not.toBe(0);
      expect(sync.stderr.trim()).toBe(remediation);
      expect(sync.stdout).not.toContain('Syncing ccusage...');
    } finally {
      await removeTemporaryDatabasePath(databasePath);
    }
  });

  it('enables Antigravity and rejects the retired Gemini harness', async () => {
    const databasePath = await createTemporaryDatabasePath();
    try {
      const enabled = await runCli(
        'harness',
        'antigravity',
        'enable',
        '--db',
        databasePath,
      );
      const retired = await runCli(
        'harness',
        'gemini',
        'enable',
        '--db',
        databasePath,
      );

      expect(enabled.exitCode).toBe(0);
      expect(enabled.stdout.trim()).toBe('Harness "antigravity" enabled.');
      expect(retired.exitCode).not.toBe(0);
      expect(retired.stderr.trim()).toBe(
        'Invalid harness: gemini. Expected one of: opencode, qwen, antigravity, ccusage, codex, oh-my-pi.',
      );
    } finally {
      await removeTemporaryDatabasePath(databasePath);
    }
  });

  it('rejects invalid harness names and states', async () => {
    const databasePath = await createTemporaryDatabasePath();
    try {
      const invalidName = await runCli(
        'harness',
        'invalid',
        'enable',
        '--db',
        databasePath,
      );
      const invalidState = await runCli(
        'harness',
        'ccusage',
        'invalid',
        '--db',
        databasePath,
      );

      expect(invalidName.exitCode).not.toBe(0);
      expect(invalidName.stderr.trim()).toBe(
        'Invalid harness: invalid. Expected one of: opencode, qwen, antigravity, ccusage, codex, oh-my-pi.',
      );
      expect(invalidState.exitCode).not.toBe(0);
      expect(invalidState.stderr.trim()).toBe(
        'Invalid harness state: invalid. Expected "enable" or "disable".',
      );
    } finally {
      await removeTemporaryDatabasePath(databasePath);
    }
  });
});
