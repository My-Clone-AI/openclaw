import { describe, expect, it, vi } from "vitest";
import { dayRange, filterActivity, lastWeek, type ActivityEvent } from "./activity-data.js";
import { activityRange, findRequest } from "./activity-requests.js";
import { createNsvxClient } from "./client.js";
import { createNsvxOwnerTools } from "./tools.js";

const event = (id: number, at: string, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id,
  at,
  kind: "status",
  summary: `event ${id}`,
  from_status: null,
  to_status: null,
  actor: "auto",
  actor_name: "AUTO",
  ...extra,
});

describe("activity filters", () => {
  const items = [
    event(3, "2026-11-05T10:00:00Z", { kind: "delegated", task_title: "Pay garage" }),
    event(2, "2026-11-03T10:00:00Z", { to_status: "completed" }),
    event(1, "2026-10-30T23:59:00Z"),
  ];

  it("filters by words, kind, and inclusive UTC days", () => {
    const pick = (filters: Partial<Parameters<typeof filterActivity>[1]>) =>
      filterActivity(items, { query: "", kind: "", start: "", end: "", ...filters }).map(
        (row) => row.id,
      );
    expect(pick({ query: "garage" })).toEqual([3]);
    expect(pick({ query: "COMPLETED" })).toEqual([2]);
    expect(pick({ kind: "status" })).toEqual([2, 1]);
    expect(pick({ start: "2026-11-03", end: "2026-11-05" })).toEqual([3, 2]);
    expect(pick({ end: "2026-10-30" })).toEqual([1]);
    expect(dayRange(items)).toEqual({ start: "2026-10-30", end: "2026-11-05" });
    expect(lastWeek(new Date("2026-11-05T12:00:00Z"))).toEqual({
      start: "2026-10-30",
      end: "2026-11-05",
    });
  });

  it("checks requests once at the Gateway boundary", () => {
    expect(activityRange({ start: "2026-11-01", end: "2026-11-05", ids: [1, 2] })).toEqual({
      start: "2026-11-01",
      end: "2026-11-05",
      ids: [1, 2],
    });
    expect(() => activityRange({ start: "2026-11-06", end: "2026-11-05" })).toThrow("after");
    expect(() => activityRange({ start: "yesterday", end: "2026-11-05" })).toThrow("start");
    expect(() => activityRange({ start: "2026-11-01", end: "2026-11-05", ids: ["1"] })).toThrow(
      "ids",
    );
    expect(findRequest({ q: "  ana   silva " })).toEqual({ q: "ana silva", limit: 5 });
    expect(() => findRequest({ q: "a" })).toThrow("characters");
    expect(() => findRequest({ q: "ana", groups: ["secrets"] })).toThrow("groups");
  });
});

describe("owner chat tools", () => {
  const fetchImpl = vi.fn(async (url: string) =>
    url.endsWith("/api/auth/state")
      ? Response.json({ authenticated: true, csrf: "t" })
      : Response.json({
          groups: [
            {
              group: "people",
              total: 1,
              next: null,
              error: null,
              items: [
                {
                  ref: { kind: "person", id: "p1" },
                  title: "Ana",
                  excerpt: null,
                  meta: [],
                  updated_at: null,
                  href: "/pessoas/p1",
                },
              ],
            },
          ],
        }),
  );
  const client = createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession: "c",
    fetchImpl,
  });
  const search = (senderIsOwner: boolean | undefined) =>
    createNsvxOwnerTools(client, {
      senderIsOwner,
      assertInvocationCurrent: () => undefined,
    } as never).find((tool) => tool.name === "nsvx_search");

  it("answers the owner and refuses anyone else before reading NSVX", async () => {
    const denied = await search(false)?.execute("call-1", { query: "ana" });
    expect(JSON.stringify(denied)).toContain('\\"reason\\": \\"denied\\"');
    expect(fetchImpl).not.toHaveBeenCalled();

    const answer = JSON.stringify(await search(true)?.execute("call-2", { query: "ana" }));
    expect(answer).toContain("Ana");
  });
});
