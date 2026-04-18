class XboxService {
  constructor(configStore) {
    this.configStore = configStore;
  }

  async fetch(path) {
    const config = this.configStore.load();
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
