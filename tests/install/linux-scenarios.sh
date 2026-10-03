#!/bin/sh
# Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
# Runs INSIDE a Linux container (see run-linux.sh). Installs the tools install.sh needs, then
# exercises install.sh against the fake release server. Prints PASS/FAIL lines; exit 1 on failure.
set -u
REPO_DIR=${REPO_DIR:-/repo}

# --- bootstrap: bash + curl -------------------------------------------------
if ! command -v bash >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -qq >/dev/null 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates >/dev/null 2>&1
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y -q curl >/dev/null 2>&1
    elif command -v pacman >/dev/null 2>&1; then
        pacman -Sy --noconfirm curl >/dev/null 2>&1
    elif command -v apk >/dev/null 2>&1; then
        apk add --no-cache bash curl >/dev/null 2>&1
    fi
fi
if [ -z "${IN_BASH:-}" ]; then
    IN_BASH=1 exec bash "$0" "$@"
fi

FAILS=0
PASSES=0
pass() { PASSES=$((PASSES + 1)); echo "  PASS  $1"; }
bad() { FAILS=$((FAILS + 1)); echo "  FAIL  $1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        | /' | head -25; }
has_text() { case "$2" in *"$3"*) pass "$1" ;; *) bad "$1 (expected to contain: $3)" "$2" ;; esac; }
lacks_text() { case "$2" in *"$3"*) bad "$1 (should not contain: $3)" "$2" ;; *) pass "$1" ;; esac; }

# shellcheck disable=SC1091
. /etc/os-release 2>/dev/null || true
echo "=== ${PRETTY_NAME:-unknown} ($(uname -m)) ==="
IS_DEB=0; command -v apt-get >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1 && IS_DEB=1
IS_MUSL=0; ls /lib/ld-musl-* >/dev/null 2>&1 && IS_MUSL=1

export NO_COLOR=1
INST="bash $REPO_DIR/install.sh"
H=$(mktemp -d)

if [ "$IS_MUSL" = 1 ]; then
    out=$(HOME=$H $INST --yes --dry-run 2>&1); rc=$?
    [ "$rc" != 0 ] && pass "musl: exits non-zero" || bad "musl: exits non-zero" "$out"
    has_text "musl: explains glibc requirement" "$out" "needs glibc"
    has_text "musl: offers manual + web fallback" "$out" "live.turtletracer.com"
    echo "--- $PASSES passed, $FAILS failed"; [ "$FAILS" = 0 ]; exit
fi

# --- version selection ------------------------------------------------------
out=$(HOME=$H $INST --yes --dry-run 2>&1)
has_text "default is latest stable" "$out" "v2.4.1 (latest stable)"
out=$(HOME=$H $INST --yes --dry-run --prerelease 2>&1)
has_text "--prerelease picks the newest pre-release" "$out" "v2.5.0 (newest pre-release)"
out=$(HOME=$H $INST --yes --dry-run --version v2.3.0 2>&1)
has_text "--version 2.3.0 honoured" "$out" "v2.3.0 (requested)"
out=$(HOME=$H TT_VERSION=2.2.1 $INST --yes --dry-run 2>&1)
has_text "TT_VERSION honoured" "$out" "v2.2.1 (requested)"
out=$(HOME=$H $INST --yes --dry-run --version 9.9.9 2>&1)
has_text "missing release explained" "$out" "There is no release called v9.9.9"
has_text "missing release lists real versions" "$out" "v2.4.1"
out=$(HOME=$H $INST --yes --dry-run --version banana 2>&1)
has_text "bad version rejected with usage" "$out" "is not a version number"

# --- format choice ------------------------------------------------------------
out=$(HOME=$H $INST --yes --dry-run 2>&1)
if [ "$IS_DEB" = 1 ]; then
    has_text "Debian-family default is the .deb" "$out" ".deb"
else
    has_text "non-Debian default is the AppImage" "$out" ".AppImage"
    out=$(HOME=$H $INST --yes --dry-run --format deb 2>&1)
    has_text "--format deb refused without apt/dpkg" "$out" "needs a Debian/Ubuntu-style system"
fi

# --- real AppImage install ----------------------------------------------------
H2=$(mktemp -d)
out=$(HOME=$H2 $INST --yes --format appimage 2>&1); rc=$?
[ "$rc" = 0 ] && pass "AppImage install exits 0" || bad "AppImage install exits 0" "$out"
[ -x "$H2/Applications/Turtle-Tracer.AppImage" ] && pass "AppImage file is executable" || bad "AppImage file is executable" "$(ls -la "$H2/Applications" 2>&1)"
D="$H2/.local/share/applications/turtle-tracer.desktop"
[ -f "$D" ] && pass "menu entry created" || bad "menu entry created" "$out"
desk=$(cat "$D" 2>/dev/null)
has_text "menu entry has %U for file associations" "$desk" "%U"
has_text "checksum verified" "$out" "SHA-256 matches"
[ -f "$H2/.local/share/icons/hicolor/512x512/apps/turtle-tracer.png" ] && pass "icon installed" || bad "icon installed"
# no FUSE inside containers -> installer must configure extract-and-run, and say so
has_text "missing FUSE is handled" "$desk" "APPIMAGE_EXTRACT_AND_RUN=1"
has_text "missing FUSE is explained" "$out" "FUSE 2 (libfuse2) isn't installed"

