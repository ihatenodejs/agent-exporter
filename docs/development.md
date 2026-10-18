# Development

## Running in Development

Run the CLI in development mode:

```bash
bun run dev sync
bun run dev live
bun run dev daily
bun run dev weekly
bun run dev monthly
bun run dev yearly
bun run dev range --start 2025-01-01 --end 2025-01-31
bun run dev json
bun run dev export ccusage
bun run dev ingest cc.json
```

## Building and Starting

Build the host-targeted standalone executable:

```bash
bun run build
```

This creates a compiled standalone binary at `dist/agent-exporter` targeting the current host operating system and architecture.

To run the compiled binary:

```bash
bun run start
```

> **Note:** `bun run start` executes `bun dist/agent-exporter` and **requires a prior build** (`bun run build`). If the binary has not been compiled first, the command will fail.

## Type Checking

Run TypeScript type checking:

```bash
bun run typecheck
```

## Quality Hooks

Install the repository's Git hooks after cloning:

```bash
pre-commit install --install-hooks
```

Pre-commit formats staged supported files, lints staged TypeScript sources,
and checks file integrity, merge conflicts, large files, and private keys.
Pre-push runs the complete TypeScript type check and Bun test suite.

## Local Testing

Link the package for local testing:

```bash
bun link
# Then use: agent-exporter <command>
```

## Packaging Smoke Testing

To verify the npm package artifact without publishing or mutating global state, run the installed-package smoke harness:

```bash
bun run package:smoke
```

### Packed-Install Shim Workflow

The smoke script (`scripts/package-smoke.ts`) performs an end-to-end installation test using an actual npm tarball:

1. **Pack:** Packs the repository using `npm pack --ignore-scripts --json --pack-destination <temp>` into an isolated temporary directory.
2. **Inspect Contents:** Validates that runtime TypeScript sources (`src/**`) and required package metadata are included, while development tests (`src/**/__tests__`), test fixtures (`src/**/__fixtures__`), and native `dist` binaries are excluded.
3. **Install:** Installs the packaged tarball into an isolated disposable consumer package via `npm install --prefix <temp-consumer> --ignore-scripts <tarball>`.
4. **Execute Shim:** Resolves the installed platform-native npm bin shim (`agent-exporter.cmd` on Windows, or the Unix executable shim on macOS/Linux).
5. **Verify CLI Commands:** Invocations through the platform shim verify:
   - `--version` matches the packaged `package.json` version.
   - `--help` displays available CLI subcommands.
   - `json --db :memory:` executes successfully against an in-memory database without accessing network services or existing usage databases.

> **Runtime Requirement:** **Node.js alone is insufficient** to run the package. The CLI entrypoint specifies `#!/usr/bin/env bun` and relies on Bun runtime APIs and SQLite. Bun must be installed and present on your `PATH`.

### Platform Verification Status

The packaging smoke harness has been verified locally on macOS. A multi-platform continuous integration matrix covering `ubuntu-latest`, `macos-latest`, and `windows-latest` has been added to `.github/workflows/quality-checks.yml`. However, live Ubuntu and Windows runner execution evidence has not yet been collected in this environment, and contributors do not have authorization to push or trigger release workflows. Cross-platform portability is therefore not claimed as proven until CI matrix results are verified across all three operating systems.

## Financial Persistence Safety Gate

To verify database persistence and financial invariant protections, run the targeted database test suite:

```bash
bun test src/database/__tests__/manager.test.ts
```

This safety gate tests real persistence behavior against isolated temporary SQLite database instances (cleaned up in `finally` blocks) without mocking the database engine or relying on external services. Do not claim arbitrary coverage percentages; the gate guarantees specific behavioral invariants:

- **Durable Persistence Across Reopen:** Validates that message fields, tokens, cost values, and timestamps survive database closing and reopening.
- **Deduplication and Replacement:**
  - Reimporting an identical message ID leaves exactly one record without duplicating rows.
  - Importing an updated message with an existing ID replaces the stored values.
  - Empty import batches leave preexisting records unchanged.
- **Date Range Filtering & Ordering:**
  - Date queries respect inclusive lower (`--start`) and upper (`--end`) boundaries.
  - Out-of-range rows are excluded.
  - Query results are ordered by timestamp ascending.
- **Batch Insert Rollback:**
  - When an insert fails mid-batch (simulated deterministically with temporary SQLite triggers), the entire transaction rolls back.
  - Preexisting rows survive intact, no partial rows from the failing batch remain, and subsequent batches succeed once the trigger is removed.
- **Cost Recalculation & Repair:**
  - **Default Repair Mode (`recalculateCosts(false)`):** Repairs missing or zero-cost records using fallback pricing while preserving existing positive stored costs.
  - **Forced Repair Mode (`recalculateCosts(true)`):** Recalculates all message costs regardless of existing stored values.
  - **Recalculation Rollback:** When an update error occurs mid-recalculation (simulated with an update-abort trigger), all cost modifications roll back to their initial sentinel values within the transaction.
