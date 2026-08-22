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

## Building

Build the executable:

```bash
bun run build
```

This creates a compiled executable at `dist/agent-exporter`.

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
