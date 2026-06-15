import { launchBrowser, newAuthenticatedContext } from './lib/maczfit-client.mjs';
import { MaczfitUiSession } from './lib/maczfit-ui-session.mjs';

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--meal') {
      args.mealTypeName = argv[++i];
    } else if (arg === '--option-id') {
      args.optionId = Number(argv[++i]);
    } else if (arg === '--option' || arg === '--option-text' || arg === '--dish') {
      args.optionText = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  npm run select:meal -- --date YYYY-MM-DD --meal "Obiad" --dish "tagliatelle z wołowiną"',
    '  npm run select:meal -- --date YYYY-MM-DD --meal "Obiad" --option-id 4532084',
    '',
    'Dry-run is the default. Add --apply to click the visible UI choice.',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.date || !args.mealTypeName || (!args.optionText && !args.optionId)) {
    throw new Error(usage());
  }

  const browser = await launchBrowser();
  try {
    const context = await newAuthenticatedContext(browser);
    const page = await context.newPage();
    const session = new MaczfitUiSession(page);

    await session.openActiveTransactionPage();
    const result = await session.selectMealOption(args);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
