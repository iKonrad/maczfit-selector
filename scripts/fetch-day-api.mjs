import fs from 'node:fs/promises';
import path from 'node:path';
import {
  OUTPUT_DIR,
  launchBrowser,
  newAuthenticatedContext,
} from './lib/maczfit-client.mjs';
import { MaczfitSession } from './lib/maczfit-session.mjs';

const requestedDate = process.argv[2] || null;

async function main() {
  const browser = await launchBrowser();
  try {
    const context = await newAuthenticatedContext(browser);
    const page = await context.newPage();
    const session = new MaczfitSession(page);

    await session.loadDashboard();
    const fetched = await session.getDayOptions(requestedDate);
    const optionsByMeal = fetched.optionsByMeal.map((meal) => ({
      mealTypeId: meal.mealTypeId,
      mealTypeName: meal.mealTypeName,
      enabled: meal.enabled,
      optionCount: meal.optionCount,
      options: meal.optionSummaries,
    }));

    const day = {
      generatedAt: new Date().toISOString(),
      source: 'direct-api',
      date: fetched.date,
      package: {
        id: fetched.package.Id,
        interactedWith: fetched.package.InteractedWith,
        isMealsEditable: fetched.package.IsMealsEditable,
        product: {
          name: fetched.package.Product?.Name,
          kcal: fetched.package.Product?.Kcal,
          tierId: fetched.package.Product?.TierId || fetched.package.Product?.Tier?.Id,
        },
      },
      currentMeals: fetched.currentMealSummaries,
      enabledMealTypes: fetched.enabledMealTypeNames,
      optionsByMeal,
    };

    const outputPath = path.join(OUTPUT_DIR, `day-${day.date}-api.json`);
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(day, null, 2));

    console.log(`Saved ${day.date} to ${outputPath}`);
    for (const meal of optionsByMeal) {
      const status = meal.enabled ? 'enabled' : 'disabled';
      console.log(`${meal.mealTypeName}: ${meal.optionCount} options (${status})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
