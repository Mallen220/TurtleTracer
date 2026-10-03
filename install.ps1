# Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
#
# Turtle Tracer installer for Windows. (macOS and Linux: install.sh.)
#
#   irm https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.ps1 | iex
#
# To choose a version or option, either set an environment variable first ...
#   $env:TT_VERSION = '2.3.0'; irm https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.ps1 | iex
# ... or run it as a script block with parameters:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.ps1))) -Version 2.3.0
#
# Parameters:   -Version X.Y.Z   -Stable   -Prerelease   -Yes   -DryRun   -RequireChecksum   -Uninstall
# Environment:  TT_VERSION, TT_CHANNEL (stable|prerelease), GITHUB_TOKEN, NO_COLOR
#
# The script never calls `exit`, because under `| iex` that would close your PowerShell window.

function Install-TurtleTracer {
    [CmdletBinding()]
    param(
        [string]$Version = $env:TT_VERSION,
        [switch]$Stable,
        [switch]$Prerelease,
        [switch]$Yes,
        [switch]$DryRun,
        [switch]$RequireChecksum,
        [switch]$Uninstall
    )

    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'   # the progress bar makes downloads far slower on Windows PowerShell 5.1
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

    $Repo = 'Mallen220/TurtleTracer'
    $AppName = 'Turtle Tracer'
    # These can be overridden so the installer can be tested against a local fake server.
    $GitHubUrl = if ($env:TT_GITHUB_URL) { $env:TT_GITHUB_URL } else { 'https://github.com' }
    $ApiUrl = if ($env:TT_API_URL) { $env:TT_API_URL } else { 'https://api.github.com' }
    $LogFile = Join-Path ([IO.Path]::GetTempPath()) 'turtle-tracer-install.log'
    Set-Content -Path $LogFile -Value "turtle-tracer installer started $(Get-Date)" -ErrorAction SilentlyContinue

    $UseColor = (-not $env:NO_COLOR)
    $Script:StepN = 0

    # ----- output -------------------------------------------------------------
    function Log([string]$m) { Add-Content -Path $LogFile -Value $m -ErrorAction SilentlyContinue }
    function Say([string]$m) { Write-Host $m; Log $m }
    function Out-Tag([string]$tag, [string]$color, [string]$m) {
        if ($UseColor) { Write-Host "[$tag] " -ForegroundColor $color -NoNewline; Write-Host $m } else { Write-Host "[$tag] $m" }
        Log "[$tag] $m"
    }
    function Ok([string]$m) { Out-Tag '+' 'Green' $m }
    function Info([string]$m) { Out-Tag 'i' 'Cyan' $m }
    function Warn([string]$m) { Out-Tag '!' 'Yellow' $m }
    function Step([string]$m) { $Script:StepN++; Say ''; Say "[$($Script:StepN)/3] $m" }
    function Kv([string]$k, [string]$v) { Say ('  {0,-14} {1}' -f $k, $v) }

    # Stops the install with an explanation. Throws a marker the caller swallows, so no `exit` is needed.
    function Fail([string]$m, [string[]]$details = @(), [switch]$NoManualHelp) {
        Out-Tag 'x' 'Red' $m
        foreach ($d in $details) { Say "    $d" }
        if (-not $NoManualHelp) {
            Say ''
            Say 'You can also install Turtle Tracer by hand:'
            Say "  1. Open https://github.com/$Repo/releases"
            Say '  2. Download Turtle-Tracer-Setup-<version>.exe and run it.'
            Say 'Or get it from the Microsoft Store: https://apps.microsoft.com/detail/9nk0b4fdj3zw'
            Say 'Or skip the install and use the browser version: https://live.turtletracer.com'
        }
        Say ''
        Say "A detailed log was saved to: $LogFile"
        throw 'TT_ABORT'
    }

    function Test-Interactive {
        if ($Yes -or $env:TT_NONINTERACTIVE) { return $false }
        if (-not [Environment]::UserInteractive) { return $false }
        if ([Environment]::GetCommandLineArgs() -contains '-NonInteractive') { return $false }
        try { if ([Console]::IsInputRedirected) { return $false } } catch { }
        return $true
    }
    $Interactive = Test-Interactive

    function Confirm-Step([string]$q) {
        if (-not $Interactive) { return $true }
        while ($true) {
            $a = (Read-Host "$q [Y/n]").Trim().ToLower()
            if ($a -eq '' -or $a -eq 'y' -or $a -eq 'yes') { return $true }
            if ($a -eq 'n' -or $a -eq 'no') { return $false }
        }
    }

    # ----- network ------------------------------------------------------------
    $ApiHeaders = @{ 'Accept' = 'application/vnd.github+json'; 'User-Agent' = 'turtle-tracer-installer' }
    if ($env:GITHUB_TOKEN) { $ApiHeaders['Authorization'] = "Bearer $($env:GITHUB_TOKEN)" }

    # .NET calls made from PowerShell wrap the real WebException, so look one level down too.
    function Get-WebException($err) {
        $ex = $err.Exception
        if ($ex -and -not $ex.Response -and $ex.InnerException) { $ex = $ex.InnerException }
        return $ex
    }
    function Get-StatusCode($err) {
        try { $ex = Get-WebException $err; if ($ex.Response) { return [int]$ex.Response.StatusCode } } catch { }
        return 0
    }
    function Get-ResponseHeader($err, [string]$name) {
        try {
            $h = (Get-WebException $err).Response.Headers
            if ($h -is [System.Net.WebHeaderCollection]) { return $h[$name] }
            $vals = $null
            if ($h.TryGetValues($name, [ref]$vals)) { return ($vals -join ',') }
        } catch { }
        return $null
    }
    function Format-Bytes([long]$n) {
        if ($n -ge 1MB) { return "$([math]::Floor($n / 1MB)) MB" }
        return "$([math]::Ceiling($n / 1KB)) KB"
    }
    # Streams a download to disk with a progress bar. (Invoke-WebRequest's own bar makes Windows
    # PowerShell 5.1 downloads very slow, so the bar is drawn here, a few times a second.)
    function Save-WithProgress([string]$url, [string]$path, [string]$label) {
        $ProgressPreference = 'Continue'
        $req = [System.Net.HttpWebRequest]::Create($url)
        $req.UserAgent = 'turtle-tracer-installer'
        $resp = $req.GetResponse()
        $in = $null; $out = $null
        try {
            $total = $resp.ContentLength   # -1 when the server doesn't say
            $in = $resp.GetResponseStream()
            $out = [IO.File]::Create($path)
            $buf = New-Object byte[] 262144
            $done = [long]0
            $lastUpdate = [DateTime]::UtcNow
            while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
                $out.Write($buf, 0, $n)
                $done += $n
                if (([DateTime]::UtcNow - $lastUpdate).TotalMilliseconds -ge 150) {
                    $lastUpdate = [DateTime]::UtcNow
                    if ($total -gt 0) {
                        Write-Progress -Activity $label -Status "$(Format-Bytes $done) of $(Format-Bytes $total)" -PercentComplete ([int](100 * $done / $total))
                    } else {
                        Write-Progress -Activity $label -Status "$(Format-Bytes $done) downloaded"
                    }
                }
            }
        } finally {
            if ($out) { $out.Dispose() }
            if ($in) { $in.Dispose() }
            $resp.Close()
            Write-Progress -Activity $label -Completed
        }
    }
    # Plain-language reason for a failed request.
    function Describe-Failure($err) {
        $code = Get-StatusCode $err
        if ($code -eq 0) { return "couldn't reach GitHub (is the network, a proxy or a firewall blocking it?)" }
        if ($code -eq 403 -or $code -eq 429) {
            if ((Get-ResponseHeader $err 'x-ratelimit-remaining') -eq '0') {
                $when = 'later'
                try { $when = [DateTimeOffset]::FromUnixTimeSeconds([long](Get-ResponseHeader $err 'x-ratelimit-reset')).LocalDateTime.ToString('HH:mm') } catch { }
                return "GitHub's anonymous rate limit was reached (it resets around $when)."
            }
            return "GitHub refused the request (HTTP $code)."
        }
        if ($code -eq 404) { return "GitHub says that doesn't exist (HTTP 404)." }
        if ($code -ge 500) { return "GitHub is having problems right now (HTTP $code)." }
        return "unexpected response from GitHub (HTTP $code)."
    }

    $Script:ApiFailReason = ''
    $Script:StableVersion = ''
    $Script:PreVersion = ''
    $Script:AtomNewest = ''
    $Script:ListSource = ''

    function Get-ReleaseList {
        try {
            $list = Invoke-RestMethod -Uri "$ApiUrl/repos/$Repo/releases?per_page=30" -Headers $ApiHeaders -UseBasicParsing
        } catch {
            $Script:ApiFailReason = Describe-Failure $_
            Log "release list failed: $($Script:ApiFailReason)"
            return $false
        }
        $Script:StableVersion = ''; $Script:PreVersion = ''
        foreach ($r in @($list)) {
            if ($r.draft) { continue }
            $v = ([string]$r.tag_name).TrimStart('v')
            if (-not $r.prerelease) { if (-not $Script:StableVersion) { $Script:StableVersion = $v } }
            elseif (-not $Script:StableVersion -and -not $Script:PreVersion) { $Script:PreVersion = $v }
        }
        if (-not $Script:StableVersion -and -not $Script:PreVersion) {
            $Script:ApiFailReason = "GitHub's release list was empty or in an unexpected format."
            return $false
        }
        return $true
    }

    # Latest stable via the /releases/latest redirect (no API, so no rate limit).
    function Get-LatestFromRedirect {
        try {
            $req = [System.Net.HttpWebRequest]::Create("$GitHubUrl/$Repo/releases/latest")
            $req.AllowAutoRedirect = $false
            $req.Method = 'HEAD'
            $req.UserAgent = 'turtle-tracer-installer'
            $resp = $req.GetResponse()
            $loc = [string]$resp.Headers['Location']
            $resp.Close()
            if ($loc -match '/releases/tag/v?([^/?#]+)$') { $Script:StableVersion = $Matches[1]; return $true }
        } catch { Log "redirect lookup failed: $_" }
        return $false
    }

    # Newest tag from the public Atom feed (also not rate limited; can't say whether it's a pre-release).
    function Get-LatestFromAtom {
        try {
            $xml = (Invoke-WebRequest -Uri "$GitHubUrl/$Repo/releases.atom" -UseBasicParsing -Headers @{ 'User-Agent' = 'turtle-tracer-installer' }).Content
            if ($xml -match '/releases/tag/v?([^"<]+)') { $Script:AtomNewest = $Matches[1]; return $true }
        } catch { Log "atom lookup failed: $_" }
        return $false
    }

    function Get-Versions {
        $Script:ListSource = ''
        Info 'Checking which versions are available...'
        if (Get-ReleaseList) { $Script:ListSource = 'api'; return $true }
        if (Get-LatestFromRedirect) { $Script:ListSource = 'redirect'; return $true }
        if (Get-LatestFromAtom) { $Script:ListSource = 'atom'; return $true }
        return $false
    }

    $Script:LookupExplained = $false
    function Explain-LimitedLookup {
        if ($Script:LookupExplained) { return }
        $Script:LookupExplained = $true
        if ($Script:ListSource -eq 'redirect') {
            Warn "Couldn't read GitHub's full release list: $($Script:ApiFailReason)"
            Warn "Showing the latest stable release only; pre-releases can't be detected right now (use -Version to pick one)."
        } elseif ($Script:ListSource -eq 'atom') {
            Warn "Couldn't read GitHub's release list: $($Script:ApiFailReason)"
            Warn "The newest published tag is v$($Script:AtomNewest), but I can't tell whether it is stable or a pre-release."
        }
    }

    function Fail-NoVersion {
        $why = if ($Script:ApiFailReason) { $Script:ApiFailReason } else { 'GitHub could not be reached.' }
        Fail "Couldn't work out which version to install." @(
            "Reason: $why",
            'Try again in a minute, check your network/proxy, or name a version yourself:',
            "    `$env:TT_VERSION = 'X.Y.Z'; irm https://raw.githubusercontent.com/$Repo/main/install.ps1 | iex",
            "(Versions are listed at https://github.com/$Repo/releases)")
    }

    # Interprets "", stable, p, prerelease, or a version number. Returns $null if it isn't any of those.
    function ConvertTo-VersionRequest([string]$text) {
        $t = $text.Trim()
        $l = $t.ToLower()
        if ($l -in @('', 'latest', 'stable', 's')) { return @{ Channel = 'stable'; Version = '' } }
        if ($l -in @('p', 'pre', 'prerelease', 'pre-release', 'beta')) { return @{ Channel = 'prerelease'; Version = '' } }
        $v = $t -replace '^[vV]', ''
        if ($v -match '^\d+\.\d+\.\d+([-+.][0-9A-Za-z.+-]+)?$') { return @{ Channel = ''; Version = $v } }
        return $null
    }

    # ----- decide the version --------------------------------------------------
    $Channel = ''
    if ($env:TT_CHANNEL) {
        $req = ConvertTo-VersionRequest $env:TT_CHANNEL
        if (-not $req) { Fail 'TT_CHANNEL must be "stable" or "prerelease".' @() -NoManualHelp }
        $Channel = $req.Channel
    }
    if ($Version) {
        $req = ConvertTo-VersionRequest $Version
        if (-not $req) { Fail "`"$Version`" is not a version number (expected something like 2.3.0)." @() -NoManualHelp }
        $Version = $req.Version
        if ($req.Channel) { $Channel = $req.Channel }
    }
    if ($Stable) { $Channel = 'stable'; $Version = '' }
    if ($Prerelease) { $Channel = 'prerelease'; $Version = '' }

    $onWindows = ($PSVersionTable.PSEdition -eq 'Desktop') -or ($PSVersionTable.Platform -eq 'Win32NT')
    if (-not $onWindows -and -not $DryRun -and -not $env:TT_SKIP_INSTALL) {
        Fail 'This installer is for Windows.' @('On macOS or Linux use:  curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash') -NoManualHelp
    }

    Say ''
    Say 'Turtle Tracer installer for Windows'
    $arch = if ($env:PROCESSOR_ARCHITECTURE) { $env:PROCESSOR_ARCHITECTURE } else { 'x64' }
    $system = "Windows ($arch)"
    Say "Detected: $system"
    if ($arch -eq 'ARM64') { Info "The installer is a 64-bit Intel build; Windows on ARM runs it through emulation." }

    # What's installed already? (the NSIS installer registers an uninstall entry)
    $InstalledVersion = ''
    $UninstallString = ''
    foreach ($key in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
        try {
            $hit = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq $AppName } | Select-Object -First 1
            if ($hit) { $InstalledVersion = [string]$hit.DisplayVersion; $UninstallString = [string]$hit.UninstallString; break }
        } catch { }
    }
    $StoreInstalled = $false
    try { if ($onWindows -and (Get-AppxPackage -Name 'PedroPathingPlus.12978EBCCDE63' -ErrorAction SilentlyContinue)) { $StoreInstalled = $true } } catch { }

    # ----- uninstall ------------------------------------------------------------
    if ($Uninstall) {
        if (-not $UninstallString) {
            Info "$AppName (the .exe installer version) isn't installed. Nothing to remove."
            if ($StoreInstalled) { Say 'The Microsoft Store version is installed; remove it from Settings > Apps.' }
            return
        }
        Say ''
        Say 'This will run the Turtle Tracer uninstaller. Your projects and settings are kept.'
        if ($DryRun) { Say 'Dry run: nothing was removed.'; return }
        if (-not $Yes -and -not $Interactive) { Fail 'Not removing anything without a confirmation.' @('Add -Yes to uninstall without being asked.') -NoManualHelp }
        if (-not (Confirm-Step 'Remove it?')) { Say 'Cancelled. Nothing was changed.'; return }
        $exe = $UninstallString
        if ($exe -match '^"([^"]+)"') { $exe = $Matches[1] } else { $exe = ($exe -split ' /')[0] }
        try {
            $p = Start-Process -FilePath $exe -ArgumentList '/allusers', '/S' -Verb RunAs -Wait -PassThru
            if ($p.ExitCode -ne 0) { Fail "The uninstaller reported exit code $($p.ExitCode)." @() -NoManualHelp }
        } catch [System.ComponentModel.Win32Exception] {
            Fail 'Windows did not allow the uninstaller to run (was the administrator prompt cancelled?).' @() -NoManualHelp
        }
        Ok 'Removed Turtle Tracer.'
        return
    }

    # ----- pick the version -----------------------------------------------------
    if (-not $Version) {
        if (-not (Get-Versions)) {
            if ($Interactive) {
                Warn "Couldn't look up versions: $(if ($Script:ApiFailReason) { $Script:ApiFailReason } else { 'GitHub could not be reached.' })"
                Say 'You can still type a version number yourself.'
            }
        } elseif ($Script:ListSource -ne 'api' -and $Interactive) {
            Explain-LimitedLookup
        }
        if (-not $Channel -and $Interactive) {
            $label = if ($Script:StableVersion) { "latest stable release (v$($Script:StableVersion))" } else { 'latest stable release' }
            Say ''
            if ($InstalledVersion) {
                Say "Currently installed: v$InstalledVersion"
                try {
                    if ($Script:StableVersion -and ([version]($Script:StableVersion -replace '[-+].*$', '')) -lt ([version]($InstalledVersion -replace '[-+].*$', ''))) {
                        Warn "That is newer than the latest stable release (v$($Script:StableVersion)), so choosing stable would be a downgrade."
                    }
                } catch { }
            }
            Say 'Which version would you like to install?'
            Say "  Enter   the $label  [recommended]"
            if ($Script:PreVersion) { Say "  p       the newest pre-release (v$($Script:PreVersion))  [newer features, less tested]" }
            Say '  or type a version number, e.g. 2.2.1'
            $tries = 0
            while ($true) {
                $answer = Read-Host 'Version'
                $req = ConvertTo-VersionRequest $answer
                if ($req) { $Channel = $req.Channel; $Version = $req.Version; break }
                Warn "`"$answer`" isn't a version number. Press Enter for stable, p for pre-release, or type something like 2.3.0."
                $tries++
                if ($tries -ge 3) { Fail 'No valid version chosen.' @('Re-run with -Version X.Y.Z, -Stable or -Prerelease.') -NoManualHelp }
            }
        }
    }

    $VersionKind = 'requested'
    if (-not $Version) {
        if ($Channel -eq 'prerelease') {
            if ($Script:PreVersion) { $Version = $Script:PreVersion; $VersionKind = 'newest pre-release' }
            elseif ($Script:ListSource -eq 'api') {
                Warn "There is no pre-release newer than the latest stable (v$($Script:StableVersion)), so that's what will be installed."
                $Version = $Script:StableVersion; $VersionKind = 'latest stable'
            } elseif ($Script:ListSource -eq 'atom') {
                Explain-LimitedLookup
                $Version = $Script:AtomNewest; $VersionKind = 'newest published tag'
            } elseif ($Script:ListSource -eq 'redirect') {
                Explain-LimitedLookup
                if ($Interactive -and (Confirm-Step "Install the latest stable release (v$($Script:StableVersion)) instead?")) {
                    $Version = $Script:StableVersion; $VersionKind = "latest stable, because pre-releases can't be looked up"
                } else {
                    Fail "You asked for a pre-release, but I can't look up pre-releases right now." @(
                        "The latest stable release is v$($Script:StableVersion) (add -Stable to install that).",
                        "To get a specific pre-release, name it: -Version X.Y.Z (see https://github.com/$Repo/releases)")
                }
            } else { Fail-NoVersion }
        } else {
            if ($Script:StableVersion) { $Version = $Script:StableVersion; $VersionKind = 'latest stable' }
            elseif ($Script:ListSource -eq 'atom') {
                Explain-LimitedLookup
                if ($Interactive -and (Confirm-Step "Install v$($Script:AtomNewest) (the newest published version)?")) {
                    $Version = $Script:AtomNewest; $VersionKind = 'newest published tag'
                } else {
                    Fail "I couldn't confirm which release is the latest stable one." @("The newest tag is v$($Script:AtomNewest). To install it anyway: -Version $($Script:AtomNewest)")
                }
            } elseif ($Script:ListSource -eq 'api') { $Version = $Script:PreVersion; $VersionKind = 'newest pre-release (no stable release exists yet)' }
            else { Fail-NoVersion }
        }
    }

    # ----- find the file -----------------------------------------------------------
    $AssetName = "Turtle-Tracer-Setup-$Version.exe"
    $AssetUrl = "$GitHubUrl/$Repo/releases/download/v$Version/$AssetName"
    $Script:AssetSize = $null

    function Test-Asset([string]$url) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ Range = 'bytes=0-0'; 'User-Agent' = 'turtle-tracer-installer' }
            $range = [string]$r.Headers['Content-Range']
            if ($range -match '/(\d+)$') { $Script:AssetSize = [long]$Matches[1] }
            return 0
        } catch { return (Get-StatusCode $_) }
    }

    $code = Test-Asset $AssetUrl
    if ($code -ne 0) {
        if ($code -ne 404) {
            Fail "Couldn't reach the download for v$Version." @("Reason: $(if ($code -eq 0) { 'the network request failed' } else { "HTTP $code" })", 'Check your connection and try again.')
        }
        Info "v$Version doesn't have the file name I expected; looking at what it actually contains..."
        $names = @()
        $releaseErr = $null
        try {
            $rel = Invoke-RestMethod -Uri "$ApiUrl/repos/$Repo/releases/tags/v$Version" -Headers $ApiHeaders -UseBasicParsing
            $names = @($rel.assets | ForEach-Object { $_.name })
            $match = @($rel.assets | Where-Object { $_.name -match '\.exe$' -and $_.name -notmatch 'arm' } | Select-Object -First 1)
            if ($match.Count -gt 0 -and $match[0]) {
                $AssetName = $match[0].name
                $AssetUrl = $match[0].browser_download_url
                if ((Test-Asset $AssetUrl) -eq 0) { Ok "Found $AssetName"; $code = 0 }
            }
        } catch { $releaseErr = $_ }
        if ($code -ne 0) {
            $details = @()
            $reason = "Release v$Version has no Windows installer."
            if ($releaseErr) {
                if ((Get-StatusCode $releaseErr) -eq 404) {
                    $reason = "There is no release called v$Version."
                    try {
                        $recent = (Invoke-RestMethod -Uri "$ApiUrl/repos/$Repo/releases?per_page=8" -Headers $ApiHeaders -UseBasicParsing | ForEach-Object { $_.tag_name }) -join ' '
                        if ($recent) { $details += "Recent versions: $recent" }
                    } catch { }
                } else {
                    $reason = "Couldn't find the installer for v$Version, and couldn't ask GitHub why: $(Describe-Failure $releaseErr)"
                }
            } elseif ($names.Count -gt 0) {
                $details += "Files attached to v${Version}:"
                $details += ($names | ForEach-Object { "    - $_" })
            }
            Fail $reason $details
        }
    }

    # ----- plan -----------------------------------------------------------------
    $size = ''
    if ($Script:AssetSize) { $size = if ($Script:AssetSize -ge 1MB) { " ($([math]::Floor($Script:AssetSize / 1MB)) MB)" } else { " ($([math]::Ceiling($Script:AssetSize / 1KB)) KB)" } }
    $hostName = ($GitHubUrl -replace '^https?://', '')
    $installNote = 'C:\Program Files\Turtle Tracer (all users)'
    $downgrade = $false
    if ($InstalledVersion) {
        $cmp = 0
        try { $cmp = ([version]($Version -replace '[-+].*$', '')).CompareTo([version]($InstalledVersion -replace '[-+].*$', '')) } catch { }
        if ($InstalledVersion -eq $Version) { $installNote += " (v$Version is already installed; it will be reinstalled)" }
        elseif ($cmp -lt 0) { $downgrade = $true }
        else { $installNote += " (upgrades v$InstalledVersion)" }
    }
    Say ''
    Say "Here's what will happen"
    Kv 'System:' $system
    Kv 'Version:' "v$Version ($VersionKind)"
    Kv 'Download:' "$AssetName$size from $hostName/$Repo"
    Kv 'Install to:' $installNote
    if ($downgrade) { Kv '' "!! DOWNGRADE: replaces your newer v$InstalledVersion with the older v$Version" }
    Kv 'Admin rights:' 'yes - Windows will show an administrator (UAC) prompt; the installer is per-machine'
    if ($StoreInstalled) { Kv 'Note:' 'the Microsoft Store version is also installed; both can coexist, but you may want to remove one' }
    Say ''

    if ($DryRun) { Say 'Dry run: nothing was downloaded or installed.'; return }
    if (-not (Confirm-Step 'Continue?')) { Say 'Cancelled. Nothing was changed.'; return }

    # ----- download + verify + install -------------------------------------------
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("turtle-tracer-install-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        $file = Join-Path $tmp $AssetName

        Step "Downloading $AssetName"
        try {
            if ($Script:AssetSize) { Info "$(Format-Bytes $Script:AssetSize) to download" }
            Save-WithProgress $AssetUrl $file "Downloading $AssetName"
        } catch {
            Fail 'The download failed.' @("Reason: $(Describe-Failure $_)", "URL: $AssetUrl")
        }
        if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) { Fail 'The download was empty.' @("URL: $AssetUrl") }
        Ok "Downloaded $(Format-Bytes (Get-Item $file).Length)"

        Step 'Verifying the download'
        $verified = $false
        $why = ''
        $expectedGap = $false
        try {
            $sums = (Invoke-WebRequest -Uri "$GitHubUrl/$Repo/releases/download/v$Version/SHA256SUMS" -UseBasicParsing -Headers @{ 'User-Agent' = 'turtle-tracer-installer' }).Content
            if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
            $expected = $null
            foreach ($line in ($sums -split "`r?`n")) {
                if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$' -and $Matches[2] -eq $AssetName) { $expected = $Matches[1].ToLower(); break }
            }
            if (-not $expected) { $why = "the release's SHA256SUMS file doesn't list $AssetName" }
            else {
                $actual = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLower()
                if ($actual -eq $expected) { Ok "SHA-256 matches the checksum published with v$Version"; $verified = $true }
                else {
                    Fail 'Checksum mismatch - the download is corrupt or has been tampered with. Nothing was installed.' @("expected: $expected", "actual:   $actual", "Try again; if it keeps happening please report it at https://github.com/$Repo/issues") -NoManualHelp
                }
            }
        } catch {
            if ($_.Exception.Message -eq 'TT_ABORT') { throw }
            # Normal for releases made before checksums existed, so this isn't worth alarming anyone.
            if ((Get-StatusCode $_) -eq 404) { $expectedGap = $true; $why = "v$Version has no published checksum file (releases made before checksums were added don't)" }
            else { $why = "the checksum file couldn't be fetched: $(Describe-Failure $_)" }
        }
        if (-not $verified) {
            if ($RequireChecksum) { Fail "Can't verify the download and -RequireChecksum was given." @("Reason: $why") -NoManualHelp }
            if ($expectedGap) {
                Info "No checksum is published for v$Version, so I can't verify it (normal for releases before checksums were added). It came over HTTPS from github.com/$Repo."
            } else {
                Warn "Couldn't verify the download: $why."
                Warn "It still came over HTTPS directly from github.com/$Repo."
            }
        }

        if ($env:TT_SKIP_INSTALL) { Say 'TT_SKIP_INSTALL is set: stopping before running the installer.'; return }

        Step "Installing $AppName"
        Info 'Running the installer silently; approve the administrator prompt when Windows shows it.'
        try {
            $p = Start-Process -FilePath $file -ArgumentList '/S' -Verb RunAs -PassThru
            # Show that something is happening while the silent installer works. Windows may not let
            # an unelevated script poll an elevated process; if so, just wait.
            try {
                $ProgressPreference = 'Continue'
                $timer = [Diagnostics.Stopwatch]::StartNew()
                while (-not $p.HasExited) {
                    Write-Progress -Activity "Installing $AppName" -Status "Running the installer ($([int]$timer.Elapsed.TotalSeconds)s)..."
                    Start-Sleep -Milliseconds 250
                }
            } catch {
                Log "install progress unavailable: $_"
            } finally {
                Write-Progress -Activity "Installing $AppName" -Completed
            }
            $p.WaitForExit()
        } catch [System.ComponentModel.Win32Exception] {
            Fail 'Windows did not run the installer (was the administrator prompt cancelled?).' @('Nothing was changed. Run this again and choose Yes at the prompt.') -NoManualHelp
        }
        if ($p.ExitCode -ne 0) {
            Fail "The installer exited with code $($p.ExitCode)." @('If a previous copy was running, close Turtle Tracer and try again.')
        }
        Say ''
        Ok "Turtle Tracer v$Version is installed."
        Say 'Open it from the Start menu or the desktop shortcut.'
        Say "To remove it later:  `$env:TT_VERSION=''; & ([scriptblock]::Create((irm https://raw.githubusercontent.com/$Repo/main/install.ps1))) -Uninstall"
    } finally {
        Remove-Item -Recurse -Force -Path $tmp -ErrorAction SilentlyContinue
    }
}

# Run it. Our own abort marker is swallowed (the message was already shown); anything else is reported.
try {
    Install-TurtleTracer @args
} catch {
    if ($_.Exception.Message -ne 'TT_ABORT') {
        Write-Host "[x] Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "    A log may be at: $(Join-Path ([IO.Path]::GetTempPath()) 'turtle-tracer-install.log')"
        Write-Host '    Please report it at https://github.com/Mallen220/TurtleTracer/issues'
    }
}
