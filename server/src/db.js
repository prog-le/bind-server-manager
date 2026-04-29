const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { config } = require('./config');

// Ensure data directory exists
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

// Initialize database
async function initDB() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(config.dbPath)) {
    const buffer = fs.readFileSync(config.dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL mode
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  // Initialize schema
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT    UNIQUE NOT NULL,
      password    TEXT    NOT NULL,
      created_at  TEXT    DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key    TEXT PRIMARY KEY,
      value  TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS zones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    UNIQUE NOT NULL,
      type        TEXT    DEFAULT 'master',
      file_path   TEXT    NOT NULL,
      forwarders  TEXT    DEFAULT NULL,
      forward_type TEXT   DEFAULT NULL,
      created_at  TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Migration: add forwarders and forward_type columns if they don't exist
  try { db.run('ALTER TABLE zones ADD COLUMN forwarders TEXT DEFAULT NULL'); } catch (e) {}
  try { db.run('ALTER TABLE zones ADD COLUMN forward_type TEXT DEFAULT NULL'); } catch (e) {}

  // Migration: add SOA columns
  try { db.run('ALTER TABLE zones ADD COLUMN soa_serial TEXT DEFAULT NULL'); } catch (e) {}
  try { db.run('ALTER TABLE zones ADD COLUMN soa_refresh INTEGER DEFAULT 3600'); } catch (e) {}
  try { db.run('ALTER TABLE zones ADD COLUMN soa_retry INTEGER DEFAULT 900'); } catch (e) {}
  try { db.run('ALTER TABLE zones ADD COLUMN soa_expire INTEGER DEFAULT 604800'); } catch (e) {}
  try { db.run('ALTER TABLE zones ADD COLUMN soa_minimum INTEGER DEFAULT 86400'); } catch (e) {}
  try { db.run('ALTER TABLE zones ADD COLUMN soa_primary_ns TEXT DEFAULT NULL'); } catch (e) {}
  try { db.run('ALTER TABLE zones ADD COLUMN soa_admin_email TEXT DEFAULT NULL'); } catch (e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id     INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      type        TEXT    NOT NULL,
      value       TEXT    NOT NULL,
      ttl         INTEGER DEFAULT 3600,
      priority    INTEGER,
      weight      INTEGER,
      port        INTEGER,
      created_at  TEXT    DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      username   TEXT,
      action     TEXT    NOT NULL,
      target     TEXT,
      detail     TEXT,
      ip         TEXT,
      status     TEXT    DEFAULT 'success',
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS backups (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_name     TEXT,
      file_type     TEXT    NOT NULL,
      original_path TEXT    NOT NULL,
      backup_path   TEXT    NOT NULL,
      created_at    TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Save to disk
  saveDB();

  return db;
}

// Save database to disk
function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(config.dbPath, buffer);
}

// Get database instance
function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

// Helper: run a query and return results
function query(sql, params = []) {
  const database = getDB();
  const stmt = database.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: run a query and return first row
function queryOne(sql, params = []) {
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper: run an insert/update/delete
function run(sql, params = []) {
  const database = getDB();
  database.run(sql, params);
  // Capture last_insert_rowid BEFORE saveDB — db.export() resets it in sql.js
  const lastInsertRowid = database.exec('SELECT last_insert_rowid()')[0]?.values[0][0] || 0;
  const changes = database.getRowsModified();
  saveDB();
  return { lastInsertRowid, changes };
}

module.exports = { initDB, getDB, query, queryOne, run, saveDB };
