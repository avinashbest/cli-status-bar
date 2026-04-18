#!/usr/bin/env node
// Core Config — optional user preferences with sensible defaults
// Config file: ~/.config/cli-status-bar/config.json

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'cli-status-bar');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  barWidth: 10,
  thresholds: {
    green: 50,
    yellow: 75,
    orange: 90
  },
  segments: ['directory', 'model', 'context', 'usage'],
  cacheTtlMs: 30000,
  providers: {
    claude: { enabled: true },
    cursor: { enabled: true },
    copilot: { enabled: true },
    gemini: { enabled: true }
  }
};

/**
 * Load user configuration, merging with defaults
 * @returns {object} merged config
 */
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG };
    }

    const userConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

    // Deep merge with defaults
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...(userConfig.thresholds || {}) },
      providers: {
        ...DEFAULT_CONFIG.providers,
        ...(userConfig.providers || {}),
        claude: { ...DEFAULT_CONFIG.providers.claude, ...(userConfig.providers?.claude || {}) },
        cursor: { ...DEFAULT_CONFIG.providers.cursor, ...(userConfig.providers?.cursor || {}) },
        copilot: { ...DEFAULT_CONFIG.providers.copilot, ...(userConfig.providers?.copilot || {}) },
        gemini: { ...DEFAULT_CONFIG.providers.gemini, ...(userConfig.providers?.gemini || {}) }
      }
    };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to disk
 * @param {object} config - config object to save
 */
function saveConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    // Silently fail
  }
}

/**
 * Check if a specific provider is enabled
 * @param {string} provider - provider name
 * @returns {boolean}
 */
function isProviderEnabled(provider) {
  const config = loadConfig();
  return config.providers[provider]?.enabled !== false;
}

module.exports = {
  loadConfig,
  saveConfig,
  isProviderEnabled,
  CONFIG_FILE,
  DEFAULT_CONFIG
};
