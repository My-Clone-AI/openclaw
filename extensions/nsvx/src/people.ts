import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import {
  CONSENT_CATEGORIES,
  HANDLINGS,
  type ContactEntry,
  type Group,
  type PersonSummary,
} from "./people-data.js";

/**
 * The owner's People and group changes. Each maps to one fixed NSVX route with a body NSVX's own contract accepts;
 * none sends a message. NSVX keeps revisions, audit, and undo, so a stale revision comes back as `conflict`.
 */

type Params = Record<string, unknown>;

const ID = /^[\w-]{1,100}$/;

function id(params: Params, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || !ID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function text(params: Params, name: string, max: number): string {
  const value = params[name];
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new NsvxError("invalid", `${name} must be text up to ${max} characters.`);
  }
  return value.trim();
}

function optionalText(params: Params, name: string, max: number): string | null {
  return params[name] === undefined || params[name] === null || params[name] === ""
    ? null
    : text(params, name, max);
}

function flag(params: Params, name: string): boolean {
  if (typeof params[name] !== "boolean") {
    throw new NsvxError("invalid", `${name} must be true or false.`);
  }
  return params[name];
}

function revision(params: Params, name = "revision"): string {
  const value = params[name];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new NsvxError("invalid", `${name} must be a whole number.`);
  }
  return String(value);
}

function oneOf<V extends string>(params: Params, name: string, values: readonly V[]): V {
  const value = params[name];
  if (typeof value !== "string" || !values.includes(value as V)) {
    throw new NsvxError("invalid", `${name} must be one of ${values.join(", ")}.`);
  }
  return value as V;
}

function key(params: Params): string {
  const value = text(params, "key", 100);
  if (value.length < 8) {
    throw new NsvxError("invalid", "key must have at least 8 characters.");
  }
  return value;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FACT_ACTIONS = ["correct", "obsolete", "restrict", "remove", "erase"] as const;
const CONTACT_KINDS = ["email", "phone", "iban", "account"] as const;
const VENUES = ["city", "restaurant", "public_venue"] as const;

/** NSVX's interest control contract (interest_controls.Control): only these fields, only these values. */
const INTEREST_FIELDS: Record<string, readonly (string | boolean)[] | "text" | "id"> = {
  mode: ["off", "observe_only", "bounded_learning"],
  willingness: ["unknown", "open", "avoid", "defer"],
  learning: [true, false],
  brevity: ["default", "brief", "detailed"],
  emoji: ["default", "off", "on"],
  language: ["current", "pt", "en"],
  engagement: ["unknown", "engaged", "not_engaged", "mixed"],
  satisfaction: ["unknown", "positive", "negative", "neutral", "mixed"],
  affect: ["unknown", "positive", "negative", "neutral", "mixed"],
  feedback_target: [
    "unknown",
    "topic",
    "move",
    "length",
    "factual_accuracy",
    "frequency",
    "timing",
    "question",
  ],
  closure: [true, false],
  label: "text",
  topic_id: "id",
  response_id: "id",
};
const INTEREST_ACTIONS = [
  "mode",
  "topic",
  "forget_topic",
  "reset",
  "style",
  "feedback",
  "retry_sync",
] as const;

function interestControl(params: Params) {
  const body: Record<string, unknown> = {
    action: oneOf(params, "control", INTEREST_ACTIONS),
    expected_revision: Number(revision(params)),
  };
  for (const [name, rule] of Object.entries(INTEREST_FIELDS)) {
    const value = params[name];
    if (value === undefined) {
      continue;
    }
    if (rule === "text") {
      body[name] = text(params, name, 160);
    } else if (rule === "id") {
      body[name] = id(params, name);
    } else if (rule.includes(value as string | boolean)) {
      body[name] = value;
    } else {
      throw new NsvxError("invalid", `${name} is not allowed.`);
    }
  }
  return body;
}

function contacts(params: Params) {
  const entries = params.entries;
  if (!Array.isArray(entries) || entries.length > 100) {
    throw new NsvxError("invalid", "entries must be a list of up to 100.");
  }
  const captureIds = params.captureIds ?? [];
  if (!Array.isArray(captureIds) || captureIds.some((v) => typeof v !== "string" || !ID.test(v))) {
    throw new NsvxError("invalid", "captureIds must be ids.");
  }
  return {
    revision: Number(revision(params)),
    entries: entries.map((raw: unknown) => {
      const entry = (raw ?? {}) as Params;
      const clean: ContactEntry = {
        kind: oneOf(entry, "kind", CONTACT_KINDS),
        value: text(entry, "value", 254),
        label: optionalText(entry, "label", 80) ?? "",
      };
      if (entry.id !== undefined) {
        clean.id = id(entry, "id");
      }
      return clean;
    }),
    capture_ids: captureIds,
  };
}

/** A visit date as NSVX stores it: `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, or none. */
function visitDate(params: Params): string | null {
  const value = params.date;
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) {
    throw new NsvxError("invalid", "date must be YYYY, YYYY-MM, or YYYY-MM-DD.");
  }
  return value;
}

