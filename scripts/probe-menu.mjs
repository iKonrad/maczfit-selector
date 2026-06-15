import fs from 'node:fs/promises';
import path from 'node:path';
import {
  OUTPUT_DIR,
  gotoOrders,
  launchBrowser,
  newAuthenticatedContext,
  readDashboardState,
} from './lib/maczfit-client.mjs';
import { fetchCurrentMeals, fetchMenuOptionsForPackage } from './lib/maczfit-api.mjs';
import { dateOnly, flattenMealRecords, mealTypeName, selectablePackages, sortPackages } from './lib/maczfit-models.mjs';

function pickNutrition(source) {
  if (!source || typeof source !== 'object') return {};
  const keys = [
    'Kcal',
    'KcalSum',
    'kcal',
    'Calories',
    'calories',
    'Fat',
    'fat',
    'Carbohydrates',
    'carbohydrates',
    'carbs',
    'Protein',
    'proteins',
    'Salt',
    'salt',
    'Sugar',
    'sugar',
    'Fiber',
    'fiber',
  ];
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function summarizePackage(pkg) {
  return {
    id: pkg.Id,
    date: dateOnly(pkg.DeliveryDate),
    displayDate: pkg.ValidDisplayDeliveryDate,
    interactedWith: pkg.InteractedWith,
    isMealsEditable: pkg.IsMealsEditable,
    packageStatus: pkg.PackageStatus,
    product: {
      kcal: pkg.Product?.Kcal,
      tierId: pkg.Product?.TierId || pkg.Product?.Tier?.Id,
      group: pkg.Product?.Group,
      name: pkg.Product?.Name,
    },
    keys: Object.keys(pkg).sort(),
  };
}

function summarizeCurrentMeal(meal) {
  return {
    id: meal.Id,
    transactionPackageId: meal.TransactionPackageId,
    mealTypeId: meal.MealTypeId,
    menuItemId: meal.MenuItemId || meal.MenuItem?.Id,
    extraMeal: meal.ExtraMeal,
    kcal: meal.Kcal || meal.MenuItem?.Menu?.Kcal,
    mealTypeName: mealTypeName(meal.MenuItem?.MealType),
    dishName: meal.MenuItem?.DishName,
    tags: meal.MenuItem?.Tags?.map((tag) => tag.Name),
    allergens: meal.MenuItem?.Allergens?.map((allergen) => allergen.Name),
    nutrition: {
      ...pickNutrition(meal),
      ...pickNutrition(meal.MenuItem),
      ...pickNutrition(meal.MenuItem?.Menu),
    },
    keys: Object.keys(meal).sort(),
    menuItemKeys: meal.MenuItem ? Object.keys(meal.MenuItem).sort() : [],
  };
}

function summarizeOption(option) {
  const rawMaterials = option.MenuItemRawMaterialsItemsList || [];
  const receipts = option.MenuItemReceiptItemsList || [];
  const rawMaterialMacroItems = rawMaterials[0]?.RawMaterial?.RawMaterialMicroMacroElementItems || [];
  const receiptRawMaterials = receipts[0]?.Receipt?.ReceiptRawMaterialItems || [];
  const receiptRawMaterialMacroItems = receiptRawMaterials[0]?.RawMaterial?.RawMaterialMicroMacroElementItems || [];

  return {
    id: option.Id,
    mealId: option.MealId,
    mealTypeId: option.MealTypeId,
    menuItemId: option.MenuItemId,
    kcal: option.Menu?.Kcal,
    dietName: option.Menu?.DietName,
    dishName: option.DishName,
    tags: option.Tags?.map((tag) => tag.Name),
    allergens: option.Allergens?.map((allergen) => allergen.Name),
    previousRating: option.PreviousRating,
    isLiked: option.IsLiked,
    nutrition: {
      ...pickNutrition(option),
      ...pickNutrition(option.Menu),
    },
    rawMaterialShape: {
      count: rawMaterials.length,
      sampleKeys: rawMaterials[0] ? Object.keys(rawMaterials[0]).sort() : [],
      sampleNutrition: rawMaterials[0] ? pickNutrition(rawMaterials[0]) : {},
      macroItemCount: rawMaterialMacroItems.length,
    },
    receiptShape: {
      count: receipts.length,
      sampleKeys: receipts[0] ? Object.keys(receipts[0]).sort() : [],
      sampleNutrition: receipts[0] ? pickNutrition(receipts[0]) : {},
      rawMaterialItemCount: receiptRawMaterials.length,
      rawMaterialItemSampleKeys: receiptRawMaterials[0] ? Object.keys(receiptRawMaterials[0]).sort() : [],
      rawMaterialMacroItemCount: receiptRawMaterialMacroItems.length,
    },
    keys: Object.keys(option).sort(),
    menuKeys: option.Menu ? Object.keys(option.Menu).sort() : [],
  };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await launchBrowser();
  try {
    const context = await newAuthenticatedContext(browser);
    const page = await context.newPage();

    await gotoOrders(page);
    const dashboard = await readDashboardState(page);
    const sortedPackages = sortPackages(dashboard.packages);
    const targetPackage = selectablePackages(sortedPackages)[0] || sortedPackages.find((pkg) => new Date(pkg.DeliveryDate) >= new Date()) || sortedPackages[0];

    const currentMealsResponse = targetPackage ? await fetchCurrentMeals(page, targetPackage.Id) : [];
    const menuDays = targetPackage ? await fetchMenuOptionsForPackage(page, targetPackage, dashboard.transaction) : [];
    const [menuDay] = Array.isArray(menuDays) ? menuDays : [];
    const currentMeals = flattenMealRecords(currentMealsResponse);

    const summarized = {
      generatedAt: new Date().toISOString(),
      globals: {
        proxyPath: dashboard.proxyPath,
        hasToken: dashboard.hasToken,
        hasClientId: dashboard.hasClientId,
        brandId: dashboard.brandId,
      },
      transaction: {
        id: dashboard.transaction?.Id,
        productType: dashboard.transaction?.ProductType,
        product: {
          kcal: dashboard.transaction?.Product?.Kcal,
          tierId: dashboard.transaction?.Product?.TierId || dashboard.transaction?.Product?.Tier?.Id,
          group: dashboard.transaction?.Product?.Group,
          name: dashboard.transaction?.Product?.Name,
        },
      },
      packages: sortedPackages.map(summarizePackage),
      targetPackage: targetPackage ? summarizePackage(targetPackage) : null,
      currentMealsRawShape: {
        type: Array.isArray(currentMealsResponse) ? 'array' : typeof currentMealsResponse,
        keys:
          currentMealsResponse && typeof currentMealsResponse === 'object' && !Array.isArray(currentMealsResponse)
            ? Object.keys(currentMealsResponse).sort()
            : [],
      },
      currentMeals: currentMeals.map(summarizeCurrentMeal),
      menuOptions: (menuDay?.MealTypes || []).map((mealType) => ({
        mealTypeId: mealType.MealType?.Id,
        mealTypeName: mealTypeName(mealType.MealType),
        optionCount: mealType.Meals?.length || 0,
        options: (mealType.Meals || []).map(summarizeOption),
      })),
    };

    await fs.writeFile(path.join(OUTPUT_DIR, 'menu-probe.json'), JSON.stringify(summarized, null, 2));
    console.log(`Saved menu probe to ${path.join(OUTPUT_DIR, 'menu-probe.json')}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
