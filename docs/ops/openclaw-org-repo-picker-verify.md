# Verify the org and repository picker is done

The picker is Concluídas only after the OC-21 commit is on `develop` in
`My-Clone-AI/openclaw` and the corresponding build is installed and verified on
mac48. The checker reads GitHub using the authenticated `gh` CLI and reads a
local operator evidence file. It does not deploy, connect to mac48, or perform
the manual checks. A pass relies on the operator's truthful evidence; retain the
underlying records for review. Never put credentials or private configuration in
the evidence file or its reference.

1. After the bundle is merged, identify the full OC-21 commit SHA (the commit
   whose message contains `[20261104T155432-t980u-oc-21]`). For a squash merge,
   use the resulting commit only if its message retains that marker. Make it
   available in the local Git repository. The checker queries the fork's live
   `develop` and fails if the commit is not its ancestor or GitHub is unavailable.
2. With separate deployment authorization, build the merged source and follow
   [the mac48 installation procedure](openclaw-mac48-install.md). Record the
   source commit, archive SHA-256, installation result, app bundle ID
   `ai.openclaw.mac`, and evidence location. Verify the installed artifact is
   built from that commit. Do not use an unrelated build or Grok Bot.app.
3. On mac48, verify OpenClaw.app connects to the intended Master Gateway. In a
   Coding new session, verify all four organization choices and remote searches,
   select multiple repositories, and verify `develop` and default-branch
   fallback where applicable. Verify pasted Git URLs and Advanced Browse folders
   remain usable. Record the results and any failure in the retained evidence.
4. Only after every check passes, create a local UTF-8 evidence file in exactly
   this format, replacing the placeholders. `evidence_reference` must point to
   the retained dated operator record and contain no whitespace. Each `pass`
   is the operator's attestation of the corresponding check above.

   ```text
   commit=<full lowercase OC-21 commit SHA>
   artifact_sha256=<64 lowercase hexadecimal characters>
   evidence_reference=<record-location>
   install=pass
   gateway=pass
   organizations=pass
   multiselect=pass
   branches=pass
   paste_url=pass
   browse_folders=pass
   ```

5. Run `scripts/ops/verify-org-repo-picker-done.sh <commit-sha> <evidence-file>`
   from a checkout containing the commit. A zero exit means the GitHub ancestry
   check passed and all required operator attestations are present and match the
   commit. Missing, failed, malformed, or mismatched evidence and GitHub errors
   exit nonzero. A prior record for another commit cannot establish completion.
