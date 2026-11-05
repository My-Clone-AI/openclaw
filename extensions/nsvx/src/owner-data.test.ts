import { describe, expect, it } from "vitest";
import { missionFilter, todaySections, type Mission } from "./owner-data.js";

const t = (key: string) => key;

describe("todaySections", () => {
  it("puts each NSVX Today group in one section and links rows to their task", () => {
    const sections = todaySections(
      {
        decisions: [
          {
            id: "d1",
            mission_id: "m1",
            mission_title: "Pay rent",
            payee: "Landlord",
            amount_minor: 120000,
            currency: "EUR",
          },
        ],
        approvals: [{ id: "o1", payload: { text: "On my way" } }],
        owner_requests: [{ id: "r1", question: "Which day?", message_from: "Ana" }],
        needs_owner: [{ id: "m2", title: "Sign lease", status: "needs_owner" }],
        handling: [
          { id: "m3", title: "Book flight", status: "working", progress: { stalled_steps: 2 } },
        ],
        done: [{ id: "m4", title: "Renew card", status: "completed" }],
        delivery_alerts: [{ id: "a1", channel: "whatsapp", reason: "not ready" }],
        subscription_limited_jobs: 3,
      },
      t,
    );
    expect(sections.decide.map((row) => [row.id, row.mission])).toEqual([
      ["d1", "m1"],
      ["o1", undefined],
    ]);
    expect(sections.decide[0]?.detail).toContain("Landlord");
    expect(sections.ask.map((row) => row.id)).toEqual(["r1", "m2"]);
    expect(sections.working[0]?.tone).toBe("warn");
    expect(sections.done[0]?.mission).toBe("m4");
    expect(sections.alert.map((row) => row.id)).toEqual(["a1", "limited"]);
  });

  it("returns empty sections for an empty day", () => {
    const sections = todaySections({}, t);
    expect(Object.values(sections).every((rows) => rows.length === 0)).toBe(true);
  });
});

describe("missionFilter", () => {
  const mission = (status: string, pending = 0): Mission => ({
    id: status,
    title: status,
    status,
    pending_decisions: pending,
  });

  it("splits open, waiting-on-owner, and closed tasks", () => {
    expect(missionFilter("active", mission("working"))).toBe(true);
    expect(missionFilter("active", mission("completed"))).toBe(false);
    expect(missionFilter("needs", mission("working", 1))).toBe(true);
    expect(missionFilter("needs", mission("needs_owner"))).toBe(true);
    expect(missionFilter("needs", mission("working"))).toBe(false);
    expect(missionFilter("done", mission("cancelled"))).toBe(true);
    expect(missionFilter("all", mission("anything"))).toBe(true);
  });
});
