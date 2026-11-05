import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildNsvxInventory,
  buildOpenClawInventory,
  crossCheckNsvx,
  crossCheckOpenClaw,
  gitReader,
  renderInventory,
  summarizeParity,
  validateRegistryShape,
  workingTreeReader,
  type Registry,
  type RegistryEntry,
} from "../../scripts/nsvx-parity-inventory.mts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const COMMIT = "a".repeat(40);

const NSVX_FILES: Record<string, string> = {
  "web/src/App.tsx": `
function AppRoutes() {
  if(p==='/portal') return <Portal/>;
}
function Shell() {
  if (seg.length === 0) screen = <TodayScreen />;
  else if (seg[0] === 'tasks' && seg[1] === 'auto') {
    screen = <ChunkBoundary><AutoScreen /></ChunkBoundary>;
  }
  else if (seg[0] === 'tasks') screen = <MissionsScreen />;
  else if (seg[0] === 'air' || seg[0] === 'work') screen = <AirScreen />;
  else if (seg[0] === 'biz' && seg[1] !== 'uber') screen = <BizScreen />;
  else {
    screen = <Empty />;
  }
}`,
  "web/src/logic/navigation.ts": `export const A = { to: '/tasks', label: 'Tasks', icon: 'tasks' };`,
  "web/src/screens/Tasks.tsx": `
const load = () => api.get('/api/tasks/list');
const live = (id) => api.get(\`/api/tasks/\${id}/live\`);
const gone = () => api.get('/api/ghost');
const TABS = [{ id: 'open', label: 'Open' }];`,
  "web/src/screens/Tasks.test.tsx": `api.get('/api/test-only');`,
  "backend/clone/main.py": `
from . import api
from .admin.api import router as admin_router
app.include_router(api.router)
app.include_router(admin_router, prefix='/api/mounted')`,
  "backend/clone/api.py": `
router = APIRouter(prefix="/api", dependencies=[Depends(owner())])
@router.get("/tasks/list")
def tasks(): ...
@router.post("/tasks/{tid}/live")
def live(): ...
_owner = router
router = APIRouter()
router.include_router(_owner)`,
  "backend/clone/admin/api.py": `
router = APIRouter(prefix='/admin')
@router.delete('/items/{item}')
def remove(): ...`,
  "backend/clone/admin/jobs.py": `
HANDLERS = {
    'admin_sweep': sweep,
}
def queue(conn):
    enqueue(conn, "admin_queue", {})
    enqueue(conn, JOB_KIND, {})`,
  "backend/clone/openclaw_admin/gateway.py": `_READ = frozenset(('health', 'agents.list'))`,
  "deploy/systemd/clone-api.service": "[Unit]\n",
};

const OPENCLAW_FILES: Record<string, string> = {
  "ui/src/app-route-paths.ts": `
const APP_ROUTE_DEFINITIONS = {
  chat: { path: "/chat" },
  "model-setup": { path: "/settings/model-setup", aliases: ["/model-setup"] },
} as const;`,
  "ui/src/pages/chat/route.ts": "",
  "src/gateway/methods/core-descriptors.ts": `
export const CORE_GATEWAY_METHOD_SPECS = [
  ["health", "health", "operator.read", "<=2026.7"],
  ["exec.approval.get", null, "operator.approvals", "<=2026.7"],
  ["agent", "agent", "dynamic", "<=2026.7", { startup: true }],
];`,
  "extensions/board/openclaw.plugin.json": `{"id":"board","categories":["x"],"controlUi":{"entry":"a"}}`,
  "extensions/board/index.ts": `api.registerGatewayMethod("board.list", handler);`,
  "extensions/pane/openclaw.plugin.json": `{"id":"pane"}`,
  "extensions/pane/package.json": `{"openclaw":{"controlUi":"./src/control-ui.tsx"}}`,
};

