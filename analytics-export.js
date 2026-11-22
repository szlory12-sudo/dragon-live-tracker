/** Export analytics reports as JSON or CSV. Values are Dragon Coin-first; legacy Diamond aliases are not exported. */
function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function periodRows(summary, handle) {
  const rows = [];
  for (const kind of ['daily', 'weekly', 'monthly']) {
    const map = summary?.periods?.[kind] ?? {};
    for (const [period, values] of Object.entries(map)) {
      rows.push({
        record_type: 'period', handle, period_type: kind, period,
        coins: cleanNumber(values.coins ?? values.diamonds),
        gifts: cleanNumber(values.gifts), gift_events: cleanNumber(values.events)
      });
    }
  }
  return rows;
}


/** JSON export; validates a report object and returns a formatted JSON string. */
export function exportAnalyticsJSON(report = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('report must be an object');
  return JSON.stringify({ ...report, exportType: 'dragon-live-analytics', version: 1, unit: 'coins' }, null, 2);
}


/** CSV export from a report containing creators, rankings, and comparisons. */
export function exportAnalyticsCSV(report = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('report must be an object');
  const rows = [];
  for (const summary of report.creators ?? []) {
    const handle = String(summary?.handle ?? summary?.profileHandle ?? '').replace(/^@/, '').toLowerCase();
    rows.push({ record_type: 'creator', handle, coins: cleanNumber(summary.coins ?? summary.totalCoins ?? summary.diamonds ?? summary.totalDiamonds), gifts: cleanNumber(summary.gifts), gift_events: cleanNumber(summary.giftEvents) });
    rows.push(...periodRows(summary, handle));
  }
  for (const item of report.rankings ?? report.ranking ?? []) {
    rows.push({ record_type: 'ranking', handle: String(item?.handle ?? '').replace(/^@/, '').toLowerCase(), rank: cleanNumber(item.rank), coins: cleanNumber(item.coins ?? item.diamonds) });
  }
  for (const item of report.comparisons ?? []) {
    const current = item.current ?? {};
    const previous = item.previous ?? {};
    const delta = item.delta ?? {};
    const percent = item.percent ?? {};
    rows.push({ record_type: 'comparison', handle: item.handle ?? '', period: item.period ?? '', coins: cleanNumber(current.coins ?? current.diamonds), previous_coins: cleanNumber(previous.coins ?? previous.diamonds), delta_coins: cleanNumber(delta.coins ?? delta.diamonds), percent_coins: percent.coins ?? percent.diamonds ?? '', gifts: cleanNumber(current.gifts), previous_gifts: cleanNumber(previous.gifts), delta_gifts: cleanNumber(delta.gifts) });
  }
  const headers = ['record_type', 'handle', 'period_type', 'period', 'rank', 'coins', 'previous_coins', 'delta_coins', 'percent_coins', 'gifts', 'previous_gifts', 'delta_gifts', 'gift_events'];
  return [headers.join(','), ...rows.map(row => headers.map(key => csvCell(row[key])).join(','))].join('\n');
}
