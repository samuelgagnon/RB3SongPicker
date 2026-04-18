class XboxService {
  constructor(configStore) {
    this.configStore = configStore;
  }

  async fetch(path) {
    const config = this.configStore.load();
    const url = `http://${config.xboxIp}:${config.xboxPort}${path}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/plain' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`Xbox HTTP server returned ${response.status} ${response.statusText}`);
      }

      return response.text();
    } catch (error) {
      if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
        throw new Error(`Cannot connect to Xbox at ${config.xboxIp}:${config.xboxPort} - make sure the Xbox is running Rock Band 3 Enhanced with HTTP server enabled`);
      }
      throw error;
    }
  }

  parseSongListResponse(body) {
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
}

module.exports = XboxService;
