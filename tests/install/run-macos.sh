#!/usr/bin/env bash
# Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
# macOS scenarios for install.sh against the local fake release server.
# Safe to run on a real Mac: HOME and the system Applications folder are both temp directories
# (TT_APPLICATIONS_DIR), so your real /Applications is never touched.
# usage: tests/install/run-macos.sh        (uses /bin/bash, the bash that `curl | bash` gets on macOS)
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
WORK=${WORK:-$(mktemp -d)}
PORT=${PORT:-18083}
SH=${SH:-/bin/bash}
PYTHON=${PYTHON:-python3}

"$HERE/make-fixtures.sh" "$WORK/fix" >/dev/null
"$PYTHON" "$HERE/fake-github.py" "$PORT" "$WORK/fix" >"$WORK/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1

export TT_GITHUB_URL=http://127.0.0.1:$PORT TT_API_URL=http://127.0.0.1:$PORT TT_RAW_URL=http://127.0.0.1:$PORT NO_COLOR=1
FAILS=0; PASSES=0
pass() { PASSES=$((PASSES + 1)); echo "  PASS  $1"; }
bad() { FAILS=$((FAILS + 1)); echo "  FAIL  $1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        | /' | head -20; }
has_text() { case "$2" in *"$3"*) pass "$1" ;; *) bad "$1 (expected: $3)" "$2" ;; esac; }
lacks_text() { case "$2" in *"$3"*) bad "$1 (unexpected: $3)" "$2" ;; *) pass "$1" ;; esac; }

# fresh sandbox per scenario
sandbox() { H=$(mktemp -d "$WORK/h.XXXX"); A=$(mktemp -d "$WORK/a.XXXX"); export HOME=$H TT_APPLICATIONS_DIR=$A; }
inst() { "$SH" "$REPO/install.sh" "$@" 2>&1; }
setmode() { printf '%s' "$1" >"$WORK/fix/mode"; }
clearmode() { rm -f "$WORK/fix/mode"; }
appver() { defaults read "$1/Turtle Tracer.app/Contents/Info" CFBundleShortVersionString 2>/dev/null; }

echo "=== macOS $(sw_vers -productVersion) $(uname -m), $SH ($("$SH" --version | head -1 | sed 's/(.*//'))"
sandbox
out=$(inst --yes --dry-run);                 has_text "default = latest stable" "$out" "v2.4.1 (latest stable)"
lacks_text "size comes from Content-Range, not the 1-byte Content-Length" "$out" "(1 KB)"
has_text "size is shown" "$out" " KB) from "
out=$(inst --yes --dry-run --prerelease);    has_text "--prerelease" "$out" "v2.5.0 (newest pre-release)"
out=$(inst --yes --dry-run --version=v2.3.0); has_text "--version=v2.3.0" "$out" "v2.3.0 (requested)"
out=$(inst --yes --dry-run --version 9.9.9); has_text "unknown version explained" "$out" "There is no release called v9.9.9"
out=$(inst --yes --dry-run --version 2.1.0); has_text "odd file names found by fuzzy match" "$out" "Pedro-Visualizer-2.1.0"
out=$(inst --help);                          has_text "--help works" "$out" "Usage:"
out=$(inst --bogus); rc=$?;                  [ $rc -ne 0 ] && pass "unknown option rejected" || bad "unknown option rejected" "$out"

echo "-- install / upgrade / downgrade / uninstall (system dir = temp)"
sandbox
out=$(inst --yes); rc=$?
[ $rc -eq 0 ] && [ "$(appver "$A")" = "2.4.1" ] && pass "fresh install of stable" || bad "fresh install" "$out"
has_text "checksum verified" "$out" "SHA-256 matches"
out=$(inst --yes --version 2.3.0)
[ "$(appver "$A")" = "2.3.0" ] && pass "downgrade works" || bad "downgrade" "$out"
has_text "plan says what it replaces (and that it is a downgrade)" "$out" "DOWNGRADE: replaces your newer v2.4.1 with the older v2.3.0"
[ -z "$(ls -A "$A" | grep -v '^Turtle Tracer.app$')" ] && pass "no staging/backup leftovers" || bad "leftovers" "$(ls -A "$A")"
out=$(inst --yes --dry-run --version 2.4.1); has_text "upgrade is described as an upgrade" "$out" "upgrades v2.3.0"
out=$(inst --yes --dry-run --version 2.2.1); has_text "older version is flagged as a DOWNGRADE" "$out" "DOWNGRADE: replaces your newer v2.3.0 with the older v2.2.1"
out=$(inst --yes --dry-run --version 2.3.0); has_text "same version is a reinstall" "$out" "already installed; it will be reinstalled"
out=$(inst --yes --user --uninstall);        has_text "--user uninstall ignores the system folder" "$out" "Nothing to remove"
[ -d "$A/Turtle Tracer.app" ] && pass "system copy untouched by --user uninstall" || bad "system copy was removed"
out=$(inst --yes --uninstall);               [ ! -d "$A/Turtle Tracer.app" ] && pass "uninstall removes the app" || bad "uninstall" "$out"
out=$(inst --uninstall </dev/null); rc=$?;   [ $rc -ne 0 ] || [ ! -d "$A/Turtle Tracer.app" ] && pass "uninstall never silently deletes without --yes" || bad "uninstall without confirmation" "$out"

