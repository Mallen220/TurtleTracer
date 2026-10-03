#!/usr/bin/env bash
# Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
#
# Turtle Tracer installer for macOS and Linux. (Windows users: see install.ps1.)
#
#   curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash -s -- --version 2.3.0
#
# Run with --help for all options. Nothing is changed on your system until the
# plan has been shown and confirmed (or --yes was passed).

set -euo pipefail

REPO="Mallen220/TurtleTracer"
APP_NAME="Turtle Tracer"
PKG_NAME="turtle-tracer"

# These can be overridden so the installer can be tested against a local fake
# release server (see tests/install). Normal users never set them.
GITHUB_URL="${TT_GITHUB_URL:-https://github.com}"
API_URL="${TT_API_URL:-https://api.github.com}"
RAW_URL="${TT_RAW_URL:-https://raw.githubusercontent.com}"

# Where macOS system-wide apps live. Only the tests change this.
SYSTEM_APPS="${TT_APPLICATIONS_DIR:-/Applications}"

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
REQ_VERSION=""        # exact version requested (flag, env or prompt)
CHANNEL=""            # "stable" | "prerelease" | "" (not chosen yet)
ASSUME_YES=0
DRY_RUN=0
ACTION="install"
USER_INSTALL=0
FORMAT_REQ=""
REQUIRE_CHECKSUM=0

INTERACTIVE=0         # 1 when we may ask questions
TTY_OK=0              # 1 when a terminal is available (questions or sudo password)
WORKDIR=""
LOG_FILE="/dev/null"
MOUNT_POINT=""
STEP_N=0
STEP_TOTAL=3

PLATFORM=""           # macos | linux | windows | wsl | unknown
ARCH=""               # x64 | arm64
DEB_ARCH=""
APPIMAGE_ARCH=""
SYSTEM_LABEL=""

STABLE_VERSION=""
PRE_VERSION=""
ATOM_NEWEST=""
LOOKUP_EXPLAINED=0
LIST_SOURCE=""        # api | redirect | atom | ""
API_FAIL_REASON=""
HTTP_CODE=""
REPLY_TEXT=""

VERSION=""
VERSION_KIND=""
FORMAT=""
ASSET_NAME=""
ASSET_URL=""
ASSET_SIZE=""
DOWNLOAD_PATH=""

NEED_ADMIN=0
ADMIN_REASON=""
DEST_DIR=""
INSTALL_TARGET=""
INSTALLED_VERSION=""
EXISTING_DIR=""
NO_SANDBOX_FLAG=0
FUSE_OK=1

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; PURPLE=""; BOLD=""; NC=""
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
    BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; PURPLE=$'\033[0;35m'
    BOLD=$'\033[1m'; NC=$'\033[0m'
fi

G_OK="+"; G_ERR="x"; G_WARN="!"; G_INFO="i"
case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
    *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) G_OK="✓"; G_ERR="✗"; G_WARN="!"; G_INFO="i" ;;
esac

log() { printf '%s\n' "$*" >>"$LOG_FILE" 2>/dev/null || true; }
say() { printf '%s\n' "$*"; log "$*"; }
ok() { printf '%s[%s]%s %s\n' "$GREEN" "$G_OK" "$NC" "$*"; log "[ok] $*"; }
info() { printf '%s[%s]%s %s\n' "$BLUE" "$G_INFO" "$NC" "$*"; log "[info] $*"; }
warn() { printf '%s[%s]%s %s\n' "$YELLOW" "$G_WARN" "$NC" "$*"; log "[warn] $*"; }
kv() { printf '  %-14s %s\n' "$1" "$2"; log "  $1 $2"; }
step() {
    STEP_N=$((STEP_N + 1))
    printf '\n%s[%d/%d]%s %s\n' "$CYAN" "$STEP_N" "$STEP_TOTAL" "$NC" "$1"
    log "[step $STEP_N/$STEP_TOTAL] $1"
}

# die MESSAGE [DETAIL...] - print an error and exit.
die() {
    local msg=$1
    shift
    printf '%s[%s]%s %s\n' "$RED" "$G_ERR" "$NC" "$msg" >&2
    log "[error] $msg"
    local line
    for line in "$@"; do
        printf '    %s\n' "$line" >&2
        log "    $line"
    done
    exit 1
}

# fail MESSAGE [DETAIL...] - like die, but also explains how to install by hand.
fail() {
    local msg=$1
    shift
    printf '%s[%s]%s %s\n' "$RED" "$G_ERR" "$NC" "$msg" >&2
    log "[error] $msg"
    local line
    for line in "$@"; do
        printf '    %s\n' "$line" >&2
        log "    $line"
    done
    print_manual_help >&2
    exit 1
}

print_manual_help() {
    printf '\n%s\n' "You can also install Turtle Tracer by hand:"
    printf '  1. Open https://github.com/%s/releases\n' "$REPO"
    case "$PLATFORM" in
        macos) printf '  2. Download the .dmg for your Mac (%s), open it and drag Turtle Tracer into Applications.\n' "${ARCH:-your architecture}" ;;
        linux) printf '  2. Download the .deb (Debian/Ubuntu) or the .AppImage (everything else) for %s.\n' "${ARCH:-your architecture}" ;;
        *) printf '  2. Download the file that matches your system.\n' ;;
    esac
    printf '%s\n' "Or skip the install and use the browser version: https://live.turtletracer.com"
}

print_logo() {
    printf '%s' "$PURPLE"
    printf '%s\n' '╔══════════════════════════════════════╗'
    printf '%s\n' '║    Turtle Tracer installer           ║'
    printf '%s\n' '╚══════════════════════════════════════╝'
    printf '%s' "$NC"
}

usage() {
    cat <<'EOF'
Turtle Tracer installer for macOS and Linux (Windows: install.ps1).

Usage:
  curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash -s -- [options]
  ./install.sh [options]

With no options the installer asks which version you want and shows a plan
before changing anything.

Options:
  -v, --version X     Install a specific version, e.g. --version 2.3.0.
                      "stable" and "prerelease" are accepted too.
      --stable        Install the newest stable release.
      --prerelease    Install the newest pre-release.
  -y, --yes           Don't ask any questions (use the defaults / your flags).
      --dry-run       Show what would happen, change nothing.
      --user          macOS: install into ~/Applications (no admin password).
      --format TYPE   Linux: force "deb" or "appimage".
      --require-checksum
                      Refuse to install if the download can't be verified.
      --uninstall     Remove Turtle Tracer (your projects and settings stay).
  -h, --help          Show this help.

Environment:
  TT_VERSION          Same as --version (put it before bash:  curl ... | TT_VERSION=2.3.0 bash)
  TT_CHANNEL          "stable" or "prerelease"
  GITHUB_TOKEN        Optional; raises GitHub's rate limit if you hit it.
  NO_COLOR            Turn off colors.
EOF
}

die_usage() {
    printf '%s[%s]%s %s\n\n' "$RED" "$G_ERR" "$NC" "$1" >&2
    usage >&2
    exit 2
}

# ---------------------------------------------------------------------------
# Exit handling and prompts
# ---------------------------------------------------------------------------
cleanup() {
    local rc=$?
    trap - EXIT INT TERM
    if [ -n "$MOUNT_POINT" ] && [ -d "$MOUNT_POINT" ]; then
        hdiutil detach "$MOUNT_POINT" -quiet -force >/dev/null 2>&1 || true
    fi
    if [ "$rc" -ne 0 ] && [ -n "$WORKDIR" ] && [ -s "$LOG_FILE" ]; then
        local saved="$HOME/turtle-tracer-install.log"
        if cp "$LOG_FILE" "$saved" 2>/dev/null; then
            printf '\n%s\n' "Nothing is left half-installed. A detailed log was saved to: $saved" >&2
            printf '%s\n' "If you need help, attach it to an issue at https://github.com/$REPO/issues" >&2
        fi
    fi
    if [ -n "$WORKDIR" ]; then
        rm -rf "$WORKDIR"
    fi
    exit "$rc"
}

on_signal() {
    printf '\n%s\n' "Cancelled." >&2
    exit 130
}

setup_workdir() {
    WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/turtle-tracer-install.XXXXXX") || die "Couldn't create a temporary directory."
    mkdir -p "$WORKDIR/dl"
    chmod 755 "$WORKDIR" "$WORKDIR/dl"
    LOG_FILE="$WORKDIR/install.log"
    : >"$LOG_FILE"
    trap cleanup EXIT
    trap on_signal INT TERM
    log "turtle-tracer installer started $(date 2>/dev/null || true)"
    log "args: $*"
}

