import { describe, expect, it, vi } from "vitest";
import { createProjectGitHubOrgCatalog } from "./project-github-org-catalog.js";

describe("GitHub organization catalog", () => {
  it("paginates, caches and rejects organizations outside the allowlist", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const page = new URL(String(input)).searchParams.get("page");
      return Response.json(page === "1" ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 100 }]);
    });
    const catalog = createProjectGitHubOrgCatalog({ fetchImpl, allowlist: ["Example"] });
    expect(await catalog.list("example")).toHaveLength(101);
    expect(await catalog.list("Example")).toHaveLength(101);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(catalog.list("other")).rejects.toThrow("not allowed");
  });
});
