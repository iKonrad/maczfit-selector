import assert from 'node:assert/strict';
import test from 'node:test';
import { isModifiable, mealTypeIdFromName, ENDPOINTS } from '../scripts/lib/maczfit-api-client.mjs';
import { buildDay } from '../scripts/fetch-day.mjs';

test('isModifiable treats zero and negative countdowns as locked', () => {
  assert.equal(isModifiable('16:14:19'), true);
  assert.equal(isModifiable('00:14:19'), true);
  assert.equal(isModifiable('00:00:01'), true);
  assert.equal(isModifiable('00:00:00'), false);
  assert.equal(isModifiable('00:-9:-40'), false);
  assert.equal(isModifiable(''), false);
  assert.equal(isModifiable(null), false);
});

test('mealTypeIdFromName accepts both the API and legacy UI meal names', () => {
  assert.equal(mealTypeIdFromName('Śniadanie'), 1);
  assert.equal(mealTypeIdFromName('2 Śniadanie'), 2);
  assert.equal(mealTypeIdFromName('II śniadanie'), 2);
  assert.equal(mealTypeIdFromName('Drugie sniadanie'), 2);
  assert.equal(mealTypeIdFromName('Obiad'), 3);
  assert.equal(mealTypeIdFromName('Kolacja'), 5);
  assert.equal(mealTypeIdFromName('Nieznany posiłek'), null);
});

test('switch endpoint targets dietCaloriesMealId, not menuMealId', () => {
  assert.equal(
    ENDPOINTS.changeMeal(1, 2, 3, 4),
    '/orders/1/deliveries/2/delivery-meals/3/switch/4'
  );
});

const menu = {
  deliveryMenuMeal: [
    { deliveryMealId: 11, mealName: 'Śniadanie', menuMealName: 'Obecne', switchable: true, dietCaloriesMealId: 473, nutrition: { protein: 16.3 } },
    { deliveryMealId: 12, mealName: '2 Śniadanie', menuMealName: 'Deser', switchable: true, dietCaloriesMealId: 415, nutrition: { protein: 9 } },
  ],
};
const options = new Map([
  [11, [
    { dietOptionName: 'FIT', reviewSummary: null, menuMealDetails: { dietCaloriesMealId: 473, menuMealId: 291911, menuMealName: 'Obecne', nutrition: { protein: 16.3 }, allergens: ['GLUTEN'] } },
    { dietOptionName: 'VEGE', mealRecommended: true, menuMealDetails: { dietCaloriesMealId: 293, menuMealId: 291699, menuMealName: 'Inne', nutrition: { protein: 14.9 }, allergens: [] } },
  ]],
  [12, [
    { dietOptionName: 'Everyday', menuMealDetails: { dietCaloriesMealId: 415, menuMealId: 292000, menuMealName: 'Deser', nutrition: { protein: 9 }, allergens: [] } },
  ]],
]);

test('buildDay uses dietCaloriesMealId as the option id and flags the active dish', () => {
  const day = buildDay({ date: '2026-08-26', deliveryId: 7, menu, optionsByMealId: options });

  assert.equal(day.date, '2026-08-26');
  assert.deepEqual(day.optionsByMeal.map((m) => m.mealTypeId), [1, 2]);

  const breakfast = day.optionsByMeal[0];
  assert.deepEqual(breakfast.options.map((o) => o.id), [473, 293]);
  assert.deepEqual(breakfast.options.map((o) => o.active), [true, false]);
  assert.equal(breakfast.options[0].menuMealId, 291911);
  assert.equal(breakfast.options[1].nutrition.protein, 14.9);
  assert.deepEqual(breakfast.options[1].tags, ['VEGE', 'RECOMMENDED']);
  assert.equal(breakfast.options[0].rating, null);
});

test('buildDay refuses to silently drop a switchable meal it cannot map', () => {
  const unknown = { deliveryMenuMeal: [{ deliveryMealId: 9, mealName: 'Podwieczorek XL', switchable: true }] };
  assert.throws(
    () => buildDay({ date: '2026-08-26', deliveryId: 7, menu: unknown, optionsByMealId: new Map() }),
    /Unmapped switchable meal name\(s\): Podwieczorek XL/
  );
});
