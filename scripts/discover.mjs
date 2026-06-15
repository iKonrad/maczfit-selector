import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AUTH_STATE,
  BASE_URL,
  OUTPUT_DIR,
  launchBrowser,
  loginAndSaveState,
} from './lib/maczfit-client.mjs';

const interestingUrl = /api|graphql|wybor|wyb[oó]r|menu|meal|posil|posił|diet|order|zam[oó]w|calendar|delivery|account|konto/i;
const firstPartyUrl = /(^https:\/\/www\.maczfit\.pl\/)|(^https:\/\/gw-prd\.maczhub-api\.maczfit\.pl\/)/i;
const sensitiveKey = /email|password|token|authorization|auth|phone|telefon|address|adres|street|ulica|name|nazw|imie|imię|customer|client|user|session|cookie|ip/i;

function redact(value) {
  if (Array.isArray(value)) return value.slice(0, 5).map(redact);
  if (!value || typeof value !== 'object') return value;

  const redacted = {};
  for (const [key, nested] of Object.entries(value)) {
    redacted[key] = sensitiveKey.test(key) ? '<redacted>' : redact(nested);
  }
  return redacted;
}

function redactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      url.searchParams.set(key, '<redacted>');
    }
    return url.toString().replaceAll('%3Credacted%3E', '<redacted>');
  } catch {
    return rawUrl;
  }
}

function pageMarkers(text) {
  return {
    loggedIn: /Wyloguj/i.test(text),
    hasDiets: /Moje diety/i.test(text),
    hasMenuChoice: /Wyb[oó]r Menu|wyb[oó]r menu|Wybierz posi[łl]ki/i.test(text),
    hasEditableMenu: /Możesz dokonywać zmian w swoim menu/i.test(text),
    hasPrepared: /Twoje posi[łl]ki są przygotowywane/i.test(text),
    hasAlreadySelected: /Wybrałeś posi[łl]ki na ten dzień/i.test(text),
    hasSelectionExpired: /Czas na wyb[oó]r Twoich posi[łl]ków upłynął/i.test(text),
    hasChooseInAppBanner: /Wybierz posi[łl]ki w aplikacji/i.test(text),
    mentionsMacros: /kcal|białko|tłuszcz|węglowodany/i.test(text),
  };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await launchBrowser();
  const context = await browser.newContext({ locale: 'pl-PL' });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();

  const network = [];
  page.on('response', async (response) => {
    const request = response.request();
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (!firstPartyUrl.test(url) || !interestingUrl.test(url)) return;

    const item = {
      method: request.method(),
      status: response.status(),
      url: redactUrl(url),
      resourceType: request.resourceType(),
      contentType,
    };

    if (contentType.includes('application/json')) {
      try {
        item.sample = redact(await response.json());
      } catch {
        item.sample = '<unreadable-json>';
      }
    }
    network.push(item);
  });

  const pages = [];
  try {
    await loginAndSaveState(page);

    const urls = [
      `${BASE_URL}/moje-konto`,
      `${BASE_URL}/moje-konto/zamowienia`,
      `${BASE_URL}/moje-konto/diety`,
      `${BASE_URL}/moje-konto/kalendarz`,
      `${BASE_URL}/moje-konto/wybor-menu`,
    ];

    for (const url of urls) {
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      const title = await page.title().catch(() => '');
      const text = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
      pages.push({
        requestedUrl: url,
        finalUrl: page.url(),
        title,
        markers: pageMarkers(text),
      });
    }
  } finally {
    await fs.writeFile(path.join(OUTPUT_DIR, 'pages.json'), JSON.stringify(pages, null, 2));
    await fs.writeFile(path.join(OUTPUT_DIR, 'network.json'), JSON.stringify(network, null, 2));
    await browser.close();
  }

  console.log(`Saved auth state to ${AUTH_STATE}`);
  console.log(`Saved discovery output to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
