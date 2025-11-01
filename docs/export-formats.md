# Export Formats

## JSON Export Format

The exported JSON is organized by provider name (`[provider-name]`), then by sub-provider name (`[sub-provider-name]`), with each provider containing daily breakdowns in CCUsage format:

```json
{
  "[provider-name]": {
    "[sub-provider-name]": {
      "daily": [
        {
          "date": "2025-10-01",
          "inputTokens": 20723,
          "outputTokens": 59188,
          "cacheCreationTokens": 4510035,
          "cacheReadTokens": 56239656,
          "totalTokens": 60829602,
          "totalCost": 60.63,
          "modelsUsed": ["claude-opus-4-1-20250805", "claude-sonnet-4-5-20250929"],
          "modelBreakdowns": [...]
        }
      ],
      "totals": {
        "inputTokens": 98663,
        "outputTokens": 450152,
        "cacheCreationTokens": 18740952,
        "cacheReadTokens": 225445494,
        "totalCost": 260.82,
        "totalTokens": 244735261
      }
    }
  },
  "[provider-name]"
    "daily": [
      {
        "date": "2025-10-01",
        "inputTokens": 20723,
        "outputTokens": 59188,
        "cacheCreationTokens": 4510035,
        "cacheReadTokens": 56239656,
        "totalTokens": 60829602,
        "totalCost": 60.63,
        "modelsUsed": ["claude-opus-4-1-20250805", "claude-sonnet-4-5-20250929"],
        "modelBreakdowns": [...]
      }
    ],
    "totals": {
      "inputTokens": 98663,
      "outputTokens": 450152,
      "cacheCreationTokens": 18740952,
      "cacheReadTokens": 225445494,
      "totalCost": 260.82,
      "totalTokens": 244735261
    }
  },
}
```

## CCUsage Export Format

The exported JSON includes:

- Daily usage breakdowns by date
- Per-model statistics (tokens, costs)
- Total aggregates across all dates

Example structure:

```json
{
  "daily": [
    {
      "date": "2025-10-01",
      "inputTokens": 20723,
      "outputTokens": 59188,
      "cacheCreationTokens": 4510035,
      "cacheReadTokens": 56239656,
      "totalTokens": 60829602,
      "totalCost": 60.63,
      "modelsUsed": ["claude-opus-4-1-20250805"],
      "modelBreakdowns": [
        {
          "modelName": "claude-opus-4-1-20250805",
          "inputTokens": 1028,
          "outputTokens": 14346,
          "cacheCreationTokens": 656058,
          "cacheReadTokens": 12651484,
          "cost": 32.37
        }
      ]
    }
  ],
  "totals": {
    "inputTokens": 98663,
    "outputTokens": 450152,
    "cacheCreationTokens": 18740952,
    "cacheReadTokens": 225445494,
    "totalCost": 260.82,
    "totalTokens": 244735261
  }
}
```
