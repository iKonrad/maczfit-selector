# Preferences Format

Write `output/preferences.json` as a single JSON object.

## Top-Level Shape

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-15T12:00:00.000Z",
  "profile": {
    "name": null,
    "notes": []
  },
  "stablePreferences": {
    "hardExclusions": [],
    "softDislikes": [],
    "positivePreferences": [],
    "decisionWeights": {
      "preferHighProtein": "medium",
      "preferVariety": "medium",
      "avoidRepeatingMainProtein": "medium",
      "preferUserFavoritesOverNovelty": "medium"
    }
  },
  "mealTypePreferences": [],
  "alwaysPickRules": [],
  "weeklyPreferences": []
}
```

## Rule Object

Use this shape for hard exclusions, dislikes, positive preferences, always-pick rules, and meal-specific rules.

```json
{
  "id": "short-kebab-case-id",
  "scope": {
    "type": "global",
    "mealTypeIds": []
  },
  "priority": 100,
  "match": {
    "includeTerms": ["egg", "jajko"],
    "excludeTerms": [],
    "tags": [],
    "cuisines": [],
    "proteins": [],
    "preparationStyles": []
  },
  "action": "exclude",
  "reason": "User does not want this selected.",
  "confidence": "high"
}
```

Fields:

- `id`: stable kebab-case identifier.
- `scope.type`: `global`, `meal-type`, `week`, or `date`.
- `scope.mealTypeIds`: use `[1]`, `[3]`, etc. for meal-specific rules; empty for global rules.
- `priority`: higher wins. Suggested scale:
  - `1000`: allergy/medical/hard exclusion
  - `900`: always-pick if available
  - `700`: strong meal-specific rule
  - `500`: stable preference/dislike
  - `300`: weak preference
  - `100`: tie-breaker
- `match.includeTerms`: lowercase matching terms in Polish and/or English when useful.
- `match.excludeTerms`: terms that prevent a match.
- `action`: `exclude`, `penalize`, `prefer`, `always-pick`, or `tie-breaker`.
- `confidence`: `high`, `medium`, or `low`.

## Meal Type Preferences

```json
{
  "mealTypeId": 1,
  "mealTypeName": "Sniadanie",
  "rules": [
    {
      "id": "breakfast-prefer-eggs",
      "scope": {
        "type": "meal-type",
        "mealTypeIds": [1]
      },
      "priority": 700,
      "match": {
        "includeTerms": ["jajko", "jajecznica", "omlet"],
        "excludeTerms": [],
        "tags": [],
        "cuisines": [],
        "proteins": ["egg"],
        "preparationStyles": []
      },
      "action": "prefer",
      "reason": "User likes eggs for breakfast.",
      "confidence": "high"
    }
  ]
}
```

Include meal sections only when the user has preferences for that meal type.

## Always-Pick Rules

Always-pick rules should be explicit and narrow enough to avoid accidental matches.

```json
{
  "id": "always-pick-tagiatelle-with-beef",
  "scope": {
    "type": "global",
    "mealTypeIds": [3]
  },
  "priority": 900,
  "match": {
    "includeTerms": ["tagliatelle", "wolowina", "wołowina"],
    "excludeTerms": [],
    "tags": [],
    "cuisines": [],
    "proteins": ["beef"],
    "preparationStyles": []
  },
  "action": "always-pick",
  "reason": "User said this is a top choice when available.",
  "confidence": "high"
}
```

## Weekly Preferences

Use ISO week ids and concrete date ranges. Week rules may override soft stable preferences, but must not override hard exclusions.

```json
{
  "weekId": "2026-W25",
  "dateRange": {
    "from": "2026-06-15",
    "to": "2026-06-21"
  },
  "mood": "lighter meals, not too much pasta",
  "temporaryRules": [
    {
      "id": "week-2026-w25-avoid-pasta",
      "scope": {
        "type": "week",
        "mealTypeIds": []
      },
      "priority": 650,
      "match": {
        "includeTerms": ["makaron", "pasta", "spaghetti", "tagliatelle"],
        "excludeTerms": [],
        "tags": [],
        "cuisines": [],
        "proteins": [],
        "preparationStyles": []
      },
      "action": "penalize",
      "reason": "Temporary preference for this week.",
      "confidence": "medium"
    }
  ],
  "notes": []
}
```

## Example Complete File

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-15T12:00:00.000Z",
  "profile": {
    "name": null,
    "notes": ["Prefer concrete menu choices over broad labels."]
  },
  "stablePreferences": {
    "hardExclusions": [
      {
        "id": "allergy-peanuts",
        "scope": { "type": "global", "mealTypeIds": [] },
        "priority": 1000,
        "match": {
          "includeTerms": ["orzechy arachidowe", "arachid", "peanut"],
          "excludeTerms": [],
          "tags": [],
          "cuisines": [],
          "proteins": [],
          "preparationStyles": []
        },
        "action": "exclude",
        "reason": "User reported allergy.",
        "confidence": "high"
      }
    ],
    "softDislikes": [],
    "positivePreferences": [],
    "decisionWeights": {
      "preferHighProtein": "medium",
      "preferVariety": "medium",
      "avoidRepeatingMainProtein": "medium",
      "preferUserFavoritesOverNovelty": "medium"
    }
  },
  "mealTypePreferences": [],
  "alwaysPickRules": [],
  "weeklyPreferences": []
}
```
