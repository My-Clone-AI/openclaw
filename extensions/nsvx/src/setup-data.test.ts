import { describe, expect, it } from "vitest";
import { accessChange, setOnlyPicked, toggleTool, toolOn, type CatalogTool } from "./setup-data.js";

const exec: CatalogTool = { id: "exec", label: "Exec", defaultProfiles: ["coding", "full"] };
const send: CatalogTool = {
  id: "message",
  label: "Message",
  defaultProfiles: ["messaging", "full"],
};

describe("tool chips", () => {
  it("turns a profile tool off with deny and back on by dropping the deny", () => {
    const off = toggleTool(exec, { profile: "coding" }, null);
    expect(off).toEqual({ profile: "coding", deny: ["exec"] });
    expect(toolOn(exec, off, null)).toBe(false);
    const on = toggleTool(exec, off, null);
    expect(on).toEqual({ profile: "coding", deny: undefined });
    expect(accessChange(on)).toEqual({
      profile: "coding",
      allow: null,
      deny: null,
      alsoAllow: null,
    });
  });

  it("adds a tool outside the profile as an extra, using the inherited profile", () => {
    expect(toolOn(send, {}, "coding")).toBe(false);
    expect(toggleTool(send, {}, "coding")).toEqual({ deny: undefined, alsoAllow: ["message"] });
    // No profile anywhere means every tool.
    expect(toolOn(send, {}, null)).toBe(true);
  });

  it("only-these keeps exactly the tools on now", () => {
    const picked = setOnlyPicked(true, [exec, send], { profile: "coding" }, null);
    expect(picked.allow).toEqual(["exec"]);
    expect(toolOn(send, picked, null)).toBe(false);
    expect(toggleTool(send, picked, null).allow).toEqual(["exec", "message"]);
    expect(setOnlyPicked(false, [exec, send], picked, null)).not.toHaveProperty("allow");
  });
});
