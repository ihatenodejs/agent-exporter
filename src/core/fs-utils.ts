/**
 * File system utilities for common directory and file operations
 */

import {readdirSync} from 'fs';

/**
 * Gets all directories in a given path
 * @param path - The directory path to search
 * @returns Array of directory names
 */
export function getDirectories(path: string): string[] {
  const entries = readdirSync(path, {withFileTypes: true});
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * Gets all files in a directory, optionally filtered by prefix and/or suffix
 * @param path - The directory path to search
 * @param options - Optional filtering options (prefix and/or suffix)
 * @returns Array of file names
 */
export function getFiles(
  path: string,
  options?: {prefix?: string; suffix?: string},
): string[] {
  const entries = readdirSync(path, {withFileTypes: true});
  return entries
    .filter(
      (e) =>
        e.isFile() &&
        (!options?.prefix || e.name.startsWith(options.prefix)) &&
        (!options?.suffix || e.name.endsWith(options.suffix)),
    )
    .map((e) => e.name);
}

/**
 * Reads and parses a JSON file using Bun's file API
 * @param filePath - The absolute path to the JSON file
 * @returns Parsed JSON data as unknown type (should be validated with Zod)
 */
export async function readJsonFile(filePath: string): Promise<unknown> {
  const file = Bun.file(filePath);
  return file.json();
}
