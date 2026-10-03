# Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
# Scenarios for install.ps1 against the local fake release server (see fake-github.py).
# Runs on Windows PowerShell 5.1 and PowerShell 7 (Windows, Linux or macOS). It never runs the
# real installer: scenarios either stop at the plan (-DryRun) or after verification (TT_SKIP_INSTALL).
# Environment: TT_GITHUB_URL, TT_API_URL pointing at the fake server.
param([string]$Script = (Join-Path $PSScriptRoot '..\..\install.ps1'))

$ErrorActionPreference = 'Continue'
$env:NO_COLOR = '1'
$src = Get-Content -Raw -Path $Script
$script:Passes = 0
$script:Fails = 0

function Invoke-Installer {
    param([string[]]$Args2 = @(), [hashtable]$Env = @{})
    foreach ($k in $Env.Keys) { Set-Item -Path "Env:$k" -Value $Env[$k] }
    try {
        # Invoke it exactly like the README does: a script block called with real parameter tokens,
        # so the script's own `@args` forwarding is what gets tested.
        $call = [scriptblock]::Create('param($code) & ([scriptblock]::Create($code)) ' + ($Args2 -join ' '))
        # *>&1 folds Write-Host output (the information stream) into the result
        return (& $call $src *>&1 | Out-String)
    } finally {
        foreach ($k in $Env.Keys) { Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue }
    }
}
function Expect-Text([string]$name, [string]$out, [string]$text) {
    if ($out.Contains($text)) { $script:Passes++; Write-Host "  PASS  $name" }
    else { $script:Fails++; Write-Host "  FAIL  $name (expected: $text)"; ($out -split "`n" | Select-Object -First 15) | ForEach-Object { Write-Host "        | $_" } }
}
function Expect-NoText([string]$name, [string]$out, [string]$text) {
    if (-not $out.Contains($text)) { $script:Passes++; Write-Host "  PASS  $name" }
    else { $script:Fails++; Write-Host "  FAIL  $name (unexpected: $text)" }
}

Write-Host "=== PowerShell $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"

$out = Invoke-Installer @('-Yes', '-DryRun')
Expect-Text 'default = latest stable' $out 'v2.4.1 (latest stable)'
Expect-Text 'asset is the versioned Setup .exe' $out 'Turtle-Tracer-Setup-2.4.1.exe'
Expect-Text 'plan warns about the UAC prompt' $out 'administrator (UAC) prompt'
Expect-Text 'plan reports a size from the server' $out 'KB)'

$out = Invoke-Installer @('-Yes', '-DryRun', '-Prerelease')
Expect-Text '-Prerelease' $out 'v2.5.0 (newest pre-release)'
$out = Invoke-Installer @('-Yes', '-DryRun', '-Version', 'v2.3.0')
Expect-Text '-Version v2.3.0' $out 'v2.3.0 (requested)'
$out = Invoke-Installer @('-Yes', '-DryRun') @{ TT_VERSION = '2.2.1' }
Expect-Text 'TT_VERSION env var' $out 'v2.2.1 (requested)'
$out = Invoke-Installer @('-Yes', '-DryRun') @{ TT_CHANNEL = 'prerelease' }
Expect-Text 'TT_CHANNEL=prerelease' $out 'v2.5.0'
$out = Invoke-Installer @('-Yes', '-DryRun', '-Version', '9.9.9')
Expect-Text 'unknown version explained' $out 'There is no release called v9.9.9'
Expect-Text 'unknown version lists real ones' $out 'v2.4.1'
$out = Invoke-Installer @('-Yes', '-DryRun', '-Version', 'banana')
Expect-Text 'bad version rejected' $out 'is not a version number'
$out = Invoke-Installer @('-Yes', '-DryRun', '-Version', '2.1.0')
Expect-Text 'old release with different file names is matched by its contents' $out 'Found Pedro-Visualizer-2.1.0-x64.exe'

# Capture Write-Progress calls (the bar itself isn't visible in a non-interactive run).
$script:Progress = @()
function Write-Progress { $script:Progress += ($args -join ' ') }

$env:TT_SKIP_INSTALL = '1'
$out = Invoke-Installer @('-Yes', '-Version', '2.4.1')
Expect-Text 'checksum verified' $out 'SHA-256 matches'
Expect-Text 'download reports progress' ($script:Progress -join "`n") 'Downloading Turtle-Tracer-Setup-2.4.1.exe'
Expect-Text 'download progress is closed when finished' ($script:Progress -join "`n") '-Completed'
Expect-Text 'human-readable size is shown' $out 'Downloaded'
$out = Invoke-Installer @('-Yes', '-Version', '2.2.1')
Expect-Text 'no checksum published: warns and continues' $out 'No checksum is published for v2.2.1'
Expect-NoText 'no checksum published: no alarming [!] warning' $out '[!]'
$out = Invoke-Installer @('-Yes', '-Version', '2.2.1', '-RequireChecksum')
Expect-Text '-RequireChecksum refuses' $out '-RequireChecksum was given'
Remove-Item Env:TT_SKIP_INSTALL

# the session must survive every outcome (no `exit` under `| iex`)
$out = Invoke-Installer @('-Yes', '-DryRun', '-Version', 'banana')
Expect-Text 'still running after a failure' "$out STILL_ALIVE" 'STILL_ALIVE'

Write-Host "--- $script:Passes passed, $script:Fails failed"
if ($script:Fails -gt 0) { $global:LASTEXITCODE = 1; throw "$script:Fails scenario(s) failed" }
