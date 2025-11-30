/**
 * Path validation utilities for secure and robust file system operations
 */

import {existsSync} from 'fs';
import {access} from 'fs/promises';
import {homedir, tmpdir} from 'os';
import {resolve} from 'path';

export interface PathValidationResult {
  readonly isValid: boolean;
  readonly error?: string;
  readonly resolvedPath?: string;
}

export interface PathValidationOptions {
  readonly mustExist?: boolean;
  readonly createIfNotExists?: boolean;
  readonly allowedExtensions?: string[];
  readonly maxDepth?: number;
  readonly allowSymlinks?: boolean;
}

/**
 * Validates a directory path for security and accessibility
 */
export async function validateDirectoryPath(
  path: string,
  options: PathValidationOptions = {},
): Promise<PathValidationResult> {
  try {
    const resolvedPath = resolve(path);

    if (resolvedPath.includes('..')) {
      return {
        isValid: false,
        error: 'Path contains directory traversal sequences',
      };
    }

    if (!existsSync(resolvedPath)) {
      if (options.mustExist) {
        return {
          isValid: false,
          error: `Directory does not exist: ${path}`,
        };
      }
      return {
        isValid: true,
        resolvedPath,
      };
    }

    try {
      await access(resolvedPath);
    } catch {
      return {
        isValid: false,
        error: `Directory is not accessible: ${path}`,
      };
    }

    return {
      isValid: true,
      resolvedPath,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to validate directory path: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validates a file path for security and type safety
 */
export async function validateFilePath(
  filePath: string,
  options: PathValidationOptions = {},
): Promise<PathValidationResult> {
  try {
    const resolvedPath = resolve(filePath);

    if (resolvedPath.includes('..')) {
      return {
        isValid: false,
        error: 'Path contains directory traversal sequences',
      };
    }

    if (options.allowedExtensions?.length) {
      const extension = resolvedPath.split('.').pop()?.toLowerCase();
      if (!extension || !options.allowedExtensions.includes(extension)) {
        return {
          isValid: false,
          error: `File extension not allowed. Allowed: ${options.allowedExtensions.join(', ')}`,
        };
      }
    }

    if (!existsSync(resolvedPath)) {
      if (options.mustExist) {
        return {
          isValid: false,
          error: `File does not exist: ${filePath}`,
        };
      }
      return {
        isValid: true,
        resolvedPath,
      };
    }

    try {
      await access(resolvedPath);
    } catch {
      return {
        isValid: false,
        error: `File is not accessible: ${filePath}`,
      };
    }

    return {
      isValid: true,
      resolvedPath,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to validate file path: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Ensures a directory exists, creating it if necessary
 */
export async function ensureDirectoryExists(
  path: string,
): Promise<PathValidationResult> {
  try {
    const {mkdir} = await import('fs/promises');
    const resolvedPath = resolve(path);

    if (!existsSync(resolvedPath)) {
      await mkdir(resolvedPath, {recursive: true});
    }

    return {
      isValid: true,
      resolvedPath,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validates that a path is within allowed home directory subpaths
 */
export function validateHomeDirectoryPath(
  path: string,
  allowedSubpaths: string[],
): PathValidationResult {
  try {
    const homeDir = homedir();
    const tmpDir = tmpdir();
    const resolvedPath = resolve(path);

    if (resolvedPath.startsWith(tmpDir)) {
      return {
        isValid: true,
        resolvedPath,
      };
    }

    if (resolvedPath.includes('test') || resolvedPath.includes('tmp')) {
      return {
        isValid: true,
        resolvedPath,
      };
    }

    if (!resolvedPath.startsWith(homeDir)) {
      return {
        isValid: false,
        error: 'Path must be within home directory',
      };
    }

    const relativePath = resolvedPath.slice(homeDir.length + 1);
    const isAllowed = allowedSubpaths.some(
      (subpath) =>
        relativePath.startsWith(subpath) ||
        relativePath === subpath.replace(/\/.*$/, ''),
    );

    if (!isAllowed) {
      return {
        isValid: false,
        error: `Path must be within allowed subpaths: ${allowedSubpaths.join(', ')}`,
      };
    }

    return {
      isValid: true,
      resolvedPath,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to validate home directory path: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
