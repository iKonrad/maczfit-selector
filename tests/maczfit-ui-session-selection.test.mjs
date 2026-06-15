import assert from 'node:assert/strict';
import test from 'node:test';
import { MaczfitUiSession } from '../scripts/lib/maczfit-ui-session.mjs';

function createUiSession({
  visibleMeals = [
    { mealTypeId: 1, mealTypeName: 'Sniadanie', dishName: 'Owsianka', changeVisible: true },
    { mealTypeId: 3, mealTypeName: 'Obiad', dishName: 'Ryba', changeVisible: true },
    { mealTypeId: 5, mealTypeName: 'Kolacja', dishName: 'Kanapki', changeVisible: false },
  ],
  optionsByMeal = {
    1: [
      { id: 11, mealTypeId: 1, active: false, dishName: 'Pasta jajeczna' },
      { id: 12, mealTypeId: 1, active: true, dishName: 'Owsianka' },
    ],
    3: [
      { id: 31, mealTypeId: 3, active: false, dishName: 'Pierogi' },
      { id: 32, mealTypeId: 3, active: true, dishName: 'Ryba' },
    ],
  },
} = {}) {
  const calls = {
    openedDays: [],
    openedDialogs: [],
    clicked: [],
    waits: [],
  };
  const session = new MaczfitUiSession({
    waitForTimeout: async (ms) => calls.waits.push(ms),
  });
  session.openDay = async (date) => calls.openedDays.push(date);
  session.getVisibleMeals = async () => visibleMeals;
  session.openMealChangeDialog = async (mealTypeId) => {
    const resolvedMealTypeId = typeof mealTypeId === 'number'
      ? mealTypeId
      : visibleMeals.find((meal) => meal.mealTypeName === mealTypeId)?.mealTypeId;
    calls.openedDialogs.push(mealTypeId);
    return resolvedMealTypeId;
  };
  session.getMealOptions = async (mealTypeId) => optionsByMeal[mealTypeId] || [];
  session.clickMealOptionButton = async (mealTypeId, optionId) => calls.clicked.push({ mealTypeId, optionId });
  return { session, calls };
}

test('selectDayOptions validates required and duplicate choices before touching the UI', async () => {
  const { session, calls } = createUiSession();

  await assert.rejects(() => session.selectDayOptions({ choices: [{ mealTypeId: 1, optionId: 11 }] }), /Missing required date/);
  await assert.rejects(() => session.selectDayOptions({ date: '2026-06-19', choices: [] }), /Missing required choices/);
  await assert.rejects(
    () => session.selectDayOptions({
      date: '2026-06-19',
      choices: [
        { mealTypeId: 1, optionId: 11 },
        { mealTypeId: 1, optionId: 12 },
      ],
    }),
    /Duplicate meal type choices: 1/
  );
  assert.deepEqual(calls.openedDays, []);
});

test('selectDayOptions returns a dry-run plan without clicking choices', async () => {
  const { session, calls } = createUiSession();

  const result = await session.selectDayOptions({
    date: '2026-06-19',
    choices: [
      { mealTypeId: '1', optionId: '11' },
      { mealTypeId: 3, optionId: 31 },
    ],
  });

  assert.equal(result.apply, false);
  assert.equal(result.date, '2026-06-19');
  assert.deepEqual(result.choices.map((choice) => ({
    mealTypeId: choice.mealTypeId,
    mealTypeName: choice.mealTypeName,
    currentDishName: choice.currentDishName,
    selectedOptionId: choice.selectedOption.id,
    alreadySelected: choice.alreadySelected,
    result: choice.result,
  })), [
    {
      mealTypeId: 1,
      mealTypeName: 'Sniadanie',
      currentDishName: 'Owsianka',
      selectedOptionId: 11,
      alreadySelected: false,
      result: null,
    },
    {
      mealTypeId: 3,
      mealTypeName: 'Obiad',
      currentDishName: 'Ryba',
      selectedOptionId: 31,
      alreadySelected: false,
      result: null,
    },
  ]);
  assert.deepEqual(calls.openedDays, ['2026-06-19']);
  assert.deepEqual(calls.openedDialogs, [1]);
  assert.deepEqual(calls.clicked, []);
});

test('selectDayOptions applies new choices and skips already active choices', async () => {
  const { session, calls } = createUiSession();

  const result = await session.selectDayOptions({
    date: '2026-06-19',
    apply: true,
    delayMs: 25,
    choices: [
      { mealTypeId: 1, optionId: 11 },
      { mealTypeId: 3, optionId: 32 },
    ],
  });

  assert.deepEqual(calls.clicked, [{ mealTypeId: 1, optionId: 11 }]);
  assert.deepEqual(calls.waits, [25]);
  assert.deepEqual(result.choices.map((choice) => choice.result), [
    { clicked: true },
    { skipped: true, reason: 'already-selected' },
  ]);
});

test('selectDayOptions rejects choices that are not changeable or not visible options', async () => {
  const { session } = createUiSession();

  await assert.rejects(
    () => session.selectDayOptions({
      date: '2026-06-19',
      choices: [{ mealTypeId: 5, optionId: 51 }],
    }),
    /Meal type 5 is not visible\/changeable/
  );
  await assert.rejects(
    () => session.selectDayOptions({
      date: '2026-06-19',
      choices: [{ mealTypeId: 3, optionId: 999 }],
    }),
    /Option 999 was not found/
  );
});

test('selectMealOption finds options by text or id and only clicks when applying', async () => {
  const { session, calls } = createUiSession();

  const dryRun = await session.selectMealOption({
    date: '2026-06-19',
    mealTypeName: 'Obiad',
    optionText: 'pierogi',
  });
  assert.equal(dryRun.selectedOption.id, 31);
  assert.equal(dryRun.result, null);
  assert.deepEqual(calls.clicked, []);

  const alreadySelected = await session.selectMealOption({
    date: '2026-06-19',
    mealTypeName: 'Obiad',
    optionId: 32,
    apply: true,
  });
  assert.deepEqual(alreadySelected.result, { skipped: true, reason: 'already-selected' });

  const applied = await session.selectMealOption({
    date: '2026-06-19',
    mealTypeName: 'Sniadanie',
    optionId: 11,
    apply: true,
  });
  assert.deepEqual(applied.result, {
    clicked: true,
    updatedMeal: {
      mealTypeId: 1,
      mealTypeName: 'Sniadanie',
      dishName: 'Owsianka',
      changeVisible: true,
    },
  });
  assert.deepEqual(calls.clicked, [{ mealTypeId: 1, optionId: 11 }]);
});

test('selectMealOption validates required fields and missing matches', async () => {
  const { session } = createUiSession();

  await assert.rejects(() => session.selectMealOption({ mealTypeName: 'Obiad', optionId: 31 }), /Missing required date/);
  await assert.rejects(() => session.selectMealOption({ date: '2026-06-19', optionId: 31 }), /Missing required meal type/);
  await assert.rejects(() => session.selectMealOption({ date: '2026-06-19', mealTypeName: 'Obiad' }), /Missing required option/);
  await assert.rejects(
    () => session.selectMealOption({ date: '2026-06-19', mealTypeName: 'Obiad', optionText: 'schabowy' }),
    /No visible option matched schabowy/
  );
});
