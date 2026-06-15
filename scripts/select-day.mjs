import { launchBrowser, newAuthenticatedContext } from './lib/maczfit-client.mjs';
import { MaczfitUiSession } from './lib/maczfit-ui-session.mjs';

function parseChoice(value) {
  const match = String(value || '').match(/^(\d+)=(\d+)$/);
  if (!match) {
    throw new Error(`Invalid choice "${value}". Expected mealTypeId=optionId, for example 3=4517099.`);
  }
  return {
    mealTypeId: Number(match[1]),
    optionId: Number(match[2]),
  };
}

function parseArgs(argv) {
  const args = { apply: false, choices: [], delayMs: 800 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--choice') {
      args.choices.push(parseChoice(argv[++i]));
    } else if (arg === '--delay-ms') {
      args.delayMs = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  npm run select:day -- --date YYYY-MM-DD --choice 1=4532566 --choice 2=4532567 --choice 3=4517099 --choice 5=4568888',
    '',
    'Choices are mealTypeId=optionId:',
    '  1 Śniadanie',
    '  2 II śniadanie',
    '  3 Obiad',
    '  4 Podwieczorek',
    '  5 Kolacja',
    '',
    'Dry-run is the default. Add --apply to click the visible UI choices.',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.date || args.choices.length === 0) {
    throw new Error(usage());
  }
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
    throw new Error('--delay-ms must be a non-negative number.');
  }

  const browser = await launchBrowser();
  try {
    const context = await newAuthenticatedContext(browser);
    const page = await context.newPage();
    const session = new MaczfitUiSession(page);

    await session.openActiveTransactionPage();
    const result = await session.selectDayOptions(args);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
