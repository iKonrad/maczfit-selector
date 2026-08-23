import { isModifiable, openSession } from './lib/maczfit-api-client.mjs';
import { appliedSelectionDates } from './lib/maczfit-selection-store.mjs';
import { pathToFileURL } from 'node:url';

const includeConfigured = process.argv.includes('--all-configurable');

async function main() {
  const { api, orderId } = await openSession();
  const deliveries = await api.upcomingDeliveries(orderId);
  const applied = await appliedSelectionDates();

  const calendarDays = deliveries
    .map((delivery) => {
      const configurable = isModifiable(delivery.modificationTimeRemaining);
      return {
        date: delivery.deliveryDate,
        deliveryId: delivery.deliveryId,
        configurable,
        configured: applied.has(delivery.deliveryDate),
        modificationTimeRemaining: delivery.modificationTimeRemaining,
        seen: delivery.seen,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const selected = calendarDays.filter((day) => day.configurable && (includeConfigured || !day.configured));

  console.log(JSON.stringify({
    orderId,
    mode: includeConfigured ? 'all-configurable' : 'configurable-unconfigured',
    dates: selected.map((day) => day.date),
    counts: {
      visibleCalendarDays: calendarDays.length,
      configurable: calendarDays.filter((day) => day.configurable).length,
      configured: calendarDays.filter((day) => day.configured).length,
      configurableUnconfigured: calendarDays.filter((day) => day.configurable && !day.configured).length,
      returned: selected.length,
      apiRequests: api.requestCount,
    },
    calendarDays,
  }, null, 2));
}

// Only run when executed directly; importing this module (e.g. from tests)
// must not fire live API calls.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
