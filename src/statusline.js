#!/usr/bin/env node
// CLI Status Bar — Main Entry Point (Orchestrator)
// Auto-detects which CLI agent is calling and renders the appropriate statusline
// https://github.com/avinashbest/cli-status-bar

const { detectProvider } = require('./detect');
const { renderStatusline, renderFallback } = require('./core/renderer');

/**
 * Output the statusline with provider data and usage bar
 */
function outputStatus(provider, data, usageBar) {
  try {
    const parsed = provider.parseInput(data);
    const task = provider.getCurrentTask(parsed.sessionId);

    const output = renderStatusline({
      directory: parsed.directory,
      model: parsed.model,
      contextRemaining: parsed.contextRemaining,
      usageBar: usageBar,
      task: task,
      provider: provider.displayName,
      extra: parsed.extra
    });

    process.stdout.write(output);
  } catch (e) {
    process.stdout.write(renderFallback(usageBar));
  }
}

/**
 * Output a fallback statusline
 */
function outputFallback(usageBar) {
  process.stdout.write(renderFallback(usageBar));
}

/**
 * Get usage with cache fallback, or skip if provider doesn't support it
 */
function getUsage(provider, callback) {
  if (provider.shouldSkipUsage()) {
    callback(null);
  } else {
    provider.fetchUsageWithCache(callback);
  }
}

// --- Main execution ---

if (process.stdin.isTTY) {
  // No stdin (e.g. running manually) — use fallback
  const provider = detectProvider();
  getUsage(provider, (usageBar) => {
    outputFallback(usageBar);
    process.exit(0);
  });
} else {
  // Read stdin JSON from the CLI agent
  let input = '';
  let timeoutReached = false;

  // Initial detection without stdin data
  let provider = detectProvider();

  const overallTimeout = provider.shouldSkipUsage()
    ? 500
    : provider.getTimeout() + 100;

  const timeout = setTimeout(() => {
    timeoutReached = true;
    getUsage(provider, (usageBar) => {
      if (input.length > 0) {
        try {
          const data = JSON.parse(input);
          // Re-detect with parsed data for better accuracy
          provider = detectProvider(data);
          outputStatus(provider, data, usageBar);
        } catch (e) {
          outputFallback(usageBar);
        }
      } else {
        outputFallback(usageBar);
      }
      process.exit(0);
    });
  }, overallTimeout);

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    if (timeoutReached) return;
    clearTimeout(timeout);

    let data;
    try {
      data = JSON.parse(input);
    } catch (e) {
      getUsage(provider, (usageBar) => {
        outputFallback(usageBar);
        process.exit(0);
      });
      return;
    }

    // Re-detect with parsed data for better accuracy
    provider = detectProvider(data);

    getUsage(provider, (usageBar) => {
      outputStatus(provider, data, usageBar);
      process.exit(0);
    });
  });
}
