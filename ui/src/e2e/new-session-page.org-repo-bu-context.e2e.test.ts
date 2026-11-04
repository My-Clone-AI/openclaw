import { expect, it } from "vitest";
import {
  createNewSessionPageE2eSuite,
  installMockGateway,
} from "./new-session-page.test-support.ts";

const suite = createNewSessionPageE2eSuite();

suite.define(() => {
  it("defaults the repository search to bitcoinuniverseio in the BU group", async () => {
    await suite.withPage({ locale: "en-US", serviceWorkers: "block" }, async ({ page }) => {
      const gateway = await installMockGateway(page, {
        sessionGroups: ["Bitcoin Universe"],
        featureMethods: ["sessions.groups.list", "projects.list", "projects.searchRemote"],
        methodResponses: {
          "projects.list": { projects: [] },
          "projects.searchRemote": { credential: "configured", projects: [] },
        },
      });
      await page.goto(`${suite.server.baseUrl}new?group=Bitcoin%20Universe`);
      await gateway.waitForRequest("projects.list");
      await page.locator("#new-session-project-trigger").click();
      const picker = page.locator(".oc-popover.new-session-page__project-popover");
      await expect
        .poll(() =>
          picker
            .getByRole("button", { name: "bitcoinuniverseio", exact: true })
            .getAttribute("aria-pressed"),
        )
        .toBe("true");
      await picker.locator(".header-search__toggle").click();
      await picker
        .getByRole("searchbox", { name: "Search projects or paste a Git URL" })
        .fill("universe");
      expect((await gateway.waitForRequest("projects.searchRemote")).params).toEqual({
        query: "universe",
        org: "bitcoinuniverseio",
      });
      await picker.getByRole("button", { name: "Project-Boden", exact: true }).click();
      await expect
        .poll(() =>
          picker
            .getByRole("button", { name: "Project-Boden", exact: true })
            .getAttribute("aria-pressed"),
        )
        .toBe("true");
    });
  });
});
