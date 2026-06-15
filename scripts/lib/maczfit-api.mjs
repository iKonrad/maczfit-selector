import { PROXY_DELAY_MS } from './maczfit-client.mjs';
import { dateOnly } from './maczfit-models.mjs';

let lastProxyCallAt = 0;

async function sleep(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProxySlot() {
  const elapsed = Date.now() - lastProxyCallAt;
  await sleep(PROXY_DELAY_MS - elapsed);
  lastProxyCallAt = Date.now();
}

export async function proxyCall(page, endpoint, dataParams = {}, requestType = 'POST') {
  await waitForProxySlot();
  return page.evaluate(
    async ({ endpoint: callEndpoint, dataParams: callDataParams, requestType: callRequestType }) => {
      const proxy = typeof mainMockApiUrl !== 'undefined' ? mainMockApiUrl : null;
      const authToken = typeof token !== 'undefined' ? token : null;
      const brandId = typeof MIX_BRAND_ID !== 'undefined' ? MIX_BRAND_ID : window.MIX_BRAND_ID;
      const clientId = typeof userId !== 'undefined' ? userId : null;
      if (!proxy || !authToken) throw new Error('Maczfit proxy globals are unavailable on this page.');

      const response = await fetch(proxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
        body: JSON.stringify({
          requestType: callRequestType,
          endpoint: callEndpoint,
          token: authToken,
          dataParams: {
            BrandId: brandId,
            ClientId: clientId,
            ...callDataParams,
          },
        }),
      });
      const text = await response.text();
      return JSON.parse(text);
    },
    { endpoint, dataParams, requestType }
  );
}

export async function fetchCurrentMeals(page, transactionPackageId) {
  return proxyCall(page, '/Transaction/Package/Meals/All', { TransactionPackageId: transactionPackageId });
}

export async function fetchMenuOptionsForPackage(page, pkg, transaction) {
  const kcal = transaction?.Product?.Kcal || pkg?.Product?.Kcal;
  const tierId = pkg?.Product?.TierId || pkg?.Product?.Tier?.Id || transaction?.Product?.TierId || transaction?.Product?.Tier?.Id;
  return proxyCall(page, '/Shop/Menu/Items/Days/Get', {
    dates: [dateOnly(pkg.DeliveryDate)],
    kcal,
    TierId: tierId,
  });
}

export async function updateExistingMealSelection(page, { existingMealId, transactionPackageId, mealTypeId, menuItemId, extraMeal = false }) {
  return proxyCall(page, '/Transaction/Package/Meals/Update', {
    Id: existingMealId,
    transactionPackageId,
    mealTypeId,
    menuItemId,
    extraMeal,
    Market: 2,
  });
}

export async function markPackageInteracted(page, transactionPackageId) {
  return proxyCall(page, '/Transaction/Packages/InteractedWith/Update', {
    TransactionPackageId: transactionPackageId,
  });
}

export async function addSingleMealSelection(page, { transactionPackageId, mealTypeId, menuItemId, kcal, extraMeal = false }) {
  return proxyCall(page, '/Transaction/Meals/AddSingle', {
    transactionPackageId,
    mealTypeId,
    menuItemId,
    extraMeal,
    kcal,
    Market: 2,
  });
}
