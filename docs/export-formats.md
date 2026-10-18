# Export Formats

`agent-exporter` supports two export formats:

1. **JSON Export (`agent-exporter json`)**: Usage grouped by provider name at a single key level (`Record<string, CCUsageExport>`), preserving provider separation across exports and imports.
2. **CCUsage Export (`agent-exporter export ccusage`)**: Standard plain CCUsage format (`{ daily, totals }`), aggregating usage across all providers into unified daily totals.

## JSON Export Format (Grouped by Provider)

The grouped JSON format organizes data with exactly one provider key level (`Record<string, CCUsageExport>`). There is no sub-provider nesting. Each provider key maps to a standard CCUsage export object with daily breakdowns and aggregated totals for that provider:

```json
{
  "anthropic": {
    "daily": [
      {
        "date": "2020-01-01",
        "inputTokens": 20,
        "outputTokens": 40,
        "cacheCreationTokens": 6,
        "cacheReadTokens": 8,
        "totalTokens": 74,
        "totalCost": 2,
        "modelsUsed": ["claude-sonnet-4-5"],
        "modelBreakdowns": [
          {
            "modelName": "claude-sonnet-4-5",
            "inputTokens": 20,
            "outputTokens": 40,
            "cacheCreationTokens": 6,
            "cacheReadTokens": 8,
            "cost": 2
          }
        ]
      }
    ],
    "totals": {
      "inputTokens": 20,
      "outputTokens": 40,
      "cacheCreationTokens": 6,
      "cacheReadTokens": 8,
      "totalCost": 2,
      "totalTokens": 74
    }
  },
  "oh-my-pi": {
    "daily": [
      {
        "date": "2020-01-01",
        "inputTokens": 10,
        "outputTokens": 20,
        "cacheCreationTokens": 3,
        "cacheReadTokens": 4,
        "totalTokens": 37,
        "totalCost": 1,
        "modelsUsed": ["claude-sonnet-4-5"],
        "modelBreakdowns": [
          {
            "modelName": "claude-sonnet-4-5",
            "inputTokens": 10,
            "outputTokens": 20,
            "cacheCreationTokens": 3,
            "cacheReadTokens": 4,
            "cost": 1
          }
        ]
      }
    ],
    "totals": {
      "inputTokens": 10,
      "outputTokens": 20,
      "cacheCreationTokens": 3,
      "cacheReadTokens": 4,
      "totalCost": 1,
      "totalTokens": 37
    }
  }
}
```

## CCUsage Export Format (Plain Aggregated)

The plain CCUsage format exports usage aggregated across all providers without provider keys:

- Daily usage breakdowns by date
- Per-model statistics (tokens, costs) summed across all providers
- Total aggregates across all dates

```json
{
  "daily": [
    {
      "date": "2020-01-01",
      "inputTokens": 30,
      "outputTokens": 60,
      "cacheCreationTokens": 9,
      "cacheReadTokens": 12,
      "totalTokens": 111,
      "totalCost": 3,
      "modelsUsed": ["claude-sonnet-4-5"],
      "modelBreakdowns": [
        {
          "modelName": "claude-sonnet-4-5",
          "inputTokens": 30,
          "outputTokens": 60,
          "cacheCreationTokens": 9,
          "cacheReadTokens": 12,
          "cost": 3
        }
      ]
    }
  ],
  "totals": {
    "inputTokens": 30,
    "outputTokens": 60,
    "cacheCreationTokens": 9,
    "cacheReadTokens": 12,
    "totalCost": 3,
    "totalTokens": 111
  }
}
```

## Restore and Ingestion Semantics

Both formats can be imported using `agent-exporter ingest <file>`. However, they have distinct identity preservation and restoration characteristics:

### Grouped vs. Plain Restored Identity

- **Grouped JSON**: Preserves provider identity. When ingesting grouped JSON, the parser extracts each top-level key as the provider name (`anthropic`, `oh-my-pi`) and generates deterministic grouped message identifiers (`ccusage-grouped:[provider, date, model, index]`). This ensures that entries from different providers using the same model on the same date remain separate records in the database.
- **Plain CCUsage**: Does **not** preserve provider separation. The plain format contains no provider metadata. When ingesting plain CCUsage data, provider identity is guessed using **legacy model-based inference** (`detectProviderFromModel`), which inspects substring patterns in the model name (e.g., mapping models containing `claude` to `anthropic`). If multiple providers used the same model on the same date, their usage is aggregated into a single entry attributed to the inferred provider, losing original provider identity.

### Aggregate Format Limitations

Both export formats represent daily model-level aggregates, not a lossless message-level backup:

- **Lost original message IDs and counts**: Exports aggregate all individual messages by model and date. On restore, each daily model breakdown is stored as a single synthesized entry (`entryCount` and original message IDs are not preserved).
- **Lost conversation session IDs**: Individual session contexts are not tracked in the export. Plain imports synthesize sessions per date; grouped imports synthesize sessions per provider and date.
- **Lost reasoning tokens**: The export schema does not include reasoning tokens; restored records have `reasoningTokens` set to 0.

### Idempotency and Recovery Caveats

- **Stable repeated grouped ingest**: Ingestion is idempotent using `INSERT OR REPLACE` with deterministic IDs. Re-ingesting the same grouped export file will update existing records in place without duplicating totals or corrupting rows.
- **No destructive old-import cleanup**: Grouped imports use a separate identifier namespace and do not remove ambiguous legacy rows created by earlier, lossy grouped imports. Reimporting records with the same generated identifiers still replaces those records.
- **Fresh DB recovery caveat**: Corrected grouped ingest leaves old legacy rows in place. Recover provider-separated history by importing an original grouped export into a **fresh database** using `--db <path>`. A plain CCUsage file cannot recover provider attribution that it never stored.
