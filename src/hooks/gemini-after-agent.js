#!/usr/bin/env node
// Gemini AfterAgent Hook Script
// Installed as an AfterAgent hook in ~/.gemini/settings.json
// Writes session stats to ~/.gemini/cache/statusline-stats.json
// for the Gemini provider adapter to read
//
// Hook input (stdin): JSON with current agent state
// Hook output (stdout): JSON response (must be valid JSON)
// Debug output: stderr only

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.homedir(), '.gemini', 'cache');
const STATS_FILE = path.join(CACHE_DIR, 'statusline-stats.json');

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    try {
      const agentData = JSON.parse(input);

      // Extract relevant stats from the agent state
      const stats = {
        timestamp: Date.now(),
        model: agentData?.model?.displayName
          || agentData?.model?.name
          || agentData?.model
          || 'Gemini',
        cwd: agentData?.context?.cwd
          || agentData?.cwd
          || process.cwd(),
        contextRemaining: agentData?.context?.remaining_percentage
          ?? agentData?.context_window?.remaining_percentage
          ?? null,
        sessionId: agentData?.session_id || '',
        turnCount: agentData?.turn_count || agentData?.context?.turn_count || 0
      };

      // Ensure cache directory exists
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }

      // Write stats
      fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');

      // Debug output goes to stderr (stdout is reserved for JSON response)
      process.stderr.write(`[cli-status-bar] Gemini stats updated: ${stats.model} @ ${path.basename(stats.cwd)}\n`);

    } catch (e) {
      process.stderr.write(`[cli-status-bar] Hook error: ${e.message}\n`);
    }

    // Must output valid JSON for the hook contract
    process.stdout.write(JSON.stringify({ status: 'ok' }));
    process.exit(0);
  });
}

main();
