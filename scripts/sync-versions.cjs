#!/usr/bin/env node
/*
/  Version Sync Script
/
/  Ensures version consistency across:
/  - package.json (main version)
/  - package.json optionalDependencies
/  - packages/{platform}/package.json (platform packages)
/
/  Usage:
/    node scripts/sync-versions.cjs          # Sync versions (updates files)
/    node scripts/sync-versions.cjs --check  # Check only (exits 1 if out of sync)
*/
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');
const PLATFORMS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];

const isCheckMode = process.argv.includes('--check');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function main() {
  const mainPkgPath = path.join(ROOT_DIR, 'package.json');
  const mainPkg = readJson(mainPkgPath);
  const version = mainPkg.version;

  let hasChanges = false;
  const changes = [];

  if (mainPkg.optionalDependencies) {
    for (const platform of PLATFORMS) {
      const depName = `@agent-exporter/${platform}`;
      if (
        mainPkg.optionalDependencies[depName] &&
        mainPkg.optionalDependencies[depName] !== version
      ) {
        changes.push(
          `  ${depName}: ${mainPkg.optionalDependencies[depName]} → ${version}`,
        );
        mainPkg.optionalDependencies[depName] = version;
        hasChanges = true;
      }
    }
  }

  for (const platform of PLATFORMS) {
    const platformPkgPath = path.join(PACKAGES_DIR, platform, 'package.json');
    if (fs.existsSync(platformPkgPath)) {
      const platformPkg = readJson(platformPkgPath);
      if (platformPkg.version !== version) {
        changes.push(
          `  packages/${platform}/package.json: ${platformPkg.version} → ${version}`,
        );
        platformPkg.version = version;
        if (!isCheckMode) {
          writeJson(platformPkgPath, platformPkg);
        }
        hasChanges = true;
      }
    }
  }

  if (hasChanges && !isCheckMode) {
    writeJson(mainPkgPath, mainPkg);
  }

  if (hasChanges) {
    if (isCheckMode) {
      console.error(`Version mismatch detected (main version: ${version}):`);
      console.error(changes.join('\n'));
      console.error('\nRun "bun run sync-versions" to fix.');
      process.exit(1);
    } else {
      console.log(`Synced versions to ${version}:`);
      console.log(changes.join('\n'));
    }
  } else {
    console.log(`All versions are in sync (${version})`);
  }
}

main();
