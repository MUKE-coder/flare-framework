#!/usr/bin/env bash
# Install the Flare CLI (@flaredev/cli), which provides the `flare` command.
#
#   curl -fsSL https://flare-docs.codetotech.com/install.sh | bash
#
# Options (environment variables):
#   FLARE_VERSION=0.1.0   install a specific version (default: latest)
#   FLARE_PM=pnpm         install with pnpm instead of npm
set -euo pipefail

PACKAGE="@flaredev/cli"
VERSION="${FLARE_VERSION:-latest}"
MIN_NODE=22

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js ${MIN_NODE} or later is required and wasn't found. Install it from https://nodejs.org (or with nvm, fnm or volta), then run this again."
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$MIN_NODE" ]; then
  fail "Node.js ${MIN_NODE} or later is required; you have $(node -v). Upgrade it, then run this again."
fi

PM="${FLARE_PM:-npm}"
case "$PM" in
  npm)  CMD=(npm install -g "${PACKAGE}@${VERSION}") ;;
  pnpm) CMD=(pnpm add -g "${PACKAGE}@${VERSION}") ;;
  *)    fail "FLARE_PM must be npm or pnpm (got \"$PM\")." ;;
esac
command -v "$PM" >/dev/null 2>&1 || fail "$PM wasn't found on your PATH."

bold "Installing ${PACKAGE}@${VERSION} with ${PM}..."
if ! "${CMD[@]}"; then
  if [ "$PM" = npm ]; then
    fail "npm couldn't install globally. If it was a permissions error, set an npm prefix you own (https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) or use a Node version manager, then run this again."
  fi
  fail "The install failed (see the output above)."
fi

if command -v flare >/dev/null 2>&1; then
  bold "Installed $(flare --version | head -n 1 | cut -d " " -f 1)."
  echo "Create an app:  flare create my-app"
else
  echo "Installed, but \`flare\` isn't on your PATH yet. Add your global bin directory to PATH:"
  if [ "$PM" = npm ]; then echo "  export PATH=\"$(npm prefix -g)/bin:\$PATH\""; else echo "  run: pnpm setup"; fi
fi