detect_interactivity() {
    TTY_OK=0
    INTERACTIVE=0
    if [ -z "${TT_NONINTERACTIVE:-}" ] && [ -r /dev/tty ] && { : </dev/tty; } 2>/dev/null; then
        TTY_OK=1
        if [ "$ASSUME_YES" -eq 0 ]; then
            INTERACTIVE=1
        fi
    fi
}

# Read a line from the terminal (works even when the script itself arrives on stdin).
prompt() {
    printf '%s' "$1" >/dev/tty
    REPLY_TEXT=""
    IFS= read -r REPLY_TEXT </dev/tty || REPLY_TEXT=""
}

# confirm QUESTION - default yes. Non-interactive runs always answer yes.
confirm() {
    if [ "$INTERACTIVE" -ne 1 ]; then
        return 0
    fi
    while :; do
        prompt "$1 [Y/n] "
        case "$REPLY_TEXT" in
            "" | [Yy] | [Yy][Ee][Ss]) return 0 ;;
            [Nn] | [Nn][Oo]) return 1 ;;
        esac
    done
}

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
has() { command -v "$1" >/dev/null 2>&1; }

# with_spinner MESSAGE COMMAND... - run a command that prints nothing useful and may take a
# while. On a terminal it shows a spinner with elapsed seconds; elsewhere it prints one line.
# The command's output goes to the log. Returns the command's exit status.
with_spinner() {
    local msg=$1 pid i=0 start rc=0 frames='|/-\'
    shift
    if [ ! -t 1 ] || [ -n "${TT_NO_SPINNER:-}" ]; then
        info "$msg"
        "$@" >>"$LOG_FILE" 2>&1 || rc=$?
        return "$rc"
    fi
    start=$SECONDS
    "$@" >>"$LOG_FILE" 2>&1 &
    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
        printf '\r%s%s%s %s (%ss)' "$CYAN" "${frames:$((i % 4)):1}" "$NC" "$msg" "$((SECONDS - start))"
        i=$((i + 1))
        sleep 0.2 2>/dev/null || sleep 1
    done
    wait "$pid" || rc=$?
    printf '\r\033[K'
    if [ "$rc" -eq 0 ]; then ok "$msg ($((SECONDS - start))s)"; fi
    return "$rc"
}

# True when $1 is an older version than $2 (numeric x.y.z comparison; suffixes ignored).
version_lt() {
    local a=${1%%[-+]*} b=${2%%[-+]*} first
    if [ "$a" = "$b" ]; then
        return 1
    fi
    first=$(printf '%s\n%s\n' "$a" "$b" | sort -t. -k1,1n -k2,2n -k3,3n | sed -n '1p')
    [ "$first" = "$a" ]
}

format_bytes() {
    local n=$1
    case "$n" in
        "" | *[!0-9]*) return 0 ;;
    esac
    if [ "$n" -ge 1048576 ]; then
        printf '%s MB' "$((n / 1048576))"
    else
        printf '%s KB' "$(((n + 1023) / 1024))"
    fi
}

human_size() { format_bytes "$ASSET_SIZE"; }

# Interpret a version request: "", "latest", "stable", "p", "prerelease", "2.3.0", "v2.3.0".
set_version_request() {
    local raw lower
    raw=$(printf '%s' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    lower=$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')
    case "$lower" in
        "" | latest | stable | s)
            CHANNEL="stable"
            REQ_VERSION=""
            ;;
        p | pre | prerelease | pre-release | beta)
            CHANNEL="prerelease"
            REQ_VERSION=""
            ;;
        *)
            raw=${raw#v}
            raw=${raw#V}
            if printf '%s' "$raw" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-+.][0-9A-Za-z.+-]+)?$'; then
                REQ_VERSION="$raw"
                CHANNEL=""
            else
                return 1
            fi
            ;;
    esac
    return 0
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            -v | --version)
                [ $# -ge 2 ] || die_usage "$1 needs a value, e.g. --version 2.3.0"
                set_version_request "$2" || die_usage "\"$2\" is not a version number (expected something like 2.3.0)."
                shift 2
                ;;
            --version=*)
                set_version_request "${1#*=}" || die_usage "\"${1#*=}\" is not a version number (expected something like 2.3.0)."
                shift
                ;;
            --stable) CHANNEL="stable"; REQ_VERSION=""; shift ;;
            --prerelease | --pre-release | --pre) CHANNEL="prerelease"; REQ_VERSION=""; shift ;;
            -y | --yes) ASSUME_YES=1; shift ;;
            --dry-run) DRY_RUN=1; shift ;;
            --user) USER_INSTALL=1; shift ;;
            --require-checksum) REQUIRE_CHECKSUM=1; shift ;;
            --uninstall) ACTION="uninstall"; shift ;;
            --format)
                [ $# -ge 2 ] || die_usage "--format needs a value: deb or appimage"
                FORMAT_REQ=$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')
                shift 2
                ;;
            --format=*)
                FORMAT_REQ=$(printf '%s' "${1#*=}" | tr '[:upper:]' '[:lower:]')
                shift
                ;;
            -h | --help) usage; exit 0 ;;
            *) die_usage "Unknown option: $1" ;;
        esac
    done
    case "$FORMAT_REQ" in
        "" | deb | appimage) ;;
        *) die_usage "--format must be \"deb\" or \"appimage\"." ;;
    esac
}

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------
detect_platform() {
    local os machine
    os=$(uname -s 2>/dev/null || echo unknown)
    machine=$(uname -m 2>/dev/null || echo unknown)

    case "$os" in
        Darwin) PLATFORM="macos" ;;
        Linux)
            PLATFORM="linux"
            if [ -r /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null && [ -z "${TT_ALLOW_WSL:-}" ]; then
                PLATFORM="wsl"
            fi
            ;;
        CYGWIN* | MINGW* | MSYS*) PLATFORM="windows" ;;
        *) PLATFORM="unknown" ;;
    esac

    case "$machine" in
        x86_64 | amd64) ARCH="x64"; DEB_ARCH="amd64"; APPIMAGE_ARCH="x86_64" ;;
        arm64 | aarch64) ARCH="arm64"; DEB_ARCH="arm64"; APPIMAGE_ARCH="arm64" ;;
        *) ARCH="" ;;
    esac

    # An Intel shell running under Rosetta on an Apple Silicon Mac should still get the native build.
    if [ "$PLATFORM" = "macos" ] && [ "$ARCH" = "x64" ]; then
        if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
            ARCH="arm64"
        fi
    fi

    case "$PLATFORM" in
        macos)
            local ver chip="Intel"
            ver=$(sw_vers -productVersion 2>/dev/null || echo "")
            if [ "$ARCH" = "arm64" ]; then chip="Apple Silicon"; fi
            SYSTEM_LABEL="macOS ${ver} · ${chip}"
            ;;
        linux)
            local distro="Linux"
            if [ -r /etc/os-release ]; then
                # shellcheck disable=SC1091
                distro=$( (. /etc/os-release; printf '%s' "${PRETTY_NAME:-Linux}") 2>/dev/null || echo Linux)
            fi
            SYSTEM_LABEL="${distro} · ${machine}"
            ;;
        *) SYSTEM_LABEL="$os · $machine" ;;
    esac
}

windows_command() {
    local cmd="irm ${RAW_URL}/${REPO}/main/install.ps1 | iex"
    if [ -n "$REQ_VERSION" ]; then
        cmd="\$env:TT_VERSION='${REQ_VERSION}'; ${cmd}"
    elif [ -n "$CHANNEL" ]; then
        cmd="\$env:TT_CHANNEL='${CHANNEL}'; ${cmd}"
    fi
    printf '%s' "$cmd"
}

handle_windows() {
    local cmd
    cmd=$(windows_command)
    say ""
    say "This script installs Turtle Tracer on macOS and Linux."
    say "On Windows, run this in PowerShell instead:"
    say ""
    say "    $cmd"
    say ""
    say "Or install from the Microsoft Store: https://apps.microsoft.com/detail/9nk0b4fdj3zw"
    if [ "$PLATFORM" = "windows" ] && has powershell.exe && [ "$INTERACTIVE" -eq 1 ]; then
        say ""
        if confirm "Run that PowerShell installer now?"; then
            exec powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$cmd"
        fi
    fi
}

