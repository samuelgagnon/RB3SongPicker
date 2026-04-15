# RB3 Song Picker

A local Node.js single-page web app for Rock Band 3 Enhanced.

## What it does

- Proxies Xbox HTTP server calls through a local Node.js backend.
- Loads and persists the Xbox song library in a local SQLite database.
- Tracks total pick counts per song.
- Supports sorting by title, artist, album, origin, and pick count.
- Includes a master search across all song fields.
- Allows creating, editing, applying, and deleting custom song lists.
- Refreshes the stored library from the Xbox server.

## Setup

1. Open a terminal in `e:\Git\RB3SongPicker`.
2. Run `npm install`.
3. Start the server with `npm start`.
4. Open `http://localhost:3000` in your browser.

## Configuration

- Set the Xbox IP address and port in the UI, or edit `config.json` directly.
- Make sure `EnableHTTPServer=true` in `rb3.ini` on the Xbox.
- The app expects the Xbox web server to be reachable via `http://<xboxIp>:<xboxPort>`.

## Notes

- The app stores the song library in `songs.sqlite`.
- Song lists are saved to the local database and can be reused.
- The UI is served from the Node.js server, so all calls proxy through the backend.
