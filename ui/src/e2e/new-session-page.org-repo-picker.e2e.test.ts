import { expect, it } from "vitest";
import {
  WORKSPACE,
  createNewSessionPageE2eSuite,
  installMockGateway,
  pollAttribute,
  pollLocatorText,
} from "./new-session-page.test-support.ts";
import { environmentProfiles } from "./new-session-shard.test-support.ts";

const suite = createNewSessionPageE2eSuite();

suite.define(() => {
  it("starts a session with the selected organization repository on develop", async () => {
    await suite.withPage({ locale: "en-US", serviceWorkers: "block" }, async ({ page }) => {
      const gateway = await installMockGateway(page, {
        workspace: WORKSPACE,
        workspaceGit: false,
        featureMethods: [
          "projects.list",
          "projects.searchRemote",
          "environments.list",
          "sessions.create",
          "sessions.dispatch",
        ],
        deferredMethods: ["sessions.dispatch"],
        methodResponses: {
          "projects.list": { projects: [] },
          "projects.searchRemote": {
            credential: "configured",
            projects: [
              {
                name: "other",
                fullName: "Echelon-RSVP/other",
                cloneUrl: "https://github.com/Echelon-RSVP/other.git",
                webUrl: "https://github.com/Echelon-RSVP/other",
                private: false,
              },
              {
                name: "clone-ai",
                fullName: "My-Clone-AI/clone-ai",
                cloneUrl: "https://github.com/My-Clone-AI/clone-ai.git",
                webUrl: "https://github.com/My-Clone-AI/clone-ai",
                defaultBranch: "main",
                preferredBranch: "develop",
                private: false,
              },
            ],
          },
          "environments.list": environmentProfiles("worker"),
          "sessions.create": { key: "agent:main:org-repo" },
        },
      });
      await page.goto(`${suite.server.baseUrl}new`);
      await gateway.waitForRequest("projects.list");
      await gateway.waitForRequest("environments.list");
      const where = page.locator("#new-session-where-trigger");
      await where.click();
      await page
        .locator(".oc-popover.new-session-page__where-popover")
        .getByRole("button", { name: "worker", exact: true })
        .click();
      await pollAttribute(where, "data-cloud-profile").toBe("worker");
      await page.keyboard.press("Escape");

      const project = page.locator("#new-session-project-trigger");
      await project.click();
      const picker = page.locator(".oc-popover.new-session-page__project-popover");
      expect(
        await picker
          .getByRole("button", { name: "My-Clone-AI", exact: true })
          .getAttribute("aria-pressed"),
      ).toBe("true");
      await picker.locator(".header-search__toggle").click();
      await picker
        .getByRole("searchbox", { name: "Search projects or paste a Git URL" })
        .fill("clone-ai");
      expect((await gateway.waitForRequest("projects.searchRemote")).params).toEqual({
        query: "clone-ai",
        org: "My-Clone-AI",
      });
      expect(await picker.getByRole("button", { name: /Echelon-RSVP\/other/u }).count()).toBe(0);
      await picker.getByRole("button", { name: /My-Clone-AI\/clone-ai/u }).click();
      await pollLocatorText(project).toContain("My-Clone-AI/clone-ai");
      await page.keyboard.press("Escape");
      await page.locator(".new-session-page__message").fill("Inspect the repository");
      await page.getByRole("button", { name: "Start session" }).click();
      expect((await gateway.waitForRequest("sessions.create")).params).toMatchObject({
        repository: { url: "https://github.com/My-Clone-AI/clone-ai.git", ref: "develop" },
      });
      expect((await gateway.waitForRequest("sessions.dispatch")).params).toMatchObject({
        key: "agent:main:org-repo",
        profileId: "worker",
      });
    });
  });
});
