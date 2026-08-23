import 'dotenv/config';

export const API_BASE = process.env.MACZFIT_API_BASE || 'https://www.maczfit.pl/api/web/v1';
export const REQUEST_DELAY_MS = Number(process.env.MACZFIT_REQUEST_DELAY_MS || 400);
export const OUTPUT_DIR = process.env.MACZFIT_OUTPUT_DIR || 'output/discovery';

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Maczfit's own SPA drives these endpoints; the paths and the id semantics were
// read out of its JS bundle and verified against live responses.
export const ENDPOINTS = {
  login: () => '/auth/login',
  activeOrders: () => '/orders/active',
  order: (orderId) => `/orders/${orderId}`,
  upcomingDeliveries: (orderId, n) => `/orders/${orderId}/upcoming-deliveries?numberOfDeliveries=${n}`,
  deliveryMenu: (deliveryId) => `/orders/deliveries/${deliveryId}/menus`,
  mealOptions: (orderId, deliveryId, deliveryMealId) =>
    `/orders/${orderId}/deliveries/${deliveryId}/delivery-meals/${deliveryMealId}/switch/new`,
  changeMeal: (orderId, deliveryId, deliveryMealId, dietCaloriesMealId) =>
    `/orders/${orderId}/deliveries/${deliveryId}/delivery-meals/${deliveryMealId}/switch/${dietCaloriesMealId}`,
};

const MEAL_TYPE_IDS = new Map([
  ['sniadanie', 1],
  // The rebuilt API labels second breakfast "2 Śniadanie"; older UI used "II śniadanie".
  ['ii sniadanie', 2],
  ['2 sniadanie', 2],
  ['drugie sniadanie', 2],
  ['obiad', 3],
  ['podwieczorek', 4],
  ['kolacja', 5],
]);

export function normalizeMealName(value) {
  return String(value || '')
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mealTypeIdFromName(name) {
  return MEAL_TYPE_IDS.get(normalizeMealName(name)) || null;
}

// "DD:HH:MM" counts down to the edit deadline; zero or negative means locked.
export function isModifiable(modificationTimeRemaining) {
  const raw = String(modificationTimeRemaining || '');
  if (!raw || raw.includes('-')) return false;
  return raw.split(':').some((part) => Number(part) > 0);
}

export class MaczfitApi {
  constructor({ base = API_BASE, delayMs = REQUEST_DELAY_MS } = {}) {
    this.base = base;
    this.delayMs = delayMs;
    this.cookies = new Map();
    this.requestCount = 0;
    this.lastRequestAt = 0;
  }

  cookieHeader() {
    return [...this.cookies.values()].join('; ');
  }

  storeCookies(response) {
    for (const cookie of response.headers.getSetCookie?.() || []) {
      const [pair] = cookie.split(';');
      const name = pair.split('=')[0];
      if (name) this.cookies.set(name, pair);
    }
  }

  async throttle() {
    const wait = this.lastRequestAt + this.delayMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
  }

  async request(path, { method = 'GET', body } = {}) {
    await this.throttle();
    this.requestCount += 1;

    const cookie = this.cookieHeader();
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': USER_AGENT,
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    this.storeCookies(response);

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} ${path} failed with ${response.status}: ${text.slice(0, 200)}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async login() {
    if (!process.env.EMAIL || !process.env.PASSWORD) {
      throw new Error('Missing EMAIL or PASSWORD in .env');
    }
    await this.request(ENDPOINTS.login(), {
      method: 'POST',
      body: { username: process.env.EMAIL, password: process.env.PASSWORD },
    });
    if (!this.cookies.has('SESSION')) {
      throw new Error('Login succeeded but no SESSION cookie was returned.');
    }
  }

  async activeOrderId() {
    const active = await this.request(ENDPOINTS.activeOrders());
    const orderId = Array.isArray(active) ? active[0]?.orderId : active?.orderId;
    if (!orderId) throw new Error('No active order found on the account.');
    return orderId;
  }

  order(orderId) {
    return this.request(ENDPOINTS.order(orderId));
  }

  upcomingDeliveries(orderId, numberOfDeliveries = 24) {
    return this.request(ENDPOINTS.upcomingDeliveries(orderId, numberOfDeliveries));
  }

  deliveryMenu(deliveryId) {
    return this.request(ENDPOINTS.deliveryMenu(deliveryId));
  }

  mealOptions(orderId, deliveryId, deliveryMealId) {
    return this.request(ENDPOINTS.mealOptions(orderId, deliveryId, deliveryMealId));
  }

  // dietCaloriesMealId comes from an option's menuMealDetails, not from its
  // top-level dietCaloriesId — the two differ and only the former switches.
  changeMeal({ orderId, deliveryId, deliveryMealId, dietCaloriesMealId, amount = 1 }) {
    return this.request(
      `${ENDPOINTS.changeMeal(orderId, deliveryId, deliveryMealId, dietCaloriesMealId)}?amount=${amount}`,
      { method: 'PUT' }
    );
  }
}

export async function openSession() {
  const api = new MaczfitApi();
  await api.login();
  const orderId = await api.activeOrderId();
  return { api, orderId };
}
