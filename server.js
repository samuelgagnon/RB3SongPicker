const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const DB_PATH = path.join(BASE_DIR, 'songs.sqlite');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const DEFAULT_CONFIG = { xboxIp: '192.168.0.100', xboxPort: 21070 };

if (typeof fetch !== 'function') {
  throw new Error('Node.js built-in fetch is required. Please use Node 18 or newer.');
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return saveConfig(DEFAULT_CONFIG);
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw);
    return {
      xboxIp: cfg.xboxIp || DEFAULT_CONFIG.xboxIp,
      xboxPort: cfg.xboxPort || DEFAULT_CONFIG.xboxPort
    };
  } catch (error) {
    console.warn('Could not read config file, using default config.', error.message);
    return saveConfig(DEFAULT_CONFIG);
  }
}

function saveConfig(config) {
  const safeConfig = {
    xboxIp: config.xboxIp || DEFAULT_CONFIG.xboxIp,
    xboxPort: Number(config.xboxPort) || DEFAULT_CONFIG.xboxPort
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(safeConfig, null, 2), 'utf-8');
  return safeConfig;
}

function openDatabase() {
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
    db.run(
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
    db.all('PRAGMA table_info(songs)', (err, rows) => {
      if (!err && rows && !rows.some((column) => column.name === 'present')) {
        db.run('ALTER TABLE songs ADD COLUMN present INTEGER NOT NULL DEFAULT 1');
      }
    });
    db.run(
      `CREATE TABLE IF NOT EXISTS picks (
        shortname TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(shortname) REFERENCES songs(shortname) ON DELETE CASCADE
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS songlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT,
        updated_at TEXT
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS songlist_items (
        list_id INTEGER NOT NULL,
        shortname TEXT NOT NULL,
        PRIMARY KEY(list_id, shortname),
        FOREIGN KEY(list_id) REFERENCES songlists(id) ON DELETE CASCADE,
        FOREIGN KEY(shortname) REFERENCES songs(shortname) ON DELETE CASCADE
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`
    );
  });
  return db;
}

async function getSetting(key, defaultValue = null) {
  const row = await promisifyGet(db, 'SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  return promisifyRun(db, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

function promisifyRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function promisifyGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function promisifyAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function parseSongListResponse(body) {
  const songs = [];
  let current = null;
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('[') && line.endsWith(']')) {
      if (current) songs.push(current);
      current = { shortname: line.slice(1, -1) };
    } else if (current && line.includes('=')) {
      const [key, value] = line.split('=', 2);
      current[key.trim()] = value.trim();
    }
  }
  if (current) songs.push(current);
  return songs.map((item) => ({
    shortname: item.shortname || '',
    title: item.title || '',
    artist: item.artist || '',
    album: item.album || '',
    origin: item.origin || ''
  }));
}

