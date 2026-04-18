#!/usr/bin/env node
// Claude Code Provider — adapter for Anthropic's Claude Code CLI
// Supports: OAuth usage API, macOS Keychain, todo tracking

const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const BaseProvider = require('./base');
const cache = require('../core/cache');
const { getUsageBar } = require('../core/renderer');

class ClaudeProvider extends BaseProvider {
  get name() {
    return 'claude';
  }

  get displayName() {
    return 'Claude Code';
  }

  get configDir() {
    return path.join(os.homedir(), '.claude');
  }

  get settingsFile() {
    return path.join(this.configDir, 'settings.json');
  }

  /**
   * Parse Claude Code's stdin JSON
   * Expected: { model: { display_name }, workspace: { current_dir }, context_window: { remaining_percentage }, session_id }
   */
  parseInput(jsonData) {
    return {
      model: jsonData?.model?.display_name || 'Claude',
      directory: path.basename(jsonData?.workspace?.current_dir || process.cwd()),
      contextRemaining: jsonData?.context_window?.remaining_percentage,
      sessionId: jsonData?.session_id || '',
      extra: {}
    };
  }

  /**
   * Read credentials from file or macOS Keychain
   */
  getCredentials() {
    // Try file first (legacy / Linux / Windows)
    const credsPath = path.join(this.configDir, '.credentials.json');
    if (fs.existsSync(credsPath)) {
      try {
        return JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      } catch (e) {}
    }

    // Fallback: macOS keychain
    if (os.platform() === 'darwin') {
      try {
        const raw = execSync(
          'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
          { encoding: 'utf8', timeout: 1000 }
        );
        return JSON.parse(raw.trim());
      } catch (e) {}
    }

    return null;
  }

  /**
   * Check if running with API key (skip usage fetch)
   */
  shouldSkipUsage() {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Fetch usage from Anthropic's OAuth API
   * Tracks 5-hour session limits with countdown timer
   */
  fetchUsage(callback) {
    if (this.shouldSkipUsage()) {
      return callback(null);
    }

    try {
      const creds = this.getCredentials();
      if (!creds) return callback(null);

      const accessToken = creds.claudeAiOauth?.accessToken;
      if (!accessToken) return callback(null);

      const timeout = this.getTimeout();

      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/api/oauth/usage',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'anthropic-beta': 'oauth-2025-04-20'
        },
        timeout: timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const usage = JSON.parse(data);

            if (usage.five_hour) {
              const percentage = Math.round(usage.five_hour.utilization);
              const resetsAt = usage.five_hour.resets_at;

              // Parse reset time
              let timeStr = '';
              if (resetsAt) {
                const resetDate = new Date(resetsAt);
                const now = new Date();
                const diffMs = resetDate - now;
                const diffMins = Math.floor(diffMs / 60000);
                const hours = Math.floor(diffMins / 60);
                const mins = diffMins % 60;

                if (hours > 0) {
                  timeStr = `${hours}h${mins}m`;
                } else {
                  timeStr = `${mins}m`;
                }
              }

              const bar = getUsageBar(percentage, timeStr);

              // Cache for cross-session sharing
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
   * Read current in-progress task from Claude's todos directory
   */
  getCurrentTask(sessionId) {
    if (!sessionId) return '';

    const todosDir = path.join(this.configDir, 'todos');
    if (!fs.existsSync(todosDir)) return '';

    try {
      const files = fs.readdirSync(todosDir)
        .filter(f => f.startsWith(sessionId) && f.includes('-agent-') && f.endsWith('.json'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
        const inProgress = todos.find(t => t.status === 'in_progress');
        if (inProgress) return inProgress.activeForm || '';
      }
    } catch (e) {}

    return '';
  }
}

module.exports = ClaudeProvider;
