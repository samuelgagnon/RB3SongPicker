const express = require('express');
const path = require('path');
const ConfigStore = require('./config-store');
const Database = require('./database');
const XboxService = require('./xbox-service');
const { createApiRouter } = require('./api-router');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const DB_PATH = path.join(BASE_DIR, 'songs.sqlite');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');

if (typeof fetch !== 'function') {
  throw new Error('Node.js built-in fetch is required. Please use Node 18 or newer.');
}

const configStore = new ConfigStore(CONFIG_PATH);
const db = new Database(DB_PATH);
const xboxService = new XboxService(configStore);
const apiRouter = createApiRouter({ db, configStore, xboxService });

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use('/api', apiRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`RB3 Song Picker server listening on http://localhost:${PORT}`);
});
