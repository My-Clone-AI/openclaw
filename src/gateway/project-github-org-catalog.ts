import { createHash } from "node:crypto";

export const DEFAULT_PROJECT_GITHUB_ORGS = [
  "My-Clone-AI",
  "bitcoinuniverseio",
  "Project-Boden",
  "Echelon-RSVP",
] as const;

type CatalogOptions = {
  allowlist?: readonly string[];
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  token?: string;
  ttlMs?: number;
};

/** A catalog instance owns its cache and its configured GitHub identity. */
export function createProjectGitHubOrgCatalog(options: CatalogOptions = {}) {
  const allowed = new Map(
    (options.allowlist ?? DEFAULT_PROJECT_GITHUB_ORGS).map((org) => [org.toLowerCase(), org]),
  );
  const cache = new Map<string, { expires: number; repositories: unknown[] }>();
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.apiBaseUrl ?? "https://api.github.com";
  const scope = createHash("sha256").update(options.token ?? "").digest("hex");
  return {
    async list(org: string): Promise<unknown[]> {
      const canonical = allowed.get(org.toLowerCase());
      if (!canonical) {
        throw new Error(`GitHub organization is not allowed: ${org}`);
      }
      const key = `${base}\0${scope}\0${canonical.toLowerCase()}`;
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) {
        return cached.repositories;
      }
      const repositories: unknown[] = [];
      for (let page = 1; ; page++) {
        const url = new URL(`orgs/${encodeURIComponent(canonical)}/repos`, `${base.replace(/\/$/, "")}/`);
        url.searchParams.set("per_page", "100");
        url.searchParams.set("page", String(page));
        const response = await fetchImpl(url, {
          headers: {
            accept: "application/vnd.github+json",
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          },
        });
        if (!response.ok) {
          throw new Error(`GitHub organization repository request failed (${response.status})`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Invalid GitHub organization repository response");
        }
        repositories.push(...data);
        if (data.length < 100) {
          break;
        }
      }
      cache.set(key, { expires: Date.now() + (options.ttlMs ?? 60_000), repositories });
      return repositories;
    },
  };
}
