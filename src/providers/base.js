#!/usr/bin/env node
// Base Provider — abstract class all provider adapters extend
// Defines the contract each provider must implement

const path = require('path');
const os = require('os');

/**
 * Abstract base class for CLI agent statusline providers
 * Each provider adapter (Claude, Cursor, Copilot, Gemini) extends this
 */
class BaseProvider {
  /**
   * @returns {string} provider identifier (e.g. 'claude', 'cursor')
   */
  get name() {
    throw new Error('Provider must implement get name()');
  }

  /**
   * @returns {string} human-readable display name
   */
  get displayName() {
    throw new Error('Provider must implement get displayName()');
  }

  /**
   * @returns {string} absolute path to provider config directory (e.g. ~/.claude)
   */
  get configDir() {
    throw new Error('Provider must implement get configDir()');
  }

  /**
   * @returns {string} absolute path to provider settings file
   */
  get settingsFile() {
    return path.join(this.configDir, 'settings.json');
  }

  /**
   * @returns {string} absolute path to cache directory
   */
  get cacheDir() {
    return path.join(this.configDir, 'cache');
  }

  /**
   * Check if this provider is installed on the system
   * @returns {boolean}
   */
  isInstalled() {
    const fs = require('fs');
    return fs.existsSync(this.configDir);
  }

  /**
   * Parse raw stdin JSON into normalized statusline data
   * @param {object} jsonData - raw JSON parsed from stdin
   * @returns {object} normalized data: { model, directory, contextRemaining, sessionId, extra }
   */
  parseInput(jsonData) {
    throw new Error('Provider must implement parseInput(jsonData)');
  }

  /**
   * Get authentication credentials for API calls
   * @returns {object|null} credentials object or null if unavailable
   */
  getCredentials() {
    return null;
  }

  /**
   * Fetch usage data from provider's API
   * @param {function} callback - callback with (usageBar: string|null)
   */
  fetchUsage(callback) {
    callback(null);
  }

  /**
   * Get usage data with cache fallback
   * @param {function} callback - callback with (usageBar: string|null)
   */
  fetchUsageWithCache(callback) {
    const cache = require('../core/cache');

    this.fetchUsage((freshData) => {
      if (freshData) {
        callback(freshData);
      } else {
        // Fallback to cached data
        const cachedData = cache.getCached(this.name, 'usage');
        callback(cachedData);
      }
    });
  }

  /**
   * Read the current task/todo if the provider supports it
   * @param {string} sessionId - current session ID
   * @returns {string} current task description or empty string
   */
  getCurrentTask(sessionId) {
    return '';
  }

  /**
   * Get the configuration patch needed to install the statusline for this provider
   * @param {string} scriptPath - absolute path to the statusline script
   * @returns {object} JSON object to merge into the provider's settings
   */
  getInstallConfig(scriptPath) {
    return {
      statusLine: {
        type: 'command',
        command: `node ${scriptPath.replace(/\\/g, '/')}`
      }
    };
  }

  /**
   * Get the adaptive timeout for this provider
   * Returns shorter timeout if cache exists (warm start)
   * @returns {number} timeout in milliseconds
   */
  getTimeout() {
    const cache = require('../core/cache');
    const hasCache = cache.hasCacheFile(this.name, 'usage');
    return hasCache ? 1200 : 1500;
  }

  /**
   * Whether this provider supports skipping usage fetch (e.g. API key mode)
   * @returns {boolean}
   */
  shouldSkipUsage() {
    return false;
  }
}

module.exports = BaseProvider;
