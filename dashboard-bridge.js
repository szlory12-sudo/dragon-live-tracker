import { DragonTracker } from './tracker.js';
import { ProfileManager, PACKAGE_LIMITS } from './profile-manager.js';
import { summarizeEvents, rankCreators } from './analytics.js';
import { exportAnalyticsCSV, exportAnalyticsJSON } from './analytics-export.js';

/** Dashboard-facing facade for the local prototype engine. No UI, network, or TikTok connector is included. */
export class DragonDashboardBridge {
  constructor({ tracker = new DragonTracker(), profileManager = new ProfileManager(), limits = PACKAGE_LIMITS } = {}) {
    this.tracker = tracker;
    this.profileManager = profileManager;
    this.limits = limits;
    this.lastEvent = null;
    this.unsubscribe = tracker.onEvent(({ event }) => { this.lastEvent = event; });
  }
  addCreator(handle) {
    const record = this.profileManager.add(handle);
    this.tracker.addProfile(record.handle);
    return record;
  }
  removeCreator(handle) {
    const normalized = this.profileManager.normalizeHandle(handle);
    this.profileManager.remove(normalized);
    this.tracker.profiles.delete(normalized);
    return true;
  }
  setPlan(packageName) { this.profileManager.setPackage(packageName); return this.getState(); }
  ingest(event) { return this.tracker.ingest(event); }
  getCreator(handle) {
    const profile = this.tracker.getProfile(handle);
    if (!profile) return null;
    return { handle: profile.handle, live: profile.live, todayCoins: profile.todayCoins, sessionCoins: profile.sessionCoins, session: profile.activeSession, sessions: profile.sessions.length, giftEvents: profile.events.filter(e => e.type === 'gift').length };
  }
  getState() {
    const creators = [...this.tracker.profiles.values()].map(profile => ({
      handle: profile.handle, live: profile.live, todayCoins: profile.todayCoins,
      sessionCoins: profile.sessionCoins, session: profile.activeSession,
      summary: summarizeEvents(profile.events, { handle: profile.handle }),
      sessionCount: profile.sessions.length,
      giftEvents: profile.events.filter(e => e.type === 'gift').length
    }));
    const rankings = rankCreators(creators.map(c => ({ handle: c.handle, coins: c.summary.totalCoins }))
      .map(item => ({ handle: item.handle, coins: item.coins, rank: item.rank })));
    return { engine: 'dragon-live-tracker', unit: 'coins', package: this.profileManager.packageName,
      limits: { ...this.profileManager.limits }, trackedCount: this.profileManager.count(), remainingSlots: this.profileManager.remaining(),
      creators, rankings, lastEvent: this.lastEvent };
  }
  exportJSON() { return exportAnalyticsJSON({ creators: this.getState().creators.map(c => ({ handle: c.handle, ...c.summary })), rankings: this.getState().rankings }); }
  exportCSV() { const state = this.getState(); return exportAnalyticsCSV({ creators: state.creators.map(c => ({ handle: c.handle, ...c.summary })), rankings: state.rankings }); }
  toSnapshot() { return { version: 1, tracker: this.tracker.toSnapshot(), profileManager: this.profileManager.toSnapshot() }; }
  restoreSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !snapshot.tracker || !snapshot.profileManager) throw new Error('Invalid dashboard bridge snapshot');
    this.tracker.restoreSnapshot(snapshot.tracker); this.profileManager.restore(snapshot.profileManager); this.lastEvent = null; return this;
  }
  async save(store, key = 'dragon-dashboard-bridge-v1') { if (!store?.set) throw new Error('Persistence store must provide set(key, value)'); await store.set(key, JSON.stringify(this.toSnapshot())); }
  async load(store, key = 'dragon-dashboard-bridge-v1') { if (!store?.get) throw new Error('Persistence store must provide get(key)'); const raw = await store.get(key); if (raw == null) return false; let snapshot; try { snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new Error('Stored dashboard bridge state is invalid JSON'); } this.restoreSnapshot(snapshot); return true; }
  dispose() { this.unsubscribe?.(); this.unsubscribe = null; }
}
