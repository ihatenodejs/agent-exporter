/**
 * Error handling utilities for consistent error normalization and logging
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  readonly context: string;
  readonly provider?: string;
  readonly severity?: ErrorSeverity;
  readonly shouldContinue?: boolean;
}

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

/**
 * Logs an error with consistent formatting and optional provider context
 */
export function logProviderError(context: ErrorContext, error: unknown): Error {
  const normalizedError = normalizeError(error);
  const severity = context.severity ?? ErrorSeverity.MEDIUM;
  const timestamp = new Date().toISOString();

  const logMessage = [
    `[${timestamp}]`,
    `[${severity.toUpperCase()}]`,
    context.provider ? `[${context.provider}]` : '',
    `${context.context}: ${normalizedError.message}`,
  ]
    .filter(Boolean)
    .join(' ');

  console.error(logMessage);

  if (
    normalizedError.stack &&
    (severity === ErrorSeverity.HIGH || severity === ErrorSeverity.CRITICAL)
  ) {
    console.error('Stack trace:', normalizedError.stack);
  }

  return normalizedError;
}

/**
 * Handles provider-specific errors with user-friendly messages
 */
export function handleProviderError(
  providerName: string,
  operation: string,
  error: unknown,
): string {
  const normalizedError = normalizeError(error);

  const errorMappings: Record<string, Record<string, string>> = {
    ccusage: {
      'command not found':
        'ccusage is not installed. Run: bun install -g ccusage',
      bunx: "ccusage is not available. Ensure it's installed globally",
      'totals.*null': 'No usage data found in ccusage export',
    },
    codex: {
      'command not found':
        '@ccusage/codex is not installed. Run: bun install -g @ccusage/codex',
      bunx: "@ccusage/codex is not available. Ensure it's installed globally",
      'totals.*null': 'No usage data found in codex export',
    },
    opencode: {
      ENOENT: 'OpenCode data directory not found',
      EACCES: 'Permission denied accessing OpenCode data directory',
    },
    gemini: {
      ENOENT: 'Gemini data directory not found',
      EACCES: 'Permission denied accessing Gemini data directory',
    },
    qwen: {
      ENOENT: 'Qwen data directory not found',
      EACCES: 'Permission denied accessing Qwen data directory',
    },
    'kimi-cli': {
      ENOENT: '',
      'command not found': 'kimi-cli is not installed',
      bunx: "kimi-cli is not available. Ensure it's installed globally",
      'totals.*null': 'No usage data found in kimi-cli export',
    },
  };

  const providerKey = providerName.toLowerCase();
  if (providerKey in errorMappings) {
    const providerMappings = errorMappings[providerKey];
    for (const [pattern, message] of Object.entries(providerMappings)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(normalizedError.message)) {
        return message;
      }
    }
  }

  return `${operation} failed for ${providerName}: ${normalizedError.message}`;
}