handle_wsl() {
    say ""
    warn "You're running inside WSL (Windows Subsystem for Linux)."
    say "Turtle Tracer is a desktop app, so you most likely want the Windows version."
    say "Open PowerShell (not this terminal) and run:"
    say ""
    say "    $(windows_command)"
    say ""
    say "If you really want the Linux build inside WSL (needs WSLg), re-run with TT_ALLOW_WSL=1."
}

# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------
proto_flags() {
    case "$1" in
        https://*) printf '%s' "--proto =https --proto-redir =https" ;;
        *) printf '%s' "" ;;
    esac
}

# fetch URL OUTFILE - download to a file, set HTTP_CODE (000 = couldn't connect).
# With SHOW_PROGRESS=1 on a terminal, curl's progress bar (which it draws on stderr) is left
# visible instead of being sent to the log.
fetch() {
    local url=$1 out=$2 proto
    proto=$(proto_flags "$url")
    : >"$WORKDIR/headers"
    if [ "${SHOW_PROGRESS:-0}" = 1 ] && [ -t 2 ]; then
        # shellcheck disable=SC2086
        HTTP_CODE=$(curl $proto --progress-bar -L --retry 2 --retry-delay 1 --connect-timeout 15 \
            -D "$WORKDIR/headers" -o "$out" -w '%{http_code}' "$url") || HTTP_CODE="000"
    else
        # shellcheck disable=SC2086
        HTTP_CODE=$(curl $proto -sS -L --retry 2 --retry-delay 1 --connect-timeout 15 \
            -D "$WORKDIR/headers" -o "$out" -w '%{http_code}' "$url" 2>>"$LOG_FILE") || HTTP_CODE="000"
    fi
    log "GET $url -> $HTTP_CODE"
}

# fetch_api URL OUTFILE - same, with the optional token and API headers.
fetch_api() {
    local url=$1 out=$2 proto
    proto=$(proto_flags "$url")
    : >"$WORKDIR/headers"
    if [ -n "${GITHUB_TOKEN:-}" ]; then
        # shellcheck disable=SC2086
        HTTP_CODE=$(curl $proto -sS --retry 2 --retry-delay 1 --connect-timeout 15 \
            -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $GITHUB_TOKEN" \
            -D "$WORKDIR/headers" -o "$out" -w '%{http_code}' "$url" 2>>"$LOG_FILE") || HTTP_CODE="000"
    else
        # shellcheck disable=SC2086
        HTTP_CODE=$(curl $proto -sS --retry 2 --retry-delay 1 --connect-timeout 15 \
            -H "Accept: application/vnd.github+json" \
            -D "$WORKDIR/headers" -o "$out" -w '%{http_code}' "$url" 2>>"$LOG_FILE") || HTTP_CODE="000"
    fi
    log "GET $url -> $HTTP_CODE"
}

# Value of the last response header called $1 (whole value, so "bytes 0-0/123" stays intact).
header_value() {
    tr -d '\r' <"$WORKDIR/headers" | awk -v h="$1" 'BEGIN{h=tolower(h)} {n=index($0, ":"); if (n > 0 && tolower(substr($0, 1, n - 1)) == h) {v=substr($0, n + 1); sub(/^[ \t]+/, "", v)}} END{print v}'
}

format_epoch() {
    date -d "@$1" '+%H:%M' 2>/dev/null || date -r "$1" '+%H:%M' 2>/dev/null || printf '%s' "later"
}

# Explain, in plain words, why the last API request failed.
describe_failure() {
    case "$HTTP_CODE" in
        000) API_FAIL_REASON="couldn't reach GitHub (is the network, a proxy or a firewall blocking it?)" ;;
        403 | 429)
            if [ "$(header_value x-ratelimit-remaining)" = "0" ]; then
                local reset
                reset=$(header_value x-ratelimit-reset)
                API_FAIL_REASON="GitHub's anonymous rate limit was reached (it resets around $(format_epoch "$reset")). Setting GITHUB_TOKEN raises the limit."
            else
                API_FAIL_REASON="GitHub refused the request (HTTP $HTTP_CODE)."
            fi
            ;;
        404) API_FAIL_REASON="GitHub says that doesn't exist (HTTP 404)." ;;
        5*) API_FAIL_REASON="GitHub is having problems right now (HTTP $HTTP_CODE)." ;;
        *) API_FAIL_REASON="unexpected response from GitHub (HTTP $HTTP_CODE)." ;;
    esac
}

# ---------------------------------------------------------------------------
# Finding versions
# ---------------------------------------------------------------------------
# Print "TAG stable|pre" for each published release in a GitHub release-list file, newest first.
# Reads only the top-level tag_name/draft/prerelease keys in order, so it works for pretty or
# minified JSON and ignores look-alike keys inside nested objects.
parse_release_list() {
    grep -oE '"(tag_name|draft|prerelease)": *("[^"]*"|true|false)' "$1" | awk '
        /"tag_name"/  { split($0, a, "\""); tag = a[4]; draft = 0; next }
        /"draft"/     { draft = ($0 ~ /true/); next }
        /"prerelease"/ { if (tag != "" && !draft) print tag, ($0 ~ /true/ ? "pre" : "stable"); tag = "" }
    ' || true
}

# Newest stable and pre-release from GitHub's release list.
load_release_list() {
    local file="$WORKDIR/releases.json" lines tag kind v
    fetch_api "$API_URL/repos/$REPO/releases?per_page=30" "$file"
    if [ "$HTTP_CODE" != "200" ]; then
        describe_failure
        return 1
    fi
    lines=$(parse_release_list "$file")
    STABLE_VERSION=""
    PRE_VERSION=""
    while read -r tag kind; do
        [ -n "$tag" ] || continue
        v=${tag#v}
        if [ "$kind" = "stable" ]; then
            if [ -z "$STABLE_VERSION" ]; then STABLE_VERSION=$v; fi
        elif [ -z "$STABLE_VERSION" ] && [ -z "$PRE_VERSION" ]; then
            PRE_VERSION=$v
        fi
    done <<LISTING
$lines
LISTING
    if [ -z "$STABLE_VERSION" ] && [ -z "$PRE_VERSION" ]; then
        API_FAIL_REASON="GitHub's release list was empty or in an unexpected format."
        return 1
    fi
    return 0
}

# Stable version via the /releases/latest redirect (no API, so no rate limit).
latest_from_redirect() {
    local loc proto url="$GITHUB_URL/$REPO/releases/latest"
    proto=$(proto_flags "$url")
    # shellcheck disable=SC2086
    loc=$(curl $proto -sSI --connect-timeout 15 "$url" 2>>"$LOG_FILE" | tr -d '\r' | awk 'tolower($1)=="location:" {print $2}' | tail -n 1) || loc=""
    case "$loc" in
        */releases/tag/*)
            STABLE_VERSION=${loc##*/releases/tag/}
            STABLE_VERSION=${STABLE_VERSION#v}
            return 0
            ;;
    esac
    return 1
}

# Newest tag from the public Atom feed (also not rate limited, but it can't say
# whether a release is a pre-release).
latest_from_atom() {
    local file="$WORKDIR/releases.atom" tag
    fetch "$GITHUB_URL/$REPO/releases.atom" "$file"
    [ "$HTTP_CODE" = "200" ] || return 1
    tag=$(grep -oE '/releases/tag/[^"<]+' "$file" | sed -n '1p' | sed 's|.*/releases/tag/||') || tag=""
    [ -n "$tag" ] || return 1
    ATOM_NEWEST=${tag#v}
    return 0
}

gather_versions() {
    STABLE_VERSION=""; PRE_VERSION=""; ATOM_NEWEST=""; LIST_SOURCE=""
    info "Checking which versions are available..."
    if load_release_list; then
        LIST_SOURCE="api"
        return 0
    fi
    log "release list failed: $API_FAIL_REASON"
    if latest_from_redirect; then
        LIST_SOURCE="redirect"
        return 0
    fi
    if latest_from_atom; then
        LIST_SOURCE="atom"
        return 0
    fi
    LIST_SOURCE=""
    return 1
}

explain_limited_lookup() {
    if [ "$LOOKUP_EXPLAINED" -eq 1 ]; then return 0; fi
    LOOKUP_EXPLAINED=1
    case "$LIST_SOURCE" in
        redirect) warn "Couldn't read GitHub's full release list: $API_FAIL_REASON" ; warn "Showing the latest stable release only; pre-releases can't be detected right now (use --version to pick one)." ;;
        atom) warn "Couldn't read GitHub's release list: $API_FAIL_REASON" ; warn "The newest published tag is v$ATOM_NEWEST, but I can't tell whether it is stable or a pre-release." ;;
    esac
}

