#!/usr/bin/env bash
# Install the membrane commit-msg enforcement hook into a git repo's hooks dir.
#
# Usage:
#   hooks/install.sh                 # install into THIS repo (the shared corpus)
#   hooks/install.sh /path/to/repo   # install into a consumer repo that points
#                                    # its membrane <store> at this corpus
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-$(cd "$HERE/.." && pwd)}"
HOOKS="$(git -C "$TARGET" rev-parse --git-path hooks)"
mkdir -p "$HOOKS"
cp "$HERE/commit-msg" "$HOOKS/commit-msg"
chmod +x "$HOOKS/commit-msg"
echo "installed membrane commit-msg hook -> $HOOKS/commit-msg"
