import fs from 'node:fs/promises';
import path from 'node:path';

export const SELECTIONS_DIR = process.env.MACZFIT_SELECTIONS_DIR || 'output/selections';

// A day counts as configured when we have already applied a plan for it. The
// API exposes no "user configured this day" flag, so our own history is the
// source of truth.
export async function appliedSelectionDates(dir = SELECTIONS_DIR) {
  const dates = new Set();
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const plan = await fs.readFile(path.join(dir, entry.name), 'utf8').then(JSON.parse).catch(() => null);
    if (plan?.status === 'applied' && plan.date) dates.add(plan.date);
  }
  return dates;
}
