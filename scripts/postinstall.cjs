#!/usr/bin/env node
/**
 * Postinstall script for local development.
 *
 * For npm installs, the platform-specific optional dependencies handle binary selection.
 * This script is used during local development to:
 * 1. Copy the correct platform binary to dist/agent-exporter for bun link
 * 2. Copy binaries to platform packages for local testing
 */
const fs = require('fs');
const path = require('path');

const {platform, arch} = process;

const platformMap = {
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
  'darwin-x64': 'darwin-x64',
  'darwin-arm64': 'darwin-arm64',
};

const key = `${platform}-${arch}`;
const target = platformMap[key];

if (!target) {
  console.error(`agent-exporter: Unsupported platform: ${key}`);
  console.error(
    'Supported platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64',
  );
  process.exit(1);
}

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const packagesDir = path.join(rootDir, 'packages');

if (!fs.existsSync(distDir)) {
  process.exit(0);
}

const src = path.join(distDir, `agent-exporter-${target}`);
const dest = path.join(distDir, 'agent-exporter');

if (fs.existsSync(src)) {
  try {
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
  } catch (err) {
    console.error(`agent-exporter: Failed to setup binary: ${err.message}`);
    process.exit(1);
  }
}

const platforms = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];

for (const plat of platforms) {
  const srcBinary = path.join(distDir, `agent-exporter-${plat}`);
  const packageBinDir = path.join(packagesDir, plat, 'bin');
  const destBinary = path.join(packageBinDir, 'agent-exporter');

  if (fs.existsSync(srcBinary)) {
    try {
      if (!fs.existsSync(packageBinDir)) {
        fs.mkdirSync(packageBinDir, {recursive: true});
      }
      fs.copyFileSync(srcBinary, destBinary);
      fs.chmodSync(destBinary, 0o755);
    } catch (err) {
      console.error(
        `agent-exporter: Failed to copy ${plat} binary: ${err.message}`,
      );
    }
  }
}
