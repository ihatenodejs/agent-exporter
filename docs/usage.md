# Usage

All commands can be run with `agent-exporter` after installation.

### Sync Data from Providers

Sync usage data from various AI agent providers to the local database:

```bash
# Sync from OpenCode (default)
agent-exporter sync

# Sync from CCUsage (Claude Code)
agent-exporter sync --provider ccusage

# Sync from Gemini
agent-exporter sync --provider gemini

# Sync from Qwen
agent-exporter sync --provider qwen

# Sync from Codex
agent-exporter sync --provider codex

# Sync from all providers
agent-exporter sync --provider all
agent-exporter sync # `all` is the default for sync
```

By default, data is stored in `~/.agent-exporter.db`.

#### Recalculating Costs

When pricing data is updated (e.g., new model prices added to the fallback database), you can recalculate costs for all existing messages:

```bash
agent-exporter sync --recalculate-costs
```

This will:

1. Sync new messages from the provider
2. Recalculate costs for **all** messages in the database using the current pricing data
3. Update the database with the new cost values

Options:

- `-p, --provider <provider>` - Provider to sync (opencode, ccusage, codex, gemini, qwen, or all) (default: opencode)
- `-d, --db <path>` - Custom database path

### View Statistics

Display usage statistics for various time periods:

#### Today's Usage

```bash
agent-exporter daily
```

#### This Week's Usage

```bash
agent-exporter weekly
```

#### This Month's Usage

```bash
agent-exporter monthly
```

#### This Year's Usage

```bash
agent-exporter yearly
```

#### Custom Date Range

```bash
agent-exporter range --start 2025-09-01 --end 2025-10-30
```

Options:

- `-s, --start <date>` - Start date (YYYY-MM-DD) - required for `range` command
- `-e, --end <date>` - End date (YYYY-MM-DD) - required for `range` command
- `-d, --db <path>` - Custom database path
- `--use-raw-labels` - Display raw model identifiers instead of friendly labels
- `--show-hidden` - Display table rows that are hidden by default in the provider/model tables

### Export Data in JSON Format

Export usage data grouped by provider in JSON format:

#### Output to Console

```bash
# Export all data to console
agent-exporter json

# Export with time period
agent-exporter json --period daily
agent-exporter json --period weekly
agent-exporter json --period monthly
agent-exporter json --period yearly

# Export with custom date range
agent-exporter json --start 2025-09-01 --end 2025-10-30
```

#### Output to File

```bash
# Export to specific file
agent-exporter json --output my-usage.json

# Export today's data to file
agent-exporter json --period daily --output today.json

# Export with custom date range to file
agent-exporter json --start 2025-09-01 --end 2025-10-30 --output my-usage.json
```

Options:

- `-p, --period <period>` - Time period: daily, weekly, monthly, or yearly
- `-s, --start <date>` - Start date (YYYY-MM-DD) - alternative to --period
- `-e, --end <date>` - End date (YYYY-MM-DD) - alternative to --period
- `-o, --output <path>` - Output file path (optional, outputs to console if not specified)
- `-d, --db <path>` - Custom database path

### Export Data in CCUsage Format

Export usage data to a file in CCUsage format:

#### Export with Time Period

```bash
# Export today's data
agent-exporter export ccusage --period daily --output today.json

# Export this week's data
agent-exporter export ccusage --period weekly --output week.json

# Export this month's data
agent-exporter export ccusage --period monthly --output month.json

# Export this year's data
agent-exporter export ccusage --period yearly --output year.json
```

#### Export with Custom Date Range

```bash
agent-exporter export ccusage --start 2025-09-01 --end 2025-10-30 --output my-usage.json
```

#### Export All Data

```bash
agent-exporter export ccusage --output all-usage.json
```

Options:

- `-p, --period <period>` - Time period: daily, weekly, monthly, or yearly
- `-s, --start <date>` - Start date (YYYY-MM-DD) - alternative to --period
- `-e, --end <date>` - End date (YYYY-MM-DD) - alternative to --period
- `-o, --output <path>` - Output file path (optional, auto-generated if not specified)
- `-d, --db <path>` - Custom database path

**Note:** Use either `--period` or both `--start` and `--end`, not both together. If neither is specified, all data will be exported.
