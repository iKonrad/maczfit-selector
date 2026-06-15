import {
  launchBrowser,
  newAuthenticatedContext,
} from './lib/maczfit-client.mjs';
import { MaczfitSession } from './lib/maczfit-session.mjs';

function parseArgs(argv) {
  const args = { apply: false, markInteracted: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--mark-interacted') {
      args.markInteracted = true;
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--meal') {
      args.mealTypeName = argv[++i];
    } else if (arg === '--meal-type-id') {
      args.mealTypeId = Number(argv[++i]);
    } else if (arg === '--option' || arg === '--menu-item-id') {
      args.menuItemId = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  npm run select:meal -- --date YYYY-MM-DD --meal "Obiad" --option MENU_ITEM_ID',
    '  npm run select:meal -- --date YYYY-MM-DD --meal-type-id 3 --menu-item-id MENU_ITEM_ID',
    '',
    'Dry-run is the default. Add --apply to execute the Maczfit update call.',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.date || !args.menuItemId || (!args.mealTypeName && !args.mealTypeId)) {
    throw new Error(usage());
  }

  const browser = await launchBrowser();
  try {
    const context = await newAuthenticatedContext(browser);
    const page = await context.newPage();
    const session = new MaczfitSession(page);

    await session.loadDashboard();
    const result = await session.selectMeal(args);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
