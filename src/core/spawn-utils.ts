/**
 * Command execution utilities for spawning processes with consistent error handling
 */

import type {z} from 'zod';

/**
 * Spawns a command, parses its JSON output, and validates it with a Zod schema
 * @param command - Array of command parts (e.g., ['ccusage', 'daily', '--json'])
 * @param schema - Zod schema to validate the output
 * @returns Parsed and validated data
 * @throws Error if command fails or output doesn't match schema
 */
export async function spawnCommandAndParseJson<T>(
  command: string[],
  schema: z.ZodType<T>,
): Promise<T> {
  const proc = Bun.spawn(command, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const errorOutput = await new Response(proc.stderr).text();
    throw new Error(
      `${command[0]} command failed with exit code ${exitCode}: ${errorOutput}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(output);
  } catch (parseError) {
    const outputSnippet =
      output.length > 500 ? output.slice(0, 500) + '...' : output;

    const errorMessage =
      `Failed to parse JSON output from ${command.join(' ')} (exit code: ${exitCode}). ` +
      `Raw output: ${JSON.stringify(outputSnippet)}. ` +
      `Original error: ${parseError instanceof Error ? parseError.message : String(parseError)}`;

    const wrappedError = new Error(errorMessage);
    if (parseError instanceof Error) {
      wrappedError.cause = parseError;
    }
    throw wrappedError;
  }

  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    throw new Error(
      `Failed to parse ${command[0]} output: ${JSON.stringify(parsed.error.issues)}`,
    );
  }

  return parsed.data;
}
