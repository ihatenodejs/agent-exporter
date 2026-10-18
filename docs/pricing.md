# Pricing

Agent Exporter uses a two-tier pricing system:

1. **Primary: @pydantic/genai-prices** - Automatic pricing for hundreds of popular models
2. **Fallback: Internal database** - Custom pricing for models not in genai-prices

## Primary Pricing Source

[@pydantic/genai-prices](https://github.com/pydantic/genai-prices) provides:

- **Up-to-date pricing** for lots of models from various providers
- **Cache token support** - includes prompt caching costs for supported models
- **No API key required** - pricing data is embedded in the package

## Fallback Pricing Database

For models not found in genai-prices, the tool checks an internal fallback database in `src/core/database/prices.ts`.

### Adding Custom Prices

Edit `src/core/database/prices.ts` to add your models:

```typescript
export const FALLBACK_PRICES: FallbackModelPrice[] = [
  {
    model: 'my-custom-model',
    provider: 'custom',
    inputPer1M: 1.0,
    outputPer1M: 2.0,
    cacheWritePer1M: 1.25,
    cacheReadPer1M: 0.1,
    notes: 'Custom pricing',
  },
  // Add more models...
];
```

### Matching Precedence

When searching the fallback pricing database for a model identifier, candidate matching follows this order:

1. **Provider-qualified exact match**: If a provider is specified, checks for an exact match on both `model` identifier and `provider`.
2. **Exact model match**: Checks for an exact case-sensitive match against `model`.
3. **Regex pattern match**: Evaluates regex patterns defined in `modelPattern` (e.g., for versioned families such as `mimo-v2.5-pro.*`).
4. **Longest containing match (specificity)**: Scans for fallback model names contained within the requested identifier (case-insensitive) and selects the longest matching name. For example, `z-ai/glm-4.5-air` matches both `glm-4.5` and `glm-4.5-air`, but selects `glm-4.5-air` due to its longer match. On equal length, the earlier entry in the table is retained.
5. **Abbreviation fallback (reverse-containment)**: If no containing match exists, checks whether any fallback model name contains the requested identifier (case-insensitive), selecting the first match in table order (e.g., `glm-4` matching `glm-4.6`).
6. **Query validation**: Empty or whitespace-only queries are rejected before fuzzy matching and return no match.

> **Note:** Explicit full model identifiers are strongly preferred over abbreviations to ensure deterministic rate lookup and prevent unintentional broader model selection.

## Pricing Priority

1. **genai-prices** - Checked first for all models
2. **Fallback database** - Used if model not found in genai-prices
3. **Zero cost** - Models not found in either source default to $0