export async function changePerson(client: NsvxClient, params: Params): Promise<unknown> {
  const action = params.action;
  const person = () => id(params, "personId");
  const update = (body: Record<string, unknown>) =>
    client.writeOwner("personUpdate", person(), body);
  switch (action) {
    case "create":
      return client.writeOwner<{ id: string }>("personCreate", undefined, {
        display_name: text(params, "name", 120),
      });
    case "rename":
      return update({ display_name: text(params, "name", 120) });
    case "mode":
      return update({ handling: oneOf(params, "handling", HANDLINGS) });
    case "space":
      return update({ social_followup_allowed: !flag(params, "on") });
    case "textOnly":
      return update({ voice_pref: flag(params, "on") ? "text_only" : "any" });
    case "voiceReplies":
      return update({ reply_as_voice: flag(params, "on") });
    case "quietHours": {
      if (params.clear === true) {
        return update({ clear_quiet_hours: true });
      }
      const start = params.start;
      const end = params.end;
      if (
        typeof start !== "string" ||
        !TIME.test(start) ||
        typeof end !== "string" ||
        !TIME.test(end)
      ) {
        throw new NsvxError("invalid", "start and end must be HH:MM.");
      }
      return update({ quiet_hours: { start, end, tz: "Europe/Lisbon" } });
    }
    case "followUp":
      return client.writeOwner<{ text: string | null }>("personFollowUp", person(), {});
    case "link":
      return client.writeOwner("personLink", person(), {
        identity_id: id(params, "identityId"),
        evidence: "",
      });
    case "resume":
      return client.writeOwner("personResume", person(), {}, { params: { confirm: "true" } });
    case "alias":
      return client.writeOwner("personAlias", person(), { alias: text(params, "alias", 80) });
    case "merge":
      return client.writeOwner("personMerge", person(), {
        drop_person_id: id(params, "dropPersonId"),
        confirm: true,
      });
    case "contacts":
      return client.writeOwner("personContacts", person(), contacts(params));
    case "fact": {
      const factAction = oneOf(params, "factAction", FACT_ACTIONS);
      return client.writeOwner("fact", id(params, "factId"), {
        action: factAction,
        ...(factAction === "correct" ? { text: text(params, "text", 2000) } : {}),
      });
    }
    case "interests":
      return client.writeOwner("interests", person(), interestControl(params));
    case "placesCategory":
      return client.writeOwner("placesCategory", person(), {
        category: oneOf(params, "category", CONSENT_CATEGORIES),
        on: flag(params, "on"),
      });
    case "placesPropose": {
      const place = optionalText(params, "place", 120);
      const city = optionalText(params, "city", 80);
      if (!place && !city) {
        throw new NsvxError("invalid", "place or city is required.");
      }
      return client.writeOwner(
        "placesPropose",
        person(),
        {
          place_label: place,
          city,
          venue_kind: oneOf(params, "venue", VENUES),
          event_date: visitDate(params),
        },
        { idempotencyKey: key(params) },
      );
    }
    case "placesHide":
      return client.writeOwner(
        "placesHide",
        person(),
        {},
        { params: { visit: id(params, "visitId") } },
      );
    case "placesErase":
      return client.writeOwner("placesErase", person(), {});
    case "mention":
      return client.writeOwner("mentionConfirm", id(params, "mentionId"), {
        person_id: params.personId === null ? null : person(),
        remember_alias: params.rememberAlias === true,
      });
  }
  throw new NsvxError("invalid", "Unknown people change.");
}

