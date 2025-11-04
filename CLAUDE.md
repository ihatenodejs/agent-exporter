# CLAUDE.md

## Policy on Bun

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Exporter is a CLI tool for tracking and analyzing LLM usage costs across multiple AI agent providers (OpenCode, Claude Code/CCUsage, Codex, Gemini, Qwen). It uses SQLite for storage, calculates costs using @pydantic/genai-prices with a fallback pricing database, and exports data in various formats.

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
3. **Pricing** (src/core/pricing.ts) calculates costs using genai-prices → fallback database → $0
4. **Exporters** (src/exporters/) transform data into output formats
5. **CLI** (src/cli.ts) orchestrates everything via Commander.js

### Key Patterns

**Provider Adapters**: All providers implement `ProviderAdapter` interface with:

- `name: string` - Provider identifier
- `dataType: "messages" | "usage entries"` - Type of data returned
- `fetchMessages(): Promise<UnifiedMessage[]>` - Fetches and normalizes data

**Unified Message Format**: All provider data is converted to `UnifiedMessage` (src/core/types.ts) with standardized token counts (input, output, reasoning, cache creation/read), cost, and metadata.

**Two-Tier Pricing**:

1. Primary: `@pydantic/genai-prices` via `calcPrice()` - handles hundreds of models automatically
2. Fallback: `src/core/database/prices.ts` - custom pricing for models not in genai-prices
3. Default: $0 for unknown models

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

1. Create `src/providers/your-provider.ts` implementing `ProviderAdapter`
2. Transform source data to `UnifiedMessage[]` format
3. Use utility functions for common operations (see below)
4. Add provider to CLI in `src/cli.ts` sync command
5. Update provider list in README.md

Example structure:

```typescript
import {normalizeAndLogError} from '../core/error-utils';
import {getDirectories, getFiles, readJsonFile} from '../core/fs-utils';
import {spawnCommandAndParseJson} from '../core/spawn-utils';
import {calculateCost} from '../core/pricing';

export class YourProviderAdapter implements ProviderAdapter {
  name = 'your-provider' as const;
  dataType = 'messages' as const;

  async fetchMessages(): Promise<UnifiedMessage[]> {
    try {
      // For file-based providers:
      const sessionDirs = getDirectories(this.dataPath);
      const files = getFiles(sessionPath, {
        prefix: 'session-',
        suffix: '.json',
      });
      const data = await readJsonFile(filePath);

      // For command-based providers:
      const data = await spawnCommandAndParseJson(
        ['command', '--json'],
        YourSchema,
      );

      // Calculate costs using the pricing utility
      const cost = calculateCost(
        model,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        provider,
      );

      return unifiedMessages;
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