# Sets INSTALLED_VERSION to what's installed now ("" if nothing or unknown).
detect_installed_version() {
    INSTALLED_VERSION=""
    if [ "$PLATFORM" = "macos" ]; then
        macos_installed || true
    elif has dpkg-query; then
        INSTALLED_VERSION=$(dpkg-query -W -f='${Version}' "$PKG_NAME" 2>/dev/null || true)
    fi
}

ask_version() {
    local tries=0 stable_label="latest stable release"
    if [ -n "$STABLE_VERSION" ]; then stable_label="latest stable release (v$STABLE_VERSION)"; fi
    say ""
    if [ -n "$INSTALLED_VERSION" ]; then
        say "Currently installed: v$INSTALLED_VERSION"
        if [ -n "$STABLE_VERSION" ] && version_lt "$STABLE_VERSION" "$INSTALLED_VERSION"; then
            warn "That is newer than the latest stable release (v$STABLE_VERSION), so choosing stable would be a downgrade."
        fi
    fi
    say "${BOLD}Which version would you like to install?${NC}"
    say "  Enter   the $stable_label  [recommended]"
    if [ -n "$PRE_VERSION" ]; then
        say "  p       the newest pre-release (v$PRE_VERSION)  [newer features, less tested]"
    fi
    say "  or type a version number, e.g. 2.2.1"
    while :; do
        prompt "Version: "
        if set_version_request "$REPLY_TEXT"; then
            return 0
        fi
        warn "\"$REPLY_TEXT\" isn't a version number. Press Enter for stable, p for pre-release, or type something like 2.3.0."
        tries=$((tries + 1))
        if [ "$tries" -ge 3 ]; then
            die "No valid version chosen." "Re-run with --version X.Y.Z, --stable or --prerelease."
        fi
    done
}

fail_no_version() {
    fail "Couldn't work out which version to install." \
        "Reason: ${API_FAIL_REASON:-GitHub could not be reached.}" \
        "Try again in a minute, check your network/proxy, or name a version yourself:" \
        "    curl -fsSL $RAW_URL/$REPO/main/install.sh | bash -s -- --version X.Y.Z" \
        "(Versions are listed at https://github.com/$REPO/releases)"
}

choose_version() {
    if [ -n "$REQ_VERSION" ]; then
        VERSION=$REQ_VERSION
        VERSION_KIND="requested"
        return 0
    fi

    if [ "$CHANNEL" = "prerelease" ]; then
        if [ -n "$PRE_VERSION" ]; then
            VERSION=$PRE_VERSION
            VERSION_KIND="newest pre-release"
        elif [ "$LIST_SOURCE" = "api" ]; then
            warn "There is no pre-release newer than the latest stable (v$STABLE_VERSION), so that's what will be installed."
            VERSION=$STABLE_VERSION
            VERSION_KIND="latest stable"
        elif [ "$LIST_SOURCE" = "atom" ]; then
            explain_limited_lookup
            VERSION=$ATOM_NEWEST
            VERSION_KIND="newest published tag"
        elif [ "$LIST_SOURCE" = "redirect" ]; then
            explain_limited_lookup
            if [ "$INTERACTIVE" -eq 1 ] && confirm "Install the latest stable release (v$STABLE_VERSION) instead?"; then
                VERSION=$STABLE_VERSION
                VERSION_KIND="latest stable, because pre-releases can't be looked up"
            else
                fail "You asked for a pre-release, but I can't look up pre-releases right now." \
                    "The latest stable release is v$STABLE_VERSION (add --stable to install that)." \
                    "To get a specific pre-release, name it: --version X.Y.Z (see https://github.com/$REPO/releases)"
            fi
        else
            fail_no_version
        fi
        return 0
    fi

    # stable (the default)
    if [ -n "$STABLE_VERSION" ]; then
        VERSION=$STABLE_VERSION
        VERSION_KIND="latest stable"
    elif [ "$LIST_SOURCE" = "atom" ]; then
        explain_limited_lookup
        if [ "$INTERACTIVE" -eq 1 ] && confirm "Install v$ATOM_NEWEST (the newest published version)?"; then
            VERSION=$ATOM_NEWEST
            VERSION_KIND="newest published tag"
        else
            fail "I couldn't confirm which release is the latest stable one." \
                "The newest tag is v$ATOM_NEWEST. To install it anyway: re-run with --version $ATOM_NEWEST"
        fi
    elif [ "$LIST_SOURCE" = "api" ]; then
        # Only pre-releases exist.
        VERSION=$PRE_VERSION
        VERSION_KIND="newest pre-release (no stable release exists yet)"
    else
        fail_no_version
    fi
}

# ---------------------------------------------------------------------------
# Finding the right file for this machine
# ---------------------------------------------------------------------------
asset_name_for() {
    case "$1" in
        dmg) printf 'Turtle-Tracer-%s-%s.dmg' "$VERSION" "$ARCH" ;;
        deb) printf 'Turtle-Tracer-%s-%s.deb' "$VERSION" "$DEB_ARCH" ;;
        appimage) printf 'Turtle-Tracer-%s-%s.AppImage' "$VERSION" "$APPIMAGE_ARCH" ;;
    esac
}

release_download_url() {
    printf '%s/%s/releases/download/v%s/%s' "$GITHUB_URL" "$REPO" "$VERSION" "$1"
}

# Does the file exist? Sets ASSET_SIZE when GitHub reports it. Uses a 1-byte ranged GET
# rather than HEAD because GitHub's CDN links are signed for GET.
probe_url() {
    local url=$1 proto
    proto=$(proto_flags "$url")
    : >"$WORKDIR/headers"
    # shellcheck disable=SC2086
    HTTP_CODE=$(curl $proto -sSL -r 0-0 --retry 2 --retry-delay 1 --connect-timeout 15 \
        -D "$WORKDIR/headers" -o /dev/null -w '%{http_code}' "$url" 2>>"$LOG_FILE") || HTTP_CODE="000"
    log "probe $url -> $HTTP_CODE"
    ASSET_SIZE=""
    case "$HTTP_CODE" in
        200 | 206)
            ASSET_SIZE=$(header_value content-range | sed 's|.*/||')
            case "$ASSET_SIZE" in "" | *[!0-9]*) ASSET_SIZE=$(header_value content-length) ;; esac
            HTTP_CODE="200"
            return 0
            ;;
    esac
    return 1
}

# Last resort: ask GitHub which assets this release really has and pick the best
# match by extension and architecture (covers older releases with other names).
fuzzy_asset_url() {
    local ext_re=$1 file="$WORKDIR/release.json" urls pos neg match=""
    fetch_api "$API_URL/repos/$REPO/releases/tags/v$VERSION" "$file"
    if [ "$HTTP_CODE" != "200" ]; then
        describe_failure
        return 1
    fi
    urls=$(grep -o '"browser_download_url": *"[^"]*"' "$file" | cut -d'"' -f4) || urls=""
    if [ "$ARCH" = "arm64" ]; then
        pos='arm64|aarch64'; neg='$^'
    else
        pos='x64|x86_64|amd64|x86-64|intel'; neg='arm|aarch'
    fi
    match=$(printf '%s\n' "$urls" | grep -Ei "$ext_re" | grep -Ei "$pos" | sed -n '1p') || match=""
    if [ -z "$match" ]; then
        match=$(printf '%s\n' "$urls" | grep -Ei "$ext_re" | grep -Eiv "$neg" | sed -n '1p') || match=""
    fi
    [ -n "$match" ] || return 1
    ASSET_URL=$match
    ASSET_NAME=$(basename "$match")
    return 0
}

list_release_assets() {
    local file="$WORKDIR/release.json"
    if [ -s "$file" ]; then
        grep -o '"browser_download_url": *"[^"]*"' "$file" | cut -d'"' -f4 | while read -r u; do printf '    - %s\n' "$(basename "$u")"; done
    fi
}

