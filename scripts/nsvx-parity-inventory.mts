#!/usr/bin/env node
// Reproducible source inventory for the NSVX -> OpenClaw Control parity registry.
// Reads both repositories at the commits pinned in docs/nsvx-parity/registry.json
// through read-only Git object access, so results never depend on a checkout.
// The clone repository is private and this one is public: only aggregates and
// a digest of the private route-level lists are tracked; `--full-out` writes the
// complete lists to a path the operator chooses, for local use.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type SourceReader = {
  list: () => string[];
  read: (files: string[]) => Map<string, string>;
};

type WebRoute = { path: string; components: string[] };
type NavItem = { to: string; icon: string };
type Tab = { screen: string; id: string };
type ApiClient = { path: string; files: string[]; backendMatch: boolean };
type BackendRoute = { method: string; path: string; file: string };
type JobKind = { kind: string; file: string };

export type NsvxInventory = {
  webRoutes: WebRoute[];
  navigation: NavItem[];
  screens: string[];
  tabs: Tab[];
  apiClients: ApiClient[];
  backendRoutes: BackendRoute[];
  jobKinds: JobKind[];
  unresolvedEnqueueCalls: number;
  systemdUnits: string[];
  openclawAdmin: { files: string[]; gatewayRpcs: string[] };
  files: string[];
};

export type OpenClawInventory = {
  uiRoutes: { id: string; path: string; aliases: string[] }[];
  pages: string[];
  gatewayMethods: { name: string; group: string | null; scope: string }[];
  extensions: { id: string; categories: string[]; controlUi: boolean; gatewayMethods: string[] }[];
};

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const uniqueSorted = (values: Iterable<string>) => [...new Set(values)].toSorted(byText);
const sortBy = <T,>(items: T[], key: (item: T) => string) =>
  items.toSorted((a, b) => byText(key(a), key(b)));

function git(repo: string, args: string[], input?: string): Buffer {
  const result = spawnSync("git", ["-C", repo, ...args], {
    input,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed in ${repo}: ${result.stderr.toString().trim()}`);
  }
  return result.stdout;
}

export function gitReader(repo: string, commit: string): SourceReader {
  return {
    list: () =>
      git(repo, ["ls-tree", "-r", "--name-only", "-z", commit])
        .toString()
        .split("\0")
        .filter(Boolean),
    read: (files) => {
      const output = git(
        repo,
        ["cat-file", "--batch"],
        files.map((file) => `${commit}:${file}\n`).join(""),
      );
      const contents = new Map<string, string>();
      let offset = 0;
      for (const file of files) {
        const headerEnd = output.indexOf(10, offset);
        const header = output.subarray(offset, headerEnd).toString();
        const size = Number(header.split(" ")[2]);
        if (header.endsWith(" missing") || !Number.isFinite(size)) {
          throw new Error(`Cannot read ${file} at ${commit}: ${header}`);
        }
        const start = headerEnd + 1;
        contents.set(file, output.subarray(start, start + size).toString());
        offset = start + size + 1;
      }
      return contents;
    },
  };
}

export function workingTreeReader(root: string): SourceReader {
  return {
    list: () => git(root, ["ls-files", "-z"]).toString().split("\0").filter(Boolean),
    read: (files) => new Map(files.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")])),
  };
}

const IGNORED_ROUTE_COMPONENTS = new Set(["ChunkBoundary", "Suspense", "Skeleton", "Empty"]);

/** `seg[n] === 'x'` branches of the Shell dispatcher; `||` alternatives become separate routes. */
export function extractWebRoutes(appSource: string): WebRoute[] {
  const routes = new Map<string, Set<string>>();
  if (/seg\.length === 0\) screen = <(\w+)/.test(appSource)) {
    routes.set("/", new Set([/seg\.length === 0\) screen = <(\w+)/.exec(appSource)?.[1] ?? ""]));
  }
  // Portals and shared-access apps resolve before the signed-in Shell.
  for (const match of appSource.matchAll(/(?:\bp\s*===?\s*|pathname\.startsWith\()'(\/[\w-]+)'/g)) {
    routes.set(match[1] ?? "", routes.get(match[1] ?? "") ?? new Set());
  }
  const branches = appSource.split(/\n\s*(?:else\s+)?(?=if \(seg\[)|\n\s*else if \(/);
  for (const branch of branches) {
    if (!branch.includes("seg[")) {
      continue;
    }
    const condition = branch.slice(0, branch.indexOf("\n") < 0 ? undefined : branch.indexOf("\n"));
    const head = /^(?:if \()?(.*?seg\[.*?)\)\s*(?:screen|\{|$)/.exec(condition)?.[1];
    if (!head) {
      continue;
    }
    for (const alternative of head.split("||")) {
      const segments: string[] = [];
      for (const match of alternative.matchAll(/seg\[(\d)\]\s*===\s*'([^']+)'/g)) {
        segments[Number(match[1])] = match[2] ?? "";
      }
      if (segments.length === 0) {
        continue;
      }
      const routePath = `/${Array.from(segments, (segment) => segment ?? "*").join("/")}`;
      const components = routes.get(routePath) ?? new Set<string>();
      for (const match of branch.matchAll(/<([A-Z]\w+)\b/g)) {
        if (!IGNORED_ROUTE_COMPONENTS.has(match[1] ?? "")) {
          components.add(match[1] ?? "");
        }
      }
      routes.set(routePath, components);
    }
  }
  return sortBy(
    [...routes].map(([routePath, components]) => ({
      path: routePath,
      components: uniqueSorted(components),
    })),
    (route) => route.path,
  );
}

export function extractNavigation(source: string): NavItem[] {
  const items = new Map<string, NavItem>();
  for (const match of source.matchAll(
    /\{\s*to:\s*'([^']+)',\s*label:[^,]+,\s*icon:\s*'([^']+)'/g,
  )) {
    items.set(match[1] ?? "", { to: match[1] ?? "", icon: match[2] ?? "" });
  }
  return sortBy([...items.values()], (item) => item.to);
}

export function extractTabs(screen: string, source: string): Tab[] {
  const ids = new Set<string>();
  for (const match of source.matchAll(/\{\s*id:\s*'([^']+)',\s*label:/g)) {
    ids.add(match[1] ?? "");
  }
  return uniqueSorted(ids).map((id) => ({ screen, id }));
}

export function extractApiPaths(source: string): string[] {
  const paths = new Set<string>();
  for (const match of source.matchAll(/['"`](\/api\/[A-Za-z0-9_./-]*)/g)) {
    paths.add((match[1] ?? "").replace(/\/+$/, ""));
  }
  return uniqueSorted(paths);
}

