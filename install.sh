#!/bin/bash
# Installs the passr native messaging host for Chromium-family browsers on macOS and Linux.
#
#   ./install.sh               install from a clone
#   curl -fsSL https://raw.githubusercontent.com/wes/passr-chrome/main/install.sh | bash
#   ./install.sh --uninstall
set -euo pipefail

NAME="com.passr.host"
REPO_RAW="https://raw.githubusercontent.com/wes/passr-chrome/main"
# Unpacked/dev build (pinned by the "key" in extension/manifest.json) and the Chrome Web Store build.
DEV_ID="nhkiodgoijpenbjclggfpgecbianeicp"
STORE_ID=""
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/passr-chrome"

if [ "$(uname)" = "Darwin" ]; then
  S="$HOME/Library/Application Support"
  BROWSERS=("Google/Chrome" "Google/Chrome Beta" "Google/Chrome Canary" "Chromium"
    "BraveSoftware/Brave-Browser" "Microsoft Edge" "Vivaldi" "Arc/User Data")
else
  S="${XDG_CONFIG_HOME:-$HOME/.config}"
  BROWSERS=("google-chrome" "google-chrome-beta" "google-chrome-unstable" "chromium"
    "BraveSoftware/Brave-Browser" "microsoft-edge" "vivaldi")
fi

if [ "${1:-}" = "--uninstall" ]; then
  for b in "${BROWSERS[@]}"; do rm -f "$S/$b/NativeMessagingHosts/$NAME.json"; done
  rm -rf "$DEST"
  echo "✓ passr host removed"
  exit 0
fi

need() { command -v "$1" >/dev/null || { echo "✗ $1 not found. $2" >&2; exit 1; }; }
need python3 "passr needs Python 3."
need gpg "Install GnuPG (and pass) first."
[ -d "${PASSWORD_STORE_DIR:-$HOME/.password-store}" ] ||
  echo "! No password store at ${PASSWORD_STORE_DIR:-$HOME/.password-store} yet (run \`pass init\`)."

mkdir -p "$DEST"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd)/host/passr_host.py"
if [ -f "$SRC" ]; then
  cp "$SRC" "$DEST/passr_host.py"
else
  need curl "Needed to download the host."
  curl -fsSL "$REPO_RAW/host/passr_host.py" -o "$DEST/passr_host.py"
fi

# Browsers launch hosts with a bare environment, so bake in PATH and store settings.
cat > "$DEST/passr-host" <<SH
#!/bin/bash
export PATH="$(dirname "$(command -v gpg)"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
${PASSWORD_STORE_DIR:+export PASSWORD_STORE_DIR="$PASSWORD_STORE_DIR"}
${PASSWORD_STORE_CLIP_TIME:+export PASSWORD_STORE_CLIP_TIME="$PASSWORD_STORE_CLIP_TIME"}
${GNUPGHOME:+export GNUPGHOME="$GNUPGHOME"}
exec "$(command -v python3)" "$DEST/passr_host.py" "\$@"
SH
chmod +x "$DEST/passr-host"

ORIGINS="\"chrome-extension://$DEV_ID/\""
[ -n "$STORE_ID" ] && ORIGINS="$ORIGINS, \"chrome-extension://$STORE_ID/\""
MANIFEST="{
  \"name\": \"$NAME\",
  \"description\": \"passr native host\",
  \"path\": \"$DEST/passr-host\",
  \"type\": \"stdio\",
  \"allowed_origins\": [$ORIGINS]
}"

found=0
for b in "${BROWSERS[@]}"; do
  if [ -d "$S/$b" ]; then
    mkdir -p "$S/$b/NativeMessagingHosts"
    echo "$MANIFEST" > "$S/$b/NativeMessagingHosts/$NAME.json"
    echo "✓ registered with $b"
    found=1
  fi
done
[ "$found" = 1 ] || echo "! No supported browser profile found. Open your browser once, then re-run."

echo
echo "Done. Restart the passr popup if it was open."
