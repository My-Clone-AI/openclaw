# Build the OpenClaw macOS app from the fork

On a macOS build machine, check out the intended commit of `develop` from
`My-Clone-AI/openclaw`. The wrapper builds the current checkout; it does not
fetch, switch branches, deploy, or install an app. Confirm the commit with
`git rev-parse HEAD` before building. Install the Xcode/Swift toolchain, Node,
and pnpm required by the checkout and its macOS packaging scripts.

From the repository root:

```sh
scripts/ops/build-openclaw-mac-fork.sh --bundle
```

This delegates to `scripts/package-mac-app.sh`, which builds the Control UI and
matching runtime, assembles and verifies the bundle, and writes
`dist/OpenClaw.app` using `scripts/lib/mac-app-bundle.sh`. Its default bundle
identifier is `ai.openclaw.mac.debug`. For the product identifier, explicitly
set `BUNDLE_ID=ai.openclaw.mac` and configure an appropriate Sparkle feed before
building; the packaging script otherwise defaults to the upstream feed for
non-debug identifiers. Signing uses the existing local keychain and packaging
script settings. Keep signing identities and credentials outside the repository;
see `scripts/codesign-mac-app.sh --help` for local signing options. This recipe
does not notarize or publish the app.

For a local Swift debug cycle instead, run:

```sh
scripts/ops/build-openclaw-mac-fork.sh --run
```

This delegates to `scripts/build-and-run-mac.sh`: it builds and relaunches the
local debug binary, not an app bundle. It stops an existing debug process from
the same checkout. The packaged app is a client; configure its remote Gateway
connection separately. GitHub credentials for remote repository search belong
in the Gateway's existing configuration or environment, never in this recipe.