# One line listing recent versions, to help when the requested one doesn't exist.
recent_versions_line() {
    local file="$WORKDIR/recent.json" recent
    fetch_api "$API_URL/repos/$REPO/releases?per_page=8" "$file"
    [ "$HTTP_CODE" = "200" ] || return 0
    recent=$(parse_release_list "$file" | awk '{printf "%s%s ", $1, ($2 == "pre" ? " (pre-release)" : "")}')
    if [ -n "$recent" ]; then
        printf 'Recent versions: %s' "$recent"
    fi
}

resolve_asset() {
    local exts fmt found=0
    case "$PLATFORM" in
        macos) exts="dmg" ;;
        linux)
            choose_linux_format
            if [ "$FORMAT" = "deb" ]; then exts="deb appimage"; else exts="appimage deb"; fi
            if [ -n "$FORMAT_REQ" ]; then exts="$FORMAT"; fi
            ;;
    esac

    for fmt in $exts; do
        ASSET_NAME=$(asset_name_for "$fmt")
        ASSET_URL=$(release_download_url "$ASSET_NAME")
        if probe_url "$ASSET_URL"; then
            FORMAT=$fmt
            found=1
            break
        fi
        if [ "$HTTP_CODE" != "404" ]; then
            break
        fi
    done

    if [ "$found" -eq 1 ]; then
        return 0
    fi

    # The expected name wasn't there. Say why, then try matching by what the release really contains.
    if [ "$HTTP_CODE" = "000" ] || { [ "$HTTP_CODE" != "404" ] && [ "$HTTP_CODE" != "200" ]; }; then
        describe_failure
        fail "Couldn't reach the download for v$VERSION." "Reason: $API_FAIL_REASON" \
            "Check your connection and try again."
    fi

    info "v$VERSION doesn't have the file name I expected; looking at what it actually contains..."
    local ext_re
    case "$PLATFORM" in
        macos) ext_re='\.dmg$' ;;
        linux) if [ "$FORMAT" = "deb" ]; then ext_re='\.deb$'; else ext_re='\.appimage$'; fi ;;
    esac
    if fuzzy_asset_url "$ext_re" && probe_url "$ASSET_URL"; then
        ok "Found $ASSET_NAME"
        return 0
    fi

    local reason="Release v$VERSION has no build for this system ($SYSTEM_LABEL)."
    if [ "$HTTP_CODE" = "404" ]; then
        # Distinguish "no such release" from "release exists, wrong files".
        fetch_api "$API_URL/repos/$REPO/releases/tags/v$VERSION" "$WORKDIR/release.json"
        if [ "$HTTP_CODE" = "404" ]; then
            reason="There is no release called v$VERSION."
        elif [ "$HTTP_CODE" != "200" ]; then
            describe_failure
            reason="Couldn't find a matching file for v$VERSION, and couldn't ask GitHub why: $API_FAIL_REASON"
        fi
    fi
    local details=() line recent
    if [ "$HTTP_CODE" = "200" ] && [ -s "$WORKDIR/release.json" ]; then
        details+=("Files attached to v$VERSION:")
        while IFS= read -r line; do
            if [ -n "$line" ]; then details+=("$line"); fi
        done <<LISTING
$(list_release_assets)
LISTING
    else
        recent=$(recent_versions_line)
        if [ -n "$recent" ]; then details+=("$recent"); fi
    fi
    fail "$reason" ${details[@]+"${details[@]}"}
}

# ---------------------------------------------------------------------------
# Plan, privileges, download, verification
# ---------------------------------------------------------------------------
priv() {
    if [ "$NEED_ADMIN" -eq 1 ] && [ "$(id -u)" -ne 0 ]; then
        sudo "$@"
    else
        "$@"
    fi
}

prepare_privileges() {
    if [ "$NEED_ADMIN" -ne 1 ] || [ "$(id -u)" -eq 0 ]; then
        return 0
    fi
    if ! has sudo; then
        fail "Administrator rights are needed ($ADMIN_REASON) but sudo isn't available." \
            "Run this installer as root, or on macOS add --user to install into your home folder."
    fi
    if [ "$TTY_OK" -eq 1 ]; then
        info "Your password is needed to $ADMIN_REASON. It is typed into sudo directly; this script never sees it."
        # shellcheck disable=SC2024  # sudo reads the password from /dev/tty itself
        sudo -v </dev/tty || die "Couldn't get administrator rights." "On macOS you can add --user to install into ~/Applications instead."
    elif ! sudo -n true 2>/dev/null; then
        die "Administrator rights are needed ($ADMIN_REASON) but there is no terminal to ask for a password." \
            "Run the installer from a terminal, or on macOS add --user."
    fi
}

download_asset() {
    step "Downloading $ASSET_NAME"
    DOWNLOAD_PATH="$WORKDIR/dl/$ASSET_NAME"
    if [ -n "$ASSET_SIZE" ]; then info "$(format_bytes "$ASSET_SIZE") to download"; fi
    SHOW_PROGRESS=1 fetch "$ASSET_URL" "$DOWNLOAD_PATH"
    if [ "$HTTP_CODE" != "200" ] || [ ! -s "$DOWNLOAD_PATH" ]; then
        describe_failure
        fail "The download failed." "Reason: $API_FAIL_REASON" "URL: $ASSET_URL"
    fi
    chmod 644 "$DOWNLOAD_PATH"
    ok "Downloaded $(format_bytes "$(wc -c <"$DOWNLOAD_PATH" | tr -d ' ')")"
}

sha256_of() {
    if has sha256sum; then
        sha256sum "$1" | awk '{print $1}'
    elif has shasum; then
        shasum -a 256 "$1" | awk '{print $1}'
    elif has openssl; then
        openssl dgst -sha256 -r "$1" | awk '{print $1}'
    else
        return 1
    fi
}

verify_asset() {
    step "Verifying the download"
    local sums="$WORKDIR/SHA256SUMS" expected actual verified=0 why=""
    fetch "$(release_download_url SHA256SUMS)" "$sums"
    if [ "$HTTP_CODE" = "200" ]; then
        expected=$(awk -v f="$ASSET_NAME" '{n=$2; sub(/^\*/, "", n); if (n == f) {print tolower($1); exit}}' "$sums") || expected=""
        if [ -z "$expected" ]; then
            why="the release's SHA256SUMS file doesn't list $ASSET_NAME"
        elif ! actual=$(sha256_of "$DOWNLOAD_PATH"); then
            why="no sha256 tool (sha256sum, shasum or openssl) is installed"
        elif [ "$actual" = "$expected" ]; then
            ok "SHA-256 matches the checksum published with v$VERSION"
            verified=1
        else
            die "Checksum mismatch - the download is corrupt or has been tampered with. Nothing was installed." \
                "expected: $expected" "actual:   $actual" \
                "Try again; if it keeps happening please report it at https://github.com/$REPO/issues"
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        why="v$VERSION was published without a checksum file (releases before checksums were added don't have one)"
    else
        describe_failure
        why="the checksum file couldn't be fetched: $API_FAIL_REASON"
    fi

    if [ "$verified" -eq 0 ]; then
        if [ "$REQUIRE_CHECKSUM" -eq 1 ]; then
            die "Can't verify the download and --require-checksum was given." "Reason: $why"
        fi
        warn "Couldn't verify the download: $why."
        warn "It still came over HTTPS directly from github.com/$REPO."
    fi
}

