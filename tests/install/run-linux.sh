#!/usr/bin/env bash
# Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
# Run the Linux installer scenarios in Docker containers against a local fake release server.
# usage: tests/install/run-linux.sh [image ...]      (default: a spread of distros)
# DOCKER_ARGS adds docker options, e.g. DOCKER_ARGS="--security-opt seccomp=unconfined" to let user
# namespaces work inside the containers, or DOCKER_ARGS="--platform linux/amd64".
# On macOS/Docker Desktop containers reach the host as host.docker.internal; on Linux hosts
# (e.g. CI) set HOST_NET=1 to use --network host.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
WORK=${WORK:-$(mktemp -d)}
PORT=${PORT:-18081}
IMAGES=("$@")
[ ${#IMAGES[@]} -gt 0 ] || IMAGES=(debian:12-slim ubuntu:24.04 fedora:41 archlinux:latest alpine:3.20)

"$HERE/make-fixtures.sh" "$WORK/fix" >/dev/null
python3 "$HERE/fake-github.py" "$PORT" "$WORK/fix" >"$WORK/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1

if [ -n "${HOST_NET:-}" ]; then NETARGS=(--network host); BASE=http://127.0.0.1:$PORT
else NETARGS=(); BASE=http://host.docker.internal:$PORT; fi

rc=0
for img in "${IMAGES[@]}"; do
    # shellcheck disable=SC2086  # DOCKER_ARGS is deliberately word-split (e.g. "--platform linux/amd64")
    docker run --rm ${DOCKER_ARGS:-} "${NETARGS[@]}" -v "$REPO":/repo:ro \
        -e TT_GITHUB_URL="$BASE" -e TT_API_URL="$BASE" -e TT_RAW_URL="$BASE" \
        "$img" sh /repo/tests/install/linux-scenarios.sh || rc=1
done
exit $rc
