#!/usr/bin/env bash
# Labware WTS — Cloud Agent install (idempotent).
#
# Sets up the multi-repo Labware / WordsThatSells workspace future Cloud
# Agents boot from: the Node 20 LTS toolchain, the sibling Labware repos,
# and their dependencies. Safe to run repeatedly (build snapshot + reboots).
#
# NEVER copies secrets or .env files. Runtime secrets come from Cursor
# Secrets, injected as environment variables at boot.
set -euo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# The marketing repo is the primary workspace (checked out at $WORKSPACE).
WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Sibling Labware repos live together under ~/repos; marketing is symlinked
# in for a single, unified view without polluting its git tree.
REPOS_DIR="${LABWARE_REPOS_DIR:-$HOME/repos}"
GH_OWNER="laurentlaboise"
EXTRA_REPOS=(ai-team labware.icu digitalcards)

# ---------------------------------------------------------------------------
# 1. System tooling: git, python3, ripgrep, jq (git/python3 ship in the base
#    image; ripgrep/jq are installed only when missing so re-runs are cheap).
# ---------------------------------------------------------------------------
log "System tooling (git, python3, ripgrep, jq)"
missing=()
for tool in rg jq; do command -v "$tool" >/dev/null 2>&1 || missing+=("$tool"); done
if [ "${#missing[@]}" -gt 0 ]; then
  declare -A PKG=( [rg]=ripgrep [jq]=jq )
  pkgs=(); for m in "${missing[@]}"; do pkgs+=("${PKG[$m]}"); done
  if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else SUDO=""; fi
  $SUDO apt-get update -qq || true
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq "${pkgs[@]}" || true
fi
command -v git >/dev/null || { echo "git is required but missing"; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required but missing"; exit 1; }

# ---------------------------------------------------------------------------
# 2. Node 20 LTS via nvm (the pinned project toolchain).
#    Note: the Cursor runtime also exposes its own node at /exec-daemon/node,
#    which precedes nvm on PATH for the agent's shell. Project work should run
#    `nvm use 20` (see AGENTS.md). Dependency installs below run under Node 20.
# ---------------------------------------------------------------------------
log "Node 20 LTS (nvm)"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 20 >/dev/null
nvm alias default 20 >/dev/null
nvm use 20 >/dev/null
echo "node $(node -v) / npm $(npm -v) (via nvm)"

# npm install helper: only runs when a package.json is present, tolerant of a
# committed lockfile drift (npm install, not npm ci, so a stale lock refreshes
# instead of aborting the whole box).
npm_install() {
  local dir="$1" label="$2"
  if [ -f "$dir/package.json" ]; then
    log "npm install — $label"
    ( cd "$dir" && npm install --no-audit --no-fund )
  else
    echo "skip $label (no package.json at $dir)"
  fi
}

# ---------------------------------------------------------------------------
# 3. Clone / refresh the sibling Labware repos (idempotent). Existing checkouts
#    are fetched, never force-reset, so local work is preserved. Only the four
#    approved repos are touched — no drive-by clones.
# ---------------------------------------------------------------------------
log "Labware repos -> $REPOS_DIR"
mkdir -p "$REPOS_DIR"
for repo in "${EXTRA_REPOS[@]}"; do
  dest="$REPOS_DIR/$repo"
  if [ -d "$dest/.git" ]; then
    echo "fetch $repo"
    git -C "$dest" fetch --all --prune --quiet || echo "  (fetch failed for $repo; keeping existing checkout)"
  else
    echo "clone $repo"
    git clone --quiet "https://github.com/$GH_OWNER/$repo.git" "$dest" \
      || echo "  (clone failed for $repo; check repositoryDependencies / access)"
  fi
done
# Unified view: marketing (the workspace) alongside the siblings.
ln -sfn "$WORKSPACE" "$REPOS_DIR/marketing"

# ---------------------------------------------------------------------------
# 4. Dependencies per repo.
# ---------------------------------------------------------------------------
npm_install "$WORKSPACE" "marketing (WTS)"
npm_install "$REPOS_DIR/ai-team" "ai-team (Labware registry, Vite/React/TS)"
npm_install "$REPOS_DIR/labware.icu" "labware.icu (landing)"
# digitalcards: Nest API at the repo root, Next app in digital-card-platform/.
npm_install "$REPOS_DIR/digitalcards" "digitalcards (Nest API)"
npm_install "$REPOS_DIR/digitalcards/digital-card-platform" "digitalcards app (Next)"

log "Install complete"
echo "workspace : $WORKSPACE (marketing / WTS)"
echo "repos     : $REPOS_DIR"
ls -1 "$REPOS_DIR"
