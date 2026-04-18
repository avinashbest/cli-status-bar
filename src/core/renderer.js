#!/usr/bin/env node
// Core Renderer — shared bar rendering, colors, and formatting
// Used by all provider adapters

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  orange: '\x1b[38;5;208m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  blink: '\x1b[5m'
};

const BLOCK_FULL = '\u2588';
const BLOCK_EMPTY = '\u2591';
const SEPARATOR = ' \u2502 ';
const SKULL = '\u{1F480}';

/**
 * Get color based on percentage thresholds
 * @param {number} percentage - 0-100
 * @param {object} [thresholds] - custom thresholds { green, yellow, orange }
 * @returns {string} ANSI color code
 */
function getUsageColor(percentage, thresholds) {
  const t = thresholds || { green: 50, yellow: 75, orange: 90 };
  if (percentage < t.green) return colors.green;
  if (percentage < t.yellow) return colors.yellow;
  if (percentage < t.orange) return colors.orange;
  return colors.red;
}

/**
 * Render a context usage bar
 * @param {number|null|undefined} remainingPercentage - remaining context percentage (0-100)
 * @param {number} [barWidth=10] - width of the bar in characters
 * @returns {string} colored bar string
 */
function getContextBar(remainingPercentage, barWidth) {
  const width = barWidth || 10;
  const effectiveRemaining = remainingPercentage ?? 100;
  const used = Math.max(0, Math.min(100, 100 - Math.round(effectiveRemaining)));

  const filled = Math.floor((used / 100) * width);
  const bar = BLOCK_FULL.repeat(filled) + BLOCK_EMPTY.repeat(width - filled);

  let coloredBar;
  if (used < 50) {
    coloredBar = `${colors.green}${bar} ${used}%${colors.reset}`;
  } else if (used < 65) {
    coloredBar = `${colors.yellow}${bar} ${used}%${colors.reset}`;
  } else if (used < 80) {
    coloredBar = `${colors.orange}${bar} ${used}%${colors.reset}`;
  } else {
    coloredBar = `${colors.blink}${colors.red}${SKULL} ${bar} ${used}%${colors.reset}`;
  }

  return coloredBar;
}

/**
 * Render a usage bar with optional time remaining
 * @param {number} percentage - usage percentage (0-100)
 * @param {string} [timeStr] - time remaining string (e.g. "2h30m")
 * @param {number} [barWidth=10] - width of the bar
 * @returns {string} colored usage bar
 */
function getUsageBar(percentage, timeStr, barWidth) {
  const width = barWidth || 10;
  const filledWidth = Math.round((percentage / 100) * width);
  const filled = BLOCK_FULL.repeat(filledWidth);
  const empty = BLOCK_EMPTY.repeat(width - filledWidth);
  const color = getUsageColor(percentage);

  let bar = `${color}${filled}${empty} ${percentage}%${colors.reset}`;
  if (timeStr) {
    bar += `${colors.dim} (${timeStr})${colors.reset}`;
  }

  return bar;
}

/**
 * Format segments into a statusline string
 * @param {string[]} parts - array of segment strings
 * @returns {string} formatted statusline
 */
function formatSegments(parts) {
  return parts.filter(Boolean).join(SEPARATOR);
}

/**
 * Build and output the full statusline
 * @param {object} data - normalized provider data
 * @param {string} data.directory - current directory basename
 * @param {string} data.model - model display name
 * @param {number|null} data.contextRemaining - remaining context percentage
 * @param {string|null} data.usageBar - pre-rendered usage bar (or null)
 * @param {string} [data.task] - current task description
 * @param {string} [data.provider] - provider name for display
 * @param {object} [data.extra] - provider-specific extra segments
 */
function renderStatusline(data) {
  const parts = [];

  // Directory
  parts.push(data.directory || '~');

  // Model
  parts.push(data.model || 'Unknown');

  // Context bar
  const contextBar = getContextBar(data.contextRemaining);
  parts.push(`context: ${contextBar}`);

  // Usage bar (if available)
  if (data.usageBar) {
    parts.push(`usage: ${data.usageBar}`);
  }

  // Extra segments (provider-specific, e.g., cost for Copilot)
  if (data.extra) {
    for (const [key, value] of Object.entries(data.extra)) {
      if (value) {
        parts.push(`${key}: ${value}`);
      }
    }
  }

  // Current task
  if (data.task) {
    parts.push(`${colors.dim}${data.task}${colors.reset}`);
  }

  return formatSegments(parts);
}

/**
 * Render a fallback statusline when no provider data is available
 * @param {string|null} usageBar - pre-rendered usage bar
 * @returns {string} fallback statusline
 */
function renderFallback(usageBar) {
  const contextBar = getContextBar(undefined);
  const parts = ['~', 'Unknown', `context: ${contextBar}`];
  if (usageBar) parts.push(`usage: ${usageBar}`);
  return formatSegments(parts);
}

module.exports = {
  colors,
  getUsageColor,
  getContextBar,
  getUsageBar,
  formatSegments,
  renderStatusline,
  renderFallback
};
