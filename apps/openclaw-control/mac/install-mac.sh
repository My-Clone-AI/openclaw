#!/bin/bash
# Install OpenClaw Control on this Mac. Run it on the Mac, from a checkout of this repo.
# It does not SSH to Master, deploy the gateway, or edit ~/.openclaw/openclaw.json.
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
PORT=${OPENCLAW_CONTROL_PORT:-18890}
STATE=${OPENCLAW_CONTROL_STATE_DIR:-"$HOME/.openclaw-control"}
NODE=$(command -v node || true)
if [ -z "$NODE" ]; then
  echo "Install Node.js 22 or newer, then run this script again." >&2
  exit 1
fi

mkdir -p "$STATE" "$HOME/Library/LaunchAgents"
if [ ! -f "$STATE/env" ]; then
  cat > "$STATE/env" <<'EOF'
# Gateway the panel forwards to. The Control UI asks for a token in the browser.
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
EOF
  chmod 600 "$STATE/env"
fi

# The old Hermes panel was reached through a tunnel on this same port.
# Stop that tunnel so this Mac serves the OpenClaw panel locally.
if launchctl print "gui/$(id -u)/com.openclaw.hermes-ui-tunnel" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/com.openclaw.hermes-ui-tunnel" || true
fi

WRAPPER="$STATE/start.sh"
cat > "$WRAPPER" <<EOF
#!/bin/bash
set -a
[ -f "$STATE/env" ] && . "$STATE/env"
set +a
exec "$NODE" "$ROOT/src/server.mjs"
EOF
chmod 700 "$WRAPPER"

PLIST="$HOME/Library/LaunchAgents/com.openclaw.control.plist"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw.control</string>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$WRAPPER</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OPENCLAW_CONTROL_PORT</key>
    <string>$PORT</string>
    <key>OPENCLAW_CONTROL_STATE_DIR</key>
    <string>$STATE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/com.openclaw.control" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/com.openclaw.control"
launchctl kickstart -k "gui/$(id -u)/com.openclaw.control"

echo "OpenClaw Control is running at http://127.0.0.1:$PORT/app/"
echo "OpenClaw Control.app loads that address. The Control UI asks for the gateway token in the browser."
