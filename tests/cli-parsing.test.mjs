import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs as parseApplyArgs, extractChoices } from '../scripts/apply-selection-files.mjs';

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
