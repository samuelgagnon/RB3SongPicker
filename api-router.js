const express = require('express');

const MAX_SONGLIST_ITEMS = 5000;
const ALLOWED_SONG_SORT_COLUMNS = ['title', 'artist', 'album', 'origin', 'picks'];

function wrapAsync(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function songMatchesSearch(song, tokens) {
  const normalizedFields = [song.title, song.artist, song.album, song.origin].map(normalizeSearchValue);
  return tokens.every((token) => {
    const normalizedToken = normalizeSearchValue(token);
    return normalizedFields.some((fieldValue) => fieldValue.includes(normalizedToken));
  });
}

function createApiRouter({ db, configStore, xboxService }) {
  const router = express.Router();

  router.get('/config', wrapAsync(async (req, res) => {
    res.json(configStore.load());
  }));

  router.post('/config', wrapAsync(async (req, res) => {
    const { xboxIp, xboxPort } = req.body;
    const currentConfig = configStore.load();
    const updatedConfig = configStore.save({
      xboxIp: xboxIp || currentConfig.xboxIp,
      xboxPort: Number(xboxPort) || currentConfig.xboxPort
    });
    res.json(updatedConfig);
  }));

  router.get('/settings', wrapAsync(async (req, res) => {
    const showSongListManagement = await db.getSetting('showSongListManagement', 'false');
    const showDuplicateFilterButton = await db.getSetting('showDuplicateFilterButton', 'false');
    const showShortnameColumn = await db.getSetting('showShortnameColumn', 'false');
    res.json({ 
      showSongListManagement: showSongListManagement === 'true',
      showDuplicateFilterButton: showDuplicateFilterButton === 'true',
      showShortnameColumn: showShortnameColumn === 'true'
    });
  }));

  router.post('/settings', wrapAsync(async (req, res) => {
    const showSongListManagement = req.body.showSongListManagement === true;
    const showDuplicateFilterButton = req.body.showDuplicateFilterButton === true;
    const showShortnameColumn = req.body.showShortnameColumn === true;
    await db.setSetting('showSongListManagement', showSongListManagement ? 'true' : 'false');
    await db.setSetting('showDuplicateFilterButton', showDuplicateFilterButton ? 'true' : 'false');
    await db.setSetting('showShortnameColumn', showShortnameColumn ? 'true' : 'false');
    res.json({ 
      showSongListManagement,
      showDuplicateFilterButton,
      showShortnameColumn
    });
  }));

  router.get('/songs', wrapAsync(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const sort = String(req.query.sort || 'title').toLowerCase();
    const order = String(req.query.order || 'asc').toLowerCase();
    const listId = req.query.listId ? Number(req.query.listId) : null;
    const filterDuplicates = req.query.filterDuplicates === 'true';

    let query = `SELECT s.shortname, s.title, s.artist, s.album, s.origin, IFNULL(p.count, 0) AS picks
      FROM songs s
      LEFT JOIN picks p ON s.shortname = p.shortname`;

    const conditions = ['s.present = 1'];
    const params = [];

    if (listId && !filterDuplicates) {
      query += ' JOIN songlist_items li ON li.shortname = s.shortname';
      conditions.push('li.list_id = ?');
      params.push(listId);
    }

    if (filterDuplicates) {
      query += ` WHERE s.present = 1 AND (s.title, s.artist) IN (
        SELECT title, artist FROM songs WHERE present = 1 GROUP BY title, artist HAVING COUNT(*) > 1
      )`;
      if (listId) {
        query += ` AND s.shortname IN (SELECT shortname FROM songlist_items WHERE list_id = ?)`;
        params.push(listId);
      }
      const orderBy = ALLOWED_SONG_SORT_COLUMNS.includes(sort) ? sort : 'title';
      const direction = order === 'desc' ? 'DESC' : 'ASC';
      query += ` ORDER BY ${orderBy} ${direction}`;
    } else {
      if (conditions.length) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      const orderBy = ALLOWED_SONG_SORT_COLUMNS.includes(sort) ? sort : 'title';
      const direction = order === 'desc' ? 'DESC' : 'ASC';
      query += ` ORDER BY ${orderBy} ${direction}`;
    }

    const songs = await db.promisifyAll(query, params);

    if (!search) {
      return res.json({ songs });
    }

    const tokens = search.split(/\s+/).filter(Boolean);
    const normalizedSongs = songs.filter((song) => songMatchesSearch(song, tokens));
    res.json({ songs: normalizedSongs });
  }));

  router.post('/songs/refresh', wrapAsync(async (req, res) => {
    const raw = await xboxService.fetch('/list_songs');
    const songs = xboxService.parseSongListResponse(raw);

    if (!songs.length) {
      return res.status(500).json({ message: 'No songs were returned from the Xbox server.' });
    }

    await db.promisifyRun('BEGIN TRANSACTION');
    await db.promisifyRun('UPDATE songs SET present = 0');

    for (const song of songs) {
      await db.promisifyRun(
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
      await db.promisifyRun('INSERT OR IGNORE INTO picks (shortname, count) VALUES (?, 0)', [song.shortname]);
    }

    await db.promisifyRun('COMMIT');
    res.json({ updated: songs.length });
  }));

  router.post('/songs/:shortname/pick', wrapAsync(async (req, res) => {
    const shortname = decodeURIComponent(req.params.shortname);
    await xboxService.fetch(`/jump?shortname=${encodeURIComponent(shortname)}`);
    await db.promisifyRun(
      `INSERT INTO picks (shortname, count) VALUES (?, 1)
        ON CONFLICT(shortname) DO UPDATE SET count = count + 1`,
      [shortname]
    );
    const row = await db.promisifyGet('SELECT count FROM picks WHERE shortname = ?', [shortname]);
    res.json({ shortname, count: row ? row.count : 0 });
  }));

  router.get('/songlists', wrapAsync(async (req, res) => {
    const lists = await db.promisifyAll(
      `SELECT s.id, s.name, s.created_at, s.updated_at,
        (SELECT COUNT(*) FROM songlist_items WHERE list_id = s.id) AS songCount
        FROM songlists s ORDER BY s.name ASC`
    );
    res.json({ lists });
  }));

  router.get('/songlists/:id', wrapAsync(async (req, res) => {
    const listId = Number(req.params.id);
    const list = await db.promisifyGet('SELECT id, name, created_at, updated_at FROM songlists WHERE id = ?', [listId]);

    if (!list) {
      return res.status(404).json({ message: 'Song list not found.' });
    }

    const items = await db.promisifyAll('SELECT shortname FROM songlist_items WHERE list_id = ? ORDER BY shortname ASC', [listId]);
    res.json({ ...list, items: items.map((item) => item.shortname) });
  }));

  router.post('/songlists', wrapAsync(async (req, res) => {
    const { name, items = [] } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'A song list name is required.' });
    }

    const result = await db.promisifyRun(
      'INSERT INTO songlists (name, created_at, updated_at) VALUES (?, datetime("now"), datetime("now"))',
      [name.trim()]
    );
    const listId = result.lastID;
    const uniqueItems = Array.from(new Set(items || [])).slice(0, MAX_SONGLIST_ITEMS);

    for (const shortname of uniqueItems) {
      await db.promisifyRun('INSERT OR IGNORE INTO songlist_items (list_id, shortname) VALUES (?, ?)', [listId, shortname]);
    }

    res.status(201).json({ id: listId, name: name.trim(), items: uniqueItems });
  }));

  router.put('/songlists/:id', wrapAsync(async (req, res) => {
    const listId = Number(req.params.id);
    const { name, items = [] } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'A song list name is required.' });
    }

    const list = await db.promisifyGet('SELECT id FROM songlists WHERE id = ?', [listId]);
    if (!list) {
      return res.status(404).json({ message: 'Song list not found.' });
    }

    await db.promisifyRun('UPDATE songlists SET name = ?, updated_at = datetime("now") WHERE id = ?', [name.trim(), listId]);
    await db.promisifyRun('DELETE FROM songlist_items WHERE list_id = ?', [listId]);

    const uniqueItems = Array.from(new Set(items || [])).slice(0, MAX_SONGLIST_ITEMS);
    for (const shortname of uniqueItems) {
      await db.promisifyRun('INSERT OR IGNORE INTO songlist_items (list_id, shortname) VALUES (?, ?)', [listId, shortname]);
    }

    res.json({ id: listId, name: name.trim(), items: uniqueItems });
  }));

  router.delete('/songlists/:id', wrapAsync(async (req, res) => {
    const listId = Number(req.params.id);
    const list = await db.promisifyGet('SELECT id FROM songlists WHERE id = ?', [listId]);
    if (!list) {
      return res.status(404).json({ message: 'Song list not found.' });
    }
    await db.promisifyRun('DELETE FROM songlist_items WHERE list_id = ?', [listId]);
    await db.promisifyRun('DELETE FROM songlists WHERE id = ?', [listId]);
    res.json({ deleted: true });
  }));

  return router;
}

module.exports = { createApiRouter };
