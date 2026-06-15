import { launchBrowser, newAuthenticatedContext } from './lib/maczfit-client.mjs';
import { MaczfitUiSession } from './lib/maczfit-ui-session.mjs';

const includeConfigured = process.argv.includes('--all-configurable');

async function main() {
  const browser = await launchBrowser();
  try {
    const context = await newAuthenticatedContext(browser);
    const page = await context.newPage();
    const session = new MaczfitUiSession(page);

    const transactionId = await session.openActiveTransactionPage();
    const calendarDays = await session.getCalendarDays();
    const dates = includeConfigured ? await session.getConfigurableDays() : await session.getConfigurableUnconfiguredDays();

    console.log(JSON.stringify({
      transactionId,
      mode: includeConfigured ? 'all-configurable' : 'configurable-unconfigured',
      dates,
      counts: {
        visibleCalendarDays: calendarDays.length,
        configurable: calendarDays.filter((day) => day.configurable).length,
        configured: calendarDays.filter((day) => day.configured).length,
        configurableUnconfigured: calendarDays.filter((day) => day.configurable && !day.configured).length,
        returned: dates.length,
      },
      calendarDays,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
