import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

export const BASE_URL = process.env.MACZFIT_BASE_URL || 'https://www.maczfit.pl';
export const AUTH_STATE = process.env.MACZFIT_AUTH_STATE || '.auth/maczfit.json';
export const OUTPUT_DIR = process.env.MACZFIT_OUTPUT_DIR || 'output/discovery';
export const HEADLESS = process.env.HEADLESS !== 'false';
export const PROXY_DELAY_MS = Number(process.env.MACZFIT_PROXY_DELAY_MS || 500);

export async function ensureDirFor(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function acceptCookies(page) {
  const allowAll = page.getByRole('button', {
    name: /allow all|zezw[oó]l na wszystkie|zaakceptuj|akceptuj|akceptuję/i,
  });
  if (await allowAll.isVisible().catch(() => false)) {
    await allowAll.click();
  }
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

export async function saveMaskedPageArtifact(page, outputDir, name) {
  await fs.mkdir(outputDir, { recursive: true });
  await page
    .locator('input[type="email"], input[type="password"]')
    .evaluateAll((inputs) => {
      for (const input of inputs) input.value = input.type === 'password' ? '********' : '<redacted>';
    })
    .catch(() => {});
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(outputDir, `${name}.html`), await page.content()).catch(() => {});
}

export async function launchBrowser() {
  return chromium.launch({ headless: HEADLESS });
}

export async function newAuthenticatedContext(browser) {
  return browser.newContext({ storageState: AUTH_STATE, locale: 'pl-PL' });
}

export async function loginAndSaveState(page, authState = AUTH_STATE, outputDir = OUTPUT_DIR) {
  if (!process.env.EMAIL || !process.env.PASSWORD) {
    throw new Error('Missing EMAIL or PASSWORD in .env');
  }

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await acceptCookies(page);

  const emailInput = await firstVisible(page, [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[autocomplete="email"]',
    'input[placeholder*="email" i]',
  ]);
  const passwordInput = await firstVisible(page, [
    'input[type="password"]',
    'input[name*="password" i]',
    'input[autocomplete="current-password"]',
    'input[placeholder*="hasło" i]',
    'input[placeholder*="password" i]',
  ]);

  if (!emailInput || !passwordInput) {
    await saveMaskedPageArtifact(page, outputDir, 'login-form-not-found');
    throw new Error(`Could not find login inputs. Current URL: ${page.url()}`);
  }

  await emailInput.fill(process.env.EMAIL);
  await passwordInput.fill(process.env.PASSWORD);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/login'), { timeout: 45000 }).catch(() => null),
    page.getByRole('button', { name: 'Zaloguj się' }).click(),
  ]);
  await Promise.race([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45000 }).catch(() => null),
    page.locator('.login__invalid:visible').waitFor({ timeout: 45000 }).catch(() => null),
    page.locator('.input-spinner').waitFor({ state: 'hidden', timeout: 45000 }).catch(() => null),
  ]);

  if (page.url().includes('/login')) {
    const visibleLoginError = await page.locator('.login__invalid:visible').innerText({ timeout: 1000 }).catch(() => '');
    await saveMaskedPageArtifact(page, outputDir, 'login-failed');
    throw new Error(`Login did not leave /login. ${visibleLoginError || 'No visible login error was shown.'}`);
  }

  await ensureDirFor(authState);
  await page.context().storageState({ path: authState });
}

export async function gotoOrders(page) {
  await page.goto(`${BASE_URL}/moje-konto/zamowienia`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

export async function gotoTransactionOrders(page, transactionId) {
  await page.goto(`${BASE_URL}/moje-konto/zamowienia/${transactionId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

export async function readDashboardState(page) {
  return page.evaluate(() => {
    const brandId = typeof MIX_BRAND_ID !== 'undefined' ? MIX_BRAND_ID : window.MIX_BRAND_ID;
    const tx = typeof transaction !== 'undefined' ? transaction : null;
    const pkgs = typeof packages !== 'undefined' && Array.isArray(packages) ? packages : [];
    const proxy = typeof mainMockApiUrl !== 'undefined' ? mainMockApiUrl : null;
    const authToken = typeof token !== 'undefined' ? token : null;
    const clientId = typeof userId !== 'undefined' ? userId : null;

    return {
      proxyPath: proxy ? new URL(proxy, window.location.origin).pathname : null,
      hasToken: Boolean(authToken),
      hasClientId: Boolean(clientId),
      brandId,
      transaction: tx,
      packages: pkgs,
    };
  });
}
