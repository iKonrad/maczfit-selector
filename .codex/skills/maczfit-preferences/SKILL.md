---
name: maczfit-preferences
description: Conduct an on-demand interview for Maczfit meal-selection preferences, then create or update the repo-local private preferences JSON used by the meal decision automation. Use only when explicitly invoked by the user with $maczfit-preferences or when they ask to collect/update Maczfit food preferences.
---

# Maczfit Preferences

Use this skill to interview the user and save structured meal-selection preferences for this repo.

Default output path: `output/preferences.json`.

Treat the file as private user data. Do not print sensitive health details back unnecessarily. Never edit `.env` or auth files.

## Workflow

1. Read the current preferences file if it exists.
2. Read [references/preferences-format.md](references/preferences-format.md) before writing JSON.
3. Interview the user in small batches. Ask follow-up questions when an answer is ambiguous or too broad to automate.
4. Save a complete, valid JSON document to `output/preferences.json`.
5. Summarize what changed in practical decision-making terms.

Use `apply_patch` for file edits.

## Interview Goals

Capture preferences in a way a later meal-ranking script can score deterministically.

Cover these areas:

- Hard exclusions: allergies, intolerances, religious/ethical restrictions, medical constraints, ingredients that must never be selected.
- General dislikes: foods, textures, cuisines, preparation styles, sauces, spice levels, repeated patterns the user wants to avoid.
- General preferences: ingredients, cuisines, preparation styles, textures, meal size, freshness, comfort-food vs light-food leaning.
- Always-pick rules: meals or ingredients that should win when available, unless blocked by a hard exclusion or stronger rule.
- Meal-specific rules: breakfast, second breakfast, lunch, afternoon snack, dinner. Capture examples like "eggs preferred for breakfast" or "no meat/chicken for breakfast".
- Weekly preferences: current week mood, cravings, temporary avoids, preferred variety, days with special needs, and whether the week should override stable preferences.
- Optional scoring hints: protein importance, calorie sensitivity, variety vs favorites, avoiding repeated proteins/cuisines.

## Interview Style

Start with a short explanation:

> I will ask a few focused questions and save the result to `output/preferences.json`. You can answer briefly; I will normalize it into structured rules.

Ask concise questions, grouped by topic. Prefer 3-6 questions at a time. Do not ask for all possible ingredients up front; let the user answer naturally, then normalize.

When the user names broad categories, clarify only if automation would be risky:

- "seafood" may mean all fish and shellfish, or only shellfish.
- "meat" may include poultry or only red meat.
- "spicy" needs a tolerance level if the menu often has mild chili.
- "healthy" should be turned into concrete preferences, such as high protein, vegetables, low-fried, no creamy sauces.

For allergies or medical constraints, do not give medical advice. Store the constraint as provided and ask whether trace/cross-contamination matters if relevant.

## Output Rules

- Preserve existing preferences unless the user explicitly replaces them.
- Prefer structured arrays of rules over long prose.
- Every rule should include `scope`, `priority`, `match`, and `reason` when known.
- Use stable Maczfit meal type ids:
  - `1`: Sniadanie
  - `2`: II sniadanie
  - `3`: Obiad
  - `4`: Podwieczorek
  - `5`: Kolacja
- Put temporary mood/week rules under `weeklyPreferences`.
- If the user is uncertain, mark `confidence` as `"medium"` or `"low"` rather than inventing certainty.
- If a rule is absolute, put it in `hardExclusions`; do not rely on scoring penalties.

## Completion Checklist

Before finishing, verify:

- `output/preferences.json` is valid JSON.
- The file has `schemaVersion`, `updatedAt`, `stablePreferences`, `mealTypePreferences`, `alwaysPickRules`, and `weeklyPreferences`.
- Hard exclusions are separated from soft dislikes.
- Meal-specific preferences include meal type ids, not only names.
- Weekly preferences have a date range or ISO week id.
