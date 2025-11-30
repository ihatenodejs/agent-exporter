/**
 * File system utilities for common directory and file operations
 */

import {readdirSync} from 'fs';

import {normalizeAndLogError} from './error-utils';
import {validateDirectoryPath} from './path-validation';

interface Dirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

/**
 * Gets all directories in a given path
 * @param path - The directory path to search
 * @returns Array of directory names or empty array if validation fails
 */
export async function getDirectories(path: string): Promise<string[]> {
  try {
    const validation = await validateDirectoryPath(path, {mustExist: true});
    if (!validation.isValid || !validation.resolvedPath) {
      normalizeAndLogError(
        'getDirectories',
        new Error(validation.error ?? 'Unknown validation error'),
      );
      return [];
    }

    const entries = readdirSync(validation.resolvedPath, {
      withFileTypes: true,
    }) as Dirent[];
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error) {
    normalizeAndLogError('getDirectories', error);
    return [];
  }
}

/**
 * Gets all files in a directory, optionally filtered by prefix and/or suffix
 * @param path - The directory path to search
 * @param options - Optional filtering options (prefix and/or suffix)
 * @returns Array of file names or empty array if validation fails
 */
export async function getFiles(
  path: string,
  options?: {prefix?: string; suffix?: string},
): Promise<string[]> {
  try {
    const validation = await validateDirectoryPath(path, {mustExist: true});
    if (!validation.isValid || !validation.resolvedPath) {
      normalizeAndLogError(
        'getFiles',
        new Error(validation.error ?? 'Unknown validation error'),
      );
      return [];
    }

    const entries = readdirSync(validation.resolvedPath, {
      withFileTypes: true,
    }) as Dirent[];
    return entries
      .filter(
        (e) =>
          e.isFile() &&
          (!options?.prefix || e.name.startsWith(options.prefix)) &&
          (!options?.suffix || e.name.endsWith(options.suffix)),
      )
      .map((e) => e.name);
  } catch (error) {
    normalizeAndLogError('getFiles', error);
    return [];
  }
}

/**
 * Reads and parses a JSON file using Bun's file API with validation
 * @param filePath - The absolute path to the JSON file
 * @returns Parsed JSON data as unknown type (should be validated with Zod)
 */
export async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const {validateFilePath} = await import('./path-validation');
    const validation = await validateFilePath(filePath, {
      mustExist: true,
      allowedExtensions: ['json'],
    });

    if (!validation.isValid || !validation.resolvedPath) {
      throw new Error(validation.error ?? 'File validation failed');
    }

    const file = Bun.file(validation.resolvedPath);
    return await file.json();
  } catch (error) {
    normalizeAndLogError(`readJsonFile: ${filePath}`, error);
    throw error;
  }
}
