# RB3 Song Picker

A local Node.js single-page web app for Rock Band 3 Enhanced.

## Features

- Proxies Xbox HTTP server calls through a local Node.js backend.
- Loads and caches the Xbox song library locally in `songs.sqlite`.
- Refreshes the stored library from the Xbox server on demand.
- Tracks total pick counts for every song.
- Supports random song selection with a dropdown for all/random unpopular/random popular picks.
- Supports searching the library across all fields.
- Supports sorting by title, artist, album, origin, and pick count.
- Displays the current song count and updates dynamically.
- Provides a responsive mobile-friendly UI.
- Allows creating, editing, deleting, and applying custom song lists.
- Stores song lists and settings locally in the app database.
- Includes an admin page for server config and feature toggles.
- Lets you update Xbox IP and port from the UI or via `config.json`.

## Setup

1. Open a terminal in `e:\Git\RB3SongPicker`.
2. Run `npm install`.
3. If you want to preconfigure the Xbox address, copy `config.example.json` to `config.json` and edit it.
4. Start the server with `npm start`.
5. Open `http://localhost:3000` in your browser.

## Requirements

- Node.js 18 or newer (built-in `fetch` is required).

## Configuration

- Set the Xbox IP address and port in the UI, or copy `config.example.json` to `config.json` and edit it.
- `config.json` is generated locally on first run and is excluded from version control.
- Make sure `EnableHTTPServer=true` in `rb3.ini` on the Xbox.
- The app expects the Xbox web server to be reachable via `http://<xboxIp>:<xboxPort>`.

## Data storage

- Songs are stored in `songs.sqlite`.
- The local database file is created empty on first run and excluded from version control.
- Custom song lists are stored in the local database.
- Pick counts are tracked per song in the local database.

## Notes

- The app uses `/list_songs` to refresh the library and `/jump?shortname=...` to select a song on the Xbox.
- All browser UI requests are proxied through the backend server at `http://localhost:3000`.
