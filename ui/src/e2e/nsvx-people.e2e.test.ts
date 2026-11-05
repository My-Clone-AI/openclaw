import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX people and groups" });
const desktop = { width: 1280, height: 900 };
const mobile = { width: 390, height: 844 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const capture = process.env.OPENCLAW_CAPTURE_UI_PROOF === "1";

// Synthetic NSVX payloads, shaped like /api/people, /api/people/{id}, its interests and history, and /api/social-groups.
const people = [
  {
    id: "p1",
    display_name: "Ana Costa",
    handling: "auto",
    channels: ["whatsapp", "instagram"],
    last_message_at: ago(4),
    active_missions: 1,
    sent_message_count: 40,
  },
  {
    id: "p2",
    display_name: "Rui Lopes",
    handling: "review",
    channels: ["gmail"],
    last_message_at: ago(90),
    active_missions: 0,
    sent_message_count: 12,
  },
  {
    id: "p3",
    display_name: "Marta Silva",
    handling: "paused",
    channels: ["telegram"],
    last_message_at: ago(4000),
    active_missions: 0,
    sent_message_count: 0,
  },
];

const person = {
  id: "p1",
  display_name: "Ana Costa",
  handling: "auto",
  quiet_hours: { start: "22:00", end: "08:30", tz: "Europe/Lisbon" },
  social_followup_allowed: true,
  voice_pref: "any",
  reply_as_voice: false,
  created_at: ago(90000),
  updated_at: ago(60),
  identities: [
    {
      id: "i1",
      external_id: "+351900000001",
      handle: null,
      display_name: "Ana Costa",
      link_status: "verified",
      channel: "whatsapp",
      label: "Personal",
      mode: "live",
    },
    {
      id: "i2",
      external_id: "ana.c",
      handle: "ana.c",
      display_name: "Ana",
      link_status: "verified",
      channel: "instagram",
      label: "Instagram",
      mode: "live",
    },
  ],
  facts: [
    {
      id: "f1",
      subject: "Food",
      assertion: "Vegetarian since 2024",
      author: "Ana Costa",
      source_kind: "message",
      source_ref: "m2",
      source_at: ago(3000),
      confidence: 0.9,
      sensitivity: "normal",
      state: "retrievable",
      verification: "stated_by_author",
      superseded_by: null,
      source_conversation_id: "c1",
      permitted: true,
    },
    {
      id: "f2",
      subject: null,
      assertion: "Works at the Porto office",
      author: "Ana Costa",
      source_kind: "message",
      source_ref: "m9",
      source_at: ago(9000),
      confidence: 0.7,
      sensitivity: "normal",
      state: "superseded",
      verification: "unverified",
      superseded_by: null,
      permitted: false,
    },
  ],
  missions: [{ id: "t1", title: "Plumber visit", status: "working" }],
  recent: [
    {
      id: "m2",
      body: "Can we move the visit to Friday?",
      direction: "inbound",
      origin: "human",
      sent_at: ago(4),
      channel: "whatsapp",
      conversation_id: "c1",
    },
    {
      id: "m1",
      body: "The plumber comes Thursday at 10.",
      direction: "outbound",
      origin: "human",
      sent_at: ago(60),
      channel: "whatsapp",
      conversation_id: "c1",
    },
  ],
  rules: [],
  groups: [
    {
      id: "g1",
      display_name: "Surf friends",
      state: "active",
      member_origin: "owner",
      rationale: null,
      last_evidence_at: ago(500),
    },
  ],
  aliases: [{ alias: "Aninhas", origin: "owner" }],
  automation_stop: null,
  mentioned_in: [
    {
      id: "mm1",
      conversation_id: "c9",
      sent_at: ago(800),
      status: "candidate",
      author_is_owner: false,
      channel: "telegram",
    },
  ],
};

const interests = {
  revision: 7,
  mode: "bounded_learning",
  permitted: true,
  sync: { memory: "verified", drive: "ok" },
  style: { learning: true, brevity: "brief", emoji: "default", language: "current" },
  topics: [
    {
      topic_id: "t-surf",
      canonical_label: "Surfing",
      context_scope: "c1",
      affinity: 82,
      confidence: 0.8,
      willingness: "open",
      observation_count: 6,
      last_confirmed_at: ago(200),
    },
    {
      topic_id: "t-work",
      canonical_label: "Her job",
      context_scope: "c1",
      affinity: 30,
      confidence: 0.5,
      willingness: "unknown",
      observation_count: 2,
      last_confirmed_at: ago(2000),
    },
  ],
  open_loops: [],
};

const places = {
  grants: {
    profile: { granted: true },
    history: { granted: true },
    photos: { granted: false },
    followup: { granted: true },
  },
  erasure: null,
  fields: {
    home_city: { value: "Lisboa", state: "shared" },
    food: { value: "Vegetarian", state: "shared" },
  },
  photos: null,
  summary: {
    last: {
      ambiguous: false,
      visit: {
        id: "v1",
        place_label: "Porto",
        city: "Porto",
        venue_kind: "city",
        event_date: "2026-09-14",
        event_date_precision: "day",
        state: "confirmed",
        source_kind: "subject_manual",
        geo_precision: "city",
      },
    },
    geojson: {
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-8.61, 41.15] },
          properties: { id: "v1", label: "Porto" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-9.14, 38.72] },
          properties: { id: "v2", label: "Lisboa" },
        },
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-9.14, 38.72],
              [-8.61, 41.15],
            ],
          },
          properties: { kind: "sequence", from: "v2", to: "v1" },
        },
      ],
    },
    count: 2,
  },
  visits: {
    items: [
      {
        id: "v1",
        place_label: "Porto",
        city: "Porto",
        venue_kind: "city",
        event_date: "2026-09-14",
        event_date_precision: "day",
        state: "confirmed",
        source_kind: "subject_manual",
        geo_precision: "city",
      },
      {
        id: "v2",
        place_label: "Lisboa",
        city: "Lisboa",
        venue_kind: "city",
        event_date: "2025-06",
        event_date_precision: "month",
        state: "proposed",
        source_kind: "owner_proposed",
        geo_precision: "city",
      },
    ],
    next: null,
  },
};

const contacts = {
  revision: 3,
  entries: [{ id: "e1", kind: "phone", value: "+351 900 000 001", label: "" }],
  linked: [{ kind: "email", value: "ana@example.com", label: "" }],
  suggestions: [],
};

const groups = {
  items: [
    {
      id: "g1",
      display_name: "Surf friends",
      description: null,
      origin: "owner",
      state: "active",
      owner_locked: false,
      owner_criteria_only: false,
      revision: 4,
      members: 2,
      proposed: 1,
    },
    {
      id: "g2",
      display_name: "Family",
      description: null,
      origin: "automatic",
      state: "active",
      owner_locked: true,
      owner_criteria_only: false,
      revision: 9,
      members: 5,
      proposed: 0,
    },
  ],
  next: null,
};

const group = {
  ...groups.items[0],
  members: [
    {
      person_id: "p1",
      display_name: "Ana Costa",
      state: "active",
      origin: "owner",
      rationale: null,
    },
    {
      person_id: "p2",
      display_name: "Rui Lopes",
      state: "active",
      origin: "owner",
      rationale: null,
    },
    {
      person_id: "p3",
      display_name: "Marta Silva",
      state: "proposed",
      origin: "automatic",
      rationale: "Talks about surf trips",
    },
  ],
  events: [{ id: 1, actor: "owner", action: "create", at: ago(9000), undone_at: null }],
  can_undo: true,
};

const viewCases = [
  { match: { view: "people" }, response: people },
  { match: { view: "person" }, response: person },
  { match: { view: "personInterests" }, response: interests },
  { match: { view: "personPlaces" }, response: places },
  { match: { view: "personContacts" }, response: contacts },
  {
    match: { view: "socialGroups", params: { limit: "200", state: "proposed" } },
    response: { items: [], next: null },
  },
  { match: { view: "socialGroups" }, response: groups },
  { match: { view: "socialGroup" }, response: group },
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
  it("lists people, opens a person, and changes mode, interests, and memory through NSVX", async () => {
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
            "nsvx.people.change": { ok: true },
            "nsvx.groups.change": { ok: true },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=people`);
        const surface = page.locator(".nsvx");

        // Frequent people first, then everyone with channel logos and non-auto modes.
        await surface.getByText("Frequent", { exact: true }).waitFor();
        await surface.getByText("Marta Silva", { exact: true }).waitFor();
        expect(await surface.getByRole("img", { name: "WhatsApp" }).count()).toBeGreaterThan(0);
        if (capture) {
          await shoot(page, surface, "nsvx-people-list", [mobile]);
          await page.setViewportSize(desktop);
        }

        // The person opens beside the list and the address keeps it.
        await surface.locator(".nsvx-conv", { hasText: "Ana Costa" }).click();
        await surface.getByText("Vegetarian since 2024").waitFor();
        expect(new URL(page.url()).searchParams.get("person")).toBe("p1");
        await surface.getByRole("button", { name: "Surf friends" }).waitFor();
        await surface.locator(".nsvx-ppl-map").waitFor();
        await surface.getByText("ana@example.com").waitFor();

        // Review applies at once; Pause drops drafts, so it asks first.
        await surface.getByRole("radio", { name: "Review" }).click();
        expect((await gateway.waitForRequest("nsvx.people.change")).params).toEqual({
          action: "mode",
          personId: "p1",
          handling: "review",
        });
        await surface.getByRole("radio", { name: "Pause" }).click();
        await surface.getByText("Unsent drafts are cancelled").waitFor();
        await surface.locator(".nsvx-confirm").getByRole("button", { name: "Pause" }).click();
        await expect
          .poll(async () =>
            (await gateway.getRequests("nsvx.people.change")).some(
              (r) => (r.params as { handling?: string }).handling === "paused",
            ),
          )
          .toBe(true);

        // Interests: tell clone to avoid a topic, fenced by the revision NSVX gave.
        await surface
          .getByRole("radiogroup", { name: "Her job" })
          .getByRole("radio", { name: "Avoid" })
          .click();
        await expect
          .poll(
            async () =>
              (await gateway.getRequests("nsvx.people.change")).find(
                (r) => (r.params as { action?: string }).action === "interests",
              )?.params,
          )
          .toEqual({
            action: "interests",
            personId: "p1",
            control: "topic",
            revision: 7,
            topic_id: "t-work",
            label: "Her job",
            willingness: "avoid",
          });

        // Memory: hiding a fact asks first, then goes to NSVX as its own "remove".
        await surface
          .locator(".nsvx-ppl-fact", { hasText: "Vegetarian" })
          .getByRole("button", { name: "Hide" })
          .click();
        await surface
          .locator(".nsvx-ppl-fact .nsvx-confirm")
          .getByRole("button", { name: "Hide" })
          .click();
        await expect
          .poll(
            async () =>
              (await gateway.getRequests("nsvx.people.change")).find(
                (r) => (r.params as { action?: string }).action === "fact",
              )?.params,
          )
          .toEqual({ action: "fact", factId: "f1", factAction: "remove" });

        if (capture) {
          await surface.locator(".nsvx-ppl-head").scrollIntoViewIfNeeded();
          await shoot(page, surface, "nsvx-people-person");
          await page.setViewportSize(desktop);
        }
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("opens a private group and confirms a suggested member", async () => {
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
            "nsvx.groups.change": { ok: true },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=people&group=g1`);
        const surface = page.locator(".nsvx");
        await surface.getByText("Family", { exact: true }).waitFor();
        await surface.getByText("Marta Silva", { exact: true }).waitFor();

        await surface.getByRole("button", { name: "Add Marta Silva" }).click();
        expect((await gateway.waitForRequest("nsvx.groups.change")).params).toEqual({
          action: "member",
          groupId: "g1",
          revision: 4,
          personId: "p3",
          state: "active",
        });

        if (capture) {
          await shoot(page, surface, "nsvx-people-group");
          await page.setViewportSize(desktop);
        }
        expect(pageErrors).toEqual([]);
      },
    );
  });
});
