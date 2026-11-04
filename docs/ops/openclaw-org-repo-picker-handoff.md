# OpenClaw organization repository picker handoff

This is the Team Memory handoff for the fork's new-session Coding project picker, as of the OC-20 source commit. It describes the code in this bundle, not a deployed or released build. OpenClaw.app is a thin client; repository search runs on its connected Gateway.

## What is in the bundle

- The picker offers My-Clone-AI, bitcoinuniverseio, Project-Boden, and Echelon-RSVP. My-Clone-AI is the ordinary default; BU / Bitcoin Universe context selects bitcoinuniverseio. An explicit selection can change the organization.
- Enter at least two characters to search the selected organization. Results can be toggled as multiple selections, and organization and repository preferences are persisted. Pasting a Git URL still offers a clone option. Local project options, including Browse folders, are under Advanced for non-admin coding sessions.
- Gateway `projects.searchRemote` accepts an organization and restricts it to the supported list. It requires a GitHub credential for organization search. Search prefers `develop` when found and otherwise uses the repository's reported default branch.
- The UI can hold multiple selected repositories, but session creation currently submits only the primary repository. Additional checkout provisioning is not implemented; do not treat multiple selected chips as proof that all repositories were checked out.

## Flags and prerequisites

There is no dedicated picker rollout flag in this bundle. `gateway.projects.nativeGitHubSearch` selects the native GitHub credential path when true. Otherwise organization search uses the existing Gateway Control UI GitHub service credential (`gateway.controlUi.github.token`) or, for github.com, `GH_TOKEN` / `GITHUB_TOKEN` in the Gateway environment. Configure an identity with access to the desired repositories using the existing secret mechanisms; do not put credentials in the app, source, commands captured in reports, or logs. A missing credential, insufficient access, or an unavailable Gateway can prevent results.

The fork's build wrapper accepts `--bundle` or `--run`; `--bundle` defaults to the debug bundle ID unless explicitly configured. The thin-client verification script defaults to a dry run; `--execute` enables its live browser check. Building, installing, restarting a shared Gateway, and deployment require their own authorization. See `docs/ops/openclaw-mac-fork-build.md` and `docs/ops/openclaw-mac48-install.md` for the operator procedures.

## Verify and hand off

1. Record the exact source commit and app build under test. Confirm the app is connected to the intended remote Gateway and that the Gateway has an authorized GitHub identity with access to each organization. Do not record credential values.
2. In a Coding new-session project picker, choose each organization and search for a known accessible repository with at least two characters. Check results belong to the selected organization. Select two repositories and confirm both appear selected; switch organizations and return to check selection and preference behavior.
3. Check a repository with `develop` and one without it: the chosen branch should be `develop` for the first and the reported default for the second. Paste a Git URL and confirm its clone option appears. For a non-admin coding session, open Advanced and confirm Browse folders remains available.
4. Create a session only in an authorized test environment and verify the primary checkout and branch. Record the multiple-checkout limitation above; do not claim full multi-repository provisioning from picker selection alone.
5. For a read-only scripted picker check, run `node scripts/ops/verify-thin-client-remote-picker.ts` with Node 24 for the dry run, or use `--help` for the separately authorized live `--execute` options. The live check validates the supplied configuration target and visible browser results; the operator must also confirm the browser is connected to that Gateway. It does not prove session creation or all four organizations in one run.

Record the commit, environment, organizations and checks performed, failures, and deployment status in the team handoff without secrets. The bundle's focused tests and E2E source are supporting evidence; the E2E files were excluded by the prescribed focused Vitest configuration, and no live Mac or Gateway verification is claimed here.
