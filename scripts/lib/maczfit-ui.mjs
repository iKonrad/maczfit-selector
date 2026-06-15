export async function readCalendarDayStates(page) {
  return page.evaluate(() => {
    function isoDateFromCell(cell) {
      const year = Number(cell.dataset.year);
      const month = Number(cell.dataset.month);
      const day = Number(cell.dataset.date);
      if (!year || Number.isNaN(month) || !day) return null;
      const date = new Date(Date.UTC(year, month, day));
      return date.toISOString().slice(0, 10);
    }

    return [...document.querySelectorAll('.datepicker--cell-day.diet-order-calendar[data-date][data-month][data-year]')]
      .filter((cell) => cell.getClientRects().length > 0)
      .map((cell) => {
        const classes = [...cell.classList];
        return {
          date: isoDateFromCell(cell),
          configurable: classes.includes('-configurable-'),
          configured: classes.includes('-configured-'),
          selected: classes.includes('-selected-'),
          current: cell.dataset.current === '1',
          classes,
        };
      })
      .filter((day) => day.date);
  });
}

export function configurableUnconfiguredDays(calendarDays) {
  return calendarDays
    .filter((day) => day.configurable && !day.configured)
    .map((day) => day.date)
    .sort();
}

export function configurableDays(calendarDays) {
  return calendarDays
    .filter((day) => day.configurable)
    .map((day) => day.date)
    .sort();
}
