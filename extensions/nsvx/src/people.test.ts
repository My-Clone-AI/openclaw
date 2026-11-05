import { describe, expect, it, vi } from "vitest";
import { createNsvxClient, type NsvxErrorKind } from "./client.js";
import { createNsvxPeopleTool } from "./people-tool.js";
import { changeGroup, changePerson } from "./people.js";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A fake NSVX: the sign-in state route answers with a CSRF token, every other route with `answer`. */
function nsvx(
  answer: (url: string, init: RequestInit) => Response = () => json(200, { ok: true }),
) {
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
    url.endsWith("/api/auth/state")
      ? json(200, { authenticated: true, csrf: "csrf-1" })
      : answer(url, init),
  );
  const client = createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession: "owner",
    fetchImpl,
  });
  const writes = () =>
    fetchImpl.mock.calls
      .filter(([url]) => !url.endsWith("/api/auth/state"))
      .map(([url, init]) => ({
        url,
        method: init.method,
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(init.body as string) : undefined,
      }));
  return { client, fetchImpl, writes };
}

async function kindOf(run: Promise<unknown>): Promise<NsvxErrorKind | undefined> {
  return run.then(
    () => undefined,
    (cause: unknown) => (cause as { kind: NsvxErrorKind }).kind,
  );
}

describe("people changes", () => {
  it("sends each change to its NSVX route with the session's CSRF token", async () => {
    const { client, writes } = nsvx();
    await changePerson(client, { action: "mode", personId: "p-1", handling: "review" });
    await changePerson(client, { action: "resume", personId: "p-1" });
    await changePerson(client, {
      action: "placesPropose",
      personId: "p-1",
      key: "visit-key-1",
      venue: "city",
      city: "Porto",
      date: "2026-05",
    });
    expect(writes()).toEqual([
      {
        url: "https://nsvx.test/api/people/p-1",
        method: "PATCH",
        headers: expect.objectContaining({
          "X-CSRF-Token": "csrf-1",
          Cookie: "clone_session=owner",
        }),
        body: { handling: "review" },
      },
      {
        url: "https://nsvx.test/api/people/p-1/automation-stop?confirm=true",
        method: "DELETE",
        headers: expect.any(Object),
        body: {},
      },
      {
        url: "https://nsvx.test/api/people/p-1/visits",
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": "visit-key-1" }),
        body: { place_label: null, city: "Porto", venue_kind: "city", event_date: "2026-05" },
      },
    ]);
  });

  it("fences group changes with the revision and treats 204 as done", async () => {
    const { client, writes } = nsvx((_url, init) =>
      init.method === "DELETE" ? json(204) : json(200, { ok: true }),
    );
    await changeGroup(client, {
      action: "member",
      groupId: "g-1",
      revision: 4,
      personId: "p-2",
      state: "excluded",
    });
    expect(await changeGroup(client, { action: "delete", groupId: "g-1", revision: 5 })).toEqual({
      ok: true,
    });
    expect(writes().map((w) => [w.method, w.url, w.body])).toEqual([
      [
        "PUT",
        "https://nsvx.test/api/social-groups/g-1/members/p-2?revision=4",
        { state: "excluded" },
      ],
      ["DELETE", "https://nsvx.test/api/social-groups/g-1?revision=5", {}],
    ]);
  });

  it("reports a stale revision as a conflict, not a failure", async () => {
    const { client } = nsvx(() => json(409, { detail: "o grupo mudou entretanto; recarrega" }));
    expect(
      await kindOf(
        changeGroup(client, { action: "rename", groupId: "g-1", revision: 1, name: "Surf" }),
      ),
    ).toBe("conflict");
  });

  it("rejects values NSVX's contract would refuse before calling NSVX", async () => {
    const { client, fetchImpl } = nsvx();
    for (const run of [
      changePerson(client, { action: "mode", personId: "p-1", handling: "spam" }),
      changePerson(client, { action: "quietHours", personId: "p-1", start: "25:00", end: "08:00" }),
      changePerson(client, { action: "fact", factId: "f-1", factAction: "correct" }),
      changePerson(client, {
        action: "interests",
        personId: "p-1",
        control: "topic",
        revision: 1,
        willingness: "always",
      }),
      changeGroup(client, {
        action: "member",
        groupId: "g-1",
        revision: -1,
        personId: "p",
        state: "active",
      }),
      changePerson(client, { action: "send", personId: "p-1" }),
    ]) {
      expect(await kindOf(run)).toBe("invalid");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("nsvx_people", () => {
  it("answers only the owner and changes only on the owner's current turn", async () => {
    const { client, writes } = nsvx();
    const assertInvocationCurrent = vi.fn();
    const guest = createNsvxPeopleTool(client, { senderIsOwner: false, assertInvocationCurrent });
    expect(JSON.stringify(await guest.execute("c-1", { action: "find" }))).toContain("denied");

    const owner = createNsvxPeopleTool(client, { senderIsOwner: true, assertInvocationCurrent });
    await owner.execute("c-2", { action: "mode", personId: "p-1", handling: "paused" });
    expect(assertInvocationCurrent).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([
      expect.objectContaining({ method: "PATCH", body: { handling: "paused" } }),
    ]);
  });
});