# ---------------------------------------------------------------------------
# macOS
# ---------------------------------------------------------------------------
# Sets EXISTING_DIR and INSTALLED_VERSION if an install is found.
macos_installed() {
    local d
    INSTALLED_VERSION=""
    EXISTING_DIR=""
    for d in "$SYSTEM_APPS" "$HOME/Applications"; do
        if [ -d "$d/$APP_NAME.app" ]; then
            EXISTING_DIR=$d
            INSTALLED_VERSION=$(defaults read "$d/$APP_NAME.app/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)
            return 0
        fi
    done
    return 1
}

plan_macos() {
    macos_installed || true
    local existing_dir=$EXISTING_DIR

    if [ "$USER_INSTALL" -eq 1 ]; then
        DEST_DIR="$HOME/Applications"
    elif [ "$existing_dir" = "$HOME/Applications" ] && [ ! -d "$SYSTEM_APPS/$APP_NAME.app" ]; then
        DEST_DIR="$HOME/Applications"
    else
        DEST_DIR="$SYSTEM_APPS"
    fi

    NEED_ADMIN=0
    if [ "$DEST_DIR" = "$SYSTEM_APPS" ]; then
        if [ ! -w "$SYSTEM_APPS" ]; then
            NEED_ADMIN=1
            ADMIN_REASON="write to $SYSTEM_APPS (your account can't modify it directly)"
        elif [ -d "$SYSTEM_APPS/$APP_NAME.app" ] && [ "$(stat -f %Su "$SYSTEM_APPS/$APP_NAME.app" 2>/dev/null)" != "$(id -un)" ]; then
            NEED_ADMIN=1
            ADMIN_REASON="replace the existing app, which is owned by another user"
        fi
        if [ "$NEED_ADMIN" -eq 1 ] && [ "$TTY_OK" -eq 0 ] && [ "$(id -u)" -ne 0 ] && ! sudo -n true 2>/dev/null; then
            warn "Admin rights would be needed but there's no terminal to ask for a password; installing into ~/Applications instead."
            DEST_DIR="$HOME/Applications"
            NEED_ADMIN=0
        fi
    fi
    INSTALL_TARGET="$DEST_DIR/$APP_NAME.app"
    INSTALLED_VERSION=""
    if [ -d "$INSTALL_TARGET" ]; then
        INSTALLED_VERSION=$(defaults read "$INSTALL_TARGET/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)
    fi
}

# Only touches a copy that is running from the exact place we're about to replace.
quit_running_macos() {
    local target=$1 pattern="$1/Contents/MacOS"
    if [ ! -d "$target" ] || ! pgrep -f "$pattern" >/dev/null 2>&1; then
        return 0
    fi
    if [ "$INTERACTIVE" -eq 1 ]; then
        if ! confirm "$APP_NAME is running. Quit it so it can be replaced?"; then
            warn "Leaving it running; restart $APP_NAME afterwards to use the new version."
            return 0
        fi
    fi
    info "Quitting $APP_NAME..."
    osascript -e "tell application \"$target\" to quit" >/dev/null 2>&1 || true
    local i=0
    while [ "$i" -lt 10 ] && pgrep -f "$pattern" >/dev/null 2>&1; do
        sleep 1
        i=$((i + 1))
    done
    if pgrep -f "$pattern" >/dev/null 2>&1; then
        warn "$APP_NAME didn't quit; continuing anyway. Restart it afterwards to use the new version."
    fi
}

install_macos() {
    step "Installing $APP_NAME"
    local mnt="$WORKDIR/mnt" app name stage backup
    mkdir -p "$mnt"
    if ! with_spinner "Opening the disk image" hdiutil attach "$DOWNLOAD_PATH" -mountpoint "$mnt" -nobrowse -readonly -quiet; then
        fail "macOS couldn't open the downloaded disk image." "The file may be damaged; run the installer again."
    fi
    MOUNT_POINT=$mnt

    app=$(find "$mnt" -maxdepth 2 -name '*.app' -type d | sed -n '1p')
    if [ -z "$app" ]; then
        fail "The disk image doesn't contain an app, so nothing was installed."
    fi
    name=$(basename "$app")
    INSTALL_TARGET="$DEST_DIR/$name"

    quit_running_macos "$INSTALL_TARGET"
    prepare_privileges

    stage="$DEST_DIR/.$name.installing"
    backup="$DEST_DIR/.$name.previous"
    mkdir -p "$DEST_DIR" 2>/dev/null || priv mkdir -p "$DEST_DIR"
    priv rm -rf "$stage" "$backup"

    if ! with_spinner "Copying to $INSTALL_TARGET" priv ditto "$app" "$stage"; then
        priv rm -rf "$stage"
        fail "Copying the app failed (is the disk full?). Your existing install, if any, was left alone."
    fi

    # Swap in the new copy; keep the old one until the swap has worked.
    if [ -d "$INSTALL_TARGET" ]; then
        priv mv "$INSTALL_TARGET" "$backup"
    fi
    if ! priv mv "$stage" "$INSTALL_TARGET"; then
        if [ -d "$backup" ]; then priv mv "$backup" "$INSTALL_TARGET" || true; fi
        fail "Couldn't put the new app in place. Your previous version was restored."
    fi
    priv rm -rf "$backup"

    # The app isn't notarized by Apple (the project has no paid developer account), so
    # macOS would warn about it if the download carried a quarantine flag. curl doesn't
    # set that flag, but a browser-downloaded copy of the same file would.
    if xattr -p com.apple.quarantine "$INSTALL_TARGET" >/dev/null 2>&1; then
        info "Clearing macOS's quarantine flag (the app is not Apple-notarized)."
        priv xattr -dr com.apple.quarantine "$INSTALL_TARGET" || true
    fi

    hdiutil detach "$mnt" -quiet >>"$LOG_FILE" 2>&1 || true
    MOUNT_POINT=""
    ok "Installed $INSTALL_TARGET"
}

uninstall_macos() {
    local d found="" scope="$SYSTEM_APPS or $HOME/Applications"
    # With --user, only touch the home-folder copy.
    if [ "$USER_INSTALL" -eq 1 ]; then scope="$HOME/Applications"; fi
    for d in "$SYSTEM_APPS" "$HOME/Applications"; do
        if [ "$USER_INSTALL" -eq 1 ] && [ "$d" = "$SYSTEM_APPS" ]; then continue; fi
        if [ -d "$d/$APP_NAME.app" ]; then found="$found$d/$APP_NAME.app"$'\n'; fi
    done
    if [ -z "$found" ]; then
        info "$APP_NAME isn't installed in $scope. Nothing to remove."
        return 0
    fi
    say ""
    say "This will remove:"
    while IFS= read -r d; do
        if [ -n "$d" ]; then say "  $d"; fi
    done <<LISTING
$found
LISTING
    say "Your projects and settings (~/Library/Application Support/$APP_NAME) are kept."
    if [ "$DRY_RUN" -eq 1 ]; then say "Dry run: nothing was removed."; return 0; fi
    if [ "$INTERACTIVE" -ne 1 ] && [ "$ASSUME_YES" -ne 1 ]; then
        die "Not removing anything without a confirmation." "Add --yes to uninstall without being asked."
    fi
    confirm "Remove it?" || { say "Cancelled. Nothing was changed."; return 0; }
    while IFS= read -r d; do
        [ -n "$d" ] || continue
        if [ -w "$(dirname "$d")" ]; then
            rm -rf "$d"
        else
            NEED_ADMIN=1; ADMIN_REASON="remove the app from $(dirname "$d")"
            prepare_privileges
            priv rm -rf "$d"
        fi
        ok "Removed $d"
    done <<LISTING
$found
LISTING
}

# ---------------------------------------------------------------------------
# Linux
# ---------------------------------------------------------------------------
can_get_root() {
    [ "$(id -u)" -eq 0 ] || has sudo
}

choose_linux_format() {
    if [ -n "$FORMAT_REQ" ]; then
        FORMAT=$FORMAT_REQ
        if [ "$FORMAT" = "deb" ] && { ! has apt-get || ! has dpkg; }; then
            fail "--format deb needs a Debian/Ubuntu-style system (apt-get and dpkg), and this one doesn't have them." \
                "Use --format appimage instead."
        fi
        return 0
    fi
    # Debian-family systems get the system package (it also sets up the Chromium sandbox
    # helper correctly). Everything else gets the AppImage, which runs anywhere.
    if has apt-get && has dpkg && can_get_root; then
        FORMAT="deb"
    else
        FORMAT="appimage"
    fi
}

# Can Chromium's unprivileged user-namespace sandbox work for a normal user here?
# Electron aborts at startup, before any app code runs, when it has neither this nor a
# setuid helper (the "SUID sandbox helper binary was found, but is not configured correctly"
# crash), so the only fix is to launch it with --no-sandbox. We add that flag to the
# launcher we write, and only when this check says the sandbox cannot work.
userns_ok() {
    local v
    if [ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]; then
        v=$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)
        if [ "$v" = "1" ]; then return 1; fi
    fi
    if [ -r /proc/sys/user/max_user_namespaces ]; then
        v=$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo 0)
        if [ "$v" = "0" ]; then return 1; fi
    else
        return 1
    fi
    if [ -r /proc/sys/kernel/unprivileged_userns_clone ]; then
        v=$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo 1)
        if [ "$v" = "0" ]; then return 1; fi
    fi
    if has unshare; then
        if ! unshare -Ur true >/dev/null 2>&1; then return 1; fi
    fi
    return 0
}

