# Usage

All commands can be run with `agent-exporter` after installation.

## Sync Data from Providers

Sync usage data from various AI agent providers to the local database:

```bash
# Sync from OpenCode (default)
agent-exporter sync

# Sync from CCUsage (Claude Code)
agent-exporter sync --provider ccusage

# Sync from Antigravity
agent-exporter sync --provider antigravity

# Sync from Qwen
agent-exporter sync --provider qwen

# Sync from Codex
agent-exporter sync --provider codex

# Sync from all providers
agent-exporter sync --provider all
agent-exporter sync # `all` is the default for sync
```

By default, data is stored in `~/.agent-exporter.db`.

### Ingest Usage Data from CCUsage or Grouped JSON Export

Import usage data from a CCUsage or grouped JSON export file:

```bash
# Ingest into default database (~/.agent-exporter.db)
agent-exporter ingest cc.json

# Ingest into custom database path
agent-exporter ingest cc.json --db ./custom.db

# Ingest into a fresh database for clean historical recovery
agent-exporter ingest usage-export-0001-01-01-to-9999-12-31.json --db ./fresh.db
```

This command reads either a plain CCUsage export file or a provider-grouped JSON export file and imports usage entries into the local database:

- **Grouped JSON exports** (`agent-exporter json`): Provider identity is preserved during ingest using deterministic grouped record identifiers. Repeated ingest is stable and idempotent (`INSERT OR REPLACE`).
- **Plain CCUsage exports** (`agent-exporter export ccusage`): Provider separation is not preserved; provider identity is inferred from model names via legacy heuristics (`detectProviderFromModel`).
- **Fresh database recovery**: Corrected grouped imports do not delete ambiguous legacy rows from earlier, lossy grouped imports. If previous imports collapsed multiple providers under legacy identifiers, import your original grouped export into a fresh database (`--db <path>`) for clean recovery. Reimporting the same generated identifiers replaces their existing records.

Options:

- `-d, --db <path>` - Custom database path

### Recalculating Costs

When pricing data is updated (e.g., new model prices added to the fallback database), you can recalculate costs for all existing messages:

```bash
agent-exporter sync --recalculate-costs
```

This will:

1. Sync new messages from the provider
2. Recalculate costs for **all** messages in the database using the current pricing data
3. Update the database with the new cost values

Options:

- `-p, --provider <provider>` - Provider to sync (opencode, ccusage, codex, antigravity, oh-my-pi, qwen, or all) (default: all)
- `-d, --db <path>` - Custom database path

### View Statistics

Display usage statistics for various time periods:

#### Interactive Live Dashboard

```bash
agent-exporter live
```

Launches an interactive dashboard with real-time updates. The dashboard allows you to:

- Switch between different time periods (daily, weekly, monthly, yearly)
- View detailed usage statistics with automatic refresh
- Navigate through provider and model breakdowns
- Use keyboard shortcuts for quick navigation

Options:

- `-d, --db <path>` - Custom database path
- `--use-raw-labels` - Display raw model identifiers instead of friendly labels

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

Export usage data grouped by provider in JSON format. The exported JSON is keyed by provider name at a single level (`Record<string, CCUsageExport>`), preserving provider separation.

#### Output to Console

By default, `agent-exporter json` prints formatted JSON directly to stdout:

```bash
# Export all stored history to console (no cutoff)
agent-exporter json

# Export with time period
agent-exporter json --period daily
agent-exporter json --period weekly
agent-exporter json --period monthly
agent-exporter json --period yearly

# Export with bounded date range
agent-exporter json --start 2025-09-01 --end 2025-10-30

# Export with lone lower bound (from date through all future history)
agent-exporter json --start 2025-09-01

# Export with lone upper bound (from earliest history through date)
agent-exporter json --end 2025-10-30

# Export from custom database
agent-exporter json --db ./custom.db
```

#### Output to File

Use `-o, --output <path>` to write the JSON export to a file instead of stdout:

```bash
# Export all history to a specific file
agent-exporter json --output my-usage.json

# Export all history from a custom database to file
agent-exporter json --output my-usage.json --db ./custom.db

# Export today's data to file
agent-exporter json --period daily --output today.json

# Export with custom date range to file
agent-exporter json --start 2025-09-01 --end 2025-10-30 --output my-usage.json

# Export with lone lower bound to file
agent-exporter json --start 2025-09-01 --output from-sept.json --db ./custom.db
```