# The AppImage can only use Chromium's user-namespace sandbox. Where namespaces are blocked
# (as in Docker's default seccomp profile, like Ubuntu 23.10+'s AppArmor) the launcher MUST carry
# --no-sandbox or the app aborts at startup; where they work, it must not.
if unshare -Ur true >/dev/null 2>&1; then
    lacks_text "userns works: AppImage launcher has no --no-sandbox" "$desk" "--no-sandbox"
else
    has_text "userns blocked: AppImage launcher has --no-sandbox" "$desk" "--no-sandbox"
    has_text "userns blocked: user is told why" "$out" "blocks unprivileged user namespaces"
fi
out=$(HOME=$H2 $INST --yes --format appimage --version 2.3.0 2>&1)
desk=$(cat "$D")
[ "$(ls "$H2/Applications" | grep -c AppImage)" = 1 ] && pass "only one AppImage kept after upgrade" || bad "only one AppImage kept" "$(ls "$H2/Applications")"

# space + odd characters in HOME
H3="$(mktemp -d)/my home"; mkdir -p "$H3"
out=$(HOME=$H3 $INST --yes --format appimage 2>&1); rc=$?
[ "$rc" = 0 ] && grep -q "Exec=.*\"$H3/Applications/Turtle-Tracer.AppImage\"" "$H3/.local/share/applications/turtle-tracer.desktop" && pass "HOME with a space is quoted correctly" || bad "HOME with a space" "$out"

# checksum failure is fatal and installs nothing
out=$(HOME=$(mktemp -d) $INST --yes --format appimage --version 2.2.1 --require-checksum 2>&1); rc=$?
[ "$rc" != 0 ] && pass "--require-checksum refuses unverifiable release" || bad "--require-checksum refuses" "$out"

# uninstall
out=$(HOME=$H2 $INST --yes --uninstall 2>&1)
[ ! -e "$H2/Applications/Turtle-Tracer.AppImage" ] && [ ! -e "$D" ] && pass "uninstall removes AppImage and menu entry" || bad "uninstall" "$out"

# --- real .deb install (Debian family, running as root) ------------------------
if [ "$IS_DEB" = 1 ] && [ "$(id -u)" = 0 ]; then
    H4=$(mktemp -d)
    out=$(HOME=$H4 $INST --yes 2>&1); rc=$?
    [ "$rc" = 0 ] && pass ".deb install exits 0" || bad ".deb install exits 0" "$out"
    [ -x "/opt/Turtle Tracer/turtle-tracer" ] && pass ".deb files installed" || bad ".deb files installed" "$out"
    [ "$(dpkg-query -W -f='${Version}' turtle-tracer 2>/dev/null)" = "2.4.1" ] && pass "dpkg reports 2.4.1" || bad "dpkg version" "$out"
    mode=$(stat -c '%a' "/opt/Turtle Tracer/chrome-sandbox" 2>/dev/null)
    [ "$mode" = "4755" ] && pass "package post-install made chrome-sandbox setuid" || bad "chrome-sandbox mode is $mode"
    lacks_text "setuid helper present: system launcher NOT patched" "$(cat /usr/share/applications/turtle-tracer.desktop)" "--no-sandbox"
    has_text "installer reports the helper is fine" "$out" "no sandbox flag needed"
    # v2.3.0's fixture package leaves the helper non-setuid
    out=$(HOME=$H4 $INST --yes --version 2.3.0 2>&1)
    if unshare -Ur true >/dev/null 2>&1; then
        lacks_text "no setuid helper but userns works: launcher not patched" "$(cat /usr/share/applications/turtle-tracer.desktop)" "--no-sandbox"
    else
        has_text "no setuid helper and userns blocked: launcher patched" "$(cat /usr/share/applications/turtle-tracer.desktop)" "--no-sandbox"
        has_text "patched Exec keeps quoting + %U" "$(grep '^Exec=' /usr/share/applications/turtle-tracer.desktop)" "\"/opt/Turtle Tracer/turtle-tracer\" --no-sandbox %U"
    fi
    out=$(HOME=$H4 $INST --yes --uninstall 2>&1)
    dpkg -s turtle-tracer >/dev/null 2>&1 && bad "uninstall removes the package" "$out" || pass "uninstall removes the package"

    # a regular user without sudo must be steered to the AppImage, not fail
    if command -v useradd >/dev/null 2>&1; then
        useradd -m ttuser 2>/dev/null
        chmod -R a+rX "$REPO_DIR" 2>/dev/null
        out=$(su ttuser -s /bin/bash -c "NO_COLOR=1 TT_GITHUB_URL=$TT_GITHUB_URL TT_API_URL=$TT_API_URL TT_RAW_URL=$TT_RAW_URL bash $REPO_DIR/install.sh --yes --dry-run" 2>&1)
        has_text "no sudo + not root: falls back to AppImage" "$out" ".AppImage"
    fi
fi

echo "--- $PASSES passed, $FAILS failed"
[ "$FAILS" = 0 ]
