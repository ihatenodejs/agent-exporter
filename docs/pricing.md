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

## Pricing Priority

1. **genai-prices** - Checked first for all models
2. **Fallback database** - Used if model not found in genai-prices
3. **Zero cost** - Models not found in either source default to $0
