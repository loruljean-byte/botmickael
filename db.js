const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT,
    points INTEGER DEFAULT 0,
    niche_call_done INTEGER DEFAULT NULL, -- NULL = pas encore répondu, 0 = non, 1 = oui
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS rediffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    coach TEXT,
    created_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    type TEXT NOT NULL, -- 'free_niche' ou 'paid'
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'screenshot' ou 'video'
    filename TEXT NOT NULL,
    points_awarded INTEGER NOT NULL,
    status TEXT DEFAULT 'approved', -- approved / pending / rejected
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

module.exports = db;
