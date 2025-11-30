# Project Structure

```plaintext
agent-exporter/
├── src/
│   ├── cli.ts                     # CLI entry point
│   ├── __tests__/                 # CLI tests
│   │   ├── cli.test.ts            # CLI unit tests
│   │   └── sample-cc.json         # Test data sample
│   ├── core/                      # Core domain logic
│   │   ├── types.ts               # Shared TypeScript interfaces
│   │   ├── aggregator.ts          # Usage aggregation routines
│   │   ├── statistics.ts          # Period statistics calculations
│   │   ├── pricing.ts             # Pricing integration helpers
│   │   ├── date-utils.ts          # Date range helpers
│   │   ├── error-utils.ts         # Error handling utilities
│   │   ├── fs-utils.ts            # File system utilities
│   │   ├── path-validation.ts     # Path validation utilities
│   │   ├── spawn-utils.ts         # Command execution utilities
│   │   ├── __tests__/             # Unit tests for core helpers
│   │   │   ├── aggregator.test.ts # Aggregator tests
│   │   │   ├── date-utils.test.ts # Date utils tests
│   │   │   ├── pricing.test.ts    # Pricing tests
│   │   │   └── statistics.test.ts # Statistics tests
│   │   └── database/
│   │       ├── __tests__/         # Database tests
│   │       │   └── prices.test.ts # Prices tests
│   │       ├── model-labels.ts    # Model label mappings
│   │       └── prices.ts          # Fallback pricing database
│   ├── database/                  # SQLite database layer
│   │   ├── __tests__/             # Database tests
│   │   │   └── manager.test.ts    # Database manager tests
│   │   ├── schema.ts              # Database schema definition
│   │   └── manager.ts             # Database access helpers
│   ├── providers/                 # Provider adapters
│   │   ├── opencode.ts            # OpenCode adapter
│   │   ├── ccusage.ts             # Claude Code adapter
│   │   ├── codex.ts               # Codex adapter
│   │   ├── gemini.ts              # Gemini adapter
│   │   ├── qwen.ts                # Qwen adapter
│   │   ├── kimi-cli.ts            # Kimi CLI adapter
│   │   └── __tests__/             # Provider tests
│   │       ├── ccusage.test.ts    # Claude Code tests
│   │       ├── codex.test.ts      # Codex tests
│   │       ├── gemini.test.ts     # Gemini tests
│   │       ├── kimi-cli.test.ts   # Kimi CLI tests
│   │       ├── opencode.test.ts   # OpenCode tests
│   │       └── qwen.test.ts       # Qwen tests
│   ├── exporters/                 # Export format handlers
│   │   ├── ccusage.ts             # CCUsage exporter
│   │   └── json.ts                # JSON exporter
│   ├── generated/                 # Auto-generated files
│   │   └── version.ts             # Version info from package.json
│   └── ui/                        # Terminal UI components
│       ├── stats-app.tsx          # Interactive stats dashboard
│       ├── Dashboard.tsx          # Main dashboard component
│       ├── DashboardContainer.tsx # Dashboard container
│       ├── ProviderStatusRow.tsx  # Provider status component
│       ├── SyncApp.tsx            # Sync progress component
│       ├── Table.tsx              # Generic table renderer
│       └── formatters.ts          # UI formatting utilities
├── dist/                          # Compiled binaries (bun build output)
├── docs/                          # Documentation
├── scripts/                       # Build and utility scripts
├── .github/                       # GitHub workflows
├── package.json
├── bun.lockb
├── tsconfig.json
└── README.md
```
