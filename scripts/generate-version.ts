#!/usr/bin/env bun
/**
 * Generates a version file from package.json for build-time use
 * This avoids runtime imports of package.json in compiled binaries
 */

import {readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

const packageJsonPath = join(import.meta.dir, '..', 'package.json');
const outputPath = join(
  import.meta.dir,
  '..',
  'src',
  'generated',
  'version.ts',
);

try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  const versionContent = `/**
 * Generated version information from package.json
 * This file is auto-generated during build - do not edit manually
 */

export const VERSION = '${packageJson.version}' as const;
export const NAME = '${packageJson.name}' as const;
export const DESCRIPTION = '${packageJson.description}' as const;

export interface PackageInfo {
  readonly version: string;
  readonly name: string;
  readonly description: string;
}

export const packageInfo: PackageInfo = {
  version: VERSION,
  name: NAME,
  description: DESCRIPTION,
} as const;
`;

  const {mkdirSync} = await import('fs');
  const generatedDir = join(import.meta.dir, '..', 'src', 'generated');
  mkdirSync(generatedDir, {recursive: true});

  writeFileSync(outputPath, versionContent, 'utf8');
  console.log(`✓ Generated version file: ${outputPath}`);
  console.log(`  Version: ${packageJson.version}`);
  console.log(`  Name: ${packageJson.name}`);
} catch (error) {
  console.error('Failed to generate version file:', error);
  process.exit(1);
}