type PyRouter = { prefix: string; parent?: { key: string; prefix: string } };

const pyRouterKey = (file: string, variable: string) => `${file}#${variable}`;

function resolvePyModule(file: string, module: string, known: Set<string>): string | null {
  const dots = /^\.+/.exec(module)?.[0].length ?? 0;
  const base = file.split("/").slice(0, -dots).join("/");
  const rest = module.slice(dots).replaceAll(".", "/");
  const stem = rest ? `${base}/${rest}` : base;
  for (const candidate of [`${stem}.py`, `${stem}/__init__.py`]) {
    if (known.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** FastAPI decorators with router prefixes and `include_router` mounts followed across files. */
export function extractBackendRoutes(sources: Map<string, string>): BackendRoute[] {
  const known = new Set(sources.keys());
  const routers = new Map<string, PyRouter>();
  for (const [file, source] of sources) {
    for (const match of source.matchAll(/^(\w+)\s*=\s*APIRouter\(/gm)) {
      const start = match.index + match[0].length;
      let depth = 1;
      let end = start;
      while (depth > 0 && end < source.length) {
        depth += source[end] === "(" ? 1 : source[end] === ")" ? -1 : 0;
        end += 1;
      }
      const prefix = /prefix\s*=\s*['"]([^'"]*)['"]/.exec(source.slice(start, end))?.[1] ?? "";
      // A module may rebind `router` to a new outer router: the first binding owns its routes.
      const key = pyRouterKey(file, match[1] ?? "");
      if (!routers.has(key)) {
        routers.set(key, { prefix });
      }
    }
  }
  for (const [file, source] of sources) {
    const imports = new Map<string, string>();
    const modules = new Map<string, string>();
    for (const match of source.matchAll(/^\s*from\s+(\.[\w.]*)\s+import\s+(\w+)\s+as\s+(\w+)/gm)) {
      const target = resolvePyModule(file, match[1] ?? "", known);
      if (target) {
        imports.set(match[3] ?? "", pyRouterKey(target, match[2] ?? ""));
      }
    }
    for (const match of source.matchAll(
      /^\s*from\s+(\.[\w.]*)\s+import\s+(\w*router\w*)\s*(?:#.*)?$/gm,
    )) {
      const target = resolvePyModule(file, match[1] ?? "", known);
      if (target) {
        imports.set(match[2] ?? "", pyRouterKey(target, match[2] ?? ""));
      }
    }
    for (const match of source.matchAll(
      /^\s*from\s+(\.[\w.]*)\s+import\s+([\w, ]+?)\s*(?:#.*)?$/gm,
    )) {
      for (const name of (match[2] ?? "").split(",").map((part) => part.trim())) {
        const target = resolvePyModule(
          file,
          `${match[1] ?? ""}${match[1]?.endsWith(".") ? "" : "."}${name}`,
          known,
        );
        if (target) {
          modules.set(name, target);
        }
      }
    }
    for (const match of source.matchAll(
      /(?:^|;)\s*(\w+)\.include_router\(\s*(?:(\w+)\.)?(\w+)([^)]*)\)/gm,
    )) {
      const owner = match[2] ? modules.get(match[2]) : undefined;
      const child = routers.get(
        owner
          ? pyRouterKey(owner, match[3] ?? "")
          : (imports.get(match[3] ?? "") ?? pyRouterKey(file, match[3] ?? "")),
      );
      if (child) {
        child.parent = {
          key: pyRouterKey(file, match[1] ?? ""),
          prefix: /prefix\s*=\s*['"]([^'"]*)['"]/.exec(match[4] ?? "")?.[1] ?? "",
        };
      }
    }
  }
  const fullPrefix = (key: string, seen = new Set<string>()): string => {
    const router = routers.get(key);
    if (!router || seen.has(key)) {
      return "";
    }
    seen.add(key);
    const parent = router.parent;
    return `${parent ? fullPrefix(parent.key, seen) + parent.prefix : ""}${router.prefix}`;
  };
  const routes: BackendRoute[] = [];
  for (const [file, source] of sources) {
    for (const match of source.matchAll(
      /^\s*@(\w+)\.(get|post|put|patch|delete)\(\s*f?['"]([^'"]*)['"]/gm,
    )) {
      routes.push({
        method: (match[2] ?? "").toUpperCase(),
        path: `${fullPrefix(pyRouterKey(file, match[1] ?? ""))}${match[3] ?? ""}`,
        file,
      });
    }
  }
  return sortBy(routes, (route) => `${route.path} ${route.method} ${route.file}`);
}

export function extractJobKinds(file: string, source: string) {
  const kinds = new Set<string>();
  let unresolved = 0;
  for (const match of source.matchAll(/\benqueue\(\s*\w+\s*,\s*(?:['"]([\w.:-]+)['"]|(\w+))/g)) {
    if (match[1]) {
      kinds.add(match[1]);
    } else {
      unresolved += 1;
    }
  }
  for (const block of source.matchAll(/^HANDLERS\s*=\s*\{([\s\S]*?)\}/gm)) {
    for (const match of (block[1] ?? "").matchAll(/['"]([\w.:-]+)['"]\s*:/g)) {
      kinds.add(match[1] ?? "");
    }
  }
  return {
    kinds: uniqueSorted(kinds).map((kind) => ({ kind, file })),
    unresolved,
  };
}

export function extractGatewayRpcs(source: string): string[] {
  const rpcs = new Set<string>();
  for (const block of source.matchAll(/^_[A-Z_]+\s*=\s*frozenset\(\(([\s\S]*?)\)\)/gm)) {
    for (const match of (block[1] ?? "").matchAll(/'([\w.]+)'/g)) {
      rpcs.add(match[1] ?? "");
    }
  }
  return uniqueSorted(rpcs);
}

function pathPattern(routePath: string): RegExp {
  const escaped = routePath
    .split(/\{[^}]+\}/)
    .map((part) => part.replace(/[.*+?^$()|[\]\\]/g, "\\$&"))
    .join("[^/]+");
  return new RegExp(`^${escaped}$`);
}

/** Template-literal clients are cut at `${`, so a client path may be a route's prefix. */
function matchClients(
  clients: Map<string, Set<string>>,
  routes: BackendRoute[],
): NsvxInventory["apiClients"] {
  const patterns = routes.map((route) => pathPattern(route.path));
  return sortBy(
    [...clients].map(([clientPath, files]) => ({
      path: clientPath,
      files: uniqueSorted(files),
      backendMatch:
        routes.some(
          (route) => route.path === clientPath || route.path.startsWith(`${clientPath}/`),
        ) || patterns.some((pattern) => pattern.test(clientPath)),
    })),
    (client) => client.path,
  );
}

const isTest = (file: string) => /(^|\/)tests?\/|\.test\.|\.spec\.|\/e2e\//.test(file);

export function buildNsvxInventory(reader: SourceReader): NsvxInventory {
  const files = reader.list();
  const webSources = files.filter((f) => /^web\/src\/.*\.tsx?$/.test(f) && !isTest(f));
  const pySources = files.filter((f) => /^backend\/clone\/.*\.py$/.test(f));
  const contents = reader.read([...webSources, ...pySources]);
  const text = (file: string) => contents.get(file) ?? "";
  const clients = new Map<string, Set<string>>();
  const tabs: Tab[] = [];
  for (const file of webSources) {
    for (const apiPath of extractApiPaths(text(file))) {
      const owners = clients.get(apiPath) ?? new Set<string>();
      owners.add(file);
      clients.set(apiPath, owners);
    }
    if (file.startsWith("web/src/screens/")) {
      tabs.push(...extractTabs(file, text(file)));
    }
  }
  const backendSources = new Map(pySources.map((file) => [file, text(file)]));
  const backendRoutes = extractBackendRoutes(backendSources);
  const jobKinds = new Map<string, JobKind>();
  let unresolvedEnqueueCalls = 0;
  for (const [file, source] of backendSources) {
    const found = extractJobKinds(file, source);
    unresolvedEnqueueCalls += found.unresolved;
    for (const job of found.kinds) {
      if (!jobKinds.has(job.kind)) {
        jobKinds.set(job.kind, job);
      }
    }
  }
  return {
    webRoutes: extractWebRoutes(text("web/src/App.tsx")),
    navigation: extractNavigation(text("web/src/logic/navigation.ts")),
    screens: webSources.filter((f) => f.startsWith("web/src/screens/") && f.endsWith(".tsx")),
    tabs: sortBy(tabs, (tab) => `${tab.screen} ${tab.id}`),
    apiClients: matchClients(clients, backendRoutes),
    backendRoutes,
    jobKinds: sortBy([...jobKinds.values()], (job) => job.kind),
    unresolvedEnqueueCalls,
    systemdUnits: files.filter((f) => /^deploy\/systemd\/.*\.(service|timer)$/.test(f)),
    openclawAdmin: {
      files: pySources.filter((f) => f.startsWith("backend/clone/openclaw_admin/")),
      gatewayRpcs: extractGatewayRpcs(text("backend/clone/openclaw_admin/gateway.py")),
    },
    files: uniqueSorted(files),
  };
}

export function extractUiRoutes(source: string): OpenClawInventory["uiRoutes"] {
  const block = /APP_ROUTE_DEFINITIONS = \{([\s\S]*?)\n\} as const/.exec(source)?.[1] ?? "";
  const routes: OpenClawInventory["uiRoutes"] = [];
  for (const match of block.matchAll(
    /^\s*"?([\w-]+)"?:\s*\{\s*path:\s*"([^"]+)"(?:,\s*aliases:\s*\[([^\]]*)\])?/gm,
  )) {
    routes.push({
      id: match[1] ?? "",
      path: match[2] ?? "",
      aliases: [...(match[3] ?? "").matchAll(/"([^"]+)"/g)].map((alias) => alias[1] ?? ""),
    });
  }
  return sortBy(routes, (route) => route.id);
}

export function extractCoreGatewayMethods(source: string): OpenClawInventory["gatewayMethods"] {
  const methods = new Map<string, OpenClawInventory["gatewayMethods"][number]>();
  for (const match of source.matchAll(
    /^\s*\[\s*"([\w.-]+)",\s*(?:"([\w-]+)"|null),\s*"(operator\.\w+|node|dynamic)"/gm,
  )) {
    methods.set(match[1] ?? "", {
      name: match[1] ?? "",
      group: match[2] ?? null,
      scope: match[3] ?? "",
    });
  }
  return sortBy([...methods.values()], (method) => method.name);
}

export function buildOpenClawInventory(reader: SourceReader): OpenClawInventory {
  const files = reader.list();
  const manifests = files.filter((f) => /^extensions\/[^/]+\/openclaw\.plugin\.json$/.test(f));
  const packages = manifests
    .map((f) => f.replace(/openclaw\.plugin\.json$/, "package.json"))
    .filter((f) => files.includes(f));
  const pluginSources = files.filter(
    (f) => /^extensions\/[^/]+\/.*\.tsx?$/.test(f) && !isTest(f) && !f.includes("/browser/"),
  );
  const routesFile = "ui/src/app-route-paths.ts";
  const methodsFile = "src/gateway/methods/core-descriptors.ts";
  const contents = reader.read([
    routesFile,
    methodsFile,
    ...manifests,
    ...packages,
    ...pluginSources,
  ]);
  const pluginMethods = new Map<string, Set<string>>();
  for (const file of pluginSources) {
    const directory = file.split("/")[1] ?? "";
    for (const match of (contents.get(file) ?? "").matchAll(
      /registerGatewayMethod\(\s*["']([\w.-]+)["']/g,
    )) {
      const methods = pluginMethods.get(directory) ?? new Set<string>();
      methods.add(match[1] ?? "");
      pluginMethods.set(directory, methods);
    }
  }
  const extensions = manifests.map((file) => {
    const manifest = JSON.parse(contents.get(file) ?? "{}") as {
      id?: string;
      categories?: string[];
      controlUi?: unknown;
    };
    const directory = file.split("/")[1] ?? "";
    // Source plugins declare their view in package.json; the build writes it into the manifest.
    const pkg = JSON.parse(contents.get(`extensions/${directory}/package.json`) ?? "{}") as {
      openclaw?: { controlUi?: unknown };
    };
    return {
      id: manifest.id ?? directory,
      categories: manifest.categories ?? [],
      controlUi: manifest.controlUi !== undefined || pkg.openclaw?.controlUi !== undefined,
      gatewayMethods: uniqueSorted(pluginMethods.get(directory) ?? []),
    };
  });
  return {
    uiRoutes: extractUiRoutes(contents.get(routesFile) ?? ""),
    pages: uniqueSorted(
      files
        .map((f) => /^ui\/src\/pages\/([^/]+)\/route\.tsx?$/.exec(f)?.[1])
        .filter((page): page is string => Boolean(page)),
    ),
    gatewayMethods: extractCoreGatewayMethods(contents.get(methodsFile) ?? ""),
    extensions: sortBy(extensions, (extension) => extension.id),
  };
}

export const VERIFICATION_DIMENSIONS = [
  "discovery",
  "ui",
  "actions",
  "chat",
  "data",
  "permissions",
  "feedback",
  "desktop",
  "mobile",
  "evidence",
] as const;

export type VerificationDimension = (typeof VERIFICATION_DIMENSIONS)[number];

export type RegistryEntry = {
  id: string;
  title: string;
  family: string;
  priority: "P0" | "P1" | "P2" | "P3";
  status: "native" | "partial" | "missing" | "blocked";
  nsvx: {
    webRoutes: string[];
    backendPackages: string[];
    jobPackages: string[];
    apiPrefixes: string[];
    sourceFiles: string[];
    permissions: string[];
    effect: "read" | "write" | "external";
    integrations: string[];
    runtime: (typeof RUNTIME_STATES)[number];
  };
  openclaw: {
    uiRoutes: string[];
    gatewayMethods: string[];
    extensions: string[];
    chatTools: string[];
  };
  adapter: string;
  verification: { requires: VerificationDimension[]; passed: VerificationDimension[] };
  evidence: { level: "source" | "runtime"; source: string[]; runtime: string[] };
  blockers: string[];
  unknowns: string[];
};

export type Registry = {
  schemaVersion: 2;
  sources: {
    nsvx: { repo: string; commit: string };
    openclaw: { repo: string; commit: string };
  };
  families: Record<string, string>;
  entries: RegistryEntry[];
};

const STATUSES = new Set(["native", "partial", "missing", "blocked"]);
const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const EFFECTS = new Set(["read", "write", "external"]);
// The brief's availability states; `not-checked` means source was read and nothing was run.
const RUNTIME_STATES = [
  "production-verified",
  "development-verified",
  "broken",
  "partial",
  "planned",
  "unmerged",
  "disabled",
  "not-checked",
] as const;
const COMMIT = /^[0-9a-f]{40}$/;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Shape rules every entry must meet; references are checked by the cross-checks below. */
export function validateRegistryShape(registry: Registry): string[] {
  const errors: string[] = [];
  if (registry.schemaVersion !== 2) {
    errors.push("schemaVersion must be 2");
  }
  for (const side of ["nsvx", "openclaw"] as const) {
    if (!COMMIT.test(registry.sources?.[side]?.commit ?? "")) {
      errors.push(`sources.${side}.commit must be a full commit id`);
    }
  }
  const seen = new Set<string>();
  for (const entry of registry.entries ?? []) {
    const fail = (message: string) => errors.push(`${entry.id}: ${message}`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id ?? "")) {
      errors.push(`invalid id: ${String(entry.id)}`);
    }
    if (seen.has(entry.id)) {
      fail("duplicate id");
    }
    seen.add(entry.id);
    if (!entry.title || !registry.families?.[entry.family]) {
      fail("title and a known family are required");
    }
    if (!PRIORITIES.has(entry.priority)) {
      fail("invalid priority");
    }
    if (!STATUSES.has(entry.status)) {
      fail("invalid status");
    }
    for (const key of [
      "webRoutes",
      "backendPackages",
      "jobPackages",
      "apiPrefixes",
      "sourceFiles",
      "permissions",
      "integrations",
    ] as const) {
      if (!isStringArray(entry.nsvx?.[key])) {
        fail(`nsvx.${key} must be a string array`);
      }
    }
    if (!EFFECTS.has(entry.nsvx?.effect)) {
      fail("invalid nsvx.effect");
    }
    if (!(RUNTIME_STATES as readonly string[]).includes(entry.nsvx?.runtime)) {
      fail("invalid nsvx.runtime");
    }
    for (const key of ["uiRoutes", "gatewayMethods", "extensions", "chatTools"] as const) {
      if (!isStringArray(entry.openclaw?.[key])) {
        fail(`openclaw.${key} must be a string array`);
      }
    }
    if (typeof entry.adapter !== "string") {
      fail("adapter must be a string");
    }
    if (!isStringArray(entry.blockers) || !isStringArray(entry.unknowns)) {
      fail("blockers and unknowns must be string arrays");
    }
    if (
      !["source", "runtime"].includes(entry.evidence?.level) ||
      !isStringArray(entry.evidence?.source) ||
      !isStringArray(entry.evidence?.runtime)
    ) {
      fail("evidence needs level, source and runtime");
    } else {
      if (entry.evidence.source.length === 0) {
        fail("evidence.source must not be empty");
      }
      // A runtime claim without a recorded run is exactly what this field exists to stop.
      if (entry.evidence.level === "runtime" && entry.evidence.runtime.length === 0) {
        fail("runtime evidence level needs a recorded runtime entry");
      }
    }
    const dimensions: readonly string[] = VERIFICATION_DIMENSIONS;
    const { requires, passed } = entry.verification ?? {};
    if (
      !isStringArray(requires) ||
      !isStringArray(passed) ||
      ![...requires, ...passed].every((name) => dimensions.includes(name))
    ) {
      fail("verification needs requires and passed from the known dimensions");
    } else {
      if (passed.some((name) => !requires.includes(name as VerificationDimension))) {
        fail("verification.passed must be a subset of requires");
      }
      // A passed check beyond discovery is a claim about behavior, so it needs a recorded run.
      if (passed.some((name) => name !== "discovery") && entry.evidence?.runtime?.length === 0) {
        fail("passed verification beyond discovery needs a recorded runtime entry");
      }
    }
    if (entry.status === "blocked" && entry.blockers?.length === 0) {
      fail("blocked status needs a blocker");
    }
    if (entry.status === "native" && entry.openclaw?.uiRoutes?.length === 0) {
      fail("native status needs an OpenClaw route");
    }
  }
  for (const family of Object.keys(registry.families ?? {})) {
    if (!registry.entries?.some((entry) => entry.family === family)) {
      errors.push(`family ${family} has no entry`);
    }
  }
  return errors;
}

/** Runs with the working tree, so native entries may cite routes added after the pin. */
export function crossCheckOpenClaw(registry: Registry, inventory: OpenClawInventory): string[] {
  const errors: string[] = [];
  const routes = new Set(inventory.uiRoutes.map((route) => route.id));
  const extensions = new Set(inventory.extensions.map((extension) => extension.id));
  const methods = new Set([
    ...inventory.gatewayMethods.map((method) => method.name),
    ...inventory.extensions.flatMap((extension) => extension.gatewayMethods),
  ]);
  for (const entry of registry.entries) {
    for (const id of entry.openclaw.uiRoutes) {
      if (!routes.has(id)) {
        errors.push(`${entry.id}: unknown OpenClaw route ${id}`);
      }
    }
    for (const id of entry.openclaw.gatewayMethods) {
      if (!methods.has(id)) {
        errors.push(`${entry.id}: unknown Gateway method ${id}`);
      }
    }
    for (const id of entry.openclaw.extensions) {
      if (!extensions.has(id)) {
        errors.push(`${entry.id}: unknown extension ${id}`);
      }
    }
  }
  return errors;
}

const backendPackage = (file: string) => {
  const part = file.split("/")[2] ?? "";
  return part.endsWith(".py") ? "(root)" : part;
};
const topRoute = (routePath: string) => `/${routePath.split("/")[1] ?? ""}`;

export function crossCheckNsvx(registry: Registry, inventory: NsvxInventory): string[] {
  const errors: string[] = [];
  const routes = new Set(
    inventory.webRoutes.flatMap((route) => [route.path, topRoute(route.path)]),
  );
  const packages = new Set(inventory.backendRoutes.map((route) => backendPackage(route.file)));
  const jobPackages = new Set(inventory.jobKinds.map((job) => backendPackage(job.file)));
  // Clients built from a base constant only show the base, so backend routes count too.
  const apiPaths = [
    ...inventory.apiClients.map((client) => client.path),
    ...inventory.backendRoutes.map((route) => route.path),
  ];
  const files = new Set(inventory.files);
  for (const entry of registry.entries) {
    for (const file of entry.nsvx.sourceFiles) {
      if (!files.has(file)) {
        errors.push(`${entry.id}: no NSVX file ${file}`);
      }
    }
    for (const route of entry.nsvx.webRoutes) {
      if (!routes.has(route)) {
        errors.push(`${entry.id}: unknown NSVX web route ${route}`);
      }
    }
    for (const name of entry.nsvx.backendPackages) {
      if (!packages.has(name)) {
        errors.push(`${entry.id}: no NSVX backend routes in package ${name}`);
      }
    }
    for (const name of entry.nsvx.jobPackages) {
      if (!jobPackages.has(name)) {
        errors.push(`${entry.id}: no NSVX job kinds in package ${name}`);
      }
    }
    for (const prefix of entry.nsvx.apiPrefixes) {
      if (!apiPaths.some((apiPath) => apiPath === prefix || apiPath.startsWith(`${prefix}/`))) {
        errors.push(`${entry.id}: no NSVX API path under ${prefix}`);
      }
    }
  }
  return errors;
}

const matchesPrefix = (apiPath: string, prefix: string) =>
  apiPath === prefix || apiPath.startsWith(`${prefix}/`);

/** Assigns each backend route to the entry with the longest matching prefix. */
function routeCoverage(registry: Registry, routes: BackendRoute[]) {
  const prefixes = registry.entries
    .flatMap((entry) => entry.nsvx.apiPrefixes.map((prefix) => ({ prefix, id: entry.id })))
    .toSorted((a, b) => b.prefix.length - a.prefix.length || byText(a.prefix, b.prefix));
  const owned = new Map<string, BackendRoute[]>();
  const unassigned: BackendRoute[] = [];
  for (const route of routes) {
    const owner = prefixes.find(({ prefix }) => matchesPrefix(route.path, prefix))?.id;
    if (owner) {
      owned.set(owner, [...(owned.get(owner) ?? []), route]);
    } else {
      unassigned.push(route);
    }
  }
  return { owned, unassigned };
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** One entry's change marker: a pin move that alters its routes changes this value in the diff. */
function entrySurface(routes: BackendRoute[]) {
  return {
    routes: routes.length,
    reads: routes.filter((route) => route.method === "GET").length,
    writes: routes.filter((route) => route.method !== "GET").length,
    digest: digest(routes),
  };
}

/** Headline numbers: an entry counts as verified only when every required check passed. */
export function summarizeParity(registry: Registry) {
  const isVerified = (entry: RegistryEntry) =>
    entry.verification.requires.every((name) => entry.verification.passed.includes(name));
  const summarize = (entries: RegistryEntry[]) => ({
    discovered: entries.length,
    native: entries.filter((entry) => entry.status === "native").length,
    partial: entries.filter((entry) => entry.status === "partial").length,
    missing: entries.filter((entry) => entry.status === "missing").length,
    blocked: entries.filter((entry) => entry.status === "blocked").length,
    verified: entries.filter(isVerified).length,
  });
  return {
    ...summarize(registry.entries),
    families: Object.entries(registry.families).map(([id, name]) =>
      Object.assign({ id, name }, summarize(registry.entries.filter((e) => e.family === id))),
    ),
  };
}

/** The plugin's copy of the registry: public titles and states, shown in Control and chat. */
export function renderPluginParity(registry: Registry): string {
  const { families, ...totals } = summarizeParity(registry);
  const data = {
    ...totals,
    sources: { nsvx: registry.sources.nsvx.commit, openclaw: registry.sources.openclaw.commit },
    families,
    entries: registry.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      family: entry.family,
      priority: entry.priority,
      status: entry.status,
      verified: entry.verification.requires.every((name) =>
        entry.verification.passed.includes(name),
      ),
    })),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of sortBy([...items], key)) {
    const name = key(item);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

const apiArea = (apiPath: string) => apiPath.split("/").slice(0, 3).join("/");

/** Tracked document: public OpenClaw lists, private NSVX aggregates plus a digest of the lists. */
export function renderInventory(
  registry: Registry,
  nsvx: NsvxInventory,
  openclaw: OpenClawInventory,
): string {
  const routes = routeCoverage(registry, nsvx.backendRoutes);
  const covered = {
    webRoutes: new Set(registry.entries.flatMap((entry) => entry.nsvx.webRoutes.map(topRoute))),
    backendPackages: new Set(registry.entries.flatMap((entry) => entry.nsvx.backendPackages)),
    jobPackages: new Set(registry.entries.flatMap((entry) => entry.nsvx.jobPackages)),
  };
  const topRoutes = uniqueSorted(nsvx.webRoutes.map((route) => topRoute(route.path)));
  const backendCounts = countBy(nsvx.backendRoutes, (route) => backendPackage(route.file));
  const jobCounts = countBy(nsvx.jobKinds, (job) => backendPackage(job.file));
  const notIn = (names: string[], set: Set<string>) => names.filter((name) => !set.has(name));
  const document = {
    schemaVersion: 2,
    generator: "scripts/nsvx-parity-inventory.mts",
    sources: registry.sources,
    nsvx: {
      fullListDigest: digest(nsvx),
      counts: {
        webRoutes: nsvx.webRoutes.length,
        navigation: nsvx.navigation.length,
        screens: nsvx.screens.length,
        tabs: nsvx.tabs.length,
        apiClients: nsvx.apiClients.length,
        apiClientsWithBackendMatch: nsvx.apiClients.filter((client) => client.backendMatch).length,
        backendRoutes: nsvx.backendRoutes.length,
        jobKinds: nsvx.jobKinds.length,
        unresolvedEnqueueCalls: nsvx.unresolvedEnqueueCalls,
        systemdUnits: nsvx.systemdUnits.length,
      },
      topLevelWebRoutes: topRoutes,
      backendRoutesByPackage: backendCounts,
      jobKindsByPackage: jobCounts,
      apiClientsByArea: countBy(nsvx.apiClients, (client) => apiArea(client.path)),
      openclawAdmin: nsvx.openclawAdmin,
    },
    openclaw,
    coverage: {
      uncoveredWebRoutes: notIn(topRoutes, covered.webRoutes),
      uncoveredBackendPackages: notIn(Object.keys(backendCounts), covered.backendPackages),
      uncoveredJobPackages: notIn(Object.keys(jobCounts), covered.jobPackages),
      unassignedRoutes: routes.unassigned.length,
      unassignedRouteAreas: countBy(routes.unassigned, (route) => apiArea(route.path)),
      byEntry: Object.fromEntries(
        registry.entries.map((entry) => [entry.id, entrySurface(routes.owned.get(entry.id) ?? [])]),
      ),
      parity: summarizeParity(registry),
    },
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

function main(argv: string[]) {
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--check") {
      flags.add(argument);
    } else if (["--clone-repo", "--full-out"].includes(argument) && argv[index + 1]) {
      options.set(argument, argv[(index += 1)] ?? "");
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  const cloneRepo = options.get("--clone-repo");
  if (!cloneRepo) {
    throw new Error("Pass --clone-repo <path to a clone repository checkout>.");
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const registryPath = path.join(root, "docs/nsvx-parity/registry.json");
  const inventoryPath = path.join(root, "docs/nsvx-parity/source-inventory.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as Registry;
  const nsvx = buildNsvxInventory(gitReader(cloneRepo, registry.sources.nsvx.commit));
  const openclaw = buildOpenClawInventory(gitReader(root, registry.sources.openclaw.commit));
  const errors = [
    ...validateRegistryShape(registry),
    ...crossCheckNsvx(registry, nsvx),
    ...crossCheckOpenClaw(registry, buildOpenClawInventory(workingTreeReader(root))),
  ];
  if (errors.length > 0) {
    throw new Error(`Registry is invalid:\n${errors.join("\n")}`);
  }
  const rendered = renderInventory(registry, nsvx, openclaw);
  const pluginParityPath = path.join(root, "extensions/nsvx/src/parity-data.json");
  const pluginParity = renderPluginParity(registry);
  if (options.has("--full-out")) {
    fs.writeFileSync(options.get("--full-out") ?? "", `${JSON.stringify(nsvx, null, 2)}\n`);
  }
  if (flags.has("--check")) {
    if (
      fs.readFileSync(inventoryPath, "utf8") !== rendered ||
      fs.readFileSync(pluginParityPath, "utf8") !== pluginParity
    ) {
      throw new Error("Generated parity files are stale. Run the generator without --check.");
    }
    process.stdout.write("nsvx-parity: registry valid, inventory current\n");
    return;
  }
  fs.writeFileSync(inventoryPath, rendered);
  fs.writeFileSync(pluginParityPath, pluginParity);
  process.stdout.write(`nsvx-parity: wrote ${path.relative(root, inventoryPath)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
