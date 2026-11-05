// Verifies command polling backoff state used by diagnostic/session commands.
import { describe, expect, it } from "vitest";
import type { SessionState } from "../logging/diagnostic-session-state.js";
import {
  pruneStaleCommandPollsCore,
  recordCommandPoll,
  resetCommandPollCount,
} from "./command-poll-backoff.js";

describe("command-poll-backoff", () => {
  describe("recordCommandPoll", () => {
    it("caps quiet polls and normalizes previously oversized counters", () => {
      const state: SessionState = {
        lastActivity: Date.now(),
        state: "processing",
        queueDepth: 0,
        commandPollCounts: new Map([["old", { count: 99, lastPollAt: Date.now() }]]),
      };
      expect(recordCommandPoll(state, "old", false)).toBe(60000);
      expect(state.commandPollCounts?.get("old")?.count).toBe(3);
      expect(Array.from({ length: 6 }, () => recordCommandPoll(state, "new", false))).toEqual([
        5000, 10000, 30000, 60000, 60000, 60000,
      ]);
      expect(state.commandPollCounts?.get("new")?.count).toBe(3);
    });

    it("resets count when poll returns new output", () => {
      const state: SessionState = {
        lastActivity: Date.now(),
        state: "processing",
        queueDepth: 0,
      };

      recordCommandPoll(state, "cmd-123", false);
      recordCommandPoll(state, "cmd-123", false);
      recordCommandPoll(state, "cmd-123", false);
      expect(state.commandPollCounts?.get("cmd-123")?.count).toBe(2); // 3 polls = index 2

      // New output resets count so the next quiet poll starts at the fast lane.
      const retryMs = recordCommandPoll(state, "cmd-123", true);
      expect(retryMs).toBe(5000);
      expect(state.commandPollCounts?.get("cmd-123")?.count).toBe(0);
    });
  });

  describe("resetCommandPollCount", () => {
    it("removes command from tracking", () => {
      const state: SessionState = {
        lastActivity: Date.now(),
        state: "processing",
        queueDepth: 0,
      };

      recordCommandPoll(state, "cmd-123", false);
      expect(state.commandPollCounts?.has("cmd-123")).toBe(true);

      resetCommandPollCount(state, "cmd-123");
      expect(state.commandPollCounts?.has("cmd-123")).toBe(false);
    });
  });

  describe("pruneStaleCommandPolls", () => {
    it("removes polls older than one hour", () => {
      const state: SessionState = {
        lastActivity: Date.now(),
        state: "processing",
        queueDepth: 0,
        commandPollCounts: new Map([
          ["cmd-old", { count: 5, lastPollAt: Date.now() - 7200000 }],
          ["cmd-new", { count: 3, lastPollAt: Date.now() - 1000 }],
        ]),
      };

      pruneStaleCommandPollsCore(state);

      expect(state.commandPollCounts?.has("cmd-old")).toBe(false);
      expect(state.commandPollCounts?.has("cmd-new")).toBe(true);
    });

    it("keeps an empty state without creating poll tracking", () => {
      const state: SessionState = {
        lastActivity: Date.now(),
        state: "idle",
        queueDepth: 0,
      };

      pruneStaleCommandPollsCore(state);
      expect(state.commandPollCounts).toBeUndefined();
    });
  });
});
