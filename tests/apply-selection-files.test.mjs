import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadPendingPlans, pendingFilesFromDir, readJson, writeJson } from '../scripts/apply-selection-files.mjs';

test('selection file helpers find JSON files, read/write JSON, and skip applied plans', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'maczfit-selections-'));
  const applied = path.join(dir, '2026-06-20.json');
  const pendingLater = path.join(dir, '2026-06-22.json');
  const pendingSooner = path.join(dir, '2026-06-19.json');
  const ignored = path.join(dir, 'notes.txt');

  await writeJson(applied, { date: '2026-06-20', status: 'applied' });
  await writeJson(pendingLater, { date: '2026-06-22', status: 'planned' });
  await writeJson(pendingSooner, { date: '2026-06-19', status: 'planned' });
  await fs.writeFile(ignored, 'not json');

  assert.deepEqual(await readJson(pendingSooner), { date: '2026-06-19', status: 'planned' });
  assert.deepEqual((await pendingFilesFromDir(dir)).map((filePath) => path.basename(filePath)), [
    '2026-06-19.json',
    '2026-06-20.json',
    '2026-06-22.json',
  ]);
  assert.deepEqual(await pendingFilesFromDir(path.join(dir, 'missing')), []);

  const pendingPlans = await loadPendingPlans([pendingLater, applied, pendingSooner]);
  assert.deepEqual(pendingPlans.map(({ plan }) => plan.date), ['2026-06-19', '2026-06-22']);
});
