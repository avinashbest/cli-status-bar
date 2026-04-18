#!/usr/bin/env node
// Provider Auto-Detection — determines which CLI agent is calling the statusline
// Uses environment variables, parent process, and config directory presence

const os = require('os');
const path = require('path');
const fs = require('fs');

const ClaudeProvider = require('./providers/claude');
const CursorProvider = require('./providers/cursor');
const CopilotProvider = require('./providers/copilot');
const GeminiProvider = require('./providers/gemini');

const PROVIDERS = {
  claude: ClaudeProvider,
  cursor: CursorProvider,
  copilot: CopilotProvider,
  gemini: GeminiProvider
};

/**
 * Detect which provider is calling the statusline script
 * Detection order:
 * 1. Explicit env var: CLI_STATUSBAR_PROVIDER
 * 2. Provider-specific environment variables
 * 3. Parent process name inspection
 * 4. Config directory heuristics
 * 5. Fallback to Claude (original behavior)
 *
 * @param {object} [stdinData] - parsed stdin JSON (used for field-based detection)
 * @returns {BaseProvider} instantiated provider
 */
function detectProvider(stdinData) {
  // 1. Explicit override via env var
  const explicit = process.env.CLI_STATUSBAR_PROVIDER;
  if (explicit && PROVIDERS[explicit]) {
    return new PROVIDERS[explicit]();
  }

  // 2. Provider-specific environment variables
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_SESSION) {
    return new ClaudeProvider();
  }
  if (process.env.CURSOR_SESSION || process.env.CURSOR_AGENT_MODE) {
    return new CursorProvider();
  }
  if (process.env.GITHUB_COPILOT_TOKEN || process.env.COPILOT_CLI_SESSION) {
    return new CopilotProvider();
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY) {
    return new GeminiProvider();
  }

  // 3. Parent process name (if available)
  try {
    const ppid = process.ppid;
    if (ppid) {
      const { execSync } = require('child_process');
      let parentName = '';

      if (os.platform() === 'darwin' || os.platform() === 'linux') {
        parentName = execSync(`ps -p ${ppid} -o comm= 2>/dev/null`, {
          encoding: 'utf8',
          timeout: 500
        }).trim().toLowerCase();
      }

      if (parentName.includes('claude')) return new ClaudeProvider();
      if (parentName.includes('cursor') || parentName.includes('agent')) return new CursorProvider();
      if (parentName.includes('copilot')) return new CopilotProvider();
      if (parentName.includes('gemini')) return new GeminiProvider();
    }
  } catch (e) {
    // Silently fail — process inspection is best-effort
  }

  // 4. Stdin JSON field-based heuristics
  if (stdinData) {
    // Claude has workspace.current_dir and session_id
    if (stdinData.workspace?.current_dir && stdinData.session_id) {
      return new ClaudeProvider();
    }
    // Copilot has cost data and session_name
    if (stdinData.cost || stdinData.session_name) {
      return new CopilotProvider();
    }
  }

  // 5. Check which CLI configs exist — pick the most recently modified
  const configChecks = [
    { name: 'claude', dir: path.join(os.homedir(), '.claude'), Provider: ClaudeProvider },
    { name: 'cursor', dir: path.join(os.homedir(), '.cursor'), Provider: CursorProvider },
    { name: 'copilot', dir: path.join(os.homedir(), '.copilot'), Provider: CopilotProvider },
    { name: 'gemini', dir: path.join(os.homedir(), '.gemini'), Provider: GeminiProvider }
  ];

  const installed = configChecks.filter(c => fs.existsSync(c.dir));
  if (installed.length === 1) {
    return new installed[0].Provider();
  }

  // 6. Fallback: Claude (original behavior, maintains backward compatibility)
  return new ClaudeProvider();
}

/**
 * Get all installed providers
 * @returns {BaseProvider[]} array of installed provider instances
 */
function getInstalledProviders() {
  return Object.values(PROVIDERS)
    .map(Provider => new Provider())
    .filter(provider => provider.isInstalled());
}

/**
 * Get a specific provider by name
 * @param {string} name - provider name
 * @returns {BaseProvider|null}
 */
function getProvider(name) {
  const Provider = PROVIDERS[name];
  return Provider ? new Provider() : null;
}

module.exports = {
  detectProvider,
  getInstalledProviders,
  getProvider,
  PROVIDERS
};
