import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/** Minimal async storage contract implementation for tests and demos. */
export class MemoryPersistence {
  constructor() { this.values = new Map(); }
  async set(key, value) { this.values.set(String(key), String(value)); }
  async get(key) { return this.values.get(String(key)) ?? null; }
}

/** SQLite key/value persistence using Node's built-in SQLite API (Node >=22.5).
 * SQLite is public-domain software; no third-party package is added.
 * Node's node:sqlite API is currently experimental, so production deployment
 * should pin and validate the Node runtime version.
 */
export class SQLitePersistence {
  constructor(databasePath) {
    if (!databasePath) throw new Error('SQLite database path is required');
    let DatabaseSync;
    try { ({ DatabaseSync } = requireSQLite()); }
    catch (error) { throw new Error(`Node SQLite is unavailable: ${error.message}`); }
    this.db = new DatabaseSync(databasePath);
    this.db.exec('CREATE TABLE IF NOT EXISTS dragon_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    this.setStatement = this.db.prepare('INSERT INTO dragon_kv(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP');
    this.getStatement = this.db.prepare('SELECT value FROM dragon_kv WHERE key = ?');
  }
  async set(key, value) { this.setStatement.run(String(key), String(value)); }
  async get(key) { return this.getStatement.get(String(key))?.value ?? null; }
  close() { this.db.close(); }
}


// Dynamic import is wrapped for compatibility with Node versions that lack node:sqlite.
function requireSQLite() {
  // Node 22+ supports the built-in module; use a synchronous accessor via a
  // cached import is not possible in a constructor, so this helper uses createRequire.
  return require('node:sqlite');
}