# True when the installed chrome-sandbox is root-owned, setuid, and not on a nosuid mount.
sandbox_helper_works() {
    local f=$1 owner mode opts=""
    [ -f "$f" ] || return 1
    owner=$(stat -c '%u' "$f" 2>/dev/null || echo "")
    mode=$(stat -c '%a' "$f" 2>/dev/null || echo "")
    [ "$owner" = "0" ] || return 1
    case "$mode" in 4*) ;; *) return 1 ;; esac
    if has findmnt; then
        opts=$(findmnt -no OPTIONS -T "$f" 2>/dev/null || true)
        case ",$opts," in *,nosuid,*) return 1 ;; esac
    fi
    return 0
}

has_fuse2() {
    [ -e /dev/fuse ] || return 1
    local lc=ldconfig out=""
    if ! has ldconfig; then lc=/sbin/ldconfig; fi
    out=$("$lc" -p 2>/dev/null || true)
    case "$out" in *libfuse.so.2*) return 0 ;; esac
    [ -e /usr/lib/libfuse.so.2 ] || [ -e /usr/lib64/libfuse.so.2 ] || ls /usr/lib/*/libfuse.so.2 >/dev/null 2>&1
}

xdg_data_home() {
    printf '%s' "${XDG_DATA_HOME:-$HOME/.local/share}"
}

appimage_dir() { printf '%s' "$HOME/Applications"; }

plan_linux() {
    NEED_ADMIN=0
    INSTALLED_VERSION=""
    if has dpkg-query; then
        INSTALLED_VERSION=$(dpkg-query -W -f='${Version}' "$PKG_NAME" 2>/dev/null || true)
    fi
    NO_SANDBOX_FLAG=0
    # An AppImage can't use the setuid helper (its mount is nosuid), so it needs user
    # namespaces. The .deb installs the helper setuid, which is checked after installing.
    if [ "$FORMAT" = "appimage" ] && ! userns_ok; then
        NO_SANDBOX_FLAG=1
    fi
    if [ "$FORMAT" = "deb" ]; then
        if [ "$(id -u)" -ne 0 ]; then
            NEED_ADMIN=1
            ADMIN_REASON="install the package with apt"
        fi
        INSTALL_TARGET="system package (apt) - files go to /opt/$APP_NAME, with a menu entry"
    else
        FUSE_OK=1
        if ! has_fuse2; then FUSE_OK=0; fi
        INSTALL_TARGET="$(appimage_dir)/Turtle-Tracer.AppImage + a menu entry"
    fi
}

# Menu entries can't hold these characters in a quoted path without extra escaping.
desktop_safe() {
    local bad='"`$\%'
    case "$1" in
        *["$bad"]*) return 1 ;;
    esac
    return 0
}

install_icon() {
    local dir icon url
    dir="$(xdg_data_home)/icons/hicolor/512x512/apps"
    icon="$dir/$PKG_NAME.png"
    mkdir -p "$dir"
    url="$RAW_URL/$REPO/v$VERSION/build/icon.png"
    fetch "$url" "$icon"
    if [ "$HTTP_CODE" != "200" ]; then
        fetch "$RAW_URL/$REPO/main/build/icon.png" "$icon"
    fi
    if [ "$HTTP_CODE" = "200" ] && [ -s "$icon" ]; then
        if has gtk-update-icon-cache; then
            gtk-update-icon-cache -f -t "$(xdg_data_home)/icons/hicolor" >/dev/null 2>&1 || true
        fi
    else
        rm -f "$icon"
        warn "Couldn't download the icon; the menu entry will use a generic one."
    fi
}

install_appimage() {
    step "Installing $APP_NAME"
    local dir dest apps_dir desktop exec_line old f
    dir=$(appimage_dir)
    dest="$dir/Turtle-Tracer.AppImage"
    mkdir -p "$dir"

    with_spinner "Copying the AppImage to $dir" cp "$DOWNLOAD_PATH" "$dest.new" || die "Couldn't copy the AppImage into $dir (is the disk full?)."
    chmod +x "$dest.new"
    mv -f "$dest.new" "$dest"

    # Remove AppImages from earlier installs so there's exactly one.
    for f in "$dir"/Turtle-Tracer*.AppImage "$dir"/turtle-tracer*.AppImage "$dir"/turtle-tracer*.appimage; do
        if [ -f "$f" ] && [ "$f" != "$dest" ]; then
            rm -f "$f"
            info "Removed older AppImage $(basename "$f")"
        fi
    done
    ok "Installed $dest"

    apps_dir="$(xdg_data_home)/applications"
    desktop="$apps_dir/$PKG_NAME.desktop"
    if desktop_safe "$dest"; then
        exec_line="\"$dest\""
        if [ "$FUSE_OK" -eq 0 ]; then
            exec_line="env APPIMAGE_EXTRACT_AND_RUN=1 $exec_line"
        fi
        if [ "$NO_SANDBOX_FLAG" -eq 1 ]; then
            exec_line="$exec_line --no-sandbox"
        fi
        mkdir -p "$apps_dir"
        install_icon
        cat >"$desktop" <<EOF
[Desktop Entry]
Name=$APP_NAME
Comment=Path planning with $APP_NAME
Exec=$exec_line %U
Icon=$PKG_NAME
Type=Application
Categories=Development;
Terminal=false
StartupWMClass=turtle-tracer
EOF
        if has update-desktop-database; then
            update-desktop-database "$apps_dir" >/dev/null 2>&1 || true
        fi
        ok "Added a menu entry ($desktop)"
    else
        warn "Your home path contains characters that menu entries can't hold, so no menu entry was created."
    fi

    if [ "$FUSE_OK" -eq 0 ]; then
        warn "FUSE 2 (libfuse2) isn't installed, so the AppImage can't mount itself."
        warn "I set the launcher to unpack on start instead (works, but starts slower)."
        warn "To make it fast, install libfuse2 with your package manager (e.g. 'sudo apt install libfuse2' or 'sudo dnf install fuse-libs')."
        old="APPIMAGE_EXTRACT_AND_RUN=1 "
    else
        old=""
    fi
    LAUNCH_HINT="${old}\"$dest\""
    if [ "$NO_SANDBOX_FLAG" -eq 1 ]; then
        LAUNCH_HINT="$LAUNCH_HINT --no-sandbox"
        warn "Your system blocks unprivileged user namespaces (Ubuntu 23.10+ does this by default), so an AppImage"
        warn "can't use Chromium's sandbox and would crash on start. I added --no-sandbox to the menu entry."
        warn "If you start the AppImage file directly, add --no-sandbox yourself, or install the .deb instead (it keeps the sandbox)."
    fi
}

install_deb() {
    step "Installing $APP_NAME"
    prepare_privileges
    info "Installing with apt (this also pulls in any libraries it needs)..."
    if ! priv env DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades "$DOWNLOAD_PATH"; then
        warn "apt couldn't install it on the first try; refreshing package lists and retrying once..."
        priv apt-get update || true
        if ! priv env DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades "$DOWNLOAD_PATH"; then
            fail "apt couldn't install the package." \
                "The messages above say which dependency is missing or what went wrong." \
                "If you can't use apt, re-run with --format appimage."
        fi
    fi
    ok "Installed the $PKG_NAME package"

    # A user-level menu entry from an old AppImage install would hide the system one (same file name).
    local user_entry
    user_entry="$(xdg_data_home)/applications/$PKG_NAME.desktop"
    if [ -f "$user_entry" ] && grep -q 'AppImage' "$user_entry" 2>/dev/null; then
        rm -f "$user_entry"
        rm -f "$(appimage_dir)"/Turtle-Tracer*.AppImage 2>/dev/null || true
        info "Removed your older AppImage install; the system package replaces it."
    fi

    # The package's post-install step makes chrome-sandbox setuid-root, which is all the sandbox
    # needs, even where user namespaces are blocked. Only if that didn't happen (or /opt is
    # mounted nosuid) and namespaces are blocked would the app crash, so patch the launcher then.
    local helper="/opt/$APP_NAME/chrome-sandbox" sys_desktop="/usr/share/applications/$PKG_NAME.desktop"
    if sandbox_helper_works "$helper"; then
        ok "Chromium's sandbox helper is set up correctly (setuid root); no sandbox flag needed"
    elif ! userns_ok && [ -f "$sys_desktop" ] && ! grep -q -- '--no-sandbox' "$sys_desktop"; then
        if grep -q '^Exec=.* %U$' "$sys_desktop"; then
            priv sed -i 's|^\(Exec=.*\) %U$|\1 --no-sandbox %U|' "$sys_desktop"
        else
            priv sed -i 's|^\(Exec=.*\)$|\1 --no-sandbox|' "$sys_desktop"
        fi
        warn "The sandbox helper isn't setuid on this system and user namespaces are blocked, so Turtle Tracer would"
        warn "crash on start. I added --no-sandbox to its menu entry."
    fi
    LAUNCH_HINT="$PKG_NAME"
}

uninstall_linux() {
    local deb=0 appimages="" f entry
    if has dpkg-query && dpkg-query -W -f='${Status}' "$PKG_NAME" 2>/dev/null | grep -q 'install ok installed'; then
        deb=1
    fi
    for f in "$(appimage_dir)"/Turtle-Tracer*.AppImage "$(appimage_dir)"/turtle-tracer*.AppImage; do
        if [ -f "$f" ]; then appimages="$appimages $f"; fi
    done
    entry="$(xdg_data_home)/applications/$PKG_NAME.desktop"
    if [ "$deb" -eq 0 ] && [ -z "$appimages" ] && [ ! -f "$entry" ]; then
        info "$APP_NAME doesn't appear to be installed. Nothing to remove."
        return 0
    fi
    say ""
    say "This will remove:"
    if [ "$deb" -eq 1 ]; then say "  the $PKG_NAME system package (needs sudo)"; fi
    for f in $appimages; do say "  $f"; done
    if [ -f "$entry" ]; then say "  $entry"; fi
    say "Your projects and settings (~/.config/$APP_NAME) are kept."
    if [ "$DRY_RUN" -eq 1 ]; then say "Dry run: nothing was removed."; return 0; fi
    confirm "Remove it?" || { say "Cancelled. Nothing was changed."; return 0; }
    if [ "$deb" -eq 1 ]; then
        NEED_ADMIN=1; ADMIN_REASON="remove the system package"
        prepare_privileges
        priv apt-get remove -y "$PKG_NAME"
        ok "Removed the system package"
    fi
    for f in $appimages; do rm -f "$f"; ok "Removed $f"; done
    if [ -f "$entry" ]; then rm -f "$entry"; fi
    rm -f "$(xdg_data_home)/icons/hicolor/512x512/apps/$PKG_NAME.png"
    if has update-desktop-database; then update-desktop-database "$(xdg_data_home)/applications" >/dev/null 2>&1 || true; fi
}

# ---------------------------------------------------------------------------
# Plan screen
# ---------------------------------------------------------------------------
print_plan() {
    local size
    size=$(human_size)
    say ""
    say "${BOLD}Here's what will happen${NC}"
    kv "System:" "$SYSTEM_LABEL"
    kv "Version:" "v$VERSION ($VERSION_KIND)"
    kv "Download:" "$ASSET_NAME${size:+ ($size)} from ${GITHUB_URL#*://}/$REPO"
    if [ -n "$INSTALLED_VERSION" ]; then
        if [ "$INSTALLED_VERSION" = "$VERSION" ]; then
            kv "Install to:" "$INSTALL_TARGET (v$VERSION is already installed; it will be reinstalled)"
        elif version_lt "$VERSION" "$INSTALLED_VERSION"; then
            kv "Install to:" "$INSTALL_TARGET"
            kv "" "!! DOWNGRADE: replaces your newer v$INSTALLED_VERSION with the older v$VERSION"
        else
            kv "Install to:" "$INSTALL_TARGET (upgrades v$INSTALLED_VERSION)"
        fi
    else
        kv "Install to:" "$INSTALL_TARGET"
    fi
    if [ "$NEED_ADMIN" -eq 1 ]; then
        kv "Admin rights:" "yes - to $ADMIN_REASON"
    else
        kv "Admin rights:" "not needed"
    fi
    if [ "$PLATFORM" = "linux" ] && [ "$FORMAT" = "appimage" ] && [ "$FUSE_OK" -eq 0 ]; then
        kv "Note:" "libfuse2 is missing; the launcher will unpack the app on start"
    fi
    if [ "$PLATFORM" = "linux" ] && [ "$NO_SANDBOX_FLAG" -eq 1 ]; then
        kv "Note:" "your system blocks user namespaces, so the AppImage launcher will get --no-sandbox"
    fi
    say ""
}

finish_message() {
    say ""
    ok "${BOLD}Turtle Tracer v$VERSION is installed.${NC}"
    case "$PLATFORM" in
        macos) say "Open it from your Applications folder, Launchpad or Spotlight." ;;
        linux)
            say "Open it from your applications menu, or run:  $LAUNCH_HINT"
            if [ "$FORMAT" = "appimage" ]; then
                say "(If the menu entry doesn't show up right away, log out and back in.)"
            fi
            ;;
    esac
    say "To remove it later:  curl -fsSL $RAW_URL/$REPO/main/install.sh | bash -s -- --uninstall"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    if [ -n "${TT_VERSION:-}" ]; then
        set_version_request "$TT_VERSION" || die_usage "TT_VERSION=\"$TT_VERSION\" is not a version number."
    fi
    if [ -n "${TT_CHANNEL:-}" ]; then
        set_version_request "$TT_CHANNEL" || die_usage "TT_CHANNEL must be \"stable\" or \"prerelease\"."
    fi
    parse_args "$@"

    if ! has curl; then
        die "This installer needs curl, which isn't installed." \
            "Install it first (Debian/Ubuntu: sudo apt install curl; Fedora: sudo dnf install curl; Arch: sudo pacman -S curl)."
    fi

    setup_workdir "$@"
    detect_platform
    detect_interactivity
    print_logo

    case "$PLATFORM" in
        windows) handle_windows; return 0 ;;
        wsl) handle_wsl; return 0 ;;
        macos | linux) ;;
        *)
            fail "$SYSTEM_LABEL isn't a supported system for this installer." \
                "Supported: macOS, Linux (x86_64/arm64) and Windows (see install.ps1)."
            ;;
    esac
    if [ -z "$ARCH" ]; then
        fail "This computer's processor ($(uname -m)) isn't supported." \
            "Builds exist for 64-bit Intel/AMD (x86_64) and ARM (arm64/aarch64) only."
    fi
    if [ "$PLATFORM" = "linux" ] && ls /lib/ld-musl-* >/dev/null 2>&1; then
        fail "This looks like a musl-based Linux (e.g. Alpine). Turtle Tracer needs glibc." \
            "Use a glibc distribution such as Debian, Ubuntu, Fedora or Arch."
    fi

    say ""
    say "Detected: $SYSTEM_LABEL"

    if [ "$ACTION" = "uninstall" ]; then
        if [ "$PLATFORM" = "macos" ]; then uninstall_macos; else uninstall_linux; fi
        return 0
    fi

    # Which version?
    detect_installed_version
    if [ -z "$REQ_VERSION" ]; then
        if ! gather_versions; then
            if [ "$INTERACTIVE" -eq 1 ]; then
                warn "Couldn't look up versions: ${API_FAIL_REASON:-GitHub could not be reached.}"
                say "You can still type a version number yourself."
            fi
        elif [ "$LIST_SOURCE" != "api" ] && [ "$INTERACTIVE" -eq 1 ]; then
            explain_limited_lookup
        fi
        if [ -z "$CHANNEL" ] && [ "$INTERACTIVE" -eq 1 ]; then
            ask_version
        fi
    fi
    choose_version

    resolve_asset

    if [ "$PLATFORM" = "macos" ]; then
        plan_macos
    else
        plan_linux
    fi
    print_plan

    if [ "$DRY_RUN" -eq 1 ]; then
        say "Dry run: nothing was downloaded or installed."
        return 0
    fi
    if ! confirm "Continue?"; then
        say "Cancelled. Nothing was changed."
        return 0
    fi

    download_asset
    verify_asset
    if [ "$PLATFORM" = "macos" ]; then
        install_macos
    elif [ "$FORMAT" = "deb" ]; then
        install_deb
    else
        install_appimage
    fi
    finish_message
}

main "$@"
