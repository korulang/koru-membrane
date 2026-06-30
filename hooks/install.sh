#!/usr/bin/env bash
# Install the membrane + worldmodel git discipline into ANY repo. Ubiquitous by
# design — a no-brainer to drop on any repo:
#   commit-msg   — the gate (universal World Model signal + OKF-aware lineage)
#   post-commit  — the faucet (routes belief-class signals to the corpus inbox)
#   .membrane    — store pointer (which corpus this repo's beliefs flow into)
#   concepts/    — the OKF store, scaffolded so the corpus is ready immediately
#
# By default a repo is its OWN self-contained corpus (zero config). Pass a shared
# corpus path to make it a consumer that routes its beliefs into a family store.
#
# Usage:
#   hooks/install.sh                       # install into THIS repo (self corpus)
#   hooks/install.sh /path/to/repo         # repo as its OWN self-contained corpus
#   hooks/install.sh /path/to/repo /corpus # repo routes its beliefs to <corpus>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CORPUS_ROOT="$(cd "$HERE/.." && pwd)"
TARGET="$(cd "${1:-$CORPUS_ROOT}" && pwd)"
STORE="$(cd "${2:-$TARGET}" && pwd)"     # default: self-contained (store = repo)

HOOKS="$(git -C "$TARGET" rev-parse --absolute-git-dir)/hooks"
mkdir -p "$HOOKS" "$STORE/concepts"
[ -e "$STORE/concepts/.gitkeep" ] || : > "$STORE/concepts/.gitkeep"
for h in commit-msg commit-msg.cjs post-commit post-commit.cjs; do
  cp "$HERE/$h" "$HOOKS/$h"; chmod +x "$HOOKS/$h"
done
printf '%s\n' "$STORE" > "$TARGET/.membrane"

echo "installed commit-msg + post-commit -> $HOOKS"
echo "store pointer                       -> $TARGET/.membrane ($STORE)"
if [ "$STORE" = "$TARGET" ]; then
  echo "topology: self-contained (this repo is its own corpus)"
else
  echo "topology: consumer → shared corpus ($STORE)"
fi