function tempGitRepo(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nsvx-parity-"));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  const run = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
  run("init", "-q");
  run("add", ".");
  run("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "seed");
  return { dir, commit: execFileSync("git", ["-C", dir, "rev-parse", "HEAD"]).toString().trim() };
}

const NSVX_FIELDS: RegistryEntry["nsvx"] = {
  webRoutes: [],
  backendPackages: [],
  jobPackages: [],
  apiPrefixes: [],
  sourceFiles: [],
  permissions: [],
  effect: "read",
  integrations: [],
  runtime: "not-checked",
};

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: "tasks",
    title: "Tasks",
    family: "01",
    priority: "P1",
    status: "missing",
    nsvx: NSVX_FIELDS,
    openclaw: { uiRoutes: [], gatewayMethods: [], extensions: [], chatTools: [] },
    adapter: "",
    verification: { requires: ["discovery", "ui"], passed: ["discovery"] },
    evidence: { level: "source", source: ["web/src/screens/Tasks.tsx"], runtime: [] },
    blockers: [],
    unknowns: [],
    ...overrides,
  };
}

function registry(entries: RegistryEntry[]): Registry {
  return {
    schemaVersion: 2,
    sources: {
      nsvx: { repo: "n", commit: COMMIT },
      openclaw: { repo: "o", commit: COMMIT },
    },
    families: { "01": "Today" },
    entries,
  };
}

