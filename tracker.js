/** Small in-memory core. A persistent store and provider adapter will be added separately. */
export class DragonTracker {
  constructor() { this.profiles = new Map(); this.listeners = new Set(); this.adapterDisposers = new Map(); }
  addProfile(handle) {
    const normalized = String(handle || '').replace(/^@/, '').trim().toLowerCase();
    if (!normalized) throw new Error('Profile handle is required');
    if (!this.profiles.has(normalized)) this.profiles.set(normalized, { handle: normalized, live: false, todayCoins: 0, todayDiamonds: 0, sessionCoins: 0, sessionDiamonds: 0, activeSession: null, sessions: [], nextSessionNumber: 1, events: [], seenEventIds: new Set() });
    return this.profiles.get(normalized);
  }
  onEvent(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async connectAdapter(adapter) {
    if (!adapter || typeof adapter.onEvent !== 'function' || typeof adapter.start !== 'function' || typeof adapter.stop !== 'function') throw new Error('Adapter must provide onEvent, start, and stop');
    if (this.adapterDisposers.has(adapter)) return;
    const unsubscribe = adapter.onEvent(event => this.ingest(event));
    this.adapterDisposers.set(adapter, unsubscribe);
    try { await adapter.start(); } catch (error) { unsubscribe(); this.adapterDisposers.delete(adapter); throw error; }
  }
  async disconnectAdapter(adapter) {
    const unsubscribe = this.adapterDisposers.get(adapter);
    if (!unsubscribe) return;
    unsubscribe(); this.adapterDisposers.delete(adapter); await adapter.stop();
  }
  ingest(event) {
    if (!event || !event.profileHandle || !event.type) throw new Error('Invalid normalized event');
    const profile = this.addProfile(event.profileHandle);
    // Idempotency guard: providers may resend events during reconnects.
    if (event.eventId != null) {
      const eventId = String(event.eventId);
      if (profile.seenEventIds.has(eventId)) return profile;
      profile.seenEventIds.add(eventId);
    }
    if (event.type === 'gift') {
      const coins = Math.max(0, Number(event.coins ?? event.diamonds ?? 0));
      profile.todayCoins += coins;
      profile.todayDiamonds = profile.todayCoins; // legacy alias
      // Gifts arriving while live are assigned to the active session. If the source
      // has no start event, preserve totals but mark them as unassigned session gifts.
      if (profile.activeSession) { profile.sessionCoins += coins; profile.sessionDiamonds = profile.sessionCoins; }
    }
    if (event.type === 'live_start') {
      profile.live = true;
      const requestedId = event.liveSessionId == null ? null : String(event.liveSessionId);
      // Duplicate live-starts for the same session do not create a new session.
      if (!profile.activeSession || (requestedId && profile.activeSession.id !== requestedId)) {
        if (profile.activeSession) profile.activeSession.endedAt = event.timestamp;
        const sessionId = requestedId || `${profile.handle}-session-${profile.nextSessionNumber++}`;
        profile.activeSession = { id: sessionId, startedAt: event.timestamp, endedAt: null, coins: 0, diamonds: 0, events: 0 };
        profile.sessionCoins = 0; profile.sessionDiamonds = 0;
        profile.sessions.push(profile.activeSession);
      }
    }
    if (event.type === 'live_end') {
      profile.live = false;
      if (profile.activeSession) {
        profile.activeSession.endedAt = event.timestamp;
        profile.activeSession.coins = profile.sessionCoins; profile.activeSession.diamonds = profile.sessionCoins;
        profile.activeSession = null;
        profile.sessionCoins = 0; profile.sessionDiamonds = 0;
      }
    }
    if (event.type === 'gift' && profile.activeSession) {
      profile.activeSession.coins = profile.sessionCoins; profile.activeSession.diamonds = profile.sessionCoins;
      profile.activeSession.events += 1;
    }
    profile.events.push(event);
    for (const listener of this.listeners) listener({ event, profile });
    return profile;
  }
  getProfile(handle) { return this.profiles.get(String(handle || '').replace(/^@/, '').toLowerCase()) || null; }
  toSnapshot() {
    return {
      version: 1,
      profiles: [...this.profiles.values()].map(profile => ({
        handle: profile.handle, live: profile.live,
        todayCoins: profile.todayCoins, todayDiamonds: profile.todayCoins, sessionCoins: profile.sessionCoins, sessionDiamonds: profile.sessionCoins,
        activeSession: profile.activeSession, sessions: profile.sessions, nextSessionNumber: profile.nextSessionNumber,
        events: profile.events,
        seenEventIds: [...profile.seenEventIds]
      }))
    };
  }
  restoreSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.profiles)) throw new Error('Invalid Dragon snapshot');
    const next = new Map();
    for (const item of snapshot.profiles) {
      const handle = String(item?.handle || '').replace(/^@/, '').trim().toLowerCase();
      if (!handle) throw new Error('Snapshot contains invalid profile handle');
      next.set(handle, {
        handle, live: Boolean(item.live),
        todayCoins: Math.max(0, Number(item.todayCoins ?? item.todayDiamonds) || 0),
        todayDiamonds: Math.max(0, Number(item.todayCoins ?? item.todayDiamonds) || 0),
        sessionCoins: Math.max(0, Number(item.sessionCoins ?? item.sessionDiamonds) || 0),
        sessionDiamonds: Math.max(0, Number(item.sessionCoins ?? item.sessionDiamonds) || 0),
        activeSession: item.activeSession || null, sessions: Array.isArray(item.sessions) ? item.sessions : [],
        nextSessionNumber: Math.max(1, Number(item.nextSessionNumber) || 1),
        events: Array.isArray(item.events) ? item.events : [],
        seenEventIds: new Set(Array.isArray(item.seenEventIds) ? item.seenEventIds.map(String) : [])
      });
    }
    this.profiles = next;
    return this;
  }
  async save(store, key = 'dragon-live-tracker-state-v1') {
    if (!store || typeof store.set !== 'function') throw new Error('Persistence store must provide set(key, value)');
    await store.set(key, JSON.stringify(this.toSnapshot()));
  }
  async load(store, key = 'dragon-live-tracker-state-v1') {
    if (!store || typeof store.get !== 'function') throw new Error('Persistence store must provide get(key)');
    const raw = await store.get(key);
    if (raw == null) return false;
    let snapshot;
    try { snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { throw new Error('Stored Dragon state is not valid JSON'); }
    this.restoreSnapshot(snapshot);
    return true;
  }
}
