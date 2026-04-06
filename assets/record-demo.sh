#!/bin/bash
# Record the crag demo GIF using VHS
#
# Prerequisites:
#   brew install charmbracelet/tap/vhs ffmpeg
#   npm install -g @whitehatd/crag   (or use a local build)
#
# Usage:
#   cd assets/
#   bash record-demo.sh

set -e

# 1. Create the npx shim so recording doesn't wait for registry resolution
mkdir -p /tmp/demo-bin

CRAG_BIN=$(which crag 2>/dev/null || echo "")
if [ -z "$CRAG_BIN" ]; then
  # Try local build
  CRAG_BIN="$(cd "$(dirname "$0")/.." && pwd)/bin/crag.js"
  if [ ! -f "$CRAG_BIN" ]; then
    echo "Error: crag not found. Install globally or build locally first."
    exit 1
  fi
  # For local build, wrap with node
  cat > /tmp/demo-bin/npx << SCRIPT
#!/bin/bash
if [[ "\$1" == "@whitehatd/crag" ]]; then
  shift
  exec node "$CRAG_BIN" "\$@"
fi
exec /opt/homebrew/bin/npx "\$@"
SCRIPT
else
  cat > /tmp/demo-bin/npx << SCRIPT
#!/bin/bash
if [[ "\$1" == "@whitehatd/crag" ]]; then
  shift
  exec "$CRAG_BIN" "\$@"
fi
exec /opt/homebrew/bin/npx "\$@"
SCRIPT
fi

chmod +x /tmp/demo-bin/npx

# 2. Verify the shim works
echo "Testing shim..."
/tmp/demo-bin/npx @whitehatd/crag version
echo "Shim OK."

# 3. Record
echo "Recording demo..."
vhs demo.tape

# 4. Report
SIZE=$(du -h demo.gif | cut -f1)
echo ""
echo "Done: demo.gif ($SIZE)"
echo "Move to assets/demo.gif and commit."
