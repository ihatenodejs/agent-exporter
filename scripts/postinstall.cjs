#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const { platform, arch } = process;

const platformMap = {
  "linux-x64": "linux-x64",
  "linux-arm64": "linux-arm64",
  "darwin-x64": "darwin-x64",
  "darwin-arm64": "darwin-arm64",
};

const key = `${platform}-${arch}`;
const target = platformMap[key];

if (!target) {
  console.error(`agent-exporter: Unsupported platform: ${key}`);
  console.error(
    "Supported platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64"
  );
  process.exit(1);
}

const distDir = path.join(__dirname, "..", "dist");
const src = path.join(distDir, `agent-exporter-${target}`);
const dest = path.join(distDir, "agent-exporter");

if (!fs.existsSync(src)) {
  console.error(`agent-exporter: Binary not found: ${src}`);
  process.exit(1);
}

try {
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
} catch (err) {
  console.error(`agent-exporter: Failed to setup binary: ${err.message}`);
  process.exit(1);
}
