import fs from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT_DIR, launchBrowser, newAuthenticatedContext } from './lib/maczfit-client.mjs';
import { MaczfitUiSession } from './lib/maczfit-ui-session.mjs';

const requestedDate = process.argv[2] || null;

async function main() {
  const browser = await launchBrowser();
  try {
    const context = await newAuthenticatedContext(browser);
    const page = await context.newPage();
    const session = new MaczfitUiSession(page);

    await session.openActiveTransactionPage();
    const day = {
      generatedAt: new Date().toISOString(),
      source: 'ui',
      ...(await session.getDayOptions(requestedDate)),
    };

    const outputPath = path.join(OUTPUT_DIR, `day-${day.date}.json`);
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(day, null, 2));

    console.log(`Saved ${day.date} to ${outputPath}`);
    for (const meal of day.optionsByMeal) {
      console.log(`${meal.mealTypeName}: ${meal.options.length} visible options`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
