Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "Starting MSIX build script"
$repoRoot = (Get-Location).Path

$version = ($env:TAG_NAME -replace '^v', '')
if ([string]::IsNullOrWhiteSpace($version)) { Write-Host 'TAG_NAME empty; continuing with version unknown' }

# locate unpacked app dir
$appDir = Get-ChildItem -Path (Join-Path $repoRoot 'release') -Directory | Where-Object { $_.Name -match 'win.*unpacked' } | Select-Object -First 1
if (-not $appDir) { Write-Host 'No win-unpacked directory found; skipping MSIX packaging.'; exit 0 }

Write-Host "Using app dir: $($appDir.FullName)"

# Find main executable
$exe = Get-ChildItem -Path $appDir.FullName -Filter *.exe | Select-Object -First 1
if (-not $exe) { throw 'Main exe not found in app dir.' }
Write-Host "Found exe: $($exe.Name)"

# Prepare config
$config = @{
  appDir = $appDir.FullName
  packageAssets = (Resolve-Path 'build').Path
  outputDir = (Resolve-Path 'release').Path
  packageName = "Pedro-Pathing-Plus-Visualizer-${version}-x64.msix"
  logLevel = 'warn'
  manifestVariables = @{
    packageIdentity = ($env:MSIX_PACKAGE_ID -or 'PedroPathingPlus.PedroPathingPlusVisualizer')
    publisher = ($env:MSIX_PUBLISHER -or 'CN=PedroPathingPlusVisualizer')
    publisherDisplayName = ($env:MSIX_PUBLISHER_DISPLAY_NAME -or 'Matthew Allen')
    packageDisplayName = 'Pedro Pathing Plus Visualizer'
    packageDescription = 'Pedro Pathing Plus Visualizer'
    packageVersion = (if ($version) { "${version}.0" } else { '0.0.0.0' })
    appExecutable = $exe.Name
    targetArch = 'x64'
  }
}

# If certificate is provided, write and configure signing
if ($env:MSIX_CERT_BASE64) {
  $pfxPath = Join-Path $repoRoot 'msix-signing.pfx'
  Write-Host 'Writing PFX to:' $pfxPath
  [System.IO.File]::WriteAllBytes($pfxPath, [Convert]::FromBase64String($env:MSIX_CERT_BASE64))
  $config.windowsSignOptions = @{ certificateFile = $pfxPath; certificatePassword = $env:MSIX_CERT_PASSWORD }
  $config.sign = $true
  Write-Host 'Signing enabled using provided PFX.'
} else {
  Write-Host 'No signing certificate provided; package will be unsigned (dev cert may be generated).'
}

# Persist config and run the node tool
$configPath = Join-Path $repoRoot 'msix-config.json'
$config | ConvertTo-Json -Depth 8 | Out-File -FilePath $configPath -Encoding utf8NoBOM
Write-Host "Wrote MSIX config to: $configPath"

$env:CONFIG_PATH = $configPath

# Ensure module is available; if not, install locally
Write-Host 'Checking for electron-windows-msix module'
node -e "(async ()=>{try{await import('electron-windows-msix');console.log('module electron-windows-msix available');}catch(e){console.log('module electron-windows-msix not found');process.exit(30);}})()"
if ($LASTEXITCODE -eq 30) { Write-Host 'Installing electron-windows-msix'; npm install --no-save electron-windows-msix }

# Execute the node runner
$nodeRunner = Join-Path $repoRoot 'scripts' 'build-msix.mjs'
Write-Host 'Running node runner:' $nodeRunner
node $nodeRunner

Write-Host 'Finished MSIX build script'