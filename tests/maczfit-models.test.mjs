import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentMealSummary,
  dateOnly,
  enabledMealTypeIds,
  enabledMealTypeNames,
  findPackageByDate,
  flattenMealRecords,
  mealTypeName,
  menuOptionSummary,
  names,
  selectablePackages,
  sortPackages,
} from '../scripts/lib/maczfit-models.mjs';

test('dateOnly returns the ISO date part or null for empty input', () => {
  assert.equal(dateOnly('2026-06-19T10:15:00.000Z'), '2026-06-19');
  assert.equal(dateOnly(null), null);
});

test('mealTypeName and names prefer Polish names and drop missing values', () => {
  assert.equal(mealTypeName({ Name: 'Obiad', NameEng: 'Lunch' }), 'Obiad');
  assert.equal(mealTypeName({ NameEng: 'Dinner' }), 'Dinner');
  assert.equal(mealTypeName(null), null);
  assert.deepEqual(names([{ Name: 'fit' }, {}, { Name: 'vege' }]), ['fit', 'vege']);
});

test('flattenMealRecords recursively extracts meal-like records', () => {
  const mealA = { Id: 1, MealTypeId: 3 };
  const mealB = { Id: 2, TransactionPackageId: 10 };
  const mealC = { Id: 3, MenuItem: { Id: 30 } };
  const input = { nested: [mealA, { deeper: { mealB, ignored: 'value' } }], mealC };

  assert.deepEqual(flattenMealRecords(input), [mealA, mealB, mealC]);
  assert.deepEqual(flattenMealRecords(null), []);
  assert.deepEqual(flattenMealRecords('not an object'), []);
});

test('packages are sorted, found by date, and filtered for selectable future days', () => {
  const packages = [
    { Id: 3, DeliveryDate: '2026-06-22T00:00:00.000Z', InteractedWith: true, IsMealsEditable: true },
    { Id: 1, DeliveryDate: '2026-06-15T00:00:00.000Z', InteractedWith: false, IsMealsEditable: true },
    { Id: 2, DeliveryDate: '2026-06-16T00:00:00.000Z', InteractedWith: false, IsMealsEditable: false },
    { Id: 4, DeliveryDate: '2026-06-17T00:00:00.000Z', InteractedWith: false, IsMealsEditable: true },
  ];

  assert.deepEqual(sortPackages(packages).map((pkg) => pkg.Id), [1, 2, 4, 3]);
  assert.equal(findPackageByDate(packages, '2026-06-16')?.Id, 2);
  assert.equal(findPackageByDate(packages, '2026-06-20'), null);
  assert.deepEqual(selectablePackages(packages, new Date('2026-06-16T18:00:00Z')).map((pkg) => pkg.Id), [4]);
});

test('meal and option summaries normalize nested Maczfit records', () => {
  const meal = {
    Id: 11,
    TransactionPackageId: 22,
    MealTypeId: 3,
    MenuItemId: null,
    MenuItem: {
      Id: 33,
      DishName: 'Pierogi',
      KcalSum: 500,
      MealType: { Name: 'Obiad' },
      Tags: [{ Name: 'comfort' }],
      Allergens: [{ Name: 'gluten' }],
    },
  };
  const option = {
    Id: 44,
    MealId: 55,
    DishName: 'Pulled pork',
    KcalSum: 600,
    Menu: { Kcal: 1800 },
    Tags: [{ Name: 'spicy' }],
    Allergens: [{ Name: 'milk' }],
    PreviousRating: 5,
    IsLiked: true,
    MainPhotoPath: '/photo.jpg',
    MenuComposition: 'rice',
  };
  const mealType = { MealType: { Id: 3, Name: 'Obiad' } };

  assert.deepEqual(currentMealSummary(meal), {
    id: 11,
    transactionPackageId: 22,
    mealTypeId: 3,
    menuItemId: 33,
    mealTypeName: 'Obiad',
    dishName: 'Pierogi',
    kcalSum: 500,
    tags: ['comfort'],
    allergens: ['gluten'],
  });
  assert.deepEqual(menuOptionSummary(option, mealType), {
    id: 44,
    mealId: 55,
    mealTypeId: 3,
    mealTypeName: 'Obiad',
    dishName: 'Pulled pork',
    kcalSum: 600,
    menuKcal: 1800,
    tags: ['spicy'],
    allergens: ['milk'],
    previousRating: 5,
    isLiked: true,
    mainPhotoPath: '/photo.jpg',
    composition: 'rice',
  });
});

test('enabled meal type helpers derive ids and names from current meals', () => {
  const meals = [
    { MealTypeId: 1, MenuItem: { MealType: { Name: 'Sniadanie' } } },
    { MenuItem: { MealTypeId: 3, MealType: { Name: 'Obiad' } } },
    { MealTypeId: null, MenuItem: {} },
  ];

  assert.deepEqual([...enabledMealTypeIds(meals)], [1, 3]);
  assert.deepEqual([...enabledMealTypeNames(meals)], ['Sniadanie', 'Obiad']);
});
