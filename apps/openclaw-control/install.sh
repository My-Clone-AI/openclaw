#!/bin/sh
# Install the OpenClaw Control panel as a local service.
# Does not edit ~/.openclaw/openclaw.json, the gateway unit, charters, or crons.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PORT=${OPENCLAW_CONTROL_PORT:-18890}
STATE=${OPENCLAW_CONTROL_STATE_DIR:-"$HOME/.openclaw-control"}
NODE=$(command -v node) || {
  echo "Node.js is required." >&2
  exit 1
}

mkdir -p "$STATE"
if [ ! -f "$STATE/env" ]; then
  cat > "$STATE/env" <<'EOF'
# Gateway the panel forwards to. The Control UI asks for a token in the browser.
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
EOF
  chmod 600 "$STATE/env"
fi

if command -v systemctl >/dev/null 2>&1 && [ "$(uname)" = "Linux" ]; then
  UNIT_DIR=${XDG_CONFIG_HOME:-"$HOME/.config"}/systemd/user
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/openclaw-control.service" <<EOF
[Unit]
Description=OpenClaw Control panel
After=network.target

[Service]
WorkingDirectory=$ROOT
EnvironmentFile=-$STATE/env
Environment=OPENCLAW_CONTROL_PORT=$PORT
Environment=OPENCLAW_CONTROL_STATE_DIR=$STATE
ExecStart=$NODE $ROOT/src/server.mjs
Restart=on-failure

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now openclaw-control.service
  echo "Panel service started at http://127.0.0.1:$PORT/app/"
  exit 0
fi

echo "No systemd user session. Start it directly:"
echo "  set -a; . \"$STATE/env\"; set +a; node \"$ROOT/src/server.mjs\""
