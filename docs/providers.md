# Providers

## Provider-Specific Notes

### CCUsage Provider:

- Requires `ccusage` CLI to be installed and available in PATH
- Reads data directly from Claude Code's usage tracking
- Automatically aggregates daily usage from all models used in Claude Code
- Provides accurate costs directly from Claude Code
- No additional configuration needed if you're already using Claude Code

**Codex Provider:**

- Requires `@ccusage/codex` package to be available via bunx
- Reads data directly from Codex's usage tracking
- Supports all Codex models including GPT-5, GPT-5-Codex, etc.
- Includes reasoning tokens and cached input tokens
- Provides accurate costs directly from Codex
- No additional configuration needed if you're already using Codex

## Adding New Providers

To add a new provider, implement the `ProviderAdapter` interface:

```typescript
export interface ProviderAdapter {
  name: string;
  fetchMessages(): Promise<UnifiedMessage[]>;
}
```

Create a new file in `src/providers/` and add the adapter to the CLI in `src/cli.ts`.
