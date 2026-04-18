#!/usr/bin/env node
// Cursor CLI Provider — adapter for Cursor's agent CLI
// Config: ~/.cursor/cli-config.json
// Usage tracking: via api2.cursor.sh/auth/usage with access token from macOS Keychain

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
   */
  getCredentials() {
    try {
      const configPath = this.settingsFile;
      if (!fs.existsSync(configPath)) return null;

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

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
   * Get the Cursor access token from macOS Keychain or other storage
   * Cursor stores JWT access tokens under "cursor-access-token" service name
   * @returns {string|null} JWT access token
   */
  _getAccessToken() {
    try {
      // macOS Keychain — Cursor stores JWT under "cursor-access-token"
      if (os.platform() === 'darwin') {
        try {
          const { execSync } = require('child_process');
          const token = execSync(
            'security find-generic-password -s "cursor-access-token" -a "cursor-user" -w 2>/dev/null',
            { encoding: 'utf8', timeout: 1000 }
          ).trim();
          if (token && token.startsWith('eyJ')) return token;
        } catch (e) {}
      }

      // Linux/Windows — try credential files
      const possiblePaths = [
        path.join(os.homedir(), '.config', 'Cursor', 'credentials.json'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'credentials.json')
      ];

      for (const credPath of possiblePaths) {
        if (fs.existsSync(credPath)) {
          try {
            const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
            if (creds.accessToken) return creds.accessToken;
          } catch (e) {}
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Fetch usage from Cursor's internal API (api2.cursor.sh/auth/usage)
   * Uses the JWT access token from macOS Keychain for authentication
   */
  fetchUsage(callback) {
    try {
      const accessToken = this._getAccessToken();
      if (!accessToken) return callback(null);

      const timeout = this.getTimeout();

      const req = https.request({
        hostname: 'api2.cursor.sh',
        path: '/auth/usage',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'cli-status-bar/2.0'
        },
        timeout: timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const usage = JSON.parse(data);

            // Cursor returns usage per model, e.g.:
            // { "gpt-4": { numRequests, numTokens, maxRequestUsage, maxTokenUsage }, "startOfMonth": "..." }
            // Aggregate across all models
            let totalRequests = 0;
            let totalTokens = 0;
            let maxRequests = null;
            let maxTokens = null;
            let startOfMonth = usage.startOfMonth;

            for (const [model, stats] of Object.entries(usage)) {
              if (model === 'startOfMonth') continue;
              if (stats && typeof stats === 'object') {
                totalRequests += (stats.numRequestsTotal || stats.numRequests || 0);
                totalTokens += (stats.numTokens || 0);
                if (stats.maxRequestUsage != null) maxRequests = (maxRequests || 0) + stats.maxRequestUsage;
                if (stats.maxTokenUsage != null) maxTokens = (maxTokens || 0) + stats.maxTokenUsage;
              }
            }

            // Build usage bar
            let bar;
            if (maxRequests && maxRequests > 0) {
              const percentage = Math.round((totalRequests / maxRequests) * 100);
              bar = getUsageBar(percentage, `${totalRequests}/${maxRequests} reqs`);
            } else if (maxTokens && maxTokens > 0) {
              const percentage = Math.round((totalTokens / maxTokens) * 100);
              bar = getUsageBar(percentage, `${Math.round(totalTokens / 1000)}k tokens`);
            } else if (totalRequests > 0) {
              // No max known — just show count
              bar = `${colors.dim}${totalRequests} reqs this period${colors.reset}`;
            } else {
              bar = `${colors.green}0 reqs${colors.reset}`;
            }

            cache.setCache(this.name, 'usage', bar);
            callback(bar);
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
