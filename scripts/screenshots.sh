#!/bin/bash
# Renders Chrome Web Store images from store/*.html with headless Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
shot() {
  "$CHROME" --headless --disable-gpu --hide-scrollbars --blink-settings=preferredColorScheme=1 \
    --force-device-scale-factor=1 --window-size="$2" --screenshot="$PWD/$3" "file://$PWD/$1" 2>/dev/null
  echo "✓ $3"
}
shot store/screenshot.html 1280,800 store/screenshot-1280x800.png
shot store/promo.html 440,280 store/promo-440x280.png
