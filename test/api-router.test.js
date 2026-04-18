const express = require('express');
const request = require('supertest');
const { createApiRouter } = require('../api-router');

// Mock dependencies
jest.mock('../database');
jest.mock('../config-store');
jest.mock('../xbox-service');

const Database = require('../database');
const ConfigStore = require('../config-store');
const XboxService = require('../xbox-service');

describe('API Router - /songs/refresh', () => {
  let db;
  let configStore;
  let xboxService;
  let app;

  beforeEach(() => {
    // Create mock instances
    db = {
      promisifyRun: jest.fn().mockResolvedValue(),
      promisifyAll: jest.fn().mockResolvedValue([]),
      promisifyGet: jest.fn().mockResolvedValue(null),
      getSetting: jest.fn().mockResolvedValue('false'),
      setSetting: jest.fn().mockResolvedValue()
    };

    configStore = {
      load: jest.fn().mockReturnValue({ xboxIp: '192.168.1.100', xboxPort: 8080 }),
      save: jest.fn()
    };

    xboxService = {
      fetch: jest.fn(),
      parseSongListResponse: jest.fn()
    };

    // Mock the constructors
    Database.mockImplementation(() => db);
    ConfigStore.mockImplementation(() => configStore);
    XboxService.mockImplementation(() => xboxService);

    // Create Express app with the router
    app = express();
    app.use(express.json());
    app.use('/api', createApiRouter({ db, configStore, xboxService }));

    // Add error handling middleware like in server.js
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });

    jest.clearAllMocks();
  });

  describe('POST /api/songs/refresh', () => {
    it('should successfully refresh the song library', async () => {
      // Mock the Xbox service responses
      const mockRawResponse = `[song1]
shortname=song1
title=Test Song 1
artist=Test Artist 1
album=Test Album 1
origin=rb3

[song2]
shortname=song2
title=Test Song 2
artist=Test Artist 2
album=Test Album 2
origin=rb3_dlc
`;

      const mockParsedSongs = [
        {
          shortname: 'song1',
          title: 'Test Song 1',
          artist: 'Test Artist 1',
          album: 'Test Album 1',
          origin: 'rb3'
        },
        {
          shortname: 'song2',
          title: 'Test Song 2',
          artist: 'Test Artist 2',
          album: 'Test Album 2',
          origin: 'rb3_dlc'
        }
      ];

      xboxService.fetch.mockResolvedValue(mockRawResponse);
      xboxService.parseSongListResponse.mockReturnValue(mockParsedSongs);

      const response = await request(app)
        .post('/api/songs/refresh')
        .expect(200);

      // Verify Xbox service was called correctly
      expect(xboxService.fetch).toHaveBeenCalledWith('/list_songs');
      expect(xboxService.parseSongListResponse).toHaveBeenCalledWith(mockRawResponse);

      // Verify database operations
      expect(db.promisifyRun).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(db.promisifyRun).toHaveBeenCalledWith('UPDATE songs SET present = 0');

      // Verify song insertions (check that the INSERT statements were called)
      expect(db.promisifyRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO songs'),
        ['song1', 'Test Song 1', 'Test Artist 1', 'Test Album 1', 'rb3']
      );
      expect(db.promisifyRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO songs'),
        ['song2', 'Test Song 2', 'Test Artist 2', 'Test Album 2', 'rb3_dlc']
      );

      // Verify picks insertions
      expect(db.promisifyRun).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO picks (shortname, count) VALUES (?, 0)',
        ['song1']
      );
      expect(db.promisifyRun).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO picks (shortname, count) VALUES (?, 0)',
        ['song2']
      );

      expect(db.promisifyRun).toHaveBeenCalledWith('COMMIT');

      // Verify response
      expect(response.body).toEqual({ updated: 2 });
    });

    it('should return error when no songs are returned', async () => {
      xboxService.fetch.mockResolvedValue('');
      xboxService.parseSongListResponse.mockReturnValue([]);

      const response = await request(app)
        .post('/api/songs/refresh')
        .expect(500);

      expect(response.body).toEqual({
        message: 'No songs were returned from the Xbox server.'
      });
    });

    it('should handle Xbox service errors', async () => {
      const xboxError = new Error('Cannot connect to Xbox');
      xboxService.fetch.mockRejectedValue(xboxError);

      const response = await request(app)
        .post('/api/songs/refresh')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Cannot connect to Xbox'
      });
    });
  });

  describe('GET /api/songs', () => {
    it('should apply duplicate filter when requested', async () => {
      db.promisifyAll.mockResolvedValue([
        { shortname: 'song1', title: 'Test Song', artist: 'Shared Artist', album: 'A', origin: 'rb3', picks: 0 },
        { shortname: 'song2', title: 'Test Song', artist: 'Shared Artist', album: 'B', origin: 'rb3_dlc', picks: 0 }
      ]);

      const response = await request(app)
        .get('/api/songs')
        .query({ filterDuplicates: 'true' })
        .expect(200);

      expect(response.body).toEqual({
        songs: [
          { shortname: 'song1', title: 'Test Song', artist: 'Shared Artist', album: 'A', origin: 'rb3', picks: 0 },
          { shortname: 'song2', title: 'Test Song', artist: 'Shared Artist', album: 'B', origin: 'rb3_dlc', picks: 0 }
        ]
      });
      expect(db.promisifyAll).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY title, artist HAVING COUNT(*) > 1'),
        []
      );
    });

    it('should include list filter when duplicate filter is enabled', async () => {
      db.promisifyAll.mockResolvedValue([
        { shortname: 'song1', title: 'Test Song', artist: 'Shared Artist', album: 'A', origin: 'rb3', picks: 0 }
      ]);

      const response = await request(app)
        .get('/api/songs')
        .query({ listId: '5', filterDuplicates: 'true' })
        .expect(200);

      expect(response.body.songs).toHaveLength(1);
      expect(db.promisifyAll).toHaveBeenCalledWith(
        expect.stringContaining('AND s.shortname IN (SELECT shortname FROM songlist_items WHERE list_id = ?)'),
        [5]
      );
    });
  });

  describe('GET /api/settings and POST /api/settings', () => {
    it('should return duplicate filter button setting', async () => {
      db.getSetting.mockImplementation((key) => {
        if (key === 'showSongListManagement') return Promise.resolve('true');
        if (key === 'showDuplicateFilterButton') return Promise.resolve('true');
        if (key === 'showShortnameColumn') return Promise.resolve('true');
        return Promise.resolve('false');
      });

      const response = await request(app)
        .get('/api/settings')
        .expect(200);

      expect(response.body).toEqual({
        showSongListManagement: true,
        showDuplicateFilterButton: true,
        showShortnameColumn: true
      });
    });

    it('should save duplicate filter button setting', async () => {
      const response = await request(app)
        .post('/api/settings')
        .send({ showSongListManagement: false, showDuplicateFilterButton: true, showShortnameColumn: true })
        .expect(200);

      expect(db.setSetting).toHaveBeenCalledWith('showSongListManagement', 'false');
      expect(db.setSetting).toHaveBeenCalledWith('showDuplicateFilterButton', 'true');
      expect(db.setSetting).toHaveBeenCalledWith('showShortnameColumn', 'true');
      expect(response.body).toEqual({
        showSongListManagement: false,
        showDuplicateFilterButton: true,
        showShortnameColumn: true
      });
    });
  });
});