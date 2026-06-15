import assert from 'node:assert/strict';
import test from 'node:test';
import { MaczfitSession } from '../scripts/lib/maczfit-session.mjs';

function createApiSession() {
  const session = new MaczfitSession({});
  session.dashboard = {
    packages: [
      { Id: 1, DeliveryDate: '2026-06-19T00:00:00.000Z', InteractedWith: false, IsMealsEditable: true },
      { Id: 2, DeliveryDate: '2026-06-18T00:00:00.000Z', InteractedWith: false, IsMealsEditable: true },
    ],
  };
  return session;
}

test('MaczfitSession cache helpers and package lookups use normalized dates', () => {
  const session = createApiSession();
  session.currentMealsByPackageId.set(1, ['current']);
  session.menuOptionsByDate.set('2026-06-19', ['menu']);
  session.dayOptionsByDate.set('2026-06-19', ['day']);

  assert.deepEqual(session.getSortedPackages().map((pkg) => pkg.Id), [2, 1]);
  assert.equal(session.getPackageByDate('2026-06-19')?.Id, 1);
  assert.equal(session.getDefaultPackage()?.Id, 2);

  session.clearDayCache('2026-06-19');
  assert.equal(session.currentMealsByPackageId.has(1), false);
  assert.equal(session.menuOptionsByDate.has('2026-06-19'), false);
  assert.equal(session.dayOptionsByDate.has('2026-06-19'), false);

  session.currentMealsByPackageId.set(1, ['current']);
  session.clearCache();
  assert.equal(session.currentMealsByPackageId.size, 0);
});

test('MaczfitSession selectMeal validates calendar and returns dry-run update payload', async () => {
  const session = createApiSession();
  session.getCalendarDays = async () => [
    { date: '2026-06-19', configurable: true, configured: false },
    { date: '2026-06-20', configurable: false, configured: false },
  ];
  session.getDayOptions = async () => ({
    package: { Id: 10 },
    currentMeals: [
      {
        Id: 100,
        TransactionPackageId: 10,
        MealTypeId: 3,
        MenuItemId: 300,
        MenuItem: {
          Id: 300,
          DishName: 'Fish',
          MealType: { Name: 'Obiad' },
          Tags: [],
          Allergens: [],
        },
      },
    ],
    optionsByMeal: [
      {
        mealTypeId: 3,
        mealTypeName: 'Obiad',
        enabled: true,
        rawMealType: { MealType: { Id: 3, Name: 'Obiad' } },
        options: [
          {
            Id: 301,
            MealId: 3,
            MealTypeId: 3,
            DishName: 'Pierogi',
            Tags: [],
            Allergens: [],
          },
        ],
      },
    ],
  });

  const result = await session.selectMeal({
    date: '2026-06-19',
    mealTypeName: 'Obiad',
    menuItemId: 301,
  });

  assert.equal(result.apply, false);
  assert.equal(result.configuredBefore, false);
  assert.equal(result.alreadySelected, false);
  assert.deepEqual(result.updatePayload, {
    existingMealId: 100,
    transactionPackageId: 10,
    mealTypeId: 3,
    menuItemId: 301,
    extraMeal: false,
  });
  assert.equal(result.result, null);

  await assert.rejects(
    () => session.selectMeal({ date: '2026-06-20', mealTypeName: 'Obiad', menuItemId: 301 }),
    /not configurable/
  );
  await assert.rejects(() => session.selectMeal({ date: '2026-06-19', mealTypeName: 'Obiad' }), /Missing required menuItemId/);
});
