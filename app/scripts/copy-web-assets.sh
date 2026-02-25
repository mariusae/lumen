#!/bin/bash
#
# Copy the web app build output into the iOS app bundle.
#
# In Xcode: runs as a pre-build script (see project.yml).
# Standalone: run from the app/ directory after `npm run build`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$APP_DIR/.." && pwd)"

WEB_DIST="$PROJECT_ROOT/dist"
WEB_DEST="$APP_DIR/Lumen/Resources/web"

# Also copy the app icon into the asset catalog
ICON_SRC="$PROJECT_ROOT/public/icon-1024.png"
ICON_DEST="$APP_DIR/Lumen/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png"

if [ ! -d "$WEB_DIST" ]; then
    echo "warning: Web build not found at $WEB_DIST"
    echo "warning: Run 'npm run build' from the project root first."

    # Create a placeholder so Xcode doesn't fail
    mkdir -p "$WEB_DEST"
    if [ ! -f "$WEB_DEST/index.html" ]; then
        echo '<html><body><h1>Run npm run build</h1></body></html>' > "$WEB_DEST/index.html"
    fi
    exit 0
fi

echo "Copying web assets from $WEB_DIST to $WEB_DEST"

# Clean and copy
rm -rf "$WEB_DEST"
mkdir -p "$WEB_DEST"
cp -R "$WEB_DIST"/ "$WEB_DEST"/

# Remove sourcemaps from the production bundle (saves ~2-5MB)
find "$WEB_DEST" -name '*.map' -delete 2>/dev/null || true

# Remove the service worker — the native app doesn't need it
rm -f "$WEB_DEST/sw.js" "$WEB_DEST/workbox-"*.js "$WEB_DEST/registerSW.js" 2>/dev/null || true

echo "Web assets copied successfully ($(du -sh "$WEB_DEST" | cut -f1))"

# Copy app icon
if [ -f "$ICON_SRC" ]; then
    cp "$ICON_SRC" "$ICON_DEST"
    echo "App icon copied"
fi
