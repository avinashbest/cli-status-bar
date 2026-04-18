#!/bin/bash
# CLI Status Bar — Universal Shell Installer
# Supports: Claude Code, Cursor CLI, Copilot CLI, Gemini CLI
# https://github.com/avinashbest/cli-status-bar

set -e

REPO_URL="https://raw.githubusercontent.com/avinashbest/cli-status-bar/main"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}  ╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}  ║         CLI Status Bar Installer         ║${NC}"
echo -e "${CYAN}${BOLD}  ║   Universal statusline for CLI agents    ║${NC}"
echo -e "${CYAN}${BOLD}  ╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Detect installed CLIs ────────────────────────────────────────────────────
declare -a DETECTED=()
declare -a DETECTED_NAMES=()
declare -a DETECTED_DIRS=()
declare -a CONFIG_FILES=()

if [ -d "$HOME/.claude" ]; then
    DETECTED+=("claude")
    DETECTED_NAMES+=("Claude Code")
    DETECTED_DIRS+=("$HOME/.claude")
    CONFIG_FILES+=("$HOME/.claude/settings.json")
fi

if [ -d "$HOME/.cursor" ]; then
    DETECTED+=("cursor")
    DETECTED_NAMES+=("Cursor CLI")
    DETECTED_DIRS+=("$HOME/.cursor")
    CONFIG_FILES+=("$HOME/.cursor/cli-config.json")
fi

if [ -d "$HOME/.copilot" ]; then
    DETECTED+=("copilot")
    DETECTED_NAMES+=("Copilot CLI")
    DETECTED_DIRS+=("$HOME/.copilot")
    CONFIG_FILES+=("$HOME/.copilot/config.json")
fi

if [ -d "$HOME/.gemini" ]; then
    DETECTED+=("gemini")
    DETECTED_NAMES+=("Gemini CLI")
    DETECTED_DIRS+=("$HOME/.gemini")
    CONFIG_FILES+=("$HOME/.gemini/settings.json")
fi

