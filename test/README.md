# RB3 Song Picker - Unit Tests

This directory contains unit tests for the RB3 Song Picker application.

## Test Structure

### `xbox-service.test.js`
Tests for the `XboxService` class, which handles communication with the Rock Band 3 Enhanced Xbox HTTP server.

**Tested functionality:**
- `parseSongListResponse()` - Parses the song list response from the Xbox server
- `fetch()` - Makes HTTP requests to the Xbox server with proper error handling

### `api-router.test.js`
Tests for the API router, specifically the `/songs/refresh` endpoint (refresh library functionality).

**Tested functionality:**
- Successful song library refresh
- Error handling when no songs are returned
- Error handling for Xbox service connection failures

## Running Tests

```bash
npm test
```

## Test Coverage

The tests cover the core "refresh library" functionality:

1. **Xbox Service Communication**: Verifies that the service correctly fetches song data from the Xbox HTTP server at `/list_songs`
2. **Response Parsing**: Ensures the song list response is correctly parsed into structured song objects
3. **Database Updates**: Confirms that the database is properly updated with new song information
4. **Error Handling**: Tests various error scenarios and proper error responses

## Real Service Definition

The "refresh library" call corresponds to the `/list_songs` endpoint in the RB3Enhanced Xbox HTTP server, which returns a plain text response with song metadata in the following format:

```
[song_shortname]
shortname=song_shortname
title=Song Title
artist=Artist Name
album=Album Name
origin=rb3|rb3_dlc|etc

[song2_shortname]
...
```

This endpoint is implemented in `RB3Enhanced/source/net_http_server.c` and provides the song list that the RB3 Song Picker uses to refresh its local database.