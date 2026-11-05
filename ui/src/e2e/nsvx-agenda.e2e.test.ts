import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import {
  defaultControlUiFeatureMethods,
  installMockGateway,
} from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX agenda" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const zone = "Europe/Lisbon";
const day = (offset: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
/** `HH:mm` on a Lisbon day, with Lisbon's offset that day. */
const at = (offset: number, time: string) => {
  const key = day(offset);
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${key}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  return `${key}T${time}:00${name === "GMT" ? "+00:00" : name.slice(3)}`;
};
const me = {
  email: "me@example.com",
  response: "accepted",
  organizer: true,
  self: true,
  optional: false,
  name: null,
};
const guest = (email: string, name: string, response: string) => ({
  email,
  response,
  organizer: false,
  self: false,
  optional: false,
  name,
});

// Synthetic payloads shaped like NSVX /api/workspace answers.
const event = (overrides: Record<string, unknown>) => ({
  creator_app: null,
  calendar_id: "primary",
  etag: '"1"',
  status: "confirmed",
  location: null,
  description: null,
  start: null,
  end: null,
  start_date: null,
  end_date: null,
  all_day: false,
  time_zone: zone,
  organizer: "me@example.com",
  organizer_self: true,
  attendees: [me],
  rsvp: {},
  self_response: "accepted",
  html_link: "https://calendar.google.com/calendar/event?eid=example",
  meet_url: null,
  conference_id: null,
  conference_status: null,
  recurring: false,
  recurring_event_id: null,
  mission_id: null,
  can_edit: true,
  synced_at: new Date().toISOString(),
  ...overrides,
});
const events = [
  event({
    id: "e1",
    event_id: "g1",
    summary: "Design review",
    start: at(0, "10:00"),
    end: at(0, "11:00"),
    location: "Studio, Lisbon",
    meet_url: "https://meet.google.com/abc-defg-hij",
    attendees: [
      me,
      guest("ana@example.com", "Ana Costa", "accepted"),
      guest("rui@example.com", "Rui Lopes", "tentative"),
    ],
  }),
  event({
    id: "e2",
    event_id: "g2",
    summary: "Team sync",
    start: at(0, "10:30"),
    end: at(0, "11:00"),
  }),
  event({
    id: "e3",
    event_id: "g3",
    summary: "Lunch",
    start: at(0, "13:00"),
    end: at(0, "14:00"),
    location: "Example Café",
  }),
  event({
    id: "e4",
    event_id: "g4",
    summary: "Dentist",
    start: at(1, "16:00"),
    end: at(1, "16:30"),
  }),
];
const calendars = [
  {
    id: "c1",
    calendar_id: "primary",
    summary: "me@example.com",
    account: "me@example.com",
    time_zone: zone,
    access_role: "owner",
    primary: true,
    selected: true,
    color: "#4285F4",
    sync_state: "ok",
    last_delta_at: new Date().toISOString(),
    last_error: null,
  },
  {
    id: "c2",
    calendar_id: "family",
    summary: "Family",
    account: "me@example.com",
    time_zone: zone,
    access_role: "reader",
    primary: false,
    selected: false,
    color: "#0B8043",
    sync_state: "ok",
    last_delta_at: null,
    last_error: null,
  },
];
const status = {
  products: [{ product: "calendar", permission_granted: true }],
  counts: { upcoming: 4, uncertain: 0, suggestions: 0 },
};
const detail = {
  event: events[0],
  meeting: {
    status: "scheduled",
    participants: [],
    participants_source: null,
    artifacts: {
      recording: ["unavailable"],
      transcript: ["unavailable"],
      smart_note: ["unavailable"],
    },
    live_media: { available: false, status: "off", reason: "clone does not join meetings." },
  },
  conferences: [],
  artifacts: [],
  documents: [],
  intents: [],
  mission: null,
};

async function capture(page: Page, surface: Locator, name: string, ready: Locator[]) {
  if (process.env.OPENCLAW_CAPTURE_UI_PROOF !== "1") {
    return;
  }
  for (const viewport of [desktop, phone]) {
    const frame = await takeControlUiScreenshotFrame(page, surface, ready, {
      animations: "disabled",
      viewport,
    });
    await writeFile(
      path.join(suite.artifactDir, `nsvx-agenda-${name}-${viewport.width}.png`),
      frame.png,
    );
  }
  await page.setViewportSize(desktop);
}

suite.define(() => {
  it("shows the NSVX agenda natively and books through NSVX's preview and confirm", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", timezoneId: zone, serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          featureMethods: [
            ...defaultControlUiFeatureMethods,
            "nsvx.view",
            "nsvx.agenda.summary",
            "nsvx.agenda.slots",
            "nsvx.agenda.preview",
            "nsvx.agenda.submit",
            "nsvx.agenda.select",
            "nsvx.agenda.help",
          ],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.view": {
              cases: [
                { match: { view: "workspaceStatus" }, response: status },
                { match: { view: "calendars" }, response: calendars },
                {
                  match: { view: "calendarEvents" },
                  response: { events, fresh_at: new Date().toISOString(), errors: [] },
                },
                { match: { view: "calendarEvent" }, response: detail },
                {
                  match: { view: "workspaceIntent" },
                  response: {
                    id: "i1",
                    operation: "calendar.create_event",
                    state: "accepted",
                    lifecycle: "accepted_by_google",
                    lifecycle_label: "Aceite pelo Google",
                    error: null,
                  },
                },
              ],
            },
            "nsvx.agenda.summary": {
              text: "Three meetings today; the afternoon is free after lunch.",
            },
            "nsvx.agenda.slots": {
              slots: [
                { start: at(1, "09:00"), end: at(1, "10:00") },
                { start: at(1, "11:00"), end: at(1, "12:00") },
              ],
              availability_complete: true,
              unverified: [],
            },
            "nsvx.agenda.preview": {
              operation: "calendar.create_event",
              effect: "private",
              summary: "Create «Planning» in me@example.com's calendar",
              account: "me@example.com",
              terms_hash: "c".repeat(64),
            },
            "nsvx.agenda.submit": {
              id: "i1",
              operation: "calendar.create_event",
              state: "pending",
              lifecycle: "queued",
              lifecycle_label: "Na fila",
              error: null,
            },
            "nsvx.agenda.help": { text: "- Goals\n- Open questions\n- Next steps" },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=agenda`);
        const surface = page.locator(".nsvx");

        // Week: today's events with the clash flagged, the Meet mark, and an up-to-date Google read.
        const review = surface.getByRole("button", { name: /Design review/ });
        await review.waitFor();
        await surface.getByText("Overlap", { exact: true }).waitFor();
        await surface.getByText("Up to date", { exact: true }).waitFor();
        await gateway.waitForRequest("nsvx.view", {
          match: { view: "calendarEvents" },
        });
        const live = (await gateway.getRequests("nsvx.view")).filter(
          (request) =>
            (request.params as { view?: string }).view === "calendarEvents" &&
            (request.params as { params?: { live?: string } }).params?.live === "1",
        );
        expect(live).toHaveLength(1);
        await surface.getByRole("button", { name: "Day summary" }).click();
        await surface.getByText(/Three meetings today/).waitFor();
        await capture(page, surface, "week", [review]);

        // Month: counts per day; tapping a day lists it below.
        await surface.getByRole("radio", { name: "Month", exact: true }).click();
        const cell = surface.getByRole("button", { name: /^Today: 3$/ });
        await cell.click();
        await surface.getByRole("button", { name: /Team sync/ }).waitFor();
        await capture(page, surface, "month", [cell]);
        await surface.getByRole("radio", { name: "Week", exact: true }).click();

        // Event: guests with replies, the meeting, and clone's help.
        await surface.getByRole("button", { name: /Design review/ }).click();
        await surface.getByText("Ana Costa", { exact: true }).waitFor();
        expect(new URL(page.url()).searchParams.get("event")).toBe("e1");
        await surface.locator(".nsvx-agenda__rsvp--tentative").getByText("Maybe").waitFor();
        await surface.getByRole("button", { name: "Agenda", exact: true }).click();
        await expect.poll(() => surface.locator("textarea").inputValue()).toContain("Goals");
        expect((await gateway.waitForRequest("nsvx.agenda.help")).params).toMatchObject({
          eventId: "e1",
          kind: "agenda",
        });
        await capture(page, surface, "event", [surface.getByText("Ana Costa", { exact: true })]);
        await surface.getByRole("button", { name: "Back", exact: true }).click();

        // New: a free time fills the form; review shows NSVX's terms; booking sends them once.
        await surface.getByRole("button", { name: "New", exact: true }).first().click();
        await surface.getByLabel("Title").fill("Planning");
        await surface.getByRole("button", { name: "Free times" }).click();
        const slot = surface.locator(".nsvx-agenda__slot").first();
        await slot.click();
        await expect.poll(() => surface.locator(`input[type="date"]`).inputValue()).toBe(day(1));
        await capture(page, surface, "new", [surface.getByLabel("Title")]);
        await surface.getByRole("button", { name: "Review", exact: true }).click();
        const book = surface.getByRole("button", { name: "Book", exact: true });
        await book.waitFor();
        await surface.getByText("Only in your calendar", { exact: true }).waitFor();
        const previewed = (await gateway.waitForRequest("nsvx.agenda.preview")).params as {
          operation: string;
          payload: Record<string, unknown>;
        };
        expect(previewed.operation).toBe("calendar.create_event");
        expect(previewed.payload).toMatchObject({ summary: "Planning", duration_min: 60 });
        await capture(page, surface, "review", [book]);
        await book.click();
        await surface.getByText("Done", { exact: true }).waitFor({ timeout: 10_000 });
        const submitted = (await gateway.waitForRequest("nsvx.agenda.submit")).params as Record<
          string,
          unknown
        >;
        expect(submitted).toMatchObject({
          operation: "calendar.create_event",
          termsHash: "c".repeat(64),
        });
        expect(typeof submitted.clientKey).toBe("string");
        expect(await gateway.getRequests("nsvx.agenda.submit")).toHaveLength(1);
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows the agenda in Portuguese and says when the calendar is not connected", async () => {
    await suite.withPage(
      { viewport: phone, locale: "pt-PT", serviceWorkers: "block" },
      async ({ page }) => {
        await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          featureMethods: [...defaultControlUiFeatureMethods, "nsvx.view"],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.view": {
              cases: [
                {
                  match: { view: "workspaceStatus" },
                  response: {
                    products: [{ product: "calendar", permission_granted: false }],
                    counts: {},
                  },
                },
                { match: { view: "calendars" }, response: [] },
              ],
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=agenda`);
        const surface = page.locator(".nsvx");
        const card = surface.getByText("Calendário não ligado", { exact: true });
        await card.waitFor();
        await surface.getByRole("tab", { name: "Agenda" }).waitFor();
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(
            path.join(suite.artifactDir, "nsvx-agenda-not-connected-390.png"),
            frame.png,
          );
        }
      },
    );
  });
});
