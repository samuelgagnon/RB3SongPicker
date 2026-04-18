const sqlite3 = require('sqlite3').verbose();

class Database {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
    this.initializeSchema();
  }

  initializeSchema() {
    this.db.serialize(() => {
      this.db.run('PRAGMA journal_mode = WAL');
      this.db.run('PRAGMA foreign_keys = ON');

      this.db.run(
        `CREATE TABLE IF NOT EXISTS songs (
          shortname TEXT PRIMARY KEY,
          title TEXT,
          artist TEXT,
          album TEXT,
          origin TEXT,
          updated_at TEXT,
          present INTEGER NOT NULL DEFAULT 1
        )`
      );

      this.db.all('PRAGMA table_info(songs)', (err, rows) => {
        if (!err && rows && !rows.some((column) => column.name === 'present')) {
          this.db.run('ALTER TABLE songs ADD COLUMN present INTEGER NOT NULL DEFAULT 1');
        }
      });

      this.db.run(
        `CREATE TABLE IF NOT EXISTS picks (
          shortname TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(shortname) REFERENCES songs(shortname) ON DELETE CASCADE
        )`
      );

      this.db.run(
        `CREATE TABLE IF NOT EXISTS songlists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          created_at TEXT,
          updated_at TEXT
        )`
      );

      this.db.run(
        `CREATE TABLE IF NOT EXISTS songlist_items (
          list_id INTEGER NOT NULL,
          shortname TEXT NOT NULL,
          PRIMARY KEY(list_id, shortname),
          FOREIGN KEY(list_id) REFERENCES songlists(id) ON DELETE CASCADE,
          FOREIGN KEY(shortname) REFERENCES songs(shortname) ON DELETE CASCADE
        )`
      );

      this.db.run(
        `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )`
      );
    });
  }

  promisifyRun(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve(this);
      });
    });
  }

  promisifyGet(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  promisifyAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  async getSetting(key, defaultValue = null) {
    const row = await this.promisifyGet('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : defaultValue;
  }

  setSetting(key, value) {
    return this.promisifyRun(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    );
  }
}

module.exports = Database;
