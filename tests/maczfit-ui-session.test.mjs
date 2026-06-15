import assert from 'node:assert/strict';
import test from 'node:test';
import { dateParts, mealTypeIdFromName, normalizeText } from '../scripts/lib/maczfit-ui-session.mjs';

test('normalizeText lowercases Polish text, strips diacritics, and collapses spaces', () => {
  assert.equal(normalizeText('  II  ŚNIADANIE  '), 'ii sniadanie');
  assert.equal(normalizeText(null), '');
});

test('mealTypeIdFromName accepts Polish names with or without diacritics', () => {
  assert.equal(mealTypeIdFromName('Śniadanie'), 1);
  assert.equal(mealTypeIdFromName('II sniadanie'), 2);
  assert.equal(mealTypeIdFromName('Obiad'), 3);
  assert.equal(mealTypeIdFromName('Podwieczorek'), 4);
  assert.equal(mealTypeIdFromName('Kolacja'), 5);
  assert.equal(mealTypeIdFromName('Brunch'), undefined);
});

test('dateParts converts ISO dates to calendar dataset values', () => {
  assert.deepEqual(dateParts('2026-06-19'), { year: 2026, month: 5, day: 19 });
  assert.throws(() => dateParts('bad-date'), /Invalid date/);
});
