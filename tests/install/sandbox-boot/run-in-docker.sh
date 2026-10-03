#!/usr/bin/env bash
# Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
# Runs the sandbox boot test in a container as a non-root user. Docker's default seccomp profile
# blocks unprivileged user namespaces, which stands in for Ubuntu 23.10+'s AppArmor restriction.
# usage: run-in-docker.sh [docker args...]      e.g. --security-opt seccomp=unconfined for the "works" case
set -uo pipefail
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
ELECTRON_VERSION=$(node -p "require('$REPO/package.json').devDependencies.electron.replace(/^[^0-9]*/, '')")
docker run --rm "$@" -v "$REPO":/repo:ro node:20-bookworm bash -c '
set -e
apt-get update -qq >/dev/null
apt-get install -y -qq xvfb libgtk-3-0 libnss3 libasound2 libgbm1 libxss1 libxtst6 libatk-bridge2.0-0 libcups2 libdrm2 >/dev/null 2>&1
mkdir -p /home/node/w && cp -r /repo/tests/install/sandbox-boot /home/node/w/ && true
cd /home/node/w && echo "{\"type\":\"module\"}" > package.json
# place main.mjs so its ../../../electron path resolves
mkdir -p tests/install && mv sandbox-boot tests/install/ && chown -R node:node /home/node/w
su node -c "cd /home/node/w && npm i --silent --no-audit --no-fund electron@'$ELECTRON_VERSION' >/dev/null 2>&1"
echo "== userns available to this user? $(su node -c "unshare -Ur true >/dev/null 2>&1 && echo yes || echo NO")"
run() { su node -c "cd /home/node/w && timeout 60 xvfb-run -a ./node_modules/electron/dist/electron ${2:-} tests/install/sandbox-boot/main.mjs 2>&1" | grep -E "BOOT_OK|FATAL" | head -6; echo "exit: ${PIPESTATUS[0]}"; }
echo "--- plain launch (what a launcher without the flag does):"; run ""
echo "--- launch with --no-sandbox (what the installer writes into the launcher when needed):"; run "" --no-sandbox
'
