#!/bin/bash
#
# Build the Lumen iOS app end-to-end:
#   1. Build the web app (npm run build)
#   2. Copy web assets into the iOS bundle
#   3. Generate the Xcode project (via XcodeGen)
#
# Usage:
#   app/scripts/build.sh          # full build
#   app/scripts/build.sh --open   # full build, then open Xcode
#   app/scripts/build.sh --skip-web  # skip npm build (if you already ran it)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$APP_DIR/.." && pwd)"
XCODEGEN_DIR="$APP_DIR/.xcodegen"

OPEN_XCODE=false
SKIP_WEB=false

for arg in "$@"; do
  case "$arg" in
    --open) OPEN_XCODE=true ;;
    --skip-web) SKIP_WEB=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ─── 1. Build web app ───────────────────────────────────────────────

if [ "$SKIP_WEB" = false ]; then
  echo "==> Building web app..."
  (cd "$PROJECT_ROOT" && npm run build)
else
  echo "==> Skipping web build (--skip-web)"
fi

# ─── 2. Copy web assets ─────────────────────────────────────────────

echo "==> Copying web assets..."
"$SCRIPT_DIR/copy-web-assets.sh"

# ─── 3. Generate Xcode project ──────────────────────────────────────

echo "==> Generating Xcode project..."

# Clone XcodeGen if we don't have it yet
if [ ! -d "$XCODEGEN_DIR" ]; then
  echo "    Cloning XcodeGen (one-time)..."
  git clone --depth 1 https://github.com/yonaskolb/XcodeGen.git "$XCODEGEN_DIR"
fi

(cd "$APP_DIR" && swift run --package-path "$XCODEGEN_DIR" xcodegen generate)

echo "==> Done. Project generated at app/Lumen.xcodeproj"

# ─── 4. Optionally open Xcode ───────────────────────────────────────

if [ "$OPEN_XCODE" = true ]; then
  open "$APP_DIR/Lumen.xcodeproj"
fi
