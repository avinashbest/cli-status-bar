#!/usr/bin/env node
// Core Cache — provider-aware caching with TTL
// Shared across all provider adapters

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_TTL_MS = 30000; // 30 seconds

/**
 * Get the cache directory for a given provider
 * @param {string} provider - provider name (claude, cursor, copilot, gemini)
 * @returns {string} absolute path to cache directory
 */
function getCacheDir(provider) {
  const providerDirs = {
    claude: path.join(os.homedir(), '.claude', 'cache'),
    cursor: path.join(os.homedir(), '.cursor', 'cache'),
    copilot: path.join(os.homedir(), '.copilot', 'cache'),
    gemini: path.join(os.homedir(), '.gemini', 'cache')
  };
  return providerDirs[provider] || path.join(os.homedir(), '.cli-status-bar', 'cache');
}

/**
 * Get the cache file path for a given provider and key
 * @param {string} provider - provider name
 * @param {string} key - cache key (e.g. 'usage', 'stats')
 * @returns {string} absolute path to cache file
 */
function getCacheFile(provider, key) {
  return path.join(getCacheDir(provider), `${key}-cache.json`);
}

/**
 * Read cached data if it exists and is fresh enough
 * @param {string} provider - provider name
 * @param {string} key - cache key
 * @param {number} [ttlMs] - time-to-live in ms (default: 30s)
 * @returns {*|null} cached data or null if stale/missing
 */
function getCached(provider, key, ttlMs) {
  const ttl = ttlMs || DEFAULT_TTL_MS;
  const cacheFile = getCacheFile(provider, key);

  try {
    if (!fs.existsSync(cacheFile)) return null;

    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const age = Date.now() - cache.timestamp;

    if (age < ttl) {
      return cache.data;
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Write data to cache
 * @param {string} provider - provider name
 * @param {string} key - cache key
 * @param {*} data - data to cache
 */
function setCache(provider, key, data) {
  const cacheDir = getCacheDir(provider);
  const cacheFile = getCacheFile(provider, key);

  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const cache = {
      timestamp: Date.now(),
      data: data
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cache), 'utf8');
  } catch (e) {
    // Silently fail — cache is best-effort
  }
}

/**
 * Check if a cache file exists (regardless of freshness)
 * Useful for adaptive timeout decisions
 * @param {string} provider - provider name
 * @param {string} key - cache key
 * @returns {boolean}
 */
function hasCacheFile(provider, key) {
  return fs.existsSync(getCacheFile(provider, key));
}

/**
 * Clear cache for a provider
 * @param {string} provider - provider name
 * @param {string} [key] - specific key to clear, or all if omitted
 */
function clearCache(provider, key) {
  try {
    if (key) {
      const cacheFile = getCacheFile(provider, key);
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    } else {
      const cacheDir = getCacheDir(provider);
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('-cache.json'));
        for (const file of files) {
          fs.unlinkSync(path.join(cacheDir, file));
        }
      }
    }
  } catch (e) {
    // Silently fail
  }
}

module.exports = {
  getCacheDir,
  getCacheFile,
  getCached,
  setCache,
  hasCacheFile,
  clearCache,
  DEFAULT_TTL_MS
};
