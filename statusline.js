#!/usr/bin/env node
// CLI Status Bar — Compatibility Shim
// This file maintains backward compatibility for users who already have
// statusline configured to point at this file path.
// It simply delegates to the modular src/statusline.js
//
// https://github.com/avinashbest/cli-status-bar

require('./src/statusline');