if [ ${#DETECTED[@]} -eq 0 ]; then
    echo -e "${RED}  No supported CLI agents detected!${NC}"
    echo ""
    echo "  Supported agents:"
    echo -e "    ${DIM}• Claude Code  (~/.claude)${NC}"
    echo -e "    ${DIM}• Cursor CLI   (~/.cursor)${NC}"
    echo -e "    ${DIM}• Copilot CLI  (~/.copilot)${NC}"
    echo -e "    ${DIM}• Gemini CLI   (~/.gemini)${NC}"
    echo ""
    exit 1
fi

echo -e "  ${GREEN}Detected ${#DETECTED[@]} CLI agent(s):${NC}"
for i in "${!DETECTED[@]}"; do
    echo -e "    ${CYAN}✓${NC} ${DETECTED_NAMES[$i]} ${DIM}(${DETECTED_DIRS[$i]})${NC}"
done
echo ""

# ── Download files ───────────────────────────────────────────────────────────
echo -e "  ${YELLOW}Downloading CLI Status Bar...${NC}"

DOWNLOAD_DIR=$(mktemp -d)
trap "rm -rf $DOWNLOAD_DIR" EXIT

FILES=(
    "statusline.js"
    "src/statusline.js"
    "src/detect.js"
    "src/core/renderer.js"
    "src/core/cache.js"
    "src/core/config.js"
    "src/providers/base.js"
    "src/providers/claude.js"
    "src/providers/cursor.js"
    "src/providers/copilot.js"
    "src/providers/gemini.js"
    "src/hooks/gemini-after-agent.js"
)

for file in "${FILES[@]}"; do
    dir=$(dirname "$DOWNLOAD_DIR/$file")
    mkdir -p "$dir"
    if command -v curl &> /dev/null; then
        curl -fsSL "$REPO_URL/$file" -o "$DOWNLOAD_DIR/$file" 2>/dev/null || true
    elif command -v wget &> /dev/null; then
        wget -q "$REPO_URL/$file" -O "$DOWNLOAD_DIR/$file" 2>/dev/null || true
    fi
done

echo -e "    ${GREEN}✓${NC} Downloaded all files"
echo ""

# ── Install for each detected provider ───────────────────────────────────────
SUCCESS=0
FAIL=0

for i in "${!DETECTED[@]}"; do
    provider="${DETECTED[$i]}"
    name="${DETECTED_NAMES[$i]}"
    dir="${DETECTED_DIRS[$i]}"
    config="${CONFIG_FILES[$i]}"

    echo -e "  ${YELLOW}Installing for ${name}...${NC}"

    HOOKS_DIR="$dir/hooks"
    DEST_DIR="$HOOKS_DIR/cli-status-bar"

    # Create destination
    mkdir -p "$DEST_DIR/src/core"
    mkdir -p "$DEST_DIR/src/providers"
    mkdir -p "$DEST_DIR/src/hooks"

    # Copy files
    for file in "${FILES[@]}"; do
        if [ -f "$DOWNLOAD_DIR/$file" ]; then
            cp "$DOWNLOAD_DIR/$file" "$DEST_DIR/$file"
        fi
    done

    chmod +x "$DEST_DIR/statusline.js"
    SCRIPT_PATH="$DEST_DIR/statusline.js"

    # Backup existing config
    if [ -f "$config" ]; then
        cp "$config" "$config.backup.$(date +%s)"
        echo -e "    ${GREEN}✓${NC} Backed up settings"
    fi

    # Update config using node
    if [ "$provider" = "gemini" ]; then
        # Gemini: install AfterAgent hook
        HOOK_PATH="$DEST_DIR/src/hooks/gemini-after-agent.js"
        chmod +x "$HOOK_PATH" 2>/dev/null || true

        node <<NODESCRIPT
const fs = require('fs');
let settings = {};
try { settings = JSON.parse(fs.readFileSync('$config', 'utf8')); } catch(e) {}
if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.AfterAgent) settings.hooks.AfterAgent = [];
// Remove existing cli-status-bar hooks
settings.hooks.AfterAgent = settings.hooks.AfterAgent.filter(h => {
  if (h.hooks) return !h.hooks.some(hh => hh.name === 'cli-status-bar-stats');
  return true;
});
settings.hooks.AfterAgent.push({
  matcher: '*',
  hooks: [{ name: 'cli-status-bar-stats', type: 'command', command: 'node $HOOK_PATH' }]
});
fs.writeFileSync('$config', JSON.stringify(settings, null, 2));
NODESCRIPT
        echo -e "    ${GREEN}✓${NC} Installed AfterAgent hook"

    elif [ "$provider" = "copilot" ]; then
        # Copilot: needs experimental flag
        node <<NODESCRIPT
const fs = require('fs');
let settings = {};
try { settings = JSON.parse(fs.readFileSync('$config', 'utf8')); } catch(e) {}
settings.experimental = true;
settings.statusLine = { type: 'command', command: 'node $SCRIPT_PATH', padding: 0 };
fs.writeFileSync('$config', JSON.stringify(settings, null, 2));
NODESCRIPT
        echo -e "    ${GREEN}✓${NC} Updated config (experimental + statusLine)"

    else
        # Claude / Cursor: standard statusLine config
        node <<NODESCRIPT
const fs = require('fs');
let settings = {};
try { settings = JSON.parse(fs.readFileSync('$config', 'utf8')); } catch(e) {}
settings.statusLine = { type: 'command', command: 'node $SCRIPT_PATH' };
fs.writeFileSync('$config', JSON.stringify(settings, null, 2));
NODESCRIPT
        echo -e "    ${GREEN}✓${NC} Updated settings"
    fi

    SUCCESS=$((SUCCESS + 1))
    echo -e "    ${GREEN}✓${NC} ${name} configured successfully"
    echo ""
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo -e "${GREEN}${BOLD}  ╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}  ║   Installation Complete!  ${SUCCESS}/${#DETECTED[@]} configured   ║${NC}"
echo -e "${GREEN}${BOLD}  ╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  Next steps:"
echo "    1. Restart your CLI agent or start a new session"
echo "    2. The statusline will activate automatically"
echo ""
echo -e "  ${DIM}To force a specific provider:${NC}"
echo -e "    ${DIM}  export CLI_STATUSBAR_PROVIDER=claude|cursor|copilot|gemini${NC}"
echo ""
echo -e "  ${DIM}To uninstall: remove the hooks/cli-status-bar directory${NC}"
echo -e "  ${DIM}and the statusLine / hooks entry from your settings.${NC}"
echo ""
echo -e "  ${DIM}GitHub: https://github.com/avinashbest/cli-status-bar${NC}"
echo ""