echo "-- --user and unwritable system folder"
sandbox
out=$(inst --yes --user); [ "$(appver "$H/Applications")" = "2.4.1" ] && pass "--user installs into ~/Applications" || bad "--user install" "$out"
sandbox; chmod 555 "$A"
out=$(inst --yes </dev/null)
has_text "unwritable /Applications + no terminal: falls back to ~/Applications" "$out" "installing into ~/Applications instead"
chmod 755 "$A"

echo "-- bad downloads"
sandbox
printf 'x' >>"$WORK/fix/assets/v2.3.0/Turtle-Tracer-2.3.0-$( [ "$(uname -m)" = arm64 ] && echo arm64 || echo x64 ).dmg"
out=$(inst --yes --version 2.3.0); rc=$?
[ $rc -ne 0 ] && has_text "tampered file: checksum mismatch is fatal" "$out" "Checksum mismatch" || bad "tampered file" "$out"
[ ! -d "$A/Turtle Tracer.app" ] && pass "nothing installed after mismatch" || bad "installed despite mismatch"
"$HERE/make-fixtures.sh" "$WORK/fix" >/dev/null 2>&1   # restore (rewrites assets + checksums)
out=$(inst --yes --version 2.2.1);           has_text "no checksum published: warns, continues" "$out" "was published without a checksum file"
out=$(inst --yes --version 2.2.1 --require-checksum); [ $? -ne 0 ] && pass "--require-checksum refuses" || bad "--require-checksum" "$out"

echo "-- lookup fallbacks"
sandbox
setmode ratelimit
out=$(inst --yes --dry-run);                 has_text "rate limit: stable still works" "$out" "v2.4.1 (latest stable)"
out=$(inst --yes --dry-run --prerelease);    has_text "rate limit: says it can't look up pre-releases" "$out" "rate limit was reached"
setmode noredirect
out=$(inst --yes --dry-run); rc=$?;          [ $rc -ne 0 ] && has_text "API+redirect down: refuses to guess stable" "$out" "couldn't confirm which release is the latest stable" || bad "guessing" "$out"
out=$(inst --yes --dry-run --prerelease);    has_text "API down: --prerelease falls back to newest tag" "$out" "v2.5.0 (newest published tag)"
setmode alldown
out=$(inst --yes --dry-run); rc=$?;          [ $rc -ne 0 ] && has_text "everything down: explains + manual steps" "$out" "You can also install Turtle Tracer by hand" || bad "all down" "$out"
clearmode
out=$(TT_GITHUB_URL=http://127.0.0.1:1 TT_API_URL=http://127.0.0.1:1 inst --yes --dry-run); rc=$?
[ $rc -ne 0 ] && has_text "offline: says GitHub can't be reached" "$out" "couldn't reach GitHub" || bad "offline" "$out"

echo "-- version question (real terminal via pty)"
sandbox
out=$("$PYTHON" "$HERE/pty_run.py" "p,n" -- "$SH" "$REPO/install.sh" --user)
has_text "question offers stable + pre-release" "$out" "p       the newest pre-release (v2.5.0)"
has_text "'p' selects the pre-release" "$out" "v2.5.0 (newest pre-release)"
has_text "answering n at the plan cancels" "$out" "Cancelled. Nothing was changed."
[ ! -d "$H/Applications/Turtle Tracer.app" ] && pass "cancel installs nothing" || bad "cancel installed something"
out=$("$PYTHON" "$HERE/pty_run.py" "banana,2.2.1,y" -- "$SH" -c "cat '$REPO/install.sh' | $SH -s -- --user --dry-run")
has_text "piped script: typo is rejected" "$out" "isn't a version number"
has_text "piped script: typed version is used" "$out" "v2.2.1 (requested)"
out=$("$PYTHON" "$HERE/pty_run.py" "," -- "$SH" "$REPO/install.sh" --user --dry-run)
has_text "Enter = stable" "$out" "v2.4.1 (latest stable)"
out=$(cat "$REPO/install.sh" | "$SH" -s -- --user --dry-run --version 2.3.0 --yes 2>&1)
has_text "piped + --version flag, no terminal needed" "$out" "v2.3.0 (requested)"

echo "-- question mentions what is installed"
sandbox; inst --yes --version 2.5.0 >/dev/null
out=$("$PYTHON" "$HERE/pty_run.py" "," -- "$SH" "$REPO/install.sh" --dry-run)
has_text "question shows the installed version" "$out" "Currently installed: v2.5.0"
has_text "question warns that stable would be a downgrade" "$out" "choosing stable would be a downgrade"
has_text "plan flags the default choice as a DOWNGRADE" "$out" "DOWNGRADE: replaces your newer v2.5.0 with the older v2.4.1"

echo "-- progress indicators (real terminal via pty)"
sandbox
out=$("$PYTHON" "$HERE/pty_run.py" "," -- "$SH" "$REPO/install.sh" --user)
has_text "download shows curl's progress bar" "$out" "100.0%"
has_text "disk image step shows a spinner and finishes" "$out" "Opening the disk image"
has_text "copy step shows a spinner and finishes" "$out" "Copying to"
has_text "sizes are human-readable" "$out" "Downloaded"
[ -d "$H/Applications/Turtle Tracer.app" ] && pass "install still completes with progress UI" || bad "install with progress UI" "$out"
out=$(inst --yes --user)
has_text "no terminal: steps are still announced" "$out" "[i] Opening the disk image"
lacks_text "no terminal: no spinner control characters" "$out" "$(printf '\r')"

echo "--- $PASSES passed, $FAILS failed"
[ "$FAILS" = 0 ]
