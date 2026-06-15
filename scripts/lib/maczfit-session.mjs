import {
  fetchCurrentMeals,
  fetchMenuOptionsForPackage,
  markPackageInteracted,
  updateExistingMealSelection,
} from './maczfit-api.mjs';
import { gotoOrders, gotoTransactionOrders, readDashboardState } from './maczfit-client.mjs';
import {
  currentMealSummary,
  dateOnly,
  enabledMealTypeIds,
  enabledMealTypeNames,
  findPackageByDate,
  flattenMealRecords,
  menuOptionSummary,
  selectablePackages,
  sortPackages,
} from './maczfit-models.mjs';
import { configurableDays, configurableUnconfiguredDays, readCalendarDayStates } from './maczfit-ui.mjs';

export class MaczfitSession {
  constructor(page) {
    this.page = page;
    this.dashboard = null;
    this.calendarDays = null;
    this.currentMealsByPackageId = new Map();
    this.menuOptionsByDate = new Map();
    this.dayOptionsByDate = new Map();
  }

  clearCache() {
    this.currentMealsByPackageId.clear();
    this.menuOptionsByDate.clear();
    this.dayOptionsByDate.clear();
  }

  clearDayCache(date) {
    this.menuOptionsByDate.delete(date);
    this.dayOptionsByDate.delete(date);
    const pkg = this.getPackageByDate(date);
    if (pkg) this.currentMealsByPackageId.delete(pkg.Id);
  }

  async loadDashboard() {
    await gotoOrders(this.page);
    this.dashboard = await readDashboardState(this.page);
    return this.dashboard;
  }

  async ensureDashboard() {
    return this.dashboard || this.loadDashboard();
  }

  async loadTransactionPage() {
    const dashboard = await this.ensureDashboard();
    const transactionId = dashboard.transaction?.Id;
    if (!transactionId) throw new Error('Could not read active transaction id.');
    await gotoTransactionOrders(this.page, transactionId);
    return transactionId;
  }

  async getCalendarDays({ reload = false } = {}) {
    if (this.calendarDays && !reload) return this.calendarDays;
    await this.loadTransactionPage();
    this.calendarDays = await readCalendarDayStates(this.page);
    return this.calendarDays;
  }

  async getConfigurableUnconfiguredDays() {
    return configurableUnconfiguredDays(await this.getCalendarDays());
  }

  async getConfigurableDays() {
    return configurableDays(await this.getCalendarDays());
  }

  async isDateConfigurable(date) {
    const calendarDays = await this.getCalendarDays();
    return Boolean(calendarDays.find((day) => day.date === date)?.configurable);
  }

  getSortedPackages() {
    return sortPackages(this.dashboard?.packages || []);
  }

  getPackageByDate(date) {
    return findPackageByDate(this.getSortedPackages(), date);
  }

  getDefaultPackage() {
    const packages = this.getSortedPackages();
    return selectablePackages(packages)[0] || packages.find((pkg) => new Date(pkg.DeliveryDate) >= new Date()) || packages[0] || null;
  }

  async getCurrentMeals(pkg) {
    if (!this.currentMealsByPackageId.has(pkg.Id)) {
      const response = await fetchCurrentMeals(this.page, pkg.Id);
      this.currentMealsByPackageId.set(pkg.Id, flattenMealRecords(response));
    }
    return this.currentMealsByPackageId.get(pkg.Id);
  }

  async getMenuDays(pkg) {
    const date = dateOnly(pkg.DeliveryDate);
    if (!this.menuOptionsByDate.has(date)) {
      const dashboard = await this.ensureDashboard();
      const response = await fetchMenuOptionsForPackage(this.page, pkg, dashboard.transaction);
      this.menuOptionsByDate.set(date, Array.isArray(response) ? response : []);
    }
    return this.menuOptionsByDate.get(date);
  }

