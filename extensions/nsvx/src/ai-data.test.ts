import { describe, expect, it } from "vitest";
import {
  laneIds,
  moveRoute,
  nodeTone,
  usageWindows,
  type ChainNode,
  type Provider,
} from "./ai-data.js";

const node = (patch: Partial<ChainNode>): ChainNode => ({
  priority: 1,
  provider: "anthropic",
  model: "claude-opus",
  effort: null,
  label: "Opus",
  eligible: true,
  reason: "ok",
  status: "ready",
  reset_at: null,
  active: false,
  ...patch,
});

const provider = (patch: Partial<Provider>): Provider => ({
  id: "anthropic",
  name: "Claude",
  subscription: "Max",
  state: "CONNECTED",
  enabled: true,
  billing: "subscription",
  error: null,
  last_ok_at: null,
  quota: [],
  ...patch,
});

describe("nsvx AI data", () => {
  it("orders lanes like NSVX and keeps lanes it adds later", () => {
    expect(laneIds({ legal: {}, extra: {}, normal: {}, tasks: {} })).toEqual([
      "normal",
      "tasks",
      "legal",
      "extra",
    ]);
  });

  it("names a route's state from NSVX's eligibility, not its stored label", () => {
    expect(nodeTone(node({ active: true })).tone).toBe("busy");
    expect(nodeTone(node({ trial: true })).key).toBe("checking");
    expect(nodeTone(node({ eligible: false, reason: "exhausted" }))).toEqual({
      tone: "bad",
      key: "exhausted",
    });
    expect(nodeTone(node({ eligible: false, reason: "something_new" })).key).toBe("waiting");
  });

  it("moves one route and sends only provider, model, and effort", () => {
    const chain = [node({ provider: "a" }), node({ provider: "b", effort: "high" })];
    expect(moveRoute(chain, 1, 0)).toEqual([
      { provider: "b", model: "claude-opus", effort: "high" },
      { provider: "a", model: "claude-opus", effort: null },
    ]);
    expect(moveRoute(chain, 0, 2)).toBeUndefined();
  });

  it("shows usage only while NSVX's measurement is fresh", () => {
    const now = 1_000_000_000;
    const measured = (ageS: number) =>
      provider({
        quota_usage: {
          checked_at: now / 1000 - ageS,
          windows: { five_hour: { utilization: 0.42 } },
        },
      });
    expect(usageWindows(measured(10), now)).toEqual([
      { key: "five_hour", used: 0.42, resetsAt: null },
    ]);
    expect(usageWindows(measured(900), now)[0]!.used).toBeNull();
  });
});
