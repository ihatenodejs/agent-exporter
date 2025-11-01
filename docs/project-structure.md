# Project Structure

```
agent-exporter/
├── src/
│   ├── cli.ts                     # CLI entry point
│   ├── core/                      # Core domain logic
│   │   ├── types.ts               # Shared TypeScript interfaces
│   │   ├── aggregator.ts          # Usage aggregation routines
│   │   ├── statistics.ts          # Period statistics calculations
│   │   ├── pricing.ts             # Pricing integration helpers
│   │   ├── date-utils.ts          # Date range helpers
│   │   ├── __tests/               # Unit tests for core helpers
│   │   └── database/
│   │       └── prices.ts          # Fallback pricing database
│   ├── database/                  # SQLite database layer
│   │   ├── schema.ts              # Database schema definition
│   │   └── manager.ts             # Database access helpers
│   ├── providers/                 # Provider adapters
│   │   ├── opencode.ts            # OpenCode adapter
│   │   ├── ccusage.ts             # Claude Code adapter
│   │   ├── codex.ts               # Codex adapter
│   │   ├── gemini.ts              # Gemini adapter
│   │   └── qwen.ts                # Qwen adapter
│   ├── exporters/                 # Export format handlers
│   │   ├── ccusage.ts             # CCUsage exporter
│   │   └── json.ts                # JSON exporter
│   └── ui/                        # Terminal UI components
│       ├── stats-app.tsx          # Interactive stats dashboard
│       └── Table.tsx              # Generic table renderer
├── tests/                         # Test suites (pricing coverage)
│   └── pricing.test.ts
├── dist/                          # Compiled binaries (bun build output)
├── package.json
├── bun.lock
└── tsconfig.json
```
