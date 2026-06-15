# Selection Plan Format

Write one file per day:

`output/selections/YYYY-MM-DD.json`

## Required Shape

```json
{
  "schemaVersion": 1,
  "status": "planned",
  "date": "2026-06-19",
  "generatedAt": "2026-06-15T12:00:00.000Z",
  "preferencesFile": "output/preferences.json",
  "menuFile": "output/discovery/day-2026-06-19.json",
  "model": {
    "method": "subagent-classification",
    "agent": "day-classifier"
  },
  "summary": "Short day-level summary of the overall selection logic.",
  "choices": [
    {
      "mealTypeId": 1,
      "mealTypeName": "Sniadanie",
      "optionId": 4532566,
      "dishName": "Pełnoziarnisty biszkopt kakaowy, ricotta z musem malinowym i melon",
      "rationale": "Short 1-2 sentence explanation tied to preferences.",
      "matchedPreferenceIds": []
    }
  ],
  "rejected": [
    {
      "mealTypeId": 3,
      "optionId": 4532393,
      "dishName": "Example rejected dish",
      "reason": "Excluded or strongly penalized reason."
    }
  ]
}
```

## Status Values

- `planned`: selected by Codex/subagent, not yet applied.
- `applied`: successfully applied to the Maczfit website by `npm run apply:selections -- --apply`.
- `failed`: apply script attempted the file and failed; it can be retried because the script processes any status other than `applied`.

The apply script adds:

```json
{
  "appliedAt": "2026-06-15T12:10:00.000Z",
  "applyResult": {}
}
```

On failure it adds:

```json
{
  "failedAt": "2026-06-15T12:10:00.000Z",
  "error": "Failure message"
}
```

## Validation Rules

- `date` must match the filename date.
- `choices` must include exactly one option for each enabled/changeable meal from the menu.
- Each `optionId` must exist in `menuFile` under the same `mealTypeId`.
- Do not include disabled meals such as Podwieczorek when they are absent from the menu JSON.
- Rationales should be short and useful, not a long chain-of-thought transcript.
- Hard exclusions from preferences must appear in `rejected` if any matching option was available.
