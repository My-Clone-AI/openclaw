# New-session project picker inventory

The new-session target controls resolve a project chip in
`ui/src/pages/new-session/target-controls-view.tsx`. `project-chip.ts` derives
its display and clone input; `project-chip.tsx` renders the chip and lazily
loads `project-picker-content.tsx`. `picker.tsx` owns the shared popover,
trigger, and focus lifecycle. The content combines registered local projects,
folder browsing, pasted clone URLs, and remote search.

`draft.ts` constructs the gateway and place owners. `draft-place-state.ts`
coordinates placement, while `draft-place-browser.ts` owns project catalog and
remote search reads. `draft-repository-state.ts` owns repository and checkout
selection; `draft-preference-state.ts` describes persisted preferences.
Submission flows through `draft-create-params.ts` and the gateway session
creation methods, including `server-methods/session-create-project.ts`.

For remote search the flow is picker query → `DraftPlaceBrowser` → Gateway
`projects.searchRemote` → `server-methods/projects.ts` →
`project-github-search.ts` → GitHub API. The method resolves configured host
and optional native credential, rechecks current authority, and returns search
results. The search caches pages by URL, host, and credential scope. Other
project server methods manage the registered project catalog and clone paths.
See `project-github-identity.ts` for GitHub identity handling.
