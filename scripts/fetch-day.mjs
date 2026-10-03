import fs from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT_DIR, isModifiable, mealTypeIdFromName, openSession } from './lib/maczfit-api-client.mjs';
import { pathToFileURL } from 'node:url';

const requestedDate = process.argv[2] || null;

export function buildDay({ date, deliveryId, menu, optionsByMealId }) {
  const currentByMealId = new Map((menu.deliveryMenuMeal || []).map((m) => [m.deliveryMealId, m.dietCaloriesMealId]));
  const currentMeals = (menu.deliveryMenuMeal || []).map((meal) => ({
    mealTypeId: mealTypeIdFromName(meal.mealName),
    mealTypeName: meal.mealName,
    dishName: meal.menuMealName,
    changeVisible: Boolean(meal.switchable),
    deliveryMealId: meal.deliveryMealId,
    nutrition: meal.nutrition || null,
  }));

  // A switchable meal we cannot map would silently disappear from the plan.
  const unmapped = currentMeals.filter((meal) => meal.changeVisible && !meal.mealTypeId);
  if (unmapped.length) {
    throw new Error(`Unmapped switchable meal name(s): ${unmapped.map((m) => m.mealTypeName).join(', ')}`);
  }

  const optionsByMeal = currentMeals
    .filter((meal) => meal.changeVisible && meal.mealTypeId)
    .map((meal) => {
      const raw = optionsByMealId.get(meal.deliveryMealId) || [];
      return {
        mealTypeId: meal.mealTypeId,
        mealTypeName: meal.mealTypeName,
        enabled: true,
        currentDishName: meal.dishName,
        deliveryMealId: meal.deliveryMealId,
        options: raw.map((option) => {
          const details = option.menuMealDetails || {};
          return {
            // dietCaloriesMealId is the id the switch endpoint accepts.
            id: details.dietCaloriesMealId,
            menuMealId: details.menuMealId,
            mealTypeId: meal.mealTypeId,
            active: details.dietCaloriesMealId === currentByMealId.get(meal.deliveryMealId),
            dishName: details.menuMealName,
            tags: [option.dietOptionName, option.mealRecommended ? 'RECOMMENDED' : null].filter(Boolean),
            // reviewSummary carries `score` (0-100) and `number` of reviews.
            // An earlier version read `averageRating`, which does not exist,
            // so every rating came back null and looked like a dead feature.
            rating: option.reviewSummary?.score ?? null,
            ratingCount: option.reviewSummary?.number ?? null,
            // Per-option macros: the API exposes these, so protein-led rules
            // can be numeric instead of guessing from the dish name.
            nutrition: details.nutrition || null,
            allergens: details.allergens || [],
          };
        }).filter((option) => option.id && option.dishName),
      };
    });

  return { date, deliveryId, currentMeals, optionsByMeal };
}

async function main() {
  const { api, orderId } = await openSession();
  const deliveries = await api.upcomingDeliveries(orderId);

  const open = deliveries.filter((d) => isModifiable(d.modificationTimeRemaining));
  const target = requestedDate
    ? deliveries.find((d) => d.deliveryDate === requestedDate)
    : open.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];

  if (!target) throw new Error(`No delivery found for ${requestedDate || 'the next open day'}.`);
  if (!isModifiable(target.modificationTimeRemaining)) {
    throw new Error(`${target.deliveryDate} is no longer modifiable (remaining ${target.modificationTimeRemaining}).`);
  }

  const menu = await api.deliveryMenu(target.deliveryId);
  const optionsByMealId = new Map();
  for (const meal of menu.deliveryMenuMeal || []) {
    if (!meal.switchable) continue;
    const res = await api.mealOptions(orderId, target.deliveryId, meal.deliveryMealId);
    optionsByMealId.set(meal.deliveryMealId, res.mealChangeOptions || []);
  }

  const day = {
    generatedAt: new Date().toISOString(),
    source: 'api',
    orderId,
    ...buildDay({ date: target.deliveryDate, deliveryId: target.deliveryId, menu, optionsByMealId }),
  };
  const outputPath = path.join(OUTPUT_DIR, `day-${day.date}.json`);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(day, null, 2));

  console.log(`Saved ${day.date} to ${outputPath} (${api.requestCount} API requests)`);
  for (const meal of day.optionsByMeal) {
    console.log(`${meal.mealTypeName}: ${meal.options.length} options`);
  }
}

// Only run when executed directly; importing this module (e.g. from tests)
// must not fire live API calls.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
