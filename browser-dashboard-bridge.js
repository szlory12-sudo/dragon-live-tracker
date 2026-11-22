/** Browser-side Dashboard bridge adapter. Mirrors the Dashboard's existing localStorage model
 * into a stable bridge API without importing Node-only engine modules.
 */
export class DragonBrowserDashboardBridge {
  constructor({ storage = globalThis.localStorage, key = 'dragonTrackerProfiles' } = {}) {
    if (!storage?.getItem || !storage?.setItem) throw new Error('Browser storage is required');
    this.storage = storage;
    this.key = key;
    this.profiles = [];
    this.loadError = null;
    this.load();
  }
  load() {
    const raw = this.storage.getItem(this.key);
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error('Dashboard profile data must be an array');
      this.profiles = parsed;
      this.loadError = null;
    } catch (error) {
      // Preserve the original storage value; keep the bridge usable with an empty state.
      this.profiles = [];
      this.loadError = error.message || 'Stored profile data is invalid';
    }
    return this.getState();
  }
  syncProfiles(profiles, { persist = true } = {}) {
    if (!Array.isArray(profiles)) throw new Error('Profiles must be an array');
    this.profiles = profiles.map(p => ({ ...p, history: Array.isArray(p.history) ? p.history : [] }));
    // Startup recovery must not overwrite malformed storage until a deliberate user save.
    if (persist) {
      this.storage.setItem(this.key, JSON.stringify(this.profiles));
      this.loadError = null;
    }
    return this.getState();
  }
  getState() {
    const creators = this.profiles.map(p => ({ handle: String(p.handle || '').replace(/^@/, '').trim().toLowerCase(), name: p.name || '', live: Boolean(p.live), followers: Number(p.followers || 0), coins: Number(p.coins ?? p.diamonds ?? 0), historyCount: (p.history || []).length }));
    const rankings = creators.slice().sort((a,b) => b.coins-a.coins || a.handle.localeCompare(b.handle)).map((p,i) => ({ ...p, rank: i+1 }));
    return { bridge: 'dragon-browser-dashboard-bridge', version: 1, unit: 'coins', trackedCount: creators.length, creators, rankings, loadError: this.loadError };
  }
  snapshot() { return { version: 1, profiles: this.profiles }; }
  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.profiles)) throw new Error('Invalid browser bridge snapshot');
    return this.syncProfiles(snapshot.profiles);
  }
  exportJSON() { return JSON.stringify({ bridge: 'dragon-browser-dashboard-bridge', version: 1, exportedAt: new Date().toISOString(), ...this.snapshot() }, null, 2); }
}
