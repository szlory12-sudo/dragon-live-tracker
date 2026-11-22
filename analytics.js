/** Analytics helpers derived only from normalized tracker events. Dates use UTC unless a caller supplies an offset-aware range. */
function validDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  return d;
}
function dayKey(date) { return date.toISOString().slice(0, 10); }
function weekKey(date) {
  // ISO week key (Monday-based) in UTC.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function monthKey(date) { return date.toISOString().slice(0, 7); }

export function summarizeEvents(events = [], { handle = null, from = null, to = null } = {}) {
  if (!Array.isArray(events)) throw new Error('events must be an array');
  const start = from == null ? null : validDate(from).getTime();
  const end = to == null ? null : validDate(to).getTime();
  if (start != null && end != null && end < start) throw new Error('to must be on or after from');
  const selected = events.filter(e => {
    if (!e || e.type !== 'gift') return false;
    if (handle && String(e.profileHandle || '').replace(/^@/, '').toLowerCase() !== String(handle).replace(/^@/, '').toLowerCase()) return false;
    const ts = validDate(e.timestamp).getTime();
    return (start == null || ts >= start) && (end == null || ts <= end);
  });
  const totalCoins = selected.reduce((sum, e) => sum + Math.max(0, Number(e.coins ?? e.diamonds) || 0), 0);
  const gifts = selected.reduce((sum, e) => sum + Math.max(0, Number(e.quantity) || 1), 0);
  const periods = { daily: {}, weekly: {}, monthly: {} };
  for (const e of selected) {
    const date = validDate(e.timestamp);
    for (const [kind, key] of [['daily', dayKey(date)], ['weekly', weekKey(date)], ['monthly', monthKey(date)]]) {
      periods[kind][key] ??= { coins: 0, diamonds: 0, gifts: 0, events: 0 };
      const coins = Math.max(0, Number(e.coins ?? e.diamonds) || 0);
      periods[kind][key].coins += coins;
      periods[kind][key].diamonds += coins; // legacy alias
      periods[kind][key].gifts += Math.max(0, Number(e.quantity) || 1);
      periods[kind][key].events += 1;
    }
  }
  return { handle: handle ? String(handle).replace(/^@/, '').toLowerCase() : null, totalCoins, totalDiamonds: totalCoins, coins: totalCoins, gifts, giftEvents: selected.length, periods }; // diamonds is a legacy alias
}


export function getDailySummary(events, date, options = {}) {
  const key = dayKey(validDate(date));
  return summarizeEvents(events, options).periods.daily[key] ?? { coins: 0, diamonds: 0, gifts: 0, events: 0 };
}
export function getWeeklySummary(events, date, options = {}) {
  const key = weekKey(validDate(date));
  return summarizeEvents(events, options).periods.weekly[key] ?? { coins: 0, diamonds: 0, gifts: 0, events: 0 };
}
export function getMonthlySummary(events, date, options = {}) {
  const key = monthKey(validDate(date));
  return summarizeEvents(events, options).periods.monthly[key] ?? { coins: 0, diamonds: 0, gifts: 0, events: 0 };
}

/** Compare two period summaries. Percent change is null when the baseline is zero. */
export function comparePeriods(current = {}, previous = {}) {
  const currentCoins = Math.max(0, Number(current.coins ?? current.diamonds ?? current.totalCoins ?? current.totalDiamonds) || 0);
  const previousCoins = Math.max(0, Number(previous.coins ?? previous.diamonds ?? previous.totalCoins ?? previous.totalDiamonds) || 0);
  const currentGifts = Math.max(0, Number(current.gifts) || 0);
  const previousGifts = Math.max(0, Number(previous.gifts) || 0);
  const deltaCoins = currentCoins - previousCoins;
  const deltaGifts = currentGifts - previousGifts;
  return {
    current: { coins: currentCoins, diamonds: currentCoins, gifts: currentGifts },
    previous: { coins: previousCoins, diamonds: previousCoins, gifts: previousGifts },
    delta: { coins: deltaCoins, diamonds: deltaCoins, gifts: deltaGifts },
    percent: {
      coins: previousCoins === 0 ? null : (deltaCoins / previousCoins) * 100,
      diamonds: previousCoins === 0 ? null : (deltaCoins / previousCoins) * 100,
      gifts: previousGifts === 0 ? null : (deltaGifts / previousGifts) * 100
    },
    direction: deltaCoins > 0 ? 'up' : deltaCoins < 0 ? 'down' : 'flat'
  };
}


/** Rank creator summaries by observed gift diamonds; ties are stable by handle. */
export function rankCreators(summaries = []) {
  if (!Array.isArray(summaries)) throw new Error('summaries must be an array');
  return summaries.map(item => {
    const handle = String(item?.handle ?? item?.profileHandle ?? '').replace(/^@/, '').toLowerCase();
    if (!handle) throw new Error('creator handle is required');
    const coins = Math.max(0, Number(item.coins ?? item.diamonds ?? item.totalCoins ?? item.totalDiamonds) || 0);
    return { handle, coins, diamonds: coins };
  }).sort((a, b) => b.coins - a.coins || a.handle.localeCompare(b.handle))
    .map((item, index) => ({ rank: index + 1, ...item }));
}
