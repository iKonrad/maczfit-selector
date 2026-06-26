import { OUTPUT_DIR, gotoOrders, gotoTransactionOrders, loginAndSaveState, saveMaskedPageArtifact } from './maczfit-client.mjs';
import { configurableDays, configurableUnconfiguredDays, readCalendarDayStates } from './maczfit-ui.mjs';

const MEAL_TYPE_IDS = new Map([
  ['śniadanie', 1],
  ['sniadanie', 1],
  ['ii śniadanie', 2],
  ['ii sniadanie', 2],
  ['obiad', 3],
  ['podwieczorek', 4],
  ['kolacja', 5],
]);

export function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mealTypeIdFromName(name) {
  return MEAL_TYPE_IDS.get(normalizeText(name));
}

export function dateParts(date) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) throw new Error(`Invalid date: ${date}`);
  return { year, month: month - 1, day };
}

export class MaczfitUiSession {
  constructor(page) {
    this.page = page;
    this.transactionId = null;
  }

  async openActiveTransactionPage() {
    await gotoOrders(this.page);
    let href = await this.waitForActiveTransactionHref();
    if (!href && await this.isLoginPage()) {
      await loginAndSaveState(this.page);
      await gotoOrders(this.page);
      href = await this.waitForActiveTransactionHref();
    }

    const match = href?.match(/\/moje-konto\/zamowienia\/(\d+)/);
    if (!match) {
      await saveMaskedPageArtifact(this.page, OUTPUT_DIR, 'active-transaction-not-found');
      throw new Error(`Could not find active transaction link in the UI. Current URL: ${this.page.url()}`);
    }
    this.transactionId = match[1];
    await gotoTransactionOrders(this.page, this.transactionId);
    try {
      await this.waitForCalendar({ timeout: 12000, saveArtifact: false });
    } catch {
      await this.openMenuEditorFromOverview();
    }
    await this.waitForCalendar();
    return this.transactionId;
  }

