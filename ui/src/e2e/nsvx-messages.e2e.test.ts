import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX messages and quick reply" });
const desktop = { width: 1280, height: 900 };
const mobile = { width: 390, height: 844 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const capture = process.env.OPENCLAW_CAPTURE_UI_PROOF === "1";

// Synthetic NSVX payloads, shaped like /api/conversations/page, /api/conversations/{id}, and /api/quick-reply.
const conversations = {
  items: [
    {
      id: "c1",
      kind: "direct",
      channel: "whatsapp",
      person: "Ana Costa",
      person_id: "p1",
      last_at: ago(4),
      last_body: "Can we move the visit to Friday?",
      pending: 1,
      outstanding: 1,
    },
    {
      id: "c2",
      kind: "direct",
      channel: "gmail",
      person: "Rui Lopes",
      person_id: "p2",
      last_at: ago(90),
      last_body: "Invoice attached",
      pending: 0,
      outstanding: 0,
    },
    {
      id: "c3",
      kind: "group",
      channel: "telegram",
      title: "Flight crew",
      last_at: ago(300),
      last_body: "Roster is out",
      pending: 0,
    },
    {
      id: "c4",
      kind: "direct",
      channel: "instagram",
      contact: "@sunny.home",
      last_at: ago(1500),
      last_body: "Is the flat still free?",
      pending: 2,
    },
  ],
  next: null,
  total: 4,
};

const thread = {
  id: "c1",
  kind: "direct",
  channel: "whatsapp",
  account_label: "Personal",
  paused: false,
  owner_takeover_until: null,
  window_applies: false,
  messages: [
    {
      id: "m1",
      direction: "outbound",
      origin: "human",
      sent_at: ago(60),
      body: "The plumber comes Thursday at 10.",
      delivery_status: "read",
    },
    {
      id: "m2",
      direction: "inbound",
      sent_at: ago(4),
      body: "Can we move the visit to Friday?",
      sender: "Ana Costa",
      reply_status: "pending",
    },
  ],
  outbox: [
    {
      id: "o1",
      state: "awaiting_approval",
      payload: { text: "Friday works. Same time?" },
      revision: "r1",
    },
  ],
  message_page: { has_older: false, before: null },
};

const readyDraft = {
  id: "d1",
  revision: 2,
  state: "ready",
  channel: "message",
  inbound: "Can we move the visit to Friday?",
  sender_name: "Ana Costa",
  updated_at: ago(0),
  reply: {
    language: "en",
    subject: null,
    body: "Of course, Friday at 10 works for me.",
    signature: "",
  },
  copy_text: "Of course, Friday at 10 works for me.",
  generations: [{ id: "g1", state: "succeeded" }],
};

const emailDraft = {
  ...readyDraft,
  id: "d2",
  channel: "email",
  sender_name: "Rui Lopes",
  subject: "Invoice",
  inbound: "From: Rui Lopes <rui@example.com>\nSubject: Invoice\n\nPlease confirm.",
  reply: {
    language: "en",
    subject: "Invoice",
    body: "Good morning Rui,\n\nConfirmed.",
    signature: "",
  },
  copy_text: "Subject: Invoice\n\nGood morning Rui,\n\nConfirmed.",
};

const viewCases = [
  { match: { view: "conversations" }, response: conversations },
  { match: { view: "conversation" }, response: thread },
  { match: { view: "quickReplyDraft", params: { id: "d2" } }, response: emailDraft },
  { match: { view: "quickReplyDraft" }, response: readyDraft },
  { match: { view: "quickReplyDrafts" }, response: { drafts: [readyDraft], next: null } },
];

async function shoot(
  page: Parameters<Parameters<typeof suite.withPage>[1]>[0]["page"],
  surface: ReturnType<Parameters<Parameters<typeof suite.withPage>[1]>[0]["page"]["locator"]>,
  name: string,
  viewports = [desktop, mobile],
) {
  for (const viewport of viewports) {
    const frame = await takeControlUiScreenshotFrame(page, surface, [], {
      animations: "disabled",
      viewport,
    });
    await writeFile(path.join(suite.artifactDir, `${name}-${viewport.width}.png`), frame.png);
  }
}

suite.define(() => {
  it("lists conversations, opens a thread, drafts a reply with AI, and sends it", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            "nsvx.view": { cases: viewCases },
            "nsvx.quickReply.start": {
              draft: { ...readyDraft, state: "generating", reply: null },
              generation: { id: "g1", state: "queued" },
            },
            "nsvx.messages.reply": { ok: true, outbox_id: "o2", state: "approved" },
            "nsvx.messages.approve": { ok: true, state: "approved" },
            "nsvx.messages.takeover": { ok: true },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=messages`);
        const surface = page.locator(".nsvx");

        // People, groups, and unknown senders, with waiting counts and channel logos.
        await surface.getByText("Ana Costa", { exact: true }).waitFor();
        await surface.getByText("Flight crew", { exact: true }).waitFor();
        await surface.getByText("@sunny.home", { exact: true }).waitFor();
        expect(await surface.getByRole("img", { name: "WhatsApp" }).count()).toBeGreaterThan(0);
        if (capture) {
          await shoot(page, surface, "nsvx-messages-list", [mobile]);
          await page.setViewportSize(desktop);
        }

        // "To answer" asks NSVX for open obligations; a channel logo filters by channel.
        const listedWith = async (wanted: Record<string, string>) =>
          (await gateway.getRequests("nsvx.view", { view: "conversations" })).some((request) =>
            Object.entries(wanted).every(
              ([key, value]) =>
                (request.params as { params: Record<string, string> }).params[key] === value,
            ),
          );
        await surface.getByRole("button", { name: /To answer/ }).click();
        await expect.poll(() => listedWith({ state: "outstanding" })).toBe(true);
        await surface.getByRole("button", { name: "WhatsApp" }).click();
        await expect
          .poll(() => listedWith({ state: "outstanding", channel: "whatsapp" }))
          .toBe(true);

        // The thread opens beside the list and the address keeps it.
        await surface.getByRole("button", { name: /Ana Costa/ }).click();
        await surface.getByText("The plumber comes Thursday at 10.", { exact: true }).waitFor();
        expect(new URL(page.url()).searchParams.get("conversation")).toBe("c1");
        await surface.getByText("Read", { exact: true }).waitFor();

        // clone's draft waits for approval; Send approves the reviewed revision.
        await surface.getByRole("textbox", { name: "To approve" }).waitFor();

        // AI draft: Quick Reply writes from the message; the reply lands in the composer, not sent.
        await surface.getByRole("button", { name: "Draft" }).first().click();
        const started = (await gateway.waitForRequest("nsvx.quickReply.start")).params as Record<
          string,
          unknown
        >;
        expect(started).toMatchObject({ messageId: "m2", sourceChannel: "whatsapp" });
        const composer = surface.getByRole("textbox", { name: "Message…" });
        await expect
          .poll(() => composer.inputValue())
          .toBe("Of course, Friday at 10 works for me.");
        expect(await gateway.getRequests("nsvx.messages.reply")).toHaveLength(0);

        if (capture) {
          await shoot(page, surface, "nsvx-messages-thread");
          await page.setViewportSize(desktop);
        }

        await surface.getByRole("button", { name: "Send", exact: true }).last().click();
        const sent = (await gateway.waitForRequest("nsvx.messages.reply")).params as Record<
          string,
          unknown
        >;
        expect(sent).toMatchObject({
          conversationId: "c1",
          text: "Of course, Friday at 10 works for me.",
          replyTo: "m2",
        });
        expect(typeof sent.idempotencyKey).toBe("string");
        await surface.getByText("Queued to send", { exact: true }).waitFor();
        await expect.poll(() => composer.inputValue()).toBe("");

        await surface.locator(".nsvx-review").getByRole("button", { name: "Send" }).click();
        expect((await gateway.waitForRequest("nsvx.messages.approve")).params).toEqual({
          outboxId: "o1",
          revision: "r1",
        });

        // Take over for two hours: NSVX stops clone replying here.
        await surface.getByRole("button", { name: "Take over" }).click();
        await surface.getByRole("button", { name: "2 h" }).click();
        expect((await gateway.waitForRequest("nsvx.messages.takeover")).params).toEqual({
          conversationId: "c1",
          minutes: 120,
        });
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("writes a quick reply from a pasted email and copies it", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            "nsvx.view": { cases: viewCases },
            "nsvx.quickReply.start": {
              draft: { ...emailDraft, state: "generating", reply: null, copy_text: undefined },
              generation: { id: "g2", state: "queued" },
            },
          },
        });
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=reply`);
        const surface = page.locator(".nsvx");
        await surface.getByText("Of course, Friday at 10 works for me.").first().waitFor();

        // Pasting an email fills sender and subject.
        await surface.getByRole("textbox", { name: "Paste a message" }).fill(emailDraft.inbound);
        await expect
          .poll(() => surface.getByRole("textbox", { name: "From" }).inputValue())
          .toBe("Rui Lopes");
        await expect
          .poll(() => surface.getByRole("textbox", { name: "Subject" }).inputValue())
          .toBe("Invoice");
        await surface.getByRole("textbox", { name: "What to say" }).fill("confirm it");
        await surface.getByRole("button", { name: "Write reply" }).click();
        expect((await gateway.waitForRequest("nsvx.quickReply.start")).params).toMatchObject({
          channel: "email",
          sender: "Rui Lopes",
          subject: "Invoice",
          guidance: "confirm it",
        });
        await surface.locator(".nsvx-qr__reply", { hasText: "Confirmed." }).waitFor();
        expect(new URL(page.url()).searchParams.get("draft")).toBe("d2");

        if (capture) {
          await shoot(page, surface, "nsvx-quick-reply");
          await page.setViewportSize(desktop);
        }

        await surface.getByRole("button", { name: "Copy" }).click();
        await surface.getByRole("button", { name: "Copied" }).waitFor();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
          emailDraft.copy_text,
        );
      },
    );
  });
});