describe("nsvx parity inventory", () => {
  const nsvxRepo = tempGitRepo(NSVX_FILES);
  const openclawRepo = tempGitRepo(OPENCLAW_FILES);
  afterAll(() => {
    fs.rmSync(nsvxRepo.dir, { recursive: true, force: true });
    fs.rmSync(openclawRepo.dir, { recursive: true, force: true });
  });
  const nsvx = buildNsvxInventory(gitReader(nsvxRepo.dir, nsvxRepo.commit));
  const openclaw = buildOpenClawInventory(gitReader(openclawRepo.dir, openclawRepo.commit));

  it("reads routes, clients, mounts, and jobs from Git objects", () => {
    expect(nsvx.webRoutes.map((route) => route.path)).toEqual([
      "/",
      "/air",
      "/biz",
      "/portal",
      "/tasks",
      "/tasks/auto",
      "/work",
    ]);
    expect(nsvx.webRoutes.find((route) => route.path === "/tasks/auto")?.components).toEqual([
      "AutoScreen",
    ]);
    expect(nsvx.navigation).toEqual([{ to: "/tasks", icon: "tasks" }]);
    expect(nsvx.tabs).toEqual([{ screen: "web/src/screens/Tasks.tsx", id: "open" }]);
    expect(nsvx.backendRoutes.map((route) => `${route.method} ${route.path}`)).toEqual([
      "DELETE /api/mounted/admin/items/{item}",
      "GET /api/tasks/list",
      "POST /api/tasks/{tid}/live",
    ]);
    expect(nsvx.jobKinds.map((job) => job.kind)).toEqual(["admin_queue", "admin_sweep"]);
    expect(nsvx.unresolvedEnqueueCalls).toBe(1);
    expect(nsvx.systemdUnits).toEqual(["deploy/systemd/clone-api.service"]);
    expect(nsvx.openclawAdmin.gatewayRpcs).toEqual(["agents.list", "health"]);
  });

  it("does not report a client without a backend route as matched", () => {
    expect(
      Object.fromEntries(nsvx.apiClients.map((client) => [client.path, client.backendMatch])),
    ).toEqual({ "/api/ghost": false, "/api/tasks": true, "/api/tasks/list": true });
  });

  it("reads OpenClaw routes, methods, and plugin views", () => {
    expect(openclaw).toEqual({
      uiRoutes: [
        { id: "chat", path: "/chat", aliases: [] },
        { id: "model-setup", path: "/settings/model-setup", aliases: ["/model-setup"] },
      ],
      pages: ["chat"],
      gatewayMethods: [
        { name: "agent", group: "agent", scope: "dynamic" },
        { name: "exec.approval.get", group: null, scope: "operator.approvals" },
        { name: "health", group: "health", scope: "operator.read" },
      ],
      extensions: [
        { id: "board", categories: ["x"], controlUi: true, gatewayMethods: ["board.list"] },
        { id: "pane", categories: [], controlUi: true, gatewayMethods: [] },
      ],
    });
  });

  it("renders the same bytes twice and keeps private route lists out", () => {
    const covered = registry([
      entry({
        nsvx: {
          ...NSVX_FIELDS,
          webRoutes: ["/tasks"],
          backendPackages: ["admin"],
          apiPrefixes: ["/api/tasks"],
        },
      }),
    ]);
    const first = renderInventory(covered, nsvx, openclaw);
    const second = renderInventory(
      covered,
      buildNsvxInventory(gitReader(nsvxRepo.dir, nsvxRepo.commit)),
      buildOpenClawInventory(gitReader(openclawRepo.dir, openclawRepo.commit)),
    );
    expect(second).toBe(first);
    expect(first).not.toContain("/api/tasks/list");
    expect(first).not.toContain("/tasks/auto");
    const coverage = JSON.parse(first).coverage;
    expect(coverage.uncoveredWebRoutes).toEqual(["/", "/air", "/biz", "/portal", "/work"]);
    expect(coverage.uncoveredBackendPackages).toEqual(["(root)"]);
    expect(coverage.uncoveredJobPackages).toEqual(["admin"]);
    // Counts and an area name only: the route itself stays out of the public document.
    expect(coverage.unassignedRouteAreas).toEqual({ "/api/mounted": 1 });
    expect(coverage.byEntry.tasks).toMatchObject({ routes: 2, reads: 1, writes: 1 });
  });

  it("rejects references the source does not contain", () => {
    const bad = registry([
      entry({
        nsvx: {
          ...NSVX_FIELDS,
          webRoutes: ["/nope"],
          backendPackages: ["nope"],
          jobPackages: ["nope"],
          apiPrefixes: ["/api/nope"],
          sourceFiles: ["web/src/screens/Nope.tsx"],
        },
        openclaw: {
          uiRoutes: ["nope"],
          gatewayMethods: ["nope"],
          extensions: ["nope"],
          chatTools: [],
        },
      }),
    ]);
    expect(crossCheckNsvx(bad, nsvx)).toHaveLength(5);
    expect(crossCheckOpenClaw(bad, openclaw)).toHaveLength(3);
  });

  it("rejects status and evidence claims with no support", () => {
    const errors = validateRegistryShape(
      registry([
        entry({ id: "a", status: "native" }),
        entry({ id: "b", status: "blocked" }),
        entry({ id: "c", evidence: { level: "runtime", source: ["x"], runtime: [] } }),
        entry({ id: "d", evidence: { level: "source", source: [], runtime: [] } }),
        entry({ id: "e", verification: { requires: ["ui"], passed: ["ui"] } }),
        entry({ id: "f", verification: { requires: ["discovery"], passed: ["ui"] } }),
        entry({ id: "g", family: "99" }),
      ]),
    );
    expect(errors).toEqual([
      "a: native status needs an OpenClaw route",
      "b: blocked status needs a blocker",
      "c: runtime evidence level needs a recorded runtime entry",
      "d: evidence.source must not be empty",
      "e: passed verification beyond discovery needs a recorded runtime entry",
      "f: verification.passed must be a subset of requires",
      "f: passed verification beyond discovery needs a recorded runtime entry",
      "g: title and a known family are required",
    ]);
  });

  it("counts an entry as verified only when every required check passed", () => {
    const summary = summarizeParity(
      registry([
        entry({ id: "a", verification: { requires: ["discovery"], passed: ["discovery"] } }),
        entry({ id: "b" }),
      ]),
    );
    expect(summary).toMatchObject({ discovered: 2, missing: 2, verified: 1 });
    expect(summary.families).toEqual([expect.objectContaining({ id: "01", verified: 1 })]);
  });
});

describe("committed nsvx parity registry", () => {
  const read = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "docs/nsvx-parity", file), "utf8"));
  const committed = read("registry.json") as Registry;
  const inventory = read("source-inventory.json");

  it("is valid and matches this working tree", () => {
    expect(validateRegistryShape(committed)).toEqual([]);
    expect(
      crossCheckOpenClaw(committed, buildOpenClawInventory(workingTreeReader(REPO_ROOT))),
    ).toEqual([]);
  });

  it("agrees with the generated inventory and leaves no NSVX area unassigned", () => {
    expect(inventory.sources).toEqual(committed.sources);
    expect(inventory.coverage.uncoveredWebRoutes).toEqual([]);
    expect(inventory.coverage.uncoveredBackendPackages).toEqual([]);
    expect(inventory.coverage.uncoveredJobPackages).toEqual([]);
    expect(inventory.coverage.parity).toEqual(summarizeParity(committed));
    expect(Object.keys(committed.families)).toHaveLength(22);
  });
});
