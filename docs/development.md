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

This creates platform-specific executables for all supported platforms:

- `dist/agent-exporter-linux-x64`
- `dist/agent-exporter-linux-arm64`
- `dist/agent-exporter-darwin-x64`
- `dist/agent-exporter-darwin-arm64`

You can also build for specific platforms:

```bash
bun run build:linux-x64
bun run build:linux-arm64
bun run build:darwin-x64
bun run build:darwin-arm64
```

## Testing

Run unit tests:

```bash
bun run test
```

## Code Quality

Run linting and formatting:

```bash
bun run lint
bun run lint:fix
bun run format
bun run format:check
```

## Type Checking

Run TypeScript type checking:

```bash
bun run typecheck
```

## Local Testing

Link the package for local testing:

```bash
bun link
# Then use: agent-exporter <command>
```
