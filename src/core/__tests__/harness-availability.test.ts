import {describe, expect, it} from 'bun:test';

import {
  isHarnessInstalled,
  resolveCCUsageCommand,
  type ExecutableFinder,
} from '../harness-availability';

const executableFinder = (...executables: string[]): ExecutableFinder => {
  const available: Partial<Record<string, true>> = Object.fromEntries(
    executables.map((executable) => [executable, true] as const),
  );
  return (executable) => (available[executable] ? `/bin/${executable}` : null);
};

describe('harness availability', () => {
  it.each([
    ['qwen', 'qwen'],
    ['opencode', 'opencode'],
    ['oh-my-pi', 'omp'],
    ['antigravity', 'agy'],
  ])('requires %s to be present as %s', (harness, executable) => {
    expect(isHarnessInstalled(harness, executableFinder(executable))).toBe(
      true,
    );
    expect(isHarnessInstalled(harness, executableFinder())).toBe(false);
  });

  it('accepts ccusage or bunx for the CCUsage harness', () => {
    expect(isHarnessInstalled('ccusage', executableFinder('ccusage'))).toBe(
      true,
    );
    expect(isHarnessInstalled('ccusage', executableFinder('bunx'))).toBe(true);
    expect(isHarnessInstalled('ccusage', executableFinder())).toBe(false);
  });

  it('requires bunx for the Codex harness', () => {
    expect(isHarnessInstalled('codex', executableFinder('ccusage'))).toBe(
      false,
    );
    expect(isHarnessInstalled('codex', executableFinder('bunx'))).toBe(true);
    expect(isHarnessInstalled('codex', executableFinder())).toBe(false);
  });

  it('prefers the installed ccusage executable over bunx', () => {
    expect(resolveCCUsageCommand(executableFinder('ccusage', 'bunx'))).toBe(
      'ccusage',
    );
    expect(resolveCCUsageCommand(executableFinder('bunx'))).toBe('bunx');
    expect(resolveCCUsageCommand(executableFinder())).toBeUndefined();
  });
});
