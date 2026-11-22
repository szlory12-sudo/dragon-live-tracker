/** Normalize provider events into Dragon's provider-neutral event shape. */
export function normalizeGift({ profileHandle, giftName, coinCount = undefined, diamondCount = undefined, repeatCount = 1, repeatEnd = true, streakable = false, timestamp = new Date().toISOString(), eventId = null, liveSessionId = null }) {
  // Streakable gift events are only counted at their final event to prevent double counting.
  if (streakable && !repeatEnd) return null;
  const quantity = Math.max(1, Number(repeatCount) || 1);
  // Dragon's internal unit is Coins. Legacy diamondCount is accepted for compatibility.
  const sourceValue = coinCount ?? diamondCount ?? 0;
  const coins = Math.max(0, Number(sourceValue) || 0) * quantity;
  return {
    type: 'gift', profileHandle: String(profileHandle || '').replace(/^@/, '').toLowerCase(),
    giftName: String(giftName || 'Gift'), quantity, coins, diamonds: coins,
    timestamp, eventId, liveSessionId
  };
}

export function normalizeLiveStatus({ profileHandle, live, timestamp = new Date().toISOString(), liveSessionId = null }) {
  return {
    type: live ? 'live_start' : 'live_end',
    profileHandle: String(profileHandle || '').replace(/^@/, '').toLowerCase(),
    timestamp, liveSessionId
  };
}
