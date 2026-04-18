const XboxService = require('../xbox-service');

// Mock fetch globally
global.fetch = jest.fn();

describe('XboxService', () => {
  let configStore;
  let xboxService;

  beforeEach(() => {
    // Mock config store
    configStore = {
      load: jest.fn().mockReturnValue({
        xboxIp: '192.168.1.100',
        xboxPort: 8080
      })
    };

    xboxService = new XboxService(configStore);
    jest.clearAllMocks();
  });

  describe('parseSongListResponse', () => {
    it('should parse a valid song list response', () => {
      const response = `[song1]
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

      const result = xboxService.parseSongListResponse(response);

      expect(result).toEqual([
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
      ]);
    });

    it('should handle empty response', () => {
      const response = '';
      const result = xboxService.parseSongListResponse(response);
      expect(result).toEqual([]);
    });

    it('should handle response with only brackets', () => {
      const response = '[song1]\n';
      const result = xboxService.parseSongListResponse(response);
      expect(result).toEqual([
        {
          shortname: 'song1',
          title: '',
          artist: '',
          album: '',
          origin: ''
        }
      ]);
    });

    it('should handle malformed response gracefully', () => {
      const response = `shortname=song1
title=Test Song 1
[song2]
shortname=song2
`;

      const result = xboxService.parseSongListResponse(response);

      expect(result).toEqual([
        {
          shortname: 'song2',
          title: '',
          artist: '',
          album: '',
          origin: ''
        }
      ]);
    });

    it('should handle CRLF line endings', () => {
      const response = `[song1]\r\nshortname=song1\r\ntitle=Test Song 1\r\n`;

      const result = xboxService.parseSongListResponse(response);

      expect(result).toEqual([
        {
          shortname: 'song1',
          title: 'Test Song 1',
          artist: '',
          album: '',
          origin: ''
        }
      ]);
    });
  });

  describe('fetch', () => {
    it('should fetch data from the correct URL', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue('test response')
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await xboxService.fetch('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://192.168.1.100:8080/test',
        {
          method: 'GET',
          headers: { Accept: 'text/plain' },
          signal: expect.any(AbortSignal)
        }
      );
      expect(result).toBe('test response');
    });

    it('should throw error for non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(xboxService.fetch('/test')).rejects.toThrow(
        'Xbox HTTP server returned 404 Not Found'
      );
    });

    it('should throw timeout error for timeout', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';

      global.fetch.mockRejectedValue(timeoutError);

      await expect(xboxService.fetch('/test')).rejects.toThrow(
        'Cannot connect to Xbox at 192.168.1.100:8080 - make sure the Xbox is running Rock Band 3 Enhanced with HTTP server enabled'
      );
    });

    it('should re-throw other errors', async () => {
      const networkError = new Error('Network error');
      global.fetch.mockRejectedValue(networkError);

      await expect(xboxService.fetch('/test')).rejects.toThrow('Network error');
    });
  });
});