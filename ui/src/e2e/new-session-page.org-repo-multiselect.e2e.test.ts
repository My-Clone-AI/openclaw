import { expect, it } from "vitest";
import {
  WORKSPACE,
  createNewSessionPageE2eSuite,
  installMockGateway,
  pollAttribute,
} from "./new-session-page.test-support.ts";
import { environmentProfiles } from "./new-session-shard.test-support.ts";

const suite = createNewSessionPageE2eSuite();

suite.define(() => {
  it("starts one session with both selected organization repositories", async () => {
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
                name: "clone-ai",
                fullName: "My-Clone-AI/clone-ai",
                cloneUrl: "https://github.com/My-Clone-AI/clone-ai.git",
                webUrl: "https://github.com/My-Clone-AI/clone-ai",
                defaultBranch: "main",
                preferredBranch: "develop",
                private: false,
              },
              {
                name: "second-repo",
                fullName: "My-Clone-AI/second-repo",
                cloneUrl: "https://github.com/My-Clone-AI/second-repo.git",
                webUrl: "https://github.com/My-Clone-AI/second-repo",
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
      await picker.getByRole("button", { name: /My-Clone-AI\/clone-ai/u }).click();
      await picker.getByRole("button", { name: /My-Clone-AI\/second-repo/u }).click();
      await expect.poll(() => picker.textContent()).toContain("2 selected");
      await page.keyboard.press("Escape");
      await page.locator(".new-session-page__message").fill("Inspect the repository");
      await page.getByRole("button", { name: "Start session" }).click();
      expect((await gateway.waitForRequest("sessions.create")).params).toMatchObject({
        repositories: [
          { url: "https://github.com/My-Clone-AI/clone-ai.git", ref: "develop" },
          { url: "https://github.com/My-Clone-AI/second-repo.git", ref: "develop" },
        ],
      });
      expect(await gateway.getRequests("sessions.create")).toHaveLength(1);
      expect((await gateway.waitForRequest("sessions.dispatch")).params).toMatchObject({
        key: "agent:main:org-repo",
        profileId: "worker",
      });
    });
  });
});
