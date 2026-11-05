# OpenClaw Control

The Mac app loads `http://127.0.0.1:18890/app/`. This process forwards that address to the OpenClaw gateway's native Control UI and forwards its WebSocket unchanged. Session menus, keyboard shortcuts, pin, rename, archive, search, attachments, and the rest of the Control UI stay in the gateway UI. They are not reimplemented here.

## Mac

On the Mac, from a checkout of this repo:

```sh
bash apps/openclaw-control/mac/install-mac.sh
```

The gateway is already tunneled to `127.0.0.1:18789`. The script serves the panel on port 18890, reads `OPENCLAW_GATEWAY_URL` from `~/.openclaw-control/env`, and stops the old Hermes tunnel on that port. It does not edit `~/.openclaw/openclaw.json` or the gateway service. The Control UI asks for the gateway token in the browser.

## Linux service

```sh
bash apps/openclaw-control/install.sh
```

## Tests

```sh
node --test apps/openclaw-control/test/*.test.mjs
```