/** Lock and the owner-only label are idempotent switches: NSVX's own screen reads the revision just before. */
async function toggleGroup(client: NsvxClient, groupId: string, body: Record<string, boolean>) {
  const current = await client.readOwnerView<Group>("socialGroup", { id: groupId });
  return client.writeOwner("groupUpdate", groupId, body, {
    params: { revision: String(current.revision) },
  });
}

export async function changeGroup(client: NsvxClient, params: Params): Promise<unknown> {
  const group = () => id(params, "groupId");
  const at = () => ({ params: { revision: revision(params) } });
  switch (params.action) {
    case "create": {
      const people = params.personIds ?? [];
      if (
        !Array.isArray(people) ||
        people.length > 200 ||
        people.some((p) => !ID.test(String(p)))
      ) {
        throw new NsvxError("invalid", "personIds must be ids.");
      }
      return client.writeOwner<{ id: string }>("groupCreate", undefined, {
        name: text(params, "name", 60),
        private_label: params.ownerOnly === true,
        person_ids: people,
      });
    }
    case "rename":
      return client.writeOwner("groupUpdate", group(), { name: text(params, "name", 60) }, at());
    case "lock":
      return toggleGroup(client, group(), { owner_locked: flag(params, "on") });
    case "ownerOnly":
      return toggleGroup(client, group(), { private_label: flag(params, "on") });
    case "archive":
      return client.writeOwner(
        "groupUpdate",
        group(),
        { state: flag(params, "on") ? "archived" : "active" },
        at(),
      );
    case "delete":
      return client.writeOwner("groupDelete", group(), {}, at());
    case "member":
      return client.writeOwner(
        "groupMember",
        group(),
        { state: oneOf(params, "state", ["active", "excluded"] as const) },
        { params: { revision: revision(params), person: id(params, "personId") } },
      );
    case "clearMember":
      return client.writeOwner(
        "groupMemberClear",
        group(),
        {},
        {
          params: { revision: revision(params), person: id(params, "personId") },
        },
      );
    case "merge":
      return client.writeOwner(
        "groupMerge",
        group(),
        {
          into_group_id: id(params, "intoId"),
          into_revision: Number(revision(params, "intoRevision")),
        },
        at(),
      );
    case "split": {
      const people = params.personIds;
      if (!Array.isArray(people) || people.length === 0 || people.length > 200) {
        throw new NsvxError("invalid", "personIds must list who moves.");
      }
      return client.writeOwner<{ new_group_id: string }>(
        "groupSplit",
        group(),
        { name: text(params, "name", 60), person_ids: people.map((p) => id({ p }, "p")) },
        at(),
      );
    }
    case "undo":
      return client.writeOwner("groupUndo", group(), {}, at());
    case "suggest":
      // NSVX queues the recompute (202) and never claims it finished.
      return client.writeOwner(
        "groupSuggest",
        undefined,
        {},
        {
          params:
            params.personId === undefined
              ? { group_id: group() }
              : { person_id: id(params, "personId") },
          idempotencyKey: key(params),
        },
      );
  }
  throw new NsvxError("invalid", "Unknown group change.");
}

/** Finds people by name or channel, as NSVX's own search does. */
export async function findPeople(client: NsvxClient, query: string | undefined) {
  const people = await client.readOwnerView<PersonSummary[]>("people");
  const needle = query?.trim().toLowerCase() ?? "";
  return people.filter(
    (p) =>
      !needle ||
      p.display_name.toLowerCase().includes(needle) ||
      p.channels.some((c) => c.toLowerCase().includes(needle)),
  );
}
