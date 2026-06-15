import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs as parseApplyArgs, extractChoices } from '../scripts/apply-selection-files.mjs';
import { parseArgs as parseSelectDayArgs, parseChoice } from '../scripts/select-day.mjs';
import { parseArgs as parseSelectMealArgs } from '../scripts/select-meal.mjs';

test('select-day parses choices and validates malformed values', () => {
  assert.deepEqual(parseChoice('3=4517099'), { mealTypeId: 3, optionId: 4517099 });
  assert.throws(() => parseChoice('3:4517099'), /Invalid choice/);

  assert.deepEqual(parseSelectDayArgs([
    '--date',
    '2026-06-19',
    '--choice',
    '1=11',
    '--choice',
    '3=33',
    '--apply',
    '--delay-ms',
    '250',
  ]), {
    apply: true,
    choices: [
      { mealTypeId: 1, optionId: 11 },
      { mealTypeId: 3, optionId: 33 },
    ],
    delayMs: 250,
    date: '2026-06-19',
  });
});

test('select-meal parses dry-run and apply arguments', () => {
  assert.deepEqual(parseSelectMealArgs([
    '--date',
    '2026-06-19',
    '--meal',
    'Obiad',
    '--option-id',
    '123',
    '--apply',
  ]), {
    apply: true,
    date: '2026-06-19',
    mealTypeName: 'Obiad',
    optionId: 123,
  });

  assert.deepEqual(parseSelectMealArgs([
    '--date',
    '2026-06-19',
    '--meal',
    'Obiad',
    '--dish',
    'pierogi',
  ]), {
    apply: false,
    date: '2026-06-19',
    mealTypeName: 'Obiad',
    optionText: 'pierogi',
  });
});

test('apply-selection-files parses files, directories, and dry-run choices', () => {
  assert.deepEqual(parseApplyArgs([
    '--dir',
    'tmp/selections',
    '--file',
    'one.json',
    '--file',
    'two.json',
    '--apply',
    '--delay-ms',
    '100',
  ]), {
    apply: true,
    dir: 'tmp/selections',
    files: ['one.json', 'two.json'],
    delayMs: 100,
  });

  assert.deepEqual(extractChoices({
    choices: [
      { mealTypeId: '1', optionId: '11' },
      { mealTypeId: 3, selectedOption: { id: '33' } },
    ],
  }), [
    { mealTypeId: 1, optionId: 11 },
    { mealTypeId: 3, optionId: 33 },
  ]);
  assert.throws(() => extractChoices({ choices: [] }), /non-empty choices array/);
});
