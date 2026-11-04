import { describe, expect, it, vi } from "vitest";
import { verifyConfig, verifyPicker } from "../../scripts/ops/verify-thin-client-remote-picker.ts";

describe("thin client remote picker verification", () => {
  it("accepts the Master target in remote direct or SSH mode and rejects other targets", () => {
    expect(() =>
      verifyConfig({
        gateway: {
          mode: "remote",
          remote: { transport: "direct", url: "wss://51.255.87.117:18789" },
        },
      }),
    ).not.toThrow();
    expect(() =>
      verifyConfig({
        gateway: {
          mode: "remote",
          remote: {
            transport: "ssh",
            sshTarget: "user@51.255.87.117",
            url: "ws://127.0.0.1:18789",
          },
        },
      }),
    ).not.toThrow();
    expect(() =>
      verifyConfig({ gateway: { mode: "local", remote: { url: "wss://51.255.87.117" } } }),
    ).toThrow();
    expect(() =>
      verifyConfig({
        gateway: {
          mode: "remote",
          remote: { transport: "ssh", sshTarget: "user@other", url: "wss://51.255.87.117" },
        },
      }),
    ).toThrow();
  });

  it("searches the chosen organization and fails if no remote rows appear", async () => {
    const picker = {
      selectOrg: vi.fn(),
      search: vi.fn(),
      remoteCount: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
    };
    await verifyPicker(picker, "My-Clone-AI", "open");
    expect(picker.selectOrg).toHaveBeenCalledWith("My-Clone-AI");
    expect(picker.search).toHaveBeenCalledWith("open");
    expect(picker.remoteCount).toHaveBeenCalledWith("My-Clone-AI");
    await expect(verifyPicker(picker, "My-Clone-AI", "missing")).rejects.toThrow(
      "No My-Clone-AI repositories",
    );
  });
});