Options:

- `-p, --period <period>` - Time period: `daily`, `weekly`, `monthly`, or `yearly`
- `-s, --start <date>` - Start date (`YYYY-MM-DD`)
- `-e, --end <date>` - End date (`YYYY-MM-DD`)
- `-o, --output <path>` - Output file path (optional, outputs to console if not specified)
- `-d, --db <path>` - Custom database path

### Export Data in CCUsage Format

Export usage data to a file in plain CCUsage format (`{ daily, totals }`). Usage is aggregated across all providers into unified totals.

#### Export All Data

When no date bounds or periods are specified, all stored history is exported (no rolling window cutoff):

```bash
# Export all data (auto-generates default sentinel filename)
agent-exporter export ccusage

# Export all data to specific file
agent-exporter export ccusage --output all-usage.json

# Export all data from custom database to specific file
agent-exporter export ccusage --output all-usage.json --db ./custom.db

# Export all data from custom database with auto-generated sentinel filename
agent-exporter export ccusage --db ./custom.db
```

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

#### Export with Custom Date Range and Open Bounds

```bash
# Export with explicit date range
agent-exporter export ccusage --start 2025-09-01 --end 2025-10-30 --output my-usage.json

# Export with lone lower bound (open upper bound)
agent-exporter export ccusage --start 2025-09-01 --output from-sept.json

# Export with lone upper bound (open lower bound)
agent-exporter export ccusage --end 2025-10-30 --output through-oct.json

# Export with custom date range and custom database
agent-exporter export ccusage --start 2025-09-01 --end 2025-10-30 --output range.json --db ./custom.db
```

Options:

- `-p, --period <period>` - Time period: `daily`, `weekly`, `monthly`, or `yearly`
- `-s, --start <date>` - Start date (`YYYY-MM-DD`)
- `-e, --end <date>` - End date (`YYYY-MM-DD`)
- `-o, --output <path>` - Output file path (optional, auto-generated if not specified)
- `-d, --db <path>` - Custom database path

### Date Filtering and Filename Semantics

Both `agent-exporter json` and `agent-exporter export ccusage` adhere to consistent date filtering and filename generation contracts:

- **No default cutoff**: If neither `--period`, `--start`, nor `--end` is specified, all stored history is exported. There is no silent rolling window or 30-day cutoff.
- **Inclusive and open bounds**:
  - `--start <date>` and `--end <date>` define an inclusive ISO date range (`YYYY-MM-DD`). Equal dates (e.g. `--start 2025-09-01 --end 2025-09-01`) export a single day.
  - Lone lower bound (`--start` without `--end`): exports from the start date through all future stored history (open upper bound).
  - Lone upper bound (`--end` without `--start`): exports from earliest stored history through the end date (open lower bound).
- **Strict date validation**:
  - Invalid date formats (not `YYYY-MM-DD`), non-existent calendar dates, and empty date strings are strictly rejected with an error message and non-zero exit code.
  - Reversed date ranges (where `--start` is chronologically after `--end`) are strictly rejected with an error message and non-zero exit code.
- **Calendar period precedence**:
  - If `--period` is provided alongside `--start` or `--end`, `--period` takes precedence to compute the date range rather than causing a mutual exclusion error.
- **Default sentinel filenames**:
  - When writing to a file without specifying `-o, --output <path>` (supported by `export ccusage`, and in programmatic exporter APIs), the default filename follows the pattern `usage-export-${start}-to-${end}.json`.
  - Unbounded bounds resolve to explicit ISO query sentinels: `0001-01-01` for unbounded start and `9999-12-31` for unbounded end.
  - Examples:
    - All history (no bounds): `usage-export-0001-01-01-to-9999-12-31.json`
    - Lone start `--start 2025-09-01`: `usage-export-2025-09-01-to-9999-12-31.json`
    - Lone end `--end 2025-10-30`: `usage-export-0001-01-01-to-2025-10-30.json`
    - Explicit range `--start 2025-09-01 --end 2025-10-30`: `usage-export-2025-09-01-to-2025-10-30.json`
