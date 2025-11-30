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

/**
 * Normalizes an unknown error to an Error instance without logging.
 * Useful when you want to throw an error that will be caught and displayed
 * by a UI component rather than logged immediately.
 *
 * @param error - The caught error (can be any type)
 * @returns Normalized Error instance
 */
export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

/**
 * Extracts a clean, user-friendly error message from an unknown error.
 * Used for displaying errors without stack traces.
 *
 * @param error - The caught error (can be any type)
 * @returns A clean error message string
 */
export function getCleanErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Extracts the stack trace from an error if available.
 * Used for verbose error output.
 *
 * @param error - The caught error (can be any type)
 * @returns The stack trace string or undefined if not available
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}
