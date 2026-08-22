export type ExecutableFinder = (executable: string) => string | null;

const findExecutable: ExecutableFinder = (executable) => Bun.which(executable);

export const resolveCCUsageCommand = (
  find: ExecutableFinder = findExecutable,
): 'bunx' | 'ccusage' | undefined => {
  if (find('ccusage')) return 'ccusage';
  if (find('bunx')) return 'bunx';
  return undefined;
};

export const isHarnessInstalled = (
  harness: string,
  find: ExecutableFinder = findExecutable,
): boolean => {
  switch (harness) {
    case 'qwen':
      return Boolean(find('qwen'));
    case 'opencode':
      return Boolean(find('opencode'));
    case 'oh-my-pi':
      return Boolean(find('omp'));
    case 'antigravity':
      return Boolean(find('agy'));
    case 'ccusage':
      return resolveCCUsageCommand(find) !== undefined;
    case 'codex':
      return Boolean(find('bunx'));
    default:
      return false;
  }
};
