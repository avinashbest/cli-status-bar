#!/usr/bin/env node
// CLI Status Bar — Universal Installer
// Detects installed CLI agents and configures statusline for each
// Supports: Claude Code, Cursor CLI, GitHub Copilot CLI, Gemini CLI
//
// Usage: npx cli-status-bar
// https://github.com/avinashbest/cli-status-bar

const fs = require('fs');
const path = require('path');
const os = require('os');

const { getInstalledProviders } = require('../src/detect');

// ── Colors ──────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

// ── Paths ───────────────────────────────────────────────────────────────────
const srcDir = path.join(__dirname, '..');
const statuslineSrc = path.join(srcDir, 'src', 'statusline.js');
const shimSrc = path.join(srcDir, 'statusline.js');
const geminiHookSrc = path.join(srcDir, 'src', 'hooks', 'gemini-after-agent.js');

// ── Banner ──────────────────────────────────────────────────────────────────
console.log(`${c.cyan}${c.bold}`);
console.log('  ╔══════════════════════════════════════════╗');
console.log('  ║         CLI Status Bar Installer         ║');
console.log('  ║   Universal statusline for CLI agents    ║');
console.log('  ╚══════════════════════════════════════════╝');
console.log(`${c.reset}`);

// ── Detect Installed CLIs ───────────────────────────────────────────────────
const providers = getInstalledProviders();

if (providers.length === 0) {
  console.log(`${c.red}  No supported CLI agents detected!${c.reset}`);
  console.log('');
  console.log('  Supported agents:');
  console.log(`    ${c.dim}• Claude Code  (~/.claude)${c.reset}`);
  console.log(`    ${c.dim}• Cursor CLI   (~/.cursor)${c.reset}`);
  console.log(`    ${c.dim}• Copilot CLI  (~/.copilot)${c.reset}`);
  console.log(`    ${c.dim}• Gemini CLI   (~/.gemini)${c.reset}`);
  console.log('');
  console.log('  Install at least one CLI agent first, then run this installer again.');
  process.exit(1);
}

console.log(`  ${c.green}Detected ${providers.length} CLI agent(s):${c.reset}`);
providers.forEach(p => {
  console.log(`    ${c.cyan}✓${c.reset} ${p.displayName} ${c.dim}(${p.configDir})${c.reset}`);
});
console.log('');

// ── Install for Each Provider ───────────────────────────────────────────────
let successCount = 0;
let failCount = 0;

for (const provider of providers) {
  console.log(`  ${c.yellow}Installing for ${provider.displayName}...${c.reset}`);

  try {
    // 1. Create hooks directory
    const hooksDir = path.join(provider.configDir, 'hooks');
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    // 2. Copy the full src directory to the provider's hooks
    const destDir = path.join(hooksDir, 'cli-status-bar');
    copyDirSync(srcDir, destDir, ['.git', 'node_modules', '.DS_Store']);

    // 3. Set the script path
    const scriptPath = path.join(destDir, 'statusline.js');
    fs.chmodSync(scriptPath, 0o755);

    // 4. Backup and update settings
    const settingsFile = provider.settingsFile;
    let settings = {};

    if (fs.existsSync(settingsFile)) {
      const backup = `${settingsFile}.backup.${Date.now()}`;
      fs.copyFileSync(settingsFile, backup);
      console.log(`    ${c.green}✓${c.reset} Backed up settings`);

      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch (e) {
        settings = {};
      }
    }

    // 5. Merge install config
    const installConfig = provider.getInstallConfig(scriptPath);
    Object.assign(settings, installConfig);

    // 6. For Gemini, also copy the hook script
    if (provider.name === 'gemini') {
      const hookDest = path.join(destDir, 'src', 'hooks', 'gemini-after-agent.js');
      if (fs.existsSync(hookDest)) {
        fs.chmodSync(hookDest, 0o755);
      }
      console.log(`    ${c.green}✓${c.reset} Installed AfterAgent hook (Gemini has no native statusLine)`);
    }

    // 7. Write updated settings
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    console.log(`    ${c.green}✓${c.reset} Updated ${path.basename(settingsFile)}`);

    successCount++;
    console.log(`    ${c.green}✓${c.reset} ${provider.displayName} configured successfully`);
    console.log('');

  } catch (err) {
    failCount++;
    console.log(`    ${c.red}✗${c.reset} Failed: ${err.message}`);
    console.log('');
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`${c.green}${c.bold}`);
console.log('  ╔══════════════════════════════════════════╗');
console.log(`  ║   Installation Complete!  ${successCount}/${providers.length} configured   ║`);
console.log('  ╚══════════════════════════════════════════╝');
console.log(`${c.reset}`);

if (failCount > 0) {
  console.log(`  ${c.yellow}⚠  ${failCount} provider(s) failed. Check the output above.${c.reset}`);
  console.log('');
}

console.log('  Next steps:');
console.log('    1. Restart your CLI agent or start a new session');
console.log('    2. The statusline will activate automatically');
console.log('');
console.log(`  ${c.dim}To force a specific provider:${c.reset}`);
console.log(`    ${c.dim}  export CLI_STATUSBAR_PROVIDER=claude|cursor|copilot|gemini${c.reset}`);
console.log('');
console.log(`  ${c.dim}GitHub: https://github.com/avinashbest/cli-status-bar${c.reset}`);
console.log('');

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively copy a directory
 * @param {string} src - source directory
 * @param {string} dest - destination directory
 * @param {string[]} excludes - directory/file names to exclude
 */
function copyDirSync(src, dest, excludes) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (excludes && excludes.includes(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, excludes);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
