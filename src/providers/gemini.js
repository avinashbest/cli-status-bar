#!/usr/bin/env node
// Gemini CLI Provider — hook-based adapter for Google's Gemini CLI
// Config: ~/.gemini/settings.json
// Note: Gemini CLI does NOT have native statusLine support
// Uses AfterAgent hook to write stats, readable via shell prompt integration

const path = require('path');
const os = require('os');
const fs = require('fs');

const BaseProvider = require('./base');
const cache = require('../core/cache');
const { colors } = require('../core/renderer');

// Path where the hook writes stats after each agent turn
const STATS_FILE = 'statusline-stats.json';

class GeminiProvider extends BaseProvider {
  get name() {
    return 'gemini';
  }

  get displayName() {
    return 'Gemini';
  }

  get configDir() {
    return path.join(os.homedir(), '.gemini');
  }

  get settingsFile() {
    return path.join(this.configDir, 'settings.json');
  }

  /**
   * Parse input from the hook-collected stats file
   * Since Gemini has no native statusline, the hook writes stats to a JSON file
   * which this adapter reads
   * @param {object} jsonData - if called natively (future support), parse stdin JSON
   *                           if null, read from stats file
   */
  parseInput(jsonData) {
    // If we get stdin JSON (future native support), parse it directly
    if (jsonData && jsonData.model) {
      return {
        model: jsonData.model?.display_name || jsonData.model || 'Gemini',
        directory: path.basename(jsonData.cwd || jsonData.workspace?.current_dir || process.cwd()),
        contextRemaining: jsonData.context_window?.remaining_percentage ?? null,
        sessionId: jsonData.session_id || '',
        extra: {}
      };
    }

    // Otherwise, read from the hook-generated stats file
    const statsData = this._readHookStats();
    if (statsData) {
      return {
        model: statsData.model || 'Gemini',
        directory: path.basename(statsData.cwd || process.cwd()),
        contextRemaining: statsData.contextRemaining ?? null,
        sessionId: statsData.sessionId || '',
        extra: {}
      };
    }

    // Fallback
    return {
      model: 'Gemini',
      directory: path.basename(process.cwd()),
      contextRemaining: null,
      sessionId: '',
      extra: {}
    };
  }

  /**
   * Read stats written by the AfterAgent hook
   * @returns {object|null} stats data
   */
  _readHookStats() {
    try {
      const statsPath = path.join(this.cacheDir, STATS_FILE);
      if (!fs.existsSync(statsPath)) return null;

      const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));

      // Only use stats if they're recent (within 5 minutes)
      const age = Date.now() - (stats.timestamp || 0);
      if (age > 5 * 60 * 1000) return null;

      return stats;
    } catch (e) {
      return null;
    }
  }

  /**
   * No public usage API for Gemini
   */
  fetchUsage(callback) {
    callback(null);
  }

  /**
   * Usage is always skipped for Gemini (no API available)
   */
  shouldSkipUsage() {
    return true;
  }

  /**
   * Get the hook configuration to install into Gemini's settings.json
   * Instead of statusLine, we install an AfterAgent hook
   * @param {string} scriptPath - path to the hook script
   * @returns {object} settings JSON patch
   */
  getInstallConfig(scriptPath) {
    const hookScriptPath = path.join(
      path.dirname(scriptPath),
      'hooks',
      'gemini-after-agent.js'
    ).replace(/\\/g, '/');

    return {
      hooks: {
        AfterAgent: [
          {
            matcher: '*',
            hooks: [
              {
                name: 'cli-status-bar-stats',
                type: 'command',
                command: `node ${hookScriptPath}`
              }
            ]
          }
        ]
      }
    };
  }

  /**
   * Gemini uses a different timeout since it's reading from file, not API
   */
  getTimeout() {
    return 500;
  }
}

module.exports = GeminiProvider;
