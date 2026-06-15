import assert from 'node:assert/strict';
import test from 'node:test';
import { configurableDays, configurableUnconfiguredDays } from '../scripts/lib/maczfit-ui.mjs';

test('calendar helpers return sorted configurable dates', () => {
  const days = [
    { date: '2026-06-19', configurable: true, configured: false },
    { date: '2026-06-17', configurable: false, configured: false },
    { date: '2026-06-18', configurable: true, configured: true },
    { date: '2026-06-16', configurable: true, configured: false },
  ];

  assert.deepEqual(configurableDays(days), ['2026-06-16', '2026-06-18', '2026-06-19']);
  assert.deepEqual(configurableUnconfiguredDays(days), ['2026-06-16', '2026-06-19']);
});
