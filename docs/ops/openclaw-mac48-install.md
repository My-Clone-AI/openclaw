# Install the fork's OpenClaw app on mac48

This is an operator-run procedure. Build and publish only when separately
authorized; the repository script does not connect to mac48 or any other host.
The app is a client of the remote Gateway. Configure its Gateway connection in
the app; GitHub credentials for repository search stay in the Gateway's
existing configuration or environment.

## Prepare a ZIP

On a macOS build machine, check out the intended `My-Clone-AI/openclaw`
`develop` commit and record `git rev-parse HEAD`. Follow the fork build guide
at `docs/ops/openclaw-mac-fork-build.md`. For distribution use the existing
`scripts/package-mac-dist.sh` release packaging flow with the product bundle ID
`ai.openclaw.mac`, a suitable Developer ID signing identity and notarization
credentials. It produces `dist/OpenClaw-<version>.zip`; keep credentials out of
the repository. Configure a fork-owned `SPARKLE_FEED_URL` and matching
`SPARKLE_PUBLIC_ED_KEY` before packaging, since the defaults point to upstream.
Do not publish an unsigned or unnotarized build as a release.

Record `shasum -a 256 dist/OpenClaw-<version>.zip` and transfer the ZIP and
its SHA-256 through trusted, separately verified channels to mac48.

## Manual installation

On mac48, quit OpenClaw and move the existing `/Applications/OpenClaw.app`
to a backup location. From a copy of this repository, run:

```sh
scripts/ops/install-openclaw-mac48.sh ~/Downloads/OpenClaw-VERSION.zip SHA256
open /Applications/OpenClaw.app
```

The script verifies the digest, bundle identifier, code signature and Gatekeeper
assessment before copying. It refuses to overwrite an existing app. If any
check fails, retain or restore the backup and investigate the artifact and its
signing; do not bypass Gatekeeper. Confirm the app version and remote Gateway
connection, then exercise the new-session repository picker. Roll back by
quitting the app, moving the new app aside and restoring the backup.

## Sparkle distribution alternative

A feed must be configured in the signed app at build time; editing its plist
after signing invalidates the signature. Use a fork-controlled HTTPS feed and
its matching Sparkle public key, and keep the private signing key outside the
repository. The existing `scripts/make_appcast.sh` generates a signed appcast
from the distribution ZIP using `SPARKLE_PRIVATE_KEY_FILE`; set
`SPARKLE_DOWNLOAD_URL_PREFIX` to the intended artifact location and pass the
feed URL as its second argument. Review the resulting appcast and its artifact
URLs before publishing both through the approved distribution process. The
script defaults to upstream URLs and seeds from the repository appcast, so
review existing entries as well. Publication is a separate authorized action.

After installing a build configured for that feed, use the app's Check for
Updates action and verify the offered version and successful relaunch. Sparkle
filters updates by the Gateway update channel; a feed entry must match the
selected channel and have a newer build version. Keep the manual ZIP and backup
available for recovery.
