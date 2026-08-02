Agent Exporter is a CLI tool for tracking and analyzing LLM usage costs across multiple AI agent providers (Oh My Pi, OpenCode, Claude Code/CCUsage, Codex, Gemini, Qwen). It uses SQLite for storage, calculates costs using @pydantic/genai-prices with a fallback pricing database, and exports data in various formats.

## Development Commands

**Run in development:**

```bash
bun run dev <command> [args]
# Example: bun run dev sync --provider opencode
```

**Build executable:**

```bash
bun run build
# Creates compiled binary at dist/agent-exporter
```

**Type checking:**

```bash
bun run typecheck
```

**Link for local testing:**

```bash
bun link
# Then use: agent-exporter <command>
```

## Architecture

### Core Data Flow

1. **Providers** (src/providers/) fetch raw usage data from each platform
2. **DatabaseManager** (src/database/) stores unified messages in SQLite
3. **Pricing** (src/core/pricing.ts) resolves Oh My Pi stored/catalog costs, then genai-prices → fallback database → $0
4. **Exporters** (src/exporters/) transform data into output formats
5. **CLI** (src/cli.ts) orchestrates everything via Commander.js

### Key Patterns

**Provider Adapters**: Each provider implements one member of the `ProviderAdapter` union:

- `MessagesProviderAdapter`: `name`, `dataType: 'messages'`, and `fetchMessages(): Promise<UnifiedMessage[]>`
- `UsageProviderAdapter`: `name`, `dataType: 'usage entries'`, and `fetchUsageEntries(): Promise<UsageEntry[]>`

**Normalized Data**: Message providers return `UnifiedMessage[]` with standardized token counts (input, output, reasoning, cache creation/read), cost, and metadata. Usage providers return `UsageEntry[]`.

**Pricing Resolution**:

1. Oh My Pi: preserve non-zero recorded totals; otherwise use the bundled `@oh-my-pi/pi-catalog` rates
2. Primary: `@pydantic/genai-prices` via `calcPrice()`; Oh My Pi wrapper records search without the wrapper provider ID
3. Fallback: `src/core/database/prices.ts` for exact and regex-matched custom prices
4. Default: $0 for unknown models

**Database Schema**: Single `messages` table with indexed fields (date, provider, model, session_id) and `sync_state` table for tracking last sync per provider.

**Utility Functions & DRY Principles**: The codebase follows DRY (Don't Repeat Yourself) principles with centralized utilities:

- Error handling via `normalizeAndLogError()` in error-utils.ts
- File system operations via `getDirectories()`, `getFiles()`, `readJsonFile()` in fs-utils.ts
- Command execution via `spawnCommandAndParseJson()` in spawn-utils.ts
- Date validation via `validateAndResolveDateRange()` in date-utils.ts
- Daily aggregation via `aggregateMessagesByDailyUsage()` in aggregator.ts
- Factory functions via `createEmptyDailyUsage()` and `createEmptyModelBreakdown()` in aggregator.ts
- UI formatting via formatters in ui/formatters.ts

### Important Files

**Core:**

- **src/cli.ts** - CLI commands using Commander.js and Ink for UI rendering
- **src/core/types.ts** - TypeScript interfaces and Zod schemas
- **src/core/pricing.ts** - Cost calculation logic with genai-prices integration
- **src/core/aggregator.ts** - Daily usage aggregation logic and factory functions
- **src/core/date-utils.ts** - Date validation, period parsing, and range utilities
- **src/core/error-utils.ts** - Centralized error handling and normalization
- **src/core/fs-utils.ts** - File system utilities (directory/file reading, JSON parsing)
- **src/core/spawn-utils.ts** - Command execution with JSON parsing and validation

**Database:**

- **src/database/manager.ts** - SQLite operations (CRUD, aggregations, cost recalculation)
- **src/database/schema.ts** - Database initialization and schema

**Providers & Exporters:**

- **src/providers/** - Provider adapters for each platform
- **src/exporters/** - CCUsage and JSON export formats

**UI:**

- **src/ui/** - Ink React components for terminal UI (stats display)
- **src/ui/formatters.ts** - Number formatters and color utilities for consistent UI formatting

## Adding New Providers

1. Create `src/providers/your-provider.ts` implementing `MessagesProviderAdapter` or `UsageProviderAdapter`
2. Transform source data to `UnifiedMessage[]` or `UsageEntry[]`, respectively
3. Use utility functions for common operations (see below)
4. Add the harness name and adapter factory to `HARNESS_NAMES` and `createProviderAdapter` in `src/cli.ts`
5. Update the provider list in README.md

Example structure:

```typescript
import {normalizeAndLogError} from '../core/error-utils';
import {join} from 'path';
import {getDirectories, readJsonFile} from '../core/fs-utils';
import {spawnCommandAndParseJson} from '../core/spawn-utils';
import {calculateCost} from '../core/pricing';
import type {MessagesProviderAdapter, UnifiedMessage} from '../core/types';

export class YourProviderAdapter implements MessagesProviderAdapter {
  name = 'your-provider' as const;
  dataType = 'messages' as const;

  async fetchMessages(): Promise<UnifiedMessage[]> {
    try {
      // File-based provider pseudocode (use this block as the method body):
      {
        const sessionPath = join(this.dataPath, 'sessions');
        const unifiedMessages: UnifiedMessage[] = [];
        for (const sessionDir of getDirectories(sessionPath)) {
          const filePath = join(sessionPath, sessionDir, 'session.json');
          const data = await readJsonFile(filePath);
          const cost = calculateCost(
            data.model,
            data.inputTokens,
            data.outputTokens,
            data.cacheCreationTokens,
            data.cacheReadTokens,
            data.provider,
          );
          unifiedMessages.push(
            /* transform data and cost into a UnifiedMessage */
          );
        }
        return unifiedMessages;
      }

      // Command-based provider pseudocode (use this block as the method body):
      {
        const data = await spawnCommandAndParseJson(
          ['command', '--json'],
          YourSchema,
        );
        const unifiedMessages = data.map(/* transform each result */);
        return unifiedMessages;
      }
    } catch (error: unknown) {
      throw normalizeAndLogError('to fetch YourProvider data', error);
    }
  }
}
```

**Best Practices:**

- Use `normalizeAndLogError()` for consistent error handling in catch blocks
- Use `getDirectories()`, `getFiles()`, `readJsonFile()` for file system operations
- Use `spawnCommandAndParseJson()` for executing CLI commands with JSON output
- Use `calculateCost()` for cost calculations with automatic fallback to custom pricing

## Adding Custom Model Prices

Edit `src/core/database/prices.ts` to add models not in genai-prices:

```typescript
export const FALLBACK_PRICES: FallbackModelPrice[] = [
  {
    model: 'your-model-name',
    modelPattern: /^your-model-name.*$/i, // Optional; match versioned/case variants
    provider: 'provider-id',
    inputPer1M: 1.0, // Cost per 1M input tokens
    outputPer1M: 2.0, // Cost per 1M output tokens
    cacheWritePer1M: 1.25,
    cacheReadPer1M: 0.1,
    notes: 'Optional description',
  },
];
```

## Database Location

Default: `~/.agent-exporter.db`
Override with `-d, --db <path>` on any command

## UI Components

Uses Ink (React for CLIs) for interactive stats display. Main component: `src/ui/stats-app.tsx`

## Date Handling

- Uses dayjs for date manipulation
- All dates stored as YYYY-MM-DD strings
- Supports periods: daily, weekly, monthly, yearly
- Custom ranges via --start and --end flags
