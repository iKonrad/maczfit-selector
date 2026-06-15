export function dateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

export function mealTypeName(mealType) {
  if (!mealType) return null;
  return mealType.Name || mealType.NameEng || mealType.NameDe || null;
}

export function names(items) {
  return (items || []).map((item) => item.Name).filter(Boolean);
}

export function flattenMealRecords(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenMealRecords);
  if (typeof value !== 'object') return [];
  if (value.MenuItem || value.MealTypeId || value.TransactionPackageId) return [value];
  return Object.values(value).flatMap(flattenMealRecords);
}

export function sortPackages(packages) {
  return [...packages].sort((a, b) => new Date(a.DeliveryDate) - new Date(b.DeliveryDate));
}

export function findPackageByDate(packages, date) {
  return sortPackages(packages).find((pkg) => dateOnly(pkg.DeliveryDate) === date) || null;
}

export function selectablePackages(packages, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return sortPackages(packages).filter((pkg) => {
    const deliveryDate = new Date(pkg.DeliveryDate);
    return deliveryDate >= today && pkg.InteractedWith === false && pkg.IsMealsEditable !== false;
  });
}

export function currentMealSummary(meal) {
  return {
    id: meal.Id,
    transactionPackageId: meal.TransactionPackageId,
    mealTypeId: meal.MealTypeId,
    menuItemId: meal.MenuItemId || meal.MenuItem?.Id,
    mealTypeName: mealTypeName(meal.MenuItem?.MealType),
    dishName: meal.MenuItem?.DishName,
    kcalSum: meal.MenuItem?.KcalSum || meal.KcalSum || null,
    tags: names(meal.MenuItem?.Tags),
    allergens: names(meal.MenuItem?.Allergens),
  };
}

export function menuOptionSummary(option, mealType) {
  return {
    id: option.Id,
    mealId: option.MealId,
    mealTypeId: option.MealTypeId || mealType.MealType?.Id,
    mealTypeName: mealTypeName(mealType.MealType),
    dishName: option.DishName,
    kcalSum: option.KcalSum || null,
    menuKcal: option.Menu?.Kcal || null,
    tags: names(option.Tags),
    allergens: names(option.Allergens),
    previousRating: option.PreviousRating ?? null,
    isLiked: option.IsLiked ?? null,
    mainPhotoPath: option.MainPhotoPath || null,
    composition: option.MenuComposition || null,
  };
}

export function enabledMealTypeIds(currentMeals) {
  return new Set(currentMeals.map((meal) => meal.MealTypeId || meal.MenuItem?.MealTypeId).filter(Boolean));
}

export function enabledMealTypeNames(currentMeals) {
  return new Set(currentMeals.map((meal) => mealTypeName(meal.MenuItem?.MealType)).filter(Boolean));
}
