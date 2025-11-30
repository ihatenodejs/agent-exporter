#!/usr/bin/env node
const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const {platform, arch} = process;

const platformPackages = {
  'linux-x64': '@agent-exporter/linux-x64',
  'linux-arm64': '@agent-exporter/linux-arm64',
  'darwin-x64': '@agent-exporter/darwin-x64',
  'darwin-arm64': '@agent-exporter/darwin-arm64',
};

const key = `${platform}-${arch}`;
const packageName = platformPackages[key];

if (!packageName) {
  console.error(`agent-exporter: Unsupported platform: ${key}`);
  console.error(
    'Supported platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64',
  );
  process.exit(1);
}

let binaryPath;

const localBinary = path.join(__dirname, '..', 'dist', 'agent-exporter');
if (fs.existsSync(localBinary)) {
  binaryPath = localBinary;
} else {
  try {
    const packagePath = require.resolve(`${packageName}/package.json`);
    binaryPath = path.join(path.dirname(packagePath), 'bin', 'agent-exporter');
  } catch {
    console.error(`agent-exporter: Platform package not found: ${packageName}`);
    console.error('Try reinstalling with: npm install -g agent-exporter');
    process.exit(1);
  }
}

if (!fs.existsSync(binaryPath)) {
  console.error(`agent-exporter: Binary not found at: ${binaryPath}`);
  process.exit(1);
}

const result = spawnSync(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(
    `agent-exporter: Failed to execute binary: ${result.error.message}`,
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
