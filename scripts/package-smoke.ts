import {existsSync} from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, relative, resolve} from 'node:path';

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const bunDir = dirname(process.execPath);
const envPath = process.env.PATH ?? '';
const pathSeparator = isWindows ? ';' : ':';
const augmentedPath = envPath.split(pathSeparator).includes(bunDir)
  ? envPath
  : `${bunDir}${pathSeparator}${envPath}`;

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface PackEntry {
  filename: string;
  files?: {path: string}[];
}

interface InstalledPackage {
  name: string;
  version: string;
  main?: string;
  bin?: Record<string, string>;
}

async function runCommand(
  cmd: string[],
  options: {cwd?: string; env?: Record<string, string | undefined>} = {},
): Promise<CommandResult> {
  const first = cmd[0];
  if (!first) {
    throw new Error('Command array must not be empty');
  }

  let executable = first;
  let args = cmd.slice(1);

  if (
    isWindows &&
    (executable.endsWith('.cmd') ||
      executable.endsWith('.bat') ||
      executable === 'npm' ||
      executable === 'npm.cmd')
  ) {
    const fullCmd = [executable, ...args]
      .map((arg) => {
        if (arg.length === 0) {
          return '""';
        }
        if (/[\s"^&|<>()%!]/.test(arg)) {
          return `"${arg.replaceAll('"', '""')}"`;
        }
        return arg;
      })
      .join(' ');
    executable = process.env.COMSPEC ?? 'cmd.exe';
    args = ['/d', '/s', '/c', `"${fullCmd}"`];
  }

  const child = Bun.spawn([executable, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      PATH: augmentedPath,
      ...options.env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  return {exitCode, stdout, stderr};
}

function checkNoDistOrTests(files: string[], source: string): void {
  for (const file of files) {
    const norm = file.replace(/\\/g, '/');
    if (norm.startsWith('dist/') || norm === 'dist') {
      throw new Error(`Native dist artifact found in ${source}: ${norm}`);
    }
    if (norm.includes('__tests__') || norm.includes('__fixtures__')) {
      throw new Error(`Test or fixture path found in ${source}: ${norm}`);
    }
    if (norm.endsWith('.test.ts') || norm.endsWith('.test.tsx')) {
      throw new Error(`Test file found in ${source}: ${norm}`);
    }
  }
}

async function main(): Promise<void> {
  const checkoutRoot = process.cwd();
  console.log(`[smoke] Packaging checkout from: ${checkoutRoot}`);

  const tempRoot = await mkdtemp(join(tmpdir(), 'agent-exporter-smoke-'));
  console.log(`[smoke] Disposable workspace: ${tempRoot}`);

  try {
    const packDir = join(tempRoot, 'pack');
    const consumerDir = join(tempRoot, 'consumer');
    await mkdir(packDir, {recursive: true});
    await mkdir(consumerDir, {recursive: true});

    // 1. Pack checkout
    const packResult = await runCommand(
      [
        npmCmd,
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        packDir,
      ],
      {cwd: checkoutRoot},
    );
    if (packResult.exitCode !== 0) {
      throw new Error(
        `npm pack failed (${packResult.exitCode}):\n${packResult.stderr}`,
      );
    }

    const startIdx = packResult.stdout.indexOf('[');
    const endIdx = packResult.stdout.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      throw new Error(
        `Failed to parse npm pack JSON output:\n${packResult.stdout}`,
      );
    }

    const packData = JSON.parse(
      packResult.stdout.slice(startIdx, endIdx + 1),
    ) as PackEntry[];
    const packEntry = packData.at(0);
    if (!packEntry?.filename) {
      throw new Error('npm pack returned empty package metadata array');
    }

    const tarballPath = join(packDir, packEntry.filename);
    if (!existsSync(tarballPath)) {
      throw new Error(`Packed tarball missing: ${tarballPath}`);
    }

    if (packEntry.files) {
      checkNoDistOrTests(
        packEntry.files.map((f) => f.path),
        'npm pack manifest',
      );
    }

    // 2. Install packed tarball into isolated consumer
    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify({name: 'smoke-consumer', version: '1.0.0', private: true}),
      'utf8',
    );

    const installResult = await runCommand(
      [
        npmCmd,
        'install',
        '--prefix',
        consumerDir,
        '--ignore-scripts',
        tarballPath,
      ],
      {cwd: consumerDir},
    );
    if (installResult.exitCode !== 0) {
      throw new Error(
        `npm install failed (${installResult.exitCode}):\n${installResult.stderr}`,
      );
    }

    // 3. Validate installed package layout and manifest
    const pkgDir = join(consumerDir, 'node_modules', 'agent-exporter');
    if (!existsSync(pkgDir)) {
      throw new Error(`Installed package missing: ${pkgDir}`);
    }

    const pkgLstat = await lstat(pkgDir);
    if (pkgLstat.isSymbolicLink()) {
      throw new Error(
        `Installed package must not be a symlink to checkout: ${pkgDir}`,
      );
    }

    const pkgJsonPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      throw new Error(`Installed package.json missing: ${pkgJsonPath}`);
    }

    const pkgJsonRaw = await readFile(pkgJsonPath, 'utf8');
    const installedPkg = JSON.parse(pkgJsonRaw) as InstalledPackage;

    if (installedPkg.name !== 'agent-exporter') {
      throw new Error(`Unexpected package name: "${installedPkg.name}"`);
    }

    if (installedPkg.main !== undefined) {
      throw new Error(
        `Unexpected "main" field in package.json: "${installedPkg.main ?? ''}". CLI package should not expose library main.`,
      );
    }

    const binRelPath = installedPkg.bin?.['agent-exporter'];
    if (!binRelPath) {
      throw new Error('Missing bin["agent-exporter"] in package.json');
    }

    // Validate actual runtime entry is contained inside installed package without checkout fallback
    const binSourcePath = resolve(pkgDir, binRelPath);
    if (!existsSync(binSourcePath)) {
      throw new Error(`Runtime entry does not exist: ${binSourcePath}`);
    }

    const relToPkg = relative(pkgDir, binSourcePath);
    if (relToPkg.startsWith('..') || isAbsolute(relToPkg)) {
      throw new Error(
        `Runtime entry escapes package directory: ${binSourcePath}`,
      );
    }

    const binContent = await readFile(binSourcePath, 'utf8');
    if (!binContent.startsWith('#!/usr/bin/env bun')) {
      const firstLine = binContent.split('\n')[0] ?? '';
      throw new Error(
        `Expected "#!/usr/bin/env bun" shebang, got "${firstLine}"`,
      );
    }

    if (existsSync(join(pkgDir, 'dist'))) {
      throw new Error(
        'Native dist directory must not be packaged in npm package',
      );
    }

    const installedFiles = await readdir(pkgDir, {recursive: true});
    checkNoDistOrTests(installedFiles, 'installed package');

    // 4. Invoke installed platform bin shim directly
    const binDir = join(consumerDir, 'node_modules', '.bin');
    const binShim = join(
      binDir,
      isWindows ? 'agent-exporter.cmd' : 'agent-exporter',
    );
    if (!existsSync(binShim)) {
      throw new Error(`Installed platform bin shim not found at: ${binShim}`);
    }

    // 4a. --version
    const versionRes = await runCommand([binShim, '--version'], {
      cwd: consumerDir,
    });
    if (versionRes.exitCode !== 0) {
      throw new Error(
        `--version failed (${versionRes.exitCode}):\n${versionRes.stderr}`,
      );
    }
    const versionOutput = versionRes.stdout.trim();
    if (versionOutput !== installedPkg.version) {
      throw new Error(
        `Version mismatch: expected "${installedPkg.version}", got "${versionOutput}"`,
      );
    }

    // 4b. --help
    const helpRes = await runCommand([binShim, '--help'], {
      cwd: consumerDir,
    });
    if (helpRes.exitCode !== 0) {
      throw new Error(
        `--help failed (${helpRes.exitCode}):\n${helpRes.stderr}`,
      );
    }
    if (
      !helpRes.stdout.includes('json') ||
      !helpRes.stdout.includes('export')
    ) {
      throw new Error(
        `--help output missing expected commands:\n${helpRes.stdout}`,
      );
    }

    // 4c. json --db :memory:
    const jsonRes = await runCommand([binShim, 'json', '--db', ':memory:'], {
      cwd: consumerDir,
    });
    if (jsonRes.exitCode !== 0) {
      throw new Error(
        `json --db :memory: failed (${jsonRes.exitCode}):\n${jsonRes.stderr}`,
      );
    }

    const parsedOutput = JSON.parse(jsonRes.stdout.trim()) as unknown;
    if (
      typeof parsedOutput !== 'object' ||
      parsedOutput === null ||
      Array.isArray(parsedOutput) ||
      Object.keys(parsedOutput).length !== 0
    ) {
      throw new Error(
        `json --db :memory: expected empty object {}, got: ${JSON.stringify(parsedOutput)}`,
      );
    }

    console.log('[smoke] All package smoke checks passed.');
  } finally {
    console.log(`[smoke] Cleaning up disposable workspace: ${tempRoot}`);
    await rm(tempRoot, {recursive: true, force: true});
  }
}

try {
  await main();
} catch (err: unknown) {
  console.error('[smoke] Smoke verification failed:');
  console.error(err);
  process.exit(1);
}