async function fetchXbox(path) {
  const config = loadConfig();
  const url = `http://${config.xboxIp}:${config.xboxPort}${path}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/plain' }
  });
  if (!response.ok) {
    throw new Error(`Xbox HTTP server returned ${response.status} ${response.statusText}`);
  }
  return response.text();
}

const db = openDatabase();
const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function wrapAsync(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get('/api/config', wrapAsync(async (req, res) => {
  res.json(loadConfig());
}));

app.post('/api/config', wrapAsync(async (req, res) => {
  const { xboxIp, xboxPort } = req.body;
  const config = loadConfig();
  const updatedConfig = saveConfig({
    xboxIp: xboxIp || config.xboxIp,
    xboxPort: Number(xboxPort) || config.xboxPort
  });
  res.json(updatedConfig);
}));

app.get('/api/settings', wrapAsync(async (req, res) => {
  const showSongListManagement = await getSetting('showSongListManagement', 'false');
  res.json({ showSongListManagement: showSongListManagement === 'true' });
}));

app.post('/api/settings', wrapAsync(async (req, res) => {
  const showSongListManagement = req.body.showSongListManagement === true;
  await setSetting('showSongListManagement', showSongListManagement ? 'true' : 'false');
  res.json({ showSongListManagement });
}));

app.get('/api/songs', wrapAsync(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const sort = String(req.query.sort || 'title').toLowerCase();
  const order = String(req.query.order || 'asc').toLowerCase();
  const listId = req.query.listId ? Number(req.query.listId) : null;

  let query = `SELECT s.shortname, s.title, s.artist, s.album, s.origin, IFNULL(p.count, 0) AS picks
    FROM songs s
    LEFT JOIN picks p ON s.shortname = p.shortname`;

  const conditions = ['s.present = 1'];
  const params = [];

  if (listId) {
    query += ' JOIN songlist_items li ON li.shortname = s.shortname';
    conditions.push('li.list_id = ?');
    params.push(listId);
  }

  if (search) {
    const tokens = search.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      conditions.push('(s.title LIKE ? COLLATE NOCASE OR s.artist LIKE ? COLLATE NOCASE OR s.album LIKE ? COLLATE NOCASE OR s.origin LIKE ? COLLATE NOCASE)');
      const wildcard = `%${token}%`;
      params.push(wildcard, wildcard, wildcard, wildcard);
    }
  }

  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const allowedSort = ['title', 'artist', 'album', 'origin', 'picks'];
  const orderBy = allowedSort.includes(sort) ? sort : 'title';
  const direction = order === 'desc' ? 'DESC' : 'ASC';
  query += ` ORDER BY ${orderBy} ${direction}`;

  const songs = await promisifyAll(db, query, params);
  res.json({ songs });
}));

app.post('/api/songs/refresh', wrapAsync(async (req, res) => {
  const raw = await fetchXbox('/list_songs');
  const songs = parseSongListResponse(raw);
  if (!songs.length) {
    return res.status(500).json({ message: 'No songs were returned from the Xbox server.' });
  }

  await promisifyRun(db, 'BEGIN TRANSACTION');
  await promisifyRun(db, 'UPDATE songs SET present = 0');
  for (const song of songs) {
    await promisifyRun(
      db,
      `INSERT INTO songs (shortname, title, artist, album, origin, updated_at, present)
       VALUES (?, ?, ?, ?, ?, datetime('now'), 1)
       ON CONFLICT(shortname) DO UPDATE SET
         title = excluded.title,
         artist = excluded.artist,
         album = excluded.album,
         origin = excluded.origin,
         updated_at = datetime('now'),
         present = 1`,
      [song.shortname, song.title, song.artist, song.album, song.origin]
    );
    await promisifyRun(db, 'INSERT OR IGNORE INTO picks (shortname, count) VALUES (?, 0)', [song.shortname]);
  }
  await promisifyRun(db, 'COMMIT');

  res.json({ updated: songs.length });
}));

app.post('/api/songs/:shortname/pick', wrapAsync(async (req, res) => {
  const shortname = decodeURIComponent(req.params.shortname);
  await fetchXbox(`/jump?shortname=${encodeURIComponent(shortname)}`);
  await promisifyRun(
    db,
    `INSERT INTO picks (shortname, count) VALUES (?, 1)
      ON CONFLICT(shortname) DO UPDATE SET count = count + 1`,
    [shortname]
  );
  const row = await promisifyGet(db, 'SELECT count FROM picks WHERE shortname = ?', [shortname]);
  res.json({ shortname, count: row ? row.count : 0 });
}));

app.get('/api/songlists', wrapAsync(async (req, res) => {
  const lists = await promisifyAll(
    db,
    `SELECT s.id, s.name, s.created_at, s.updated_at,
      (SELECT COUNT(*) FROM songlist_items WHERE list_id = s.id) AS songCount
      FROM songlists s ORDER BY s.name ASC`
  );
  res.json({ lists });
}));

app.get('/api/songlists/:id', wrapAsync(async (req, res) => {
  const listId = Number(req.params.id);
  const list = await promisifyGet(db, 'SELECT id, name, created_at, updated_at FROM songlists WHERE id = ?', [listId]);
  if (!list) {
    return res.status(404).json({ message: 'Song list not found.' });
  }
  const items = await promisifyAll(db, 'SELECT shortname FROM songlist_items WHERE list_id = ? ORDER BY shortname ASC', [listId]);
  res.json({ ...list, items: items.map((item) => item.shortname) });
}));

app.post('/api/songlists', wrapAsync(async (req, res) => {
  const { name, items = [] } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'A song list name is required.' });
  }
  const result = await promisifyRun(
    db,
    'INSERT INTO songlists (name, created_at, updated_at) VALUES (?, datetime("now"), datetime("now"))',
    [name.trim()]
  );
  const listId = result.lastID;
  for (const shortname of Array.from(new Set(items || [])).slice(0, 5000)) {
    await promisifyRun(db, 'INSERT OR IGNORE INTO songlist_items (list_id, shortname) VALUES (?, ?)', [listId, shortname]);
  }
  res.status(201).json({ id: listId, name: name.trim(), items: Array.from(new Set(items || [])) });
}));

app.put('/api/songlists/:id', wrapAsync(async (req, res) => {
  const listId = Number(req.params.id);
  const { name, items = [] } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'A song list name is required.' });
  }
  const list = await promisifyGet(db, 'SELECT id FROM songlists WHERE id = ?', [listId]);
  if (!list) {
    return res.status(404).json({ message: 'Song list not found.' });
  }
  await promisifyRun(db, 'UPDATE songlists SET name = ?, updated_at = datetime("now") WHERE id = ?', [name.trim(), listId]);
  await promisifyRun(db, 'DELETE FROM songlist_items WHERE list_id = ?', [listId]);
  for (const shortname of Array.from(new Set(items || [])).slice(0, 5000)) {
    await promisifyRun(db, 'INSERT OR IGNORE INTO songlist_items (list_id, shortname) VALUES (?, ?)', [listId, shortname]);
  }
  res.json({ id: listId, name: name.trim(), items: Array.from(new Set(items || [])) });
}));

app.delete('/api/songlists/:id', wrapAsync(async (req, res) => {
  const listId = Number(req.params.id);
  const list = await promisifyGet(db, 'SELECT id FROM songlists WHERE id = ?', [listId]);
  if (!list) {
    return res.status(404).json({ message: 'Song list not found.' });
  }
  await promisifyRun(db, 'DELETE FROM songlist_items WHERE list_id = ?', [listId]);
  await promisifyRun(db, 'DELETE FROM songlists WHERE id = ?', [listId]);
  res.json({ deleted: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`RB3 Song Picker server listening on http://localhost:${PORT}`);
});
