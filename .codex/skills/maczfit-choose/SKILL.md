---
name: maczfit-choose
description: Choose Maczfit meals for all unconfigured configurable days using output/preferences.json, UI-only menu fetches, subagent-assisted day classification, saved selection-plan JSON files, and the apply:selections script. Use only when explicitly invoked with $maczfit-choose or when the user asks Codex to choose/apply Maczfit meals from preferences.
---

# Maczfit Choose

Use this skill to plan and optionally apply Maczfit meal selections.

This workflow is UI-only for Maczfit interaction. Do not use `*:api` scripts.

## Dry Run Mode

If the user says "dry run", "plan only", "do not apply", "don't update the website", or similar, do not run `npm run apply:selections -- --apply`.

In dry run mode:

- Verify preferences and weekly preferences.
- Discover unconfigured days.
- Fetch menus.
- Use subagents to classify and choose meals.
- Save `output/selections/YYYY-MM-DD.json` files with `status: "planned"`.
- Optionally run `npm run apply:selections` without `--apply` to show pending files.
- Stop before any website update.

Clearly tell the user that no selections were applied.

## Required Files And Outputs

- Required preferences: `output/preferences.json`
- Menu snapshots: `output/discovery/day-YYYY-MM-DD.json`
- Selection plans: `output/selections/YYYY-MM-DD.json`

If `output/preferences.json` does not exist, stop and tell the user to run `$maczfit-preferences` first.

Before writing selection plans, read [references/selection-format.md](references/selection-format.md).

## Weekly Preference Check

Before choosing meals, check whether `output/preferences.json` has a `weeklyPreferences` entry for the current ISO week or for the target dates.

If not present, ask the user 2-4 focused questions before continuing:

- What are you in the mood for this week?
- Anything to avoid this week even if you normally like it?
- Should this week favor high protein, lighter meals, comfort food, or variety?
- Any days with special needs?

Update `output/preferences.json` with the weekly preference before fetching and choosing meals.

## Efficient Tool Sequence

1. Verify preferences:
   - Read `output/preferences.json`.
   - Stop if missing or invalid.
2. Discover pending days once:
   - Run `npm run list:configurable-days`.
   - Use only the returned unconfigured dates.
3. Fetch menus once per pending day:
   - Run `npm run fetch:day -- YYYY-MM-DD` for each date.
   - These are UI-only browser runs; do not loop unnecessarily.
4. Classify and choose with subagents:
   - Use `multi_agent_v1.spawn_agent` because this skill explicitly requires subagent day classification.
   - Spawn one bounded subagent per day, or at most 3 concurrent subagents for many days.
   - Use `fork_context: false`.
   - Pass only the day menu JSON, relevant preferences JSON, and the required selection-plan format.
   - Do not pass `.env`, auth state, cookies, raw page HTML, or credentials.
   - Ask each subagent to return strict JSON only, with choices and short rationales.
5. Save one selection-plan file per day:
   - `output/selections/YYYY-MM-DD.json`
   - Initial status must be `"planned"`.
6. Apply pending plans:
   - Skip this step entirely if the user requested dry run / plan only.
   - Dry-run first: `npm run apply:selections`
   - After user confirmation, apply all pending files: `npm run apply:selections -- --apply`
   - The script scans `output/selections/*.json` and processes files where `status !== "applied"`.
   - Successfully applied files are updated to `status: "applied"` and kept as history.

## Subagent Prompt Template

Use a prompt like this for each day:

```text
You are choosing Maczfit meals for one day.

Inputs:
- Date: YYYY-MM-DD
- Preferences JSON: <paste relevant preferences>
- Menu JSON: <paste output/discovery/day-YYYY-MM-DD.json>
- Required output format: <paste selection-format summary>

Task:
Choose exactly one option for every enabled/changeable meal in the menu. Respect hard exclusions absolutely. Apply always-pick rules when available. Then apply meal-specific preferences, weekly preferences, soft dislikes, ratings, tags, and variety. Return strict JSON only. Each choice must include mealTypeId, mealTypeName, optionId, dishName, and a 1-2 sentence rationale. Do not invent option ids. Do not choose disabled/missing meals.
```

When the subagent returns, validate that every selected `optionId` exists under the same `mealTypeId` in the day menu before writing the file.

## Selection Judgment

Rules in order:

1. Exclude anything matching `hardExclusions`.
2. Select `alwaysPickRules` when available and not excluded.
3. Apply meal-specific rules.
4. Apply weekly temporary preferences.
5. Apply stable positive preferences and soft dislikes.
6. Use rating/tags as tie-breakers.
7. Prefer variety across the day when preferences do not clearly decide.

If all options for a meal look bad, choose the least-bad non-excluded option and explain briefly.

## Applying Plans

Only apply plans when the user explicitly wants website updates. If the user requested dry run / plan only, do not use `--apply`.

The apply script is:

```bash
npm run apply:selections -- --apply
```

Useful variants:

```bash
npm run apply:selections
npm run apply:selections -- --dir output/selections
npm run apply:selections -- --file output/selections/2026-06-19.json --apply
```

Do not manually rewrite applied files. Let the script update `status`, `appliedAt`, and `applyResult`.

## Completion Checklist

Before finishing:

- Preferences existed and weekly preferences were present or added.
- Only unconfigured configurable days were planned.
- Every pending day has `output/selections/YYYY-MM-DD.json`.
- Each plan has status `"planned"` before applying.
- In dry run mode, no website update command was run.
- Outside dry run mode, `npm run apply:selections` dry-run showed the intended pending files before applying.
- If applied, the script completed and changed successful files to `status: "applied"`.
