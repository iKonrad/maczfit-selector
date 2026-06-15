import fs from 'node:fs/promises';
import path from 'node:path';
import { launchBrowser, newAuthenticatedContext } from './lib/maczfit-client.mjs';
import { MaczfitUiSession } from './lib/maczfit-ui-session.mjs';

const DEFAULT_DIR = 'output/selections';

function parseArgs(argv) {
  const args = {
    apply: false,
    dir: DEFAULT_DIR,
    files: [],
    delayMs: 800,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--dir') {
      args.dir = argv[++i];
    } else if (arg === '--file') {
      args.files.push(argv[++i]);
    } else if (arg === '--delay-ms') {
      args.delayMs = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    'Usage:',
    '  npm run apply:selections',
    '  npm run apply:selections -- --apply',
    '  npm run apply:selections -- --dir output/selections --apply',
    '  npm run apply:selections -- --file output/selections/2026-06-19.json --apply',
    '',
    'Without --file, scans --dir for *.json files and processes files where status !== "applied".',
    'Dry-run is the default. Add --apply to update the website and mark files as applied.',
  ].join('\n');
}

async function fileExists(filePath) {
  return fs.access(filePath).then(() => true, () => false);
}

async function pendingFilesFromDir(dir) {
  if (!await fileExists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function extractChoices(plan) {
  const rawChoices = Array.isArray(plan.choices) ? plan.choices : plan.selections;
  if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
    throw new Error('Selection file must contain a non-empty choices array.');
  }

  return rawChoices.map((choice) => ({
    mealTypeId: Number(choice.mealTypeId),
    optionId: Number(choice.optionId ?? choice.selectedOption?.id),
  }));
}

async function loadPendingPlans(files) {
  const plans = [];
  for (const filePath of files) {
    const plan = await readJson(filePath);
    if (plan.status === 'applied') continue;
    plans.push({ filePath, plan });
  }
  return plans.sort((a, b) => String(a.plan.date || a.filePath).localeCompare(String(b.plan.date || b.filePath)));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
    throw new Error('--delay-ms must be a non-negative number.');
  }

  const files = args.files.length > 0 ? args.files : await pendingFilesFromDir(args.dir);
  if (files.length === 0) {
    console.log(`No selection files found. ${usage()}`);
    return;
  }

  const pendingPlans = await loadPendingPlans(files);
  if (pendingPlans.length === 0) {
    console.log('No pending selection files found. All matching files are already applied.');
    return;
  }

  if (!args.apply) {
    console.log(JSON.stringify({
      apply: false,
      pendingFiles: pendingPlans.map(({ filePath, plan }) => ({
        filePath,
        date: plan.date,
        status: plan.status || null,
        choices: extractChoices(plan),
      })),
    }, null, 2));
    return;
  }

  const browser = await launchBrowser();
  let hadError = false;
  try {
    const context = await newAuthenticatedContext(browser);
    const page = await context.newPage();
    const session = new MaczfitUiSession(page);
    await session.openActiveTransactionPage();

    for (const { filePath, plan } of pendingPlans) {
      try {
        if (!plan.date) throw new Error('Selection file is missing date.');
        const choices = extractChoices(plan);
        const applyResult = await session.selectDayOptions({
          date: plan.date,
          choices,
          apply: true,
          delayMs: args.delayMs,
        });

        plan.status = 'applied';
        plan.appliedAt = new Date().toISOString();
        plan.applyResult = applyResult;
        delete plan.failedAt;
        delete plan.error;
        await writeJson(filePath, plan);
        console.log(`Applied ${plan.date} from ${filePath}`);
      } catch (error) {
        hadError = true;
        await session.closeMealDialogIfOpen().catch(() => {});
        plan.status = 'failed';
        plan.failedAt = new Date().toISOString();
        plan.error = error.message;
        await writeJson(filePath, plan).catch(() => {});
        console.error(`Failed ${filePath}: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (hadError) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  console.error(usage());
  process.exitCode = 1;
});
