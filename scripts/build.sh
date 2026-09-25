#!/bin/bash
# Builds dist/passr-<version>.zip for the Chrome Web Store (strips the dev "key" from the manifest).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")
OUT="dist/passr-$VERSION.zip"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp -R extension/ "$STAGE/"
python3 - "$STAGE/manifest.json" <<'PY'
import json, sys
p = sys.argv[1]
m = json.load(open(p))
m.pop("key", None)
json.dump(m, open(p, "w"), indent=2)
PY

mkdir -p dist
rm -f "$OUT"
(cd "$STAGE" && zip -qrX - . -x '.*') > "$OUT"
echo "✓ $OUT"
