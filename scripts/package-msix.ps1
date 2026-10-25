# Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
# Packs the Tauri release build into an MSIX for the Microsoft Store, since
# Tauri itself only makes NSIS and MSI installers. Run from the repository
# root on Windows after `npm run build` and `npx tauri build`.
#
#   pwsh scripts/package-msix.ps1 -Version 2.7.0 [-Pfx cert.pfx -PfxPassword ...]
#
# The identity defaults to the Store listing's; MSIX_PACKAGE_ID, MSIX_PUBLISHER
# and MSIX_PUBLISHER_DISPLAY_NAME override it.
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Pfx = '',
    [string]$PfxPassword = '',
    [string]$OutDir = 'release'
)
$ErrorActionPreference = 'Stop'

function Find-SdkTool([string]$Name) {
    $onPath = Get-Command $Name -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    $kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    $found = Get-ChildItem $kits -Recurse -Filter $Name -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\' } |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $found) { throw "$Name not found (install the Windows 10/11 SDK)." }
    return $found.FullName
}

$identity = if ($env:MSIX_PACKAGE_ID) { $env:MSIX_PACKAGE_ID } else { 'PedroPathingPlus.12978EBCCDE63' }
$publisher = if ($env:MSIX_PUBLISHER) { $env:MSIX_PUBLISHER } else { 'CN=D17DA008-76B7-4978-BFAA-9ED056EE08B9' }
$publisherName = if ($env:MSIX_PUBLISHER_DISPLAY_NAME) { $env:MSIX_PUBLISHER_DISPLAY_NAME } else { 'Turtle Tracer' }

# MSIX versions have four numbers; pre-release suffixes aren't allowed.
if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)') { throw "Version '$Version' isn't X.Y.Z." }
$msixVersion = "$($Matches[1]).$($Matches[2]).$($Matches[3]).0"

$release = 'src-tauri\target\release'
$exe = Join-Path $release 'Turtle Tracer.exe'
if (-not (Test-Path $exe)) { throw "$exe not found; run 'npx tauri build' first." }

$layout = Join-Path ([IO.Path]::GetTempPath()) "turtle-tracer-msix-$PID"
if (Test-Path $layout) { Remove-Item $layout -Recurse -Force }
New-Item -ItemType Directory -Path $layout, "$layout\Assets", "$layout\plugins" | Out-Null

Copy-Item $exe $layout
# The bundled plugins, where the app looks for its resources (beside the exe).
Copy-Item 'plugins\*.ts' "$layout\plugins"
Copy-Item 'build\appx\*.png' "$layout\Assets"

$manifest = Get-Content 'src-tauri\windows\AppxManifest.xml' -Raw
$manifest = $manifest.Replace('{{IDENTITY_NAME}}', $identity).
    Replace('{{PUBLISHER}}', $publisher).
    Replace('{{PUBLISHER_DISPLAY_NAME}}', $publisherName).
    Replace('{{APPLICATION_ID}}', 'TurtleTracer').
    Replace('{{VERSION}}', $msixVersion)
Set-Content -Path "$layout\AppxManifest.xml" -Value $manifest -Encoding UTF8

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$msix = Join-Path $OutDir "Turtle-Tracer-$Version-x64.msix"
& (Find-SdkTool 'makeappx.exe') pack /d $layout /p $msix /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed ($LASTEXITCODE)." }

if ($Pfx) {
    & (Find-SdkTool 'signtool.exe') sign /fd SHA256 /f $Pfx /p $PfxPassword $msix
    if ($LASTEXITCODE -ne 0) { throw "signtool failed ($LASTEXITCODE)." }
} else {
    Write-Host 'No certificate given: the package is unsigned (the Store signs it on submission).'
}

Remove-Item $layout -Recurse -Force
Write-Host "Wrote $msix"