  async getDayOptions(date = null) {
    await this.ensureDashboard();
    const pkg = date ? this.getPackageByDate(date) : this.getDefaultPackage();
    if (!pkg) throw new Error(date ? `No package found for ${date}` : 'No packages were exposed by the dashboard.');

    const normalizedDate = dateOnly(pkg.DeliveryDate);
    if (this.dayOptionsByDate.has(normalizedDate)) return this.dayOptionsByDate.get(normalizedDate);

    const currentMeals = await this.getCurrentMeals(pkg);
    const menuDays = await this.getMenuDays(pkg);
    const [menuDay] = menuDays;
    const enabledIds = enabledMealTypeIds(currentMeals);
    const optionsByMeal = (menuDay?.MealTypes || []).map((mealType) => {
      const mealTypeId = mealType.MealType?.Id;
      return {
        mealTypeId,
        mealTypeName: mealTypeNameForMealType(mealType),
        enabled: enabledIds.has(mealTypeId),
        optionCount: mealType.Meals?.length || 0,
        rawMealType: mealType,
        options: mealType.Meals || [],
        optionSummaries: (mealType.Meals || []).map((option) => menuOptionSummary(option, mealType)),
      };
    });

    const day = {
      date: normalizedDate,
      package: pkg,
      dashboard: this.dashboard,
      currentMeals,
      currentMealSummaries: currentMeals.map(currentMealSummary),
      enabledMealTypeIds: [...enabledIds],
      enabledMealTypeNames: [...enabledMealTypeNames(currentMeals)],
      optionsByMeal,
      enabledOptionsByMeal: optionsByMeal.filter((meal) => meal.enabled),
    };
    this.dayOptionsByDate.set(normalizedDate, day);
    return day;
  }

  async selectMeal({
    date,
    mealTypeName: requestedMealTypeName = null,
    mealTypeId: requestedMealTypeId = null,
    menuItemId,
    apply = false,
    markInteracted = false,
  } = {}) {
    if (!date) throw new Error('Missing required date.');
    if (!menuItemId) throw new Error('Missing required menuItemId.');
    if (!requestedMealTypeName && !requestedMealTypeId) {
      throw new Error('Missing required mealTypeName or mealTypeId.');
    }

    const calendarDays = await this.getCalendarDays();
    const calendarDay = calendarDays.find((day) => day.date === date);
    if (!calendarDay?.configurable) {
      throw new Error(`Date ${date} is not configurable in the rendered calendar.`);
    }

    const day = await this.getDayOptions(date);
    const targetMeal = day.optionsByMeal.find((meal) => {
      if (requestedMealTypeId) return meal.mealTypeId === Number(requestedMealTypeId);
      return meal.mealTypeName?.toLocaleLowerCase('pl-PL') === requestedMealTypeName.toLocaleLowerCase('pl-PL');
    });
    if (!targetMeal) {
      throw new Error(`Meal type not found for ${date}: ${requestedMealTypeName || requestedMealTypeId}`);
    }
    if (!targetMeal.enabled) {
      throw new Error(`Meal type is disabled for ${date}: ${targetMeal.mealTypeName}`);
    }

    const selectedOption = targetMeal.options.find((option) => option.Id === Number(menuItemId));
    if (!selectedOption) {
      throw new Error(`Menu item ${menuItemId} is not an option for ${targetMeal.mealTypeName} on ${date}.`);
    }

    const existingMeal = day.currentMeals.find((meal) => Number(meal.MealTypeId) === Number(targetMeal.mealTypeId));
    if (!existingMeal?.Id) {
      throw new Error(`No existing meal slot found for ${targetMeal.mealTypeName} on ${date}.`);
    }

    const updatePayload = {
      existingMealId: existingMeal.Id,
      transactionPackageId: day.package.Id,
      mealTypeId: targetMeal.mealTypeId,
      menuItemId: selectedOption.Id,
      extraMeal: false,
    };
    const alreadySelected = Number(existingMeal.MenuItemId || existingMeal.MenuItem?.Id) === Number(selectedOption.Id);
    const plan = {
      apply,
      date,
      configuredBefore: calendarDay.configured,
      alreadySelected,
      mealTypeName: targetMeal.mealTypeName,
      current: currentMealSummary(existingMeal),
      selectedOption: menuOptionSummary(selectedOption, targetMeal.rawMealType),
      updatePayload,
      markInteracted,
    };

    if (!apply) return { ...plan, result: null };
    if (alreadySelected) return { ...plan, result: { skipped: true, reason: 'already-selected' } };

    const updateResult = await updateExistingMealSelection(this.page, updatePayload);
    const interactedResult = markInteracted ? await markPackageInteracted(this.page, day.package.Id) : null;
    this.clearDayCache(date);
    return { ...plan, result: { updateResult, interactedResult } };
  }
}

function mealTypeNameForMealType(mealType) {
  return mealType.MealType?.Name || mealType.MealType?.NameEng || mealType.MealType?.NameDe || null;
}
