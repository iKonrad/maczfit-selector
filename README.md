# maczfit-selector

Node.js scripts for inspecting and applying Maczfit meal selections from the command line.

The project uses Playwright to log in to `maczfit.pl`, read configurable delivery days, fetch visible meal options, and optionally click selections in the Maczfit UI. Selection commands are dry-run by default; add `--apply` only when you want to change the website.

## Requirements

- Node.js 20 or newer
- npm
- A Maczfit account with an active order

## Installation

Install dependencies:

```sh
npm install
```

Install the Playwright browser used by the scripts:

```sh
npx playwright install chromium
```

Create a local `.env` file:

```sh
EMAIL=your-maczfit-email@example.com
PASSWORD=your-maczfit-password
```

Optional environment variables:

```sh
MACZFIT_BASE_URL=https://www.maczfit.pl
MACZFIT_AUTH_STATE=.auth/maczfit.json
MACZFIT_OUTPUT_DIR=output/discovery
HEADLESS=false
MACZFIT_PROXY_DELAY_MS=500
```

`HEADLESS=false` is useful for the first run or when debugging login and UI behavior.

## First Run

Run discovery once to log in and save the browser session:

```sh
npm run discover
```

This creates `.auth/maczfit.json` and writes diagnostic discovery data to `output/discovery/`. The `.auth/`, `output/`, and `.env` paths are ignored by git.

If the saved session expires, rerun:

```sh
npm run discover
```

## Usage

List configurable days that still need meal choices:

```sh
npm run list:configurable-days
```

List all configurable days, including days that already have choices:

```sh
npm run list:configurable-days -- --all-configurable
```

Fetch visible meal options for a day through the UI:

```sh
npm run fetch:day -- 2026-06-19
```

Fetch visible meal options for the next configurable day:

```sh
npm run fetch:day
```

The output is saved under `output/discovery/day-YYYY-MM-DD.json`.

Fetch day options through the direct API path:

```sh
npm run fetch:day:api -- 2026-06-19
```

Select one meal by dish text or option id. This is a dry run:

```sh
npm run select:meal -- --date 2026-06-19 --meal "Obiad" --dish "tagliatelle z wolowina"
```

```sh
npm run select:meal -- --date 2026-06-19 --meal "Obiad" --option-id 4532084
```

Apply the selection on the website:

```sh
npm run select:meal -- --date 2026-06-19 --meal "Obiad" --option-id 4532084 --apply
```

Select multiple meals for one day. Choices use `mealTypeId=optionId`:

```sh
npm run select:day -- --date 2026-06-19 --choice 1=4532566 --choice 2=4532567 --choice 3=4517099 --choice 5=4568888
```

Apply those choices:

```sh
npm run select:day -- --date 2026-06-19 --choice 1=4532566 --choice 2=4532567 --choice 3=4517099 --choice 5=4568888 --apply
```

Meal type ids:

- `1` - Sniadanie
- `2` - II sniadanie
- `3` - Obiad
- `4` - Podwieczorek
- `5` - Kolacja

## Selection Files

`apply:selections` reads JSON plans from `output/selections/` by default. Files with `status: "applied"` are skipped.

Example `output/selections/2026-06-19.json`:

```json
{
  "date": "2026-06-19",
  "choices": [
    { "mealTypeId": 1, "optionId": 4532566 },
    { "mealTypeId": 2, "optionId": 4532567 },
    { "mealTypeId": 3, "optionId": 4517099 },
    { "mealTypeId": 5, "optionId": 4568888 }
  ]
}
```

Preview pending selection files:

```sh
npm run apply:selections
```

Apply all pending files:

```sh
npm run apply:selections -- --apply
```

Apply files from another directory:

```sh
npm run apply:selections -- --dir output/selections --apply
```

Apply one file:

```sh
npm run apply:selections -- --file output/selections/2026-06-19.json --apply
```

After a successful apply, the script marks the file with `status: "applied"`, `appliedAt`, and `applyResult`. Failed files are marked with `status: "failed"` and an error message.

## Development

Run tests:

```sh
npm test
```

Run tests with Node's experimental coverage output:

```sh
npm run test:coverage
```

Useful debugging commands:

```sh
npm run probe:menu:api
npm run discover
```

Most commands print JSON to stdout so their output can be inspected or piped to other tools.
