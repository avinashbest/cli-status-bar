#!/usr/bin/env node
// Cursor CLI Provider — adapter for Cursor's agent CLI
// Config: ~/.cursor/cli-config.json
// Usage tracking: cookie-based scraping from Cursor dashboard API

const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');

const BaseProvider = require('./base');
const cache = require('../core/cache');
const { getUsageBar, colors } = require('../core/renderer');

class CursorProvider extends BaseProvider {
  get name() {
    return 'cursor';
  }

  get displayName() {
    return 'Cursor';
  }

  get configDir() {
    return path.join(os.homedir(), '.cursor');
  }

  get settingsFile() {
    return path.join(this.configDir, 'cli-config.json');
  }

  /**
   * Parse Cursor CLI's stdin JSON
   * Expected: { model: { display_name }, workspace/cwd, context_window: { remaining_percentage } }
   */
  parseInput(jsonData) {
    const model = jsonData?.model?.display_name
      || jsonData?.model?.displayName
      || jsonData?.model?.modelId
      || 'Cursor';

    const dir = jsonData?.workspace?.current_dir
      || jsonData?.cwd
      || process.cwd();

    return {
      model: model,
      directory: path.basename(dir),
      contextRemaining: jsonData?.context_window?.remaining_percentage
        ?? (jsonData?.context_window?.used_percentage != null
          ? (100 - jsonData.context_window.used_percentage)
          : null),
      sessionId: jsonData?.session_id || '',
      extra: {}
    };
  }

  /**
   * Read Cursor auth info from cli-config.json
   * The auth token is stored in the serverConfigCache and cookie storage
   */
  getCredentials() {
    try {
      const configPath = this.settingsFile;
      if (!fs.existsSync(configPath)) return null;

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      // Extract auth info
      if (config.authInfo) {
        return {
          email: config.authInfo.email,
          userId: config.authInfo.userId,
          authId: config.authInfo.authId,
          authCacheKey: config.serverConfigCache?.authCacheKey || null
        };
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Attempt to read the Cursor session token from various storage locations
   * Used for cookie-based dashboard scraping
   * @returns {string|null} session token
   */
  _getSessionToken() {
    try {
      // Try reading from macOS Keychain
      if (os.platform() === 'darwin') {
        try {
          const { execSync } = require('child_process');
          const raw = execSync(
            'security find-generic-password -s "Cursor-credentials" -w 2>/dev/null',
            { encoding: 'utf8', timeout: 1000 }
          );
          const creds = JSON.parse(raw.trim());
          if (creds.accessToken) return creds.accessToken;
          if (creds.sessionToken) return creds.sessionToken;
        } catch (e) {}
      }

      // Try reading WorkosCursorSessionToken from local storage db
      // This is in the Cursor app's storage, not the CLI config
      const possiblePaths = [
        path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'Local Storage', 'leveldb'),
        path.join(os.homedir(), '.config', 'Cursor', 'Local Storage', 'leveldb'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'Local Storage', 'leveldb')
      ];

      for (const dbPath of possiblePaths) {
        if (fs.existsSync(dbPath)) {
          // Read .log files for the session token (simple text search)
          const logFiles = fs.readdirSync(dbPath).filter(f => f.endsWith('.log'));
          for (const logFile of logFiles) {
            try {
              const content = fs.readFileSync(path.join(dbPath, logFile), 'utf8');
              const match = content.match(/WorkosCursorSessionToken[^\w]+([\w.-]+)/);
              if (match) return match[1];
            } catch (e) {}
          }
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Fetch usage from Cursor's dashboard API using session cookie
   * This is a best-effort scraping approach since no public API exists
   */
  fetchUsage(callback) {
    try {
      const sessionToken = this._getSessionToken();
      if (!sessionToken) return callback(null);

      const timeout = this.getTimeout();

      const req = https.request({
        hostname: 'www.cursor.com',
        path: '/api/usage',
        method: 'GET',
        headers: {
          'Cookie': `WorkosCursorSessionToken=${sessionToken}`,
          'User-Agent': 'cli-status-bar/1.0',
          'Accept': 'application/json'
        },
        timeout: timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const usage = JSON.parse(data);

            // Parse Cursor's usage response
            // Expected fields vary, but typically include premium request counts
            if (usage.numRequests != null && usage.maxRequests != null) {
              const percentage = Math.round((usage.numRequests / usage.maxRequests) * 100);
              const remaining = usage.maxRequests - usage.numRequests;

              const bar = getUsageBar(percentage, `${remaining} left`);
              cache.setCache(this.name, 'usage', bar);
              callback(bar);
            } else if (usage.usage != null) {
              // Alternative response format
              const percentage = Math.round(usage.usage * 100);
              const bar = getUsageBar(percentage);
              cache.setCache(this.name, 'usage', bar);
              callback(bar);
            } else {
              callback(null);
            }
          } catch (e) {
            callback(null);
          }
        });
      });

      req.on('error', () => callback(null));
      req.on('timeout', () => {
        req.destroy();
        callback(null);
      });

      req.end();
    } catch (e) {
      callback(null);
    }
  }

  /**
   * Get install config for Cursor's cli-config.json
   */
  getInstallConfig(scriptPath) {
    return {
      statusLine: {
        type: 'command',
        command: `node ${scriptPath.replace(/\\/g, '/')}`
      }
    };
  }
}

module.exports = CursorProvider;
