# Providers

## Supported Providers

### OpenCode Provider

- Default provider for OpenCode usage data
- Fetches usage entries from OpenCode's API
- Includes all token types (input, output, reasoning, cache)
- No additional configuration required

### CCUsage Provider

- Requires `ccusage` CLI to be installed and available in PATH
- Reads data directly from Claude Code's usage tracking
- Automatically aggregates daily usage from all models used in Claude Code
- Provides accurate costs directly from Claude Code
- No additional configuration needed if you're already using Claude Code

### Codex Provider

- Requires `@ccusage/codex` package to be available via bunx
- Reads data directly from Codex's usage tracking
- Supports all Codex models including GPT-5, GPT-5-Codex, etc.
- Includes reasoning tokens and cached input tokens
- Provides accurate costs directly from Codex
- No additional configuration needed if you're already using Codex

### Antigravity Provider

- Reads local per-conversation SQLite databases from `~/.gemini/antigravity-cli/conversations/`
- Imports invocation-level input, output, cache-read, and cache-write token data
- Estimates API-equivalent cost when model pricing is available

### Oh My Pi Provider

- Reads local Oh My Pi session usage data
- Includes input, output, reasoning, cache-read, and cache-write token data
- Preserves recorded costs when available and otherwise uses the bundled catalog

### Qwen Provider

- Fetches usage data from Alibaba's Qwen models
- Supports Qwen model family including Qwen-Max, Qwen-Plus, etc.
- Includes comprehensive token tracking
- Requires API access to be configured

## Provider Data Types

Providers return one of two data types:

- **Messages**: Individual message-level data with detailed token counts
- **Usage Entries**: Aggregated usage statistics (typically daily summaries)

## Adding New Providers

To add a new provider, implement one of two adapter interfaces depending on your data source:

## Messages Provider Adapter

For providers that expose individual message-level data:

```typescript
export interface MessagesProviderAdapter {
  name: string;
  dataType: 'messages';
  fetchMessages(): Promise<UnifiedMessage[]>;
}
```

## Usage Provider Adapter

For providers that expose aggregated usage data:

```typescript
export interface UsageProviderAdapter {
  name: string;
  dataType: 'usage entries';
  fetchUsageEntries(): Promise<UsageEntry[]>;
}

export interface UsageEntry {
  date: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  entryCount?: number; // Number of messages aggregated into the entry
}
```

## Steps to Add a Messages Provider

1. Create a new file in `src/providers/your-provider.ts`
2. Implement the `MessagesProviderAdapter` interface
3. Transform source data to `UnifiedMessage[]` format
4. Use `calculateCost()` from pricing.ts for cost calculation on each message
5. Add the provider name to `HARNESS_NAMES` and register its adapter through `createProviderAdapter` in `src/cli.ts`
6. Update the provider list in README.md and documentation

Example Messages Provider:

```typescript
export class YourProviderAdapter implements MessagesProviderAdapter {
  name = 'your-provider' as const;
  dataType = 'messages' as const;

  async fetchMessages(): Promise<UnifiedMessage[]> {
    // Fetch individual messages from source
    // Transform each to UnifiedMessage format
    // Calculate costs using calculateCost() for each message
    return unifiedMessages;
  }
}
```

## Steps to Add a Usage Provider

1. Create a new file in `src/providers/your-provider.ts`
2. Implement the `UsageProviderAdapter` interface
3. Transform source data to `UsageEntry[]` format
4. Ensure costs are pre-calculated or calculate them from aggregated token counts
5. Add the provider name to `HARNESS_NAMES` and register its adapter through `createProviderAdapter` in `src/cli.ts`
6. Update the provider list in README.md and documentation

Example Usage Provider:

```typescript
export class YourProviderAdapter implements UsageProviderAdapter {
  name = 'your-provider' as const;
  dataType = 'usage entries' as const;

  async fetchUsageEntries(): Promise<UsageEntry[]> {
    // Fetch aggregated usage data from source
    // Transform to UsageEntry format
    // Costs should already be calculated at the aggregation level
    return usageEntries;
  }
}
```

## CLI Integration

After implementing your adapter, update the CLI integration in `src/cli.ts`:

1. **Add to `HARNESS_NAMES`** (around line 42). New provider names belong here:

```typescript
const HARNESS_NAMES = [
  'opencode',
  'qwen',
  'antigravity',
  'ccusage',
  'codex',
  'oh-my-pi',
  'your-provider', // Add your provider here
] as const;
```

2. **Register the adapter through `createProviderAdapter`** (around line 85):

```typescript
const createProviderAdapter: Record<HarnessName, () => ProviderAdapter> = {
  opencode: () => new OpenCodeAdapter(),
  qwen: () => new QwenAdapter(),
  antigravity: () => new AntigravityAdapter(),
  ccusage: () => new CCUsageAdapter(),
  codex: () => new CodexAdapter(),
  'oh-my-pi': () => new OhMyPiAdapter(),
  'your-provider': () => new YourProviderAdapter(), // Register your adapter here
};
```

Note: The TypeScript types will automatically infer whether your adapter is a `MessagesProviderAdapter` or `UsageProviderAdapter` based on the `dataType` property.
