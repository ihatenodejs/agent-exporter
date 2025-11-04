/**
 * Error handling utilities for consistent error normalization and logging
 */

/**
 * Normalizes an unknown error to an Error instance, logs it, and returns it.
 * This provides consistent error handling across all provider adapters.
 *
 * @param context - Description of what operation failed (e.g., "fetch OpenCode data")
 * @param error - The caught error (can be any type)
 * @param prefix - Optional prefix for the log message (default: "Failed")
 * @returns Normalized Error instance
 */
export function normalizeAndLogError(
  context: string,
  error: unknown,
  prefix = 'Failed',
): Error {
  const normalizedError =
    error instanceof Error ? error : new Error(String(error));
  console.error(`${prefix} ${context}:`, normalizedError.message);
  if (normalizedError.stack) {
    console.error(normalizedError.stack);
  }
  return normalizedError;
}