  async waitForActiveTransactionHref() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const href = await this.activeTransactionHref();
      if (href) return href;
      await this.page.waitForTimeout(10000);
      if (attempt < 2) await gotoOrders(this.page);
    }
    return null;
  }

  async activeTransactionHref() {
    return this.page
      .locator('a.diet-box--active[href*="/moje-konto/zamowienia/"]')
      .first()
      .getAttribute('href', { timeout: 12000 })
      .catch(() => null);
  }

  async isLoginPage() {
    if (this.page.url().includes('/login')) return true;
    return this.page.locator('input[type="password"]').first().isVisible({ timeout: 1000 }).catch(() => false);
  }

  async waitForCalendar({ timeout = 30000, saveArtifact = true } = {}) {
    try {
      await this.page.locator('.datepicker--cell-day.diet-order-calendar[data-date][data-month][data-year]').first().waitFor({ timeout });
    } catch (error) {
      if (saveArtifact) await saveMaskedPageArtifact(this.page, OUTPUT_DIR, 'calendar-not-found');
      throw new Error(`Calendar did not render. Current URL: ${this.page.url()}. ${error.message}`);
    }
  }

  async openMenuEditorFromOverview() {
    const consent = this.page.locator('.orders-agreemens-js .button--accepted:visible').first();
    if (await consent.isVisible().catch(() => false)) {
      await consent.click().catch(() => {});
      await this.page.waitForTimeout(800);
    }

    const editButton = this.page
      .locator('button.control-buttons-edit-diet:visible, .eab__action--edit-diet:visible')
      .first();
    if (await editButton.isVisible().catch(() => false)) {
      await editButton.click();
      await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await this.page.waitForTimeout(1200);
    }
  }

  async getCalendarDays() {
    await this.waitForCalendar();
    return readCalendarDayStates(this.page);
  }

  async getConfigurableUnconfiguredDays() {
    return configurableUnconfiguredDays(await this.getCalendarDays());
  }

  async getConfigurableDays() {
    return configurableDays(await this.getCalendarDays());
  }

  async openDay(date) {
    await this.closeMealDialogIfOpen();
    const { year, month, day } = dateParts(date);
    const dayCell = this.page.locator(
      `.datepicker--cell-day.diet-order-calendar[data-date="${day}"][data-month="${month}"][data-year="${year}"]`
    ).first();
    await dayCell.waitFor({ timeout: 30000 });
    const className = await dayCell.getAttribute('class');
    if (!className?.includes('-configurable-')) {
      throw new Error(`Date ${date} is not configurable in the rendered calendar.`);
    }
    await dayCell.click();
    await this.page.waitForTimeout(800);
    await this.page.locator('.meal-type:visible').first().waitFor({ timeout: 30000 });
  }

  async getVisibleMeals() {
    return this.page.locator('.meal-type').evaluateAll((nodes) => nodes.filter((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).map((node) => {
      const title = node.querySelector('.title')?.textContent?.trim() || null;
      const dishName = node.querySelector('.desc-title-container')?.textContent?.replace(/\s+/g, ' ').trim() || null;
      return {
        mealTypeId: Number(node.getAttribute('data-value')) || null,
        mealTypeName: title,
        dishName,
        changeVisible: Boolean(node.querySelector('.label-change')),
      };
    }).filter((meal) => meal.mealTypeId && meal.mealTypeName));
  }

  async openMealChangeDialog(mealTypeNameOrId) {
    const mealTypeId = typeof mealTypeNameOrId === 'number' ? mealTypeNameOrId : mealTypeIdFromName(mealTypeNameOrId);
    if (!mealTypeId) throw new Error(`Unknown meal type: ${mealTypeNameOrId}`);
    const mealCard = this.page.locator(`.meal-type[data-value="${mealTypeId}"]:visible`).first();
    await mealCard.waitFor({ timeout: 30000 });
    const change = mealCard.locator('.label-change').first();
    if (!(await change.isVisible().catch(() => false))) {
      throw new Error(`Meal type is not changeable in UI: ${mealTypeNameOrId}`);
    }
    await change.click();
    await this.mealDialog().waitFor({ timeout: 30000 });
    await this.mealOptionBoxes().first().waitFor({ timeout: 30000 });
    await this.page.waitForTimeout(500);
    return mealTypeId;
  }

  mealDialog() {
    return this.page
      .locator('.modal__container[role="dialog"]:visible')
      .filter({ has: this.page.locator('.meals-swiper__new-dish-box') })
      .first();
  }

  mealOptionBoxes() {
    return this.mealDialog().locator('.meals-swiper__new-dish-box');
  }

  async closeMealDialogIfOpen() {
    const modal = this.page.locator('#new-select-menu-modal.is-open, .micromodal.is-open').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(300);
    if (await modal.isVisible().catch(() => false)) {
      const close = modal.locator('[data-micromodal-close], .modal__close, .close').first();
      if (await close.isVisible().catch(() => false)) {
        await close.click().catch(() => {});
      }
    }
    await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async bringMealOptionIntoView(mealTypeId, optionId) {
    await this.page.evaluate(({ mealTypeId: targetMealTypeId, optionId: targetOptionId }) => {
      const selector = `.meals-swiper__new-dish-box[data-meal-type-id="${targetMealTypeId}"][data-id="${targetOptionId}"]`;
      const box = document.querySelector(selector);
      if (!box) return;

      const slide = box.closest('.swiper-slide') || box;
      const wrapper = slide.parentElement;
      const slides = wrapper ? [...wrapper.children].filter((child) => child.classList?.contains('swiper-slide')) : [];
      const slideIndex = slides.indexOf(slide);
      const container = slide.closest('.swiper-container, .swiper');
      const swiper = container?.swiper;
      if (swiper && slideIndex >= 0) {
        swiper.slideTo(slideIndex, 0);
      }

      box.scrollIntoView({ block: 'center', inline: 'center' });
    }, { mealTypeId, optionId });
    await this.page.waitForTimeout(500);
  }

  async clickMealOptionButton(mealTypeId, optionId) {
    const box = this.mealDialog()
      .locator(`.meals-swiper__new-dish-box[data-meal-type-id="${mealTypeId}"][data-id="${optionId}"]`)
      .first();
    await box.waitFor({ timeout: 30000 });
    await this.bringMealOptionIntoView(mealTypeId, optionId);

    const button = box.locator('.slide-meal__content__button').first();
    try {
      await button.click({ timeout: 5000 });
    } catch (error) {
      await this.bringMealOptionIntoView(mealTypeId, optionId);
      const clicked = await this.page.evaluate(({ mealTypeId: targetMealTypeId, optionId: targetOptionId }) => {
        const selector = `.meals-swiper__new-dish-box[data-meal-type-id="${targetMealTypeId}"][data-id="${targetOptionId}"]`;
        const button = document.querySelector(selector)?.querySelector('.slide-meal__content__button');
        if (!button) return false;
        button.click();
        return true;
      }, { mealTypeId, optionId });
      if (!clicked) throw error;
    }
  }

  async getMealOptions(mealTypeNameOrId) {
    const mealTypeId = typeof mealTypeNameOrId === 'number' ? mealTypeNameOrId : mealTypeIdFromName(mealTypeNameOrId);
    if (!mealTypeId) throw new Error(`Unknown meal type: ${mealTypeNameOrId}`);
    return this.mealDialog()
      .locator(`.meals-swiper__new-dish-box[data-meal-type-id="${mealTypeId}"]`)
      .evaluateAll((nodes) => nodes.map((node) => {
        const dishName = node.querySelector('.slide-meal__content__content')?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const tags = [...node.querySelectorAll('.dish-tag-partial-content__text')].map((tag) => tag.textContent?.trim()).filter(Boolean);
        const rating = node.querySelector('.avg-meal-rating')?.textContent?.trim() || null;
        return {
          id: Number(node.getAttribute('data-id')) || null,
          mealTypeId: Number(node.getAttribute('data-meal-type-id')) || null,
          active: node.getAttribute('data-active') === '1',
          dishName,
          tags,
          rating,
        };
      }).filter((option) => option.id && option.dishName));
  }

  async selectMealOption({ date, mealTypeName, optionText, optionId = null, apply = false }) {
    if (!date) throw new Error('Missing required date.');
    if (!mealTypeName) throw new Error('Missing required meal type.');
    if (!optionText && !optionId) throw new Error('Missing required option text or option id.');

    await this.openDay(date);
    const visibleMeals = await this.getVisibleMeals();
    const mealTypeId = await this.openMealChangeDialog(mealTypeName);
    const options = await this.getMealOptions(mealTypeId);
    const normalizedOptionText = normalizeText(optionText);
    const selectedOption = options.find((option) => {
      if (optionId) return option.id === Number(optionId);
      return normalizeText(option.dishName).includes(normalizedOptionText);
    });
    if (!selectedOption) {
      throw new Error(`No visible option matched ${optionText || optionId} for ${mealTypeName} on ${date}.`);
    }

    const plan = {
      apply,
      date,
      mealTypeName,
      mealTypeId,
      visibleMeals,
      selectedOption,
      alreadySelected: selectedOption.active,
    };
    if (!apply || selectedOption.active) {
      return {
        ...plan,
        result: selectedOption.active && apply ? { skipped: true, reason: 'already-selected' } : null,
      };
    }

    await this.clickMealOptionButton(mealTypeId, selectedOption.id);
    await this.page.waitForTimeout(1200);

    const updatedMeal = (await this.getVisibleMeals()).find((meal) => meal.mealTypeId === mealTypeId);
    return {
      ...plan,
      result: {
        clicked: true,
        updatedMeal,
      },
    };
  }

  async selectDayOptions({ date, choices, apply = false, delayMs = 800 }) {
    if (!date) throw new Error('Missing required date.');
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error('Missing required choices.');
    }

    const normalizedChoices = choices.map((choice) => ({
      mealTypeId: Number(choice.mealTypeId),
      optionId: Number(choice.optionId),
    }));
    for (const choice of normalizedChoices) {
      if (!choice.mealTypeId || !choice.optionId) {
        throw new Error(`Invalid choice: ${JSON.stringify(choice)}`);
      }
    }

    const duplicateMealTypeIds = normalizedChoices
      .map((choice) => choice.mealTypeId)
      .filter((mealTypeId, index, values) => values.indexOf(mealTypeId) !== index);
    if (duplicateMealTypeIds.length > 0) {
      throw new Error(`Duplicate meal type choices: ${[...new Set(duplicateMealTypeIds)].join(', ')}`);
    }

    await this.openDay(date);
    const visibleMeals = await this.getVisibleMeals();
    const changeableMealTypeIds = new Set(visibleMeals.filter((meal) => meal.changeVisible).map((meal) => meal.mealTypeId));
    for (const choice of normalizedChoices) {
      if (!changeableMealTypeIds.has(choice.mealTypeId)) {
        throw new Error(`Meal type ${choice.mealTypeId} is not visible/changeable for ${date}.`);
      }
    }

    await this.openMealChangeDialog(normalizedChoices[0].mealTypeId);

    const results = [];
    for (const choice of normalizedChoices) {
      const meal = visibleMeals.find((item) => item.mealTypeId === choice.mealTypeId);
      const options = await this.getMealOptions(choice.mealTypeId);
      const selectedOption = options.find((option) => option.id === choice.optionId);
      if (!selectedOption) {
        throw new Error(`Option ${choice.optionId} was not found for meal type ${choice.mealTypeId} on ${date}.`);
      }

      const result = {
        apply,
        date,
        mealTypeId: choice.mealTypeId,
        mealTypeName: meal?.mealTypeName || null,
        currentDishName: meal?.dishName || null,
        selectedOption,
        alreadySelected: selectedOption.active,
        result: null,
      };

      if (apply && !selectedOption.active) {
        await this.clickMealOptionButton(choice.mealTypeId, choice.optionId);
        await this.page.waitForTimeout(delayMs);
        result.result = { clicked: true };
      } else if (apply && selectedOption.active) {
        result.result = { skipped: true, reason: 'already-selected' };
      }

      results.push(result);
    }

    return {
      apply,
      date,
      choices: results,
    };
  }

  async getDayOptions(date = null) {
    const targetDate = date || (await this.getConfigurableUnconfiguredDays())[0] || (await this.getConfigurableDays())[0];
    if (!targetDate) throw new Error('No configurable days found in the rendered calendar.');

    await this.openDay(targetDate);
    const visibleMeals = await this.getVisibleMeals();
    const firstChangeableMeal = visibleMeals.find((meal) => meal.changeVisible);
    if (!firstChangeableMeal) {
      return {
        date: targetDate,
        currentMeals: visibleMeals,
        optionsByMeal: [],
      };
    }

    await this.openMealChangeDialog(firstChangeableMeal.mealTypeId);
    const optionsByMeal = [];
    for (const meal of visibleMeals.filter((item) => item.changeVisible)) {
      optionsByMeal.push({
        mealTypeId: meal.mealTypeId,
        mealTypeName: meal.mealTypeName,
        enabled: true,
        currentDishName: meal.dishName,
        options: await this.getMealOptions(meal.mealTypeId),
      });
    }

    return {
      date: targetDate,
      currentMeals: visibleMeals,
      optionsByMeal,
    };
  }
}
