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

### Gemini Provider

- Fetches usage data from Google's Gemini API
- Supports all Gemini model variants
- Includes token usage and cost information
- Requires appropriate API credentials to be configured

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

To add a new provider, implement the `ProviderAdapter` interface:

```typescript
export interface ProviderAdapter {
  name: string;
  dataType: 'messages' | 'usage entries';
  fetchMessages(): Promise<UnifiedMessage[]>;
}
```

Steps to add a new provider:

1. Create a new file in `src/providers/your-provider.ts`
2. Implement the `ProviderAdapter` interface
3. Transform source data to `UnifiedMessage[]` format
4. Use `calculateCost()` from pricing.ts for cost calculation
5. Add the provider to the VALID_PROVIDERS list in `src/cli.ts`
6. Add the provider to the createProviderAdapter mapping in `src/cli.ts`
7. Update the provider list in README.md and documentation

Example structure:

```typescript
export class YourProviderAdapter implements ProviderAdapter {
  name = 'your-provider' as const;
  dataType = 'messages' as const;

  async fetchMessages(): Promise<UnifiedMessage[]> {
    // Fetch from source
    // Transform to UnifiedMessage[]
    // Calculate costs
    return unifiedMessages;
  }
}
```
