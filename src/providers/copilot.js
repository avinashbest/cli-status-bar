#!/usr/bin/env node
// GitHub Copilot CLI Provider — adapter for GitHub Copilot CLI
// Config: ~/.copilot/config.json
// Usage tracking: cookie-based scraping from GitHub billing API

const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');

const BaseProvider = require('./base');
const cache = require('../core/cache');
const { getUsageBar, colors } = require('../core/renderer');

class CopilotProvider extends BaseProvider {
  get name() {
    return 'copilot';
  }

  get displayName() {
    return 'Copilot';
  }

  get configDir() {
    return path.join(os.homedir(), '.copilot');
  }

  get settingsFile() {
    return path.join(this.configDir, 'config.json');
  }

  /**
   * Parse Copilot CLI's stdin JSON
   * Expected: { model: { id, display_name }, context_window: { used_percentage, remaining_tokens }, cwd, cost, session_id }
   */
  parseInput(jsonData) {
    const model = jsonData?.model?.display_name
      || jsonData?.model?.id
      || 'Copilot';

    const dir = jsonData?.cwd
      || jsonData?.workspace?.current_dir
      || process.cwd();

    // Copilot may provide used_percentage instead of remaining
    let contextRemaining = jsonData?.context_window?.remaining_percentage;
    if (contextRemaining == null && jsonData?.context_window?.used_percentage != null) {
      contextRemaining = 100 - jsonData.context_window.used_percentage;
    }

    // Build extra segments — Copilot provides cost data
    const extra = {};
    if (jsonData?.cost) {
      const added = jsonData.cost.lines_added || 0;
      const removed = jsonData.cost.lines_removed || 0;
      if (added || removed) {
        extra.lines = `${colors.green}+${added}${colors.reset}/${colors.red}-${removed}${colors.reset}`;
      }
    }

    return {
      model: model,
      directory: path.basename(dir),
      contextRemaining: contextRemaining,
      sessionId: jsonData?.session_id || jsonData?.session_name || '',
      extra: extra
    };
  }

  /**
   * Read Copilot auth config
   */
  getCredentials() {
    try {
      const configPath = this.settingsFile;
      if (!fs.existsSync(configPath)) return null;

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      return {
        login: config.last_logged_in_user?.login || null,
        host: config.last_logged_in_user?.host || 'https://github.com'
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Attempt to read the GitHub auth token for API access
   * @returns {string|null} GitHub OAuth token
   */
  _getGitHubToken() {
    try {
      // Try GitHub CLI token
      if (os.platform() === 'darwin') {
        try {
          const { execSync } = require('child_process');
          // Try gh auth token
          const token = execSync('gh auth token 2>/dev/null', {
            encoding: 'utf8',
            timeout: 2000
          }).trim();
          if (token) return token;
        } catch (e) {}
      }

      // Try reading from gh hosts config
      const ghHostsPath = path.join(os.homedir(), '.config', 'gh', 'hosts.yml');
      if (fs.existsSync(ghHostsPath)) {
        const content = fs.readFileSync(ghHostsPath, 'utf8');
        const tokenMatch = content.match(/oauth_token:\s*(.+)/);
        if (tokenMatch) return tokenMatch[1].trim();
      }

      // Try macOS Keychain
      if (os.platform() === 'darwin') {
        try {
          const { execSync } = require('child_process');
          const raw = execSync(
            'security find-generic-password -s "GitHub Copilot-credentials" -w 2>/dev/null',
            { encoding: 'utf8', timeout: 1000 }
          );
          const creds = JSON.parse(raw.trim());
          if (creds.accessToken) return creds.accessToken;
        } catch (e) {}
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Fetch usage from GitHub's Copilot billing API
   * Uses GitHub auth token for API access to check premium request usage
   */
  fetchUsage(callback) {
    try {
      const token = this._getGitHubToken();
      if (!token) return callback(null);

      const creds = this.getCredentials();
      if (!creds || !creds.login) return callback(null);

      const timeout = this.getTimeout();

      // Try the user-level Copilot usage endpoint
      const req = https.request({
        hostname: 'api.github.com',
        path: '/user/copilot/usage',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'cli-status-bar/1.0',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        timeout: timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const usage = JSON.parse(data);

            // Parse premium request counts
            if (usage.premium_requests_used != null && usage.premium_requests_limit != null) {
              const percentage = Math.round(
                (usage.premium_requests_used / usage.premium_requests_limit) * 100
              );
              const remaining = usage.premium_requests_limit - usage.premium_requests_used;

              const bar = getUsageBar(percentage, `${remaining} reqs left`);
              cache.setCache(this.name, 'usage', bar);
              callback(bar);
            } else if (usage.total_premium_requests != null) {
              // Alternative format — just show count
              const bar = `${colors.dim}${usage.total_premium_requests} premium reqs${colors.reset}`;
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
   * Get install config for Copilot's config.json
   * Requires experimental flag to be enabled
   */
  getInstallConfig(scriptPath) {
    return {
      experimental: true,
      statusLine: {
        type: 'command',
        command: `node ${scriptPath.replace(/\\/g, '/')}`,
        padding: 0
      }
    };
  }
}

module.exports = CopilotProvider;
