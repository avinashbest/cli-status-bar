# CLI Status Bar — Universal PowerShell Installer
# Supports: Claude Code, Cursor CLI, Copilot CLI, Gemini CLI
# https://github.com/avinashbest/cli-status-bar

$ErrorActionPreference = "Stop"

$REPO_URL = "https://raw.githubusercontent.com/avinashbest/cli-status-bar/main"

# ── Banner ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║         CLI Status Bar Installer         ║" -ForegroundColor Cyan
Write-Host "  ║   Universal statusline for CLI agents    ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Detect installed CLIs ────────────────────────────────────────────────────
$providers = @()

$checks = @(
    @{ Name = "claude";  DisplayName = "Claude Code"; Dir = "$env:USERPROFILE\.claude"; Config = "$env:USERPROFILE\.claude\settings.json" },
    @{ Name = "cursor";  DisplayName = "Cursor CLI";  Dir = "$env:USERPROFILE\.cursor"; Config = "$env:USERPROFILE\.cursor\cli-config.json" },
    @{ Name = "copilot"; DisplayName = "Copilot CLI"; Dir = "$env:USERPROFILE\.copilot"; Config = "$env:USERPROFILE\.copilot\config.json" },
    @{ Name = "gemini";  DisplayName = "Gemini CLI";  Dir = "$env:USERPROFILE\.gemini"; Config = "$env:USERPROFILE\.gemini\settings.json" }
)

foreach ($check in $checks) {
    if (Test-Path $check.Dir) {
        $providers += $check
    }
}

if ($providers.Count -eq 0) {
    Write-Host "  No supported CLI agents detected!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Supported agents:"
    Write-Host "    - Claude Code  (~/.claude)" -ForegroundColor DarkGray
    Write-Host "    - Cursor CLI   (~/.cursor)" -ForegroundColor DarkGray
    Write-Host "    - Copilot CLI  (~/.copilot)" -ForegroundColor DarkGray
    Write-Host "    - Gemini CLI   (~/.gemini)" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

Write-Host "  Detected $($providers.Count) CLI agent(s):" -ForegroundColor Green
foreach ($p in $providers) {
    Write-Host "    ✓ $($p.DisplayName) ($($p.Dir))" -ForegroundColor Cyan
}
Write-Host ""

# ── Download files ───────────────────────────────────────────────────────────
Write-Host "  Downloading CLI Status Bar..." -ForegroundColor Yellow

$files = @(
    "statusline.js",
    "src/statusline.js",
    "src/detect.js",
    "src/core/renderer.js",
    "src/core/cache.js",
    "src/core/config.js",
    "src/providers/base.js",
    "src/providers/claude.js",
    "src/providers/cursor.js",
    "src/providers/copilot.js",
    "src/providers/gemini.js",
    "src/hooks/gemini-after-agent.js"
)

$tempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }

foreach ($file in $files) {
    $dir = Split-Path "$tempDir\$file" -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    try {
        Invoke-WebRequest -Uri "$REPO_URL/$file" -OutFile "$tempDir\$file" -UseBasicParsing -ErrorAction SilentlyContinue
    } catch {}
}

Write-Host "    ✓ Downloaded all files" -ForegroundColor Green
Write-Host ""

# ── Install for each provider ────────────────────────────────────────────────
$successCount = 0

foreach ($provider in $providers) {
    Write-Host "  Installing for $($provider.DisplayName)..." -ForegroundColor Yellow

    $hooksDir = "$($provider.Dir)\hooks"
    $destDir = "$hooksDir\cli-status-bar"

    # Create directories
    @("$destDir\src\core", "$destDir\src\providers", "$destDir\src\hooks") | ForEach-Object {
        if (-not (Test-Path $_)) { New-Item -ItemType Directory -Force -Path $_ | Out-Null }
    }

    # Copy files
    foreach ($file in $files) {
        $srcFile = "$tempDir\$file"
        $dstFile = "$destDir\$file"
        if (Test-Path $srcFile) {
            $dstDir = Split-Path $dstFile -Parent
            if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
            Copy-Item $srcFile $dstFile -Force
        }
    }

    $scriptPath = "$destDir\statusline.js" -replace '\\', '/'

    # Backup settings
    $config = $provider.Config
    if (Test-Path $config) {
        $timestamp = Get-Date -Format "yyyyMMddHHmmss"
        Copy-Item $config "$config.backup.$timestamp"
        Write-Host "    ✓ Backed up settings" -ForegroundColor Green
    }

    # Read existing settings
    $settings = @{}
    if (Test-Path $config) {
        try { $settings = Get-Content $config | ConvertFrom-Json -AsHashtable } catch { $settings = @{} }
    }

    # Update settings per provider
    switch ($provider.Name) {
        "gemini" {
            $hookPath = "$destDir\src\hooks\gemini-after-agent.js" -replace '\\', '/'
            if (-not $settings.hooks) { $settings.hooks = @{} }
            if (-not $settings.hooks.AfterAgent) { $settings.hooks.AfterAgent = @() }
            $settings.hooks.AfterAgent = @($settings.hooks.AfterAgent | Where-Object {
                -not ($_.hooks | Where-Object { $_.name -eq "cli-status-bar-stats" })
            })
            $settings.hooks.AfterAgent += @{
                matcher = "*"
                hooks = @(@{ name = "cli-status-bar-stats"; type = "command"; command = "node $hookPath" })
            }
            Write-Host "    ✓ Installed AfterAgent hook" -ForegroundColor Green
        }
        "copilot" {
            $settings.experimental = $true
            $settings.statusLine = @{ type = "command"; command = "node $scriptPath"; padding = 0 }
            Write-Host "    ✓ Updated config (experimental + statusLine)" -ForegroundColor Green
        }
        default {
            $settings.statusLine = @{ type = "command"; command = "node $scriptPath" }
            Write-Host "    ✓ Updated settings" -ForegroundColor Green
        }
    }

    $settings | ConvertTo-Json -Depth 10 | Set-Content $config
    $successCount++
    Write-Host "    ✓ $($provider.DisplayName) configured successfully" -ForegroundColor Green
    Write-Host ""
}

# Cleanup
Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║   Installation Complete!  $successCount/$($providers.Count) configured   ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Restart your CLI agent or start a new session"
Write-Host "    2. The statusline will activate automatically"
Write-Host ""
Write-Host "  To force a specific provider:" -ForegroundColor DarkGray
Write-Host '    $env:CLI_STATUSBAR_PROVIDER = "claude|cursor|copilot|gemini"' -ForegroundColor DarkGray
Write-Host ""
Write-Host "  GitHub: https://github.com/avinashbest/cli-status-bar" -ForegroundColor DarkGray
Write-Host ""
