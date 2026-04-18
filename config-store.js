const fs = require('fs');

class ConfigStore {
  constructor(configPath) {
    this.configPath = configPath;
    this.DEFAULT_CONFIG = { xboxIp: '192.168.0.100', xboxPort: 21070 };
  }

  load() {
    try {
      if (!fs.existsSync(this.configPath)) {
        return this.save(this.DEFAULT_CONFIG);
      }

      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const cfg = JSON.parse(raw);
      return {
        xboxIp: cfg.xboxIp || this.DEFAULT_CONFIG.xboxIp,
        xboxPort: cfg.xboxPort || this.DEFAULT_CONFIG.xboxPort
      };
    } catch (error) {
      console.warn('Could not read config file, using default config.', error.message);
      return this.save(this.DEFAULT_CONFIG);
    }
  }

  save(config) {
    const safeConfig = {
      xboxIp: config.xboxIp || this.DEFAULT_CONFIG.xboxIp,
      xboxPort: Number(config.xboxPort) || this.DEFAULT_CONFIG.xboxPort
    };

    fs.writeFileSync(this.configPath, JSON.stringify(safeConfig, null, 2), 'utf-8');
    return safeConfig;
  }
}

module.exports = ConfigStore;
