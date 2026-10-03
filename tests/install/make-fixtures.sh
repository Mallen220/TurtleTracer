#!/usr/bin/env bash
# Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
# Builds fake release assets for the installer tests.
# usage: make-fixtures.sh FIXTURE_DIR
# Run it on macOS to get .dmg files and on Debian/Ubuntu (e.g. in Docker) to get .deb files;
# both runs can target the same directory.
set -euo pipefail
FIX=${1:?usage: make-fixtures.sh FIXTURE_DIR}
mkdir -p "$FIX/assets"

# tag:prerelease  (newest first)
RELEASES="v2.5.0:true v2.4.1:false v2.3.0:false v2.2.1:false v2.1.0:false"
if [ ! -f "$FIX/releases.json" ]; then
    {
        printf '['
        sep=""
        for r in $RELEASES; do
            printf '%s{"tag":"%s","prerelease":%s}' "$sep" "${r%%:*}" "${r##*:}"
            sep=","
        done
        printf ']\n'
    } >"$FIX/releases.json"
fi

sha() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi
}

make_deb() { # make_deb DIR VERSION ARCH
    local out=$1 ver=$2 arch=$3 root
    root=$(mktemp -d)
    mkdir -p "$root/DEBIAN" "$root/opt/Turtle Tracer" "$root/usr/share/applications"
    cat >"$root/DEBIAN/control" <<EOF
Package: turtle-tracer
Version: $ver
Architecture: $arch
Maintainer: Test <test@example.com>
Description: Turtle Tracer test package
EOF
    printf '#!/bin/sh\necho "turtle-tracer %s"\n' "$ver" >"$root/opt/Turtle Tracer/turtle-tracer"
    chmod 755 "$root/opt/Turtle Tracer/turtle-tracer"
    printf 'fake chrome-sandbox\n' >"$root/opt/Turtle Tracer/chrome-sandbox"
    chmod 755 "$root/opt/Turtle Tracer/chrome-sandbox"
    # Like electron-builder's post-install step, except v2.3.0 which stands in for a package whose
    # helper did not end up setuid (so the installer's launcher patch can be tested).
    if [ "$ver" != "2.3.0" ]; then
        printf "#!/bin/sh\nchmod 4755 '/opt/Turtle Tracer/chrome-sandbox' || true\n" >"$root/DEBIAN/postinst"
        chmod 755 "$root/DEBIAN/postinst"
    fi
    cat >"$root/usr/share/applications/turtle-tracer.desktop" <<'EOF'
[Desktop Entry]
Name=Turtle Tracer
Exec="/opt/Turtle Tracer/turtle-tracer" %U
Terminal=false
Type=Application
EOF
    dpkg-deb --build --root-owner-group "$root" "$out" >/dev/null
    rm -rf "$root"
}

make_dmg() { # make_dmg FILE VERSION
    local out=$1 ver=$2 src
    src=$(mktemp -d)
    mkdir -p "$src/Turtle Tracer.app/Contents/MacOS"
    cat >"$src/Turtle Tracer.app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Turtle Tracer</string>
<key>CFBundleExecutable</key><string>turtle-tracer</string>
<key>CFBundleShortVersionString</key><string>$ver</string>
<key>CFBundleIdentifier</key><string>com.turtletracer.test</string>
</dict></plist>
EOF
    printf '#!/bin/sh\necho test\n' >"$src/Turtle Tracer.app/Contents/MacOS/turtle-tracer"
    # TT_FIXTURE_PAD_MB=40 adds incompressible padding so downloads/copies take visible time.
    if [ -n "${TT_FIXTURE_PAD_MB:-}" ]; then
        dd if=/dev/urandom of="$src/Turtle Tracer.app/Contents/pad.bin" bs=1048576 count="$TT_FIXTURE_PAD_MB" 2>/dev/null
    fi
    chmod 755 "$src/Turtle Tracer.app/Contents/MacOS/turtle-tracer"
    rm -f "$out"
    hdiutil create -quiet -volname "Turtle Tracer" -srcfolder "$src" -format UDZO "$out"
    rm -rf "$src"
}

for r in $RELEASES; do
    tag=${r%%:*}
    ver=${tag#v}
    d="$FIX/assets/$tag"
    mkdir -p "$d"
    if [ "$tag" = "v2.1.0" ]; then
        # An old release with different file names, to exercise the fallback matcher.
        names_plain="Pedro-Visualizer-$ver-x64.exe Visualizer-$ver-x86_64.AppImage Visualizer-$ver-aarch64.AppImage"
        for n in $names_plain; do printf 'fake %s\n' "$n" >"$d/$n"; done
        [ "$(uname -s)" = Darwin ] && { make_dmg "$d/Pedro-Visualizer-$ver-arm64.dmg" "$ver"; make_dmg "$d/Pedro-Visualizer-$ver-x64.dmg" "$ver"; }
        continue
    fi
    for n in "Turtle-Tracer-$ver-x86_64.AppImage" "Turtle-Tracer-$ver-arm64.AppImage" "Turtle-Tracer-Setup-$ver.exe"; do
        printf '#!/bin/sh\necho "fake %s"\n' "$n" >"$d/$n"
    done
    if command -v dpkg-deb >/dev/null 2>&1; then
        make_deb "$d/Turtle-Tracer-$ver-amd64.deb" "$ver" amd64
        make_deb "$d/Turtle-Tracer-$ver-arm64.deb" "$ver" arm64
    fi
    if command -v hdiutil >/dev/null 2>&1; then
        make_dmg "$d/Turtle-Tracer-$ver-arm64.dmg" "$ver"
        make_dmg "$d/Turtle-Tracer-$ver-x64.dmg" "$ver"
    fi
done

# Checksums: published for 2.3.0 and newer only (older releases have none, like real life).
# Re-generated on every run so a second run on another OS adds its files.
for r in $RELEASES; do
    tag=${r%%:*}
    case "$tag" in v2.1.0 | v2.2.1) continue ;; esac
    d="$FIX/assets/$tag"
    : >"$d/SHA256SUMS"
    for f in "$d"/*; do
        n=$(basename "$f")
        [ "$n" = SHA256SUMS ] && continue
        printf '%s  %s\n' "$(sha "$f")" "$n" >>"$d/SHA256SUMS"
    done
done
echo "fixtures ready in $FIX"
