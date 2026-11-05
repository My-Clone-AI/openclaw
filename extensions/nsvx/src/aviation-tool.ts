import { jsonResult } from "openclaw/plugin-sdk/core";
import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  hm,
  roleOf,
  type Candidate,
  type Checkin,
  type Entry,
  type FlightLog,
  type Library,
  type Overview,
  type WorkItem,
} from "./aviation-data.js";
import { changeAviation, ENTRY_FIELDS, scheduleCheckin } from "./aviation.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";

const ACTIONS = [
  "overview",
  "logbook",
  "entry",
  "missing",
  "pending",
  "confirm",
  "checkYesterday",
  "compare",
  "documents",
  "checkins",
  "airlines",
  "checkin",
  "cancelCheckin",
  "roster",
] as const;

type AviationToolParams = {
  action: (typeof ACTIONS)[number];
  id?: string;
  query?: string;
  kind?: string;
  from?: string;
  to?: string;
  aircraft?: string;
  condition?: string;
  expiring?: boolean;
  pnr?: string;
  airline?: string;
  surname?: string;
  firstName?: string;
};

const line = (entry: Entry) => ({
  id: entry.id,
  date: entry.log_date,
  ...(entry.kind === "fstd"
    ? { simulator: entry.fstd_type, time: hm(entry.fstd_min) }
    : {
        flight: entry.flight_no,
        route: `${entry.dep_place}-${entry.arr_place}`,
        aircraft: `${entry.aircraft_model} ${entry.registration}`,
        block: hm(entry.total_min),
        night: hm(entry.night_min),
        ifr: hm(entry.ifr_min),
        role: roleOf(entry)?.replace("_min", "") ?? null,
      }),
  ...(entry.status === "voided" ? { voided: true } : {}),
  ...(entry.sheet_state === "pending_write" ? { notInDriveFile: true } : {}),
});

const totals = (t: Overview["stats"]["totals"]) => ({
  total: hm(t.total_min),
  pic: hm(t.pic_min),
  copilot: hm(t.copilot_min),
  night: hm(t.night_min),
  ifr: hm(t.ifr_min),
  simulator: hm(t.fstd_min),
  flights: t.flights,
  landings: t.ldg_day + t.ldg_night,
});

/**
 * Owner-only chat path to the NSVX pilot logbook, previous-day flights, aviation documents, auto check-in, and the
 * airline roster. Confirming a flight, the previous-day check, the Flight Log comparison, and check-in scheduling or
 * cancelling are the only changes; corrections, voids, and document edits stay on the page.
 */
export function createNsvxAviationTool(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "senderIsOwner" | "assertInvocationCurrent">,
): AnyAgentTool {
  return {
    name: "nsvx_aviation",
    label: "NSVX aviation",
    description:
      "The owner's aviation records in NSVX. overview gives logbook totals, this month and year, yesterday's flights, and documents about to expire; logbook searches entries (query, kind flight or fstd, from, to, aircraft, condition night or ifr); entry reads one (id); missing compares the airline's actual Flight Log with the logbook and lists flights missing or different; pending lists flights waiting for confirmation and what each lacks; confirm records one pending flight as NSVX prepared it (id); checkYesterday asks NSVX to check yesterday's flights now; compare re-reads the Flight Log (a background job); documents lists aviation documents (query; expiring true for dated ones); checkins lists auto check-ins; airlines finds an airline (query); checkin schedules a free online check-in (pnr, airline, optional surname and firstName), which NSVX runs on the airline's site when it opens and never pays; cancelCheckin stops one (id); roster lists planned duties (from, to as YYYY-MM-DD).",
    parameters: Type.Object(
      {
        action: Type.Union(ACTIONS.map((action) => Type.Literal(action))),
        id: Type.Optional(Type.String()),
        query: Type.Optional(Type.String()),
        kind: Type.Optional(Type.String({ description: "flight or fstd" })),
        from: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
        to: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
        aircraft: Type.Optional(Type.String()),
        condition: Type.Optional(Type.String({ description: "night or ifr" })),
        expiring: Type.Optional(Type.Boolean()),
        pnr: Type.Optional(Type.String()),
        airline: Type.Optional(Type.String()),
        surname: Type.Optional(Type.String()),
        firstName: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, params: AviationToolParams) => {
      try {
        if (context.senderIsOwner !== true) {
          throw new NsvxError("denied", "Only the owner may use the NSVX aviation tool.");
        }
        return jsonResult(await runAviation(client, context, params));
      } catch (cause) {
        if (cause instanceof NsvxError) {
          return jsonResult({ ok: false, reason: cause.kind, message: cause.message });
        }
        throw cause;
      }
    },
  } as AnyAgentTool;
}

function only<V extends string>(value: string | undefined, allowed: readonly V[], name: string) {
  if (value !== undefined && !allowed.includes(value as V)) {
    throw new NsvxError("invalid", `${name} must be ${allowed.join(" or ")}.`);
  }
  return value as V | undefined;
}

async function runAviation(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "assertInvocationCurrent">,
  params: AviationToolParams,
): Promise<unknown> {
  switch (params.action) {
    case "overview": {
      const o = await client.readOwnerView<Overview>("aviationOverview");
      return {
        today: o.today,
        totals: totals(o.stats.totals),
        month: totals(o.stats.month),
        year: totals(o.stats.year),
        yesterday: {
          date: o.yesterday.date,
          state: o.yesterday.state,
          recorded: o.yesterday.recorded.map(line),
          toConfirm: o.yesterday.open_total,
        },
        expiring: o.validity.map(({ id, title, expires_on, validity, days_left }) => ({
          id,
          title,
          expires: expires_on,
          validity,
          daysLeft: days_left,
        })),
        notInDriveFile: o.sheet.pending_write,
      };
    }
    case "logbook": {
      const { entries } = await client.readOwnerView<{ entries: Entry[] }>("aviationEntries", {
        q: params.query?.slice(0, 80),
        kind: only(params.kind, ["flight", "fstd"] as const, "kind"),
        condition: only(params.condition, ["night", "ifr"] as const, "condition"),
        start: params.from,
        end: params.to,
        aircraft: params.aircraft,
        limit: "50",
      });
      return { entries: entries.map(line) };
    }
    case "entry": {
      if (!params.id) {
        throw new NsvxError("invalid", "id is required.");
      }
      const entry = await client.readOwnerView<Entry & { remarks: string | null }>(
        "aviationEntry",
        { id: params.id },
      );
      return { ...line(entry), pic: entry.pic_name, remarks: entry.remarks };
    }
    case "missing": {
      const f = await client.readOwnerView<FlightLog>("aviationFlightLog");
      const row = (r: FlightLog["missing"][number]) => ({
        date: r.start.slice(0, 10),
        ...(r.kind === "flight"
          ? { route: `${r.dep}-${r.arr}`, registration: r.registration }
          : { simulator: true }),
        time: hm(r.minutes),
        ...(r.problems?.length ? { differences: r.problems } : {}),
      });
      return {
        read: f.rows,
        matched: f.matched,
        missing: f.missing.map(row),
        different: f.different.map(row),
        onlyInLogbook: f.logbook_only.length,
        lastRead: f.last_read,
      };
    }
    case "pending": {
      const { candidates } = await client.readOwnerView<{ candidates: Candidate[] }>(
        "aviationCandidates",
      );
      return candidates.map((c) => ({
        id: c.id,
        date: c.log_date,
        title: c.planned.title ?? null,
        actual: c.planned.actual === true,
        state: c.state,
        missing: c.problems,
      }));
    }
    case "confirm": {
      if (!params.id) {
        throw new NsvxError("invalid", "id is required.");
      }
      const { candidates } = await client.readOwnerView<{ candidates: Candidate[] }>(
        "aviationCandidates",
      );
      const candidate = candidates.find((c) => c.id === params.id);
      if (!candidate) {
        throw new NsvxError("not-found", "No such pending flight.");
      }
      context.assertInvocationCurrent?.();
      // NSVX prepared this draft from the actual Flight Log; it validates it again and names what is missing.
      const draft = Object.entries({
        kind: candidate.activity === "ground" ? "fstd" : "flight",
        log_date: candidate.log_date,
        ...candidate.draft,
      }).filter(([name]) => ENTRY_FIELDS.has(name));
      const entry = await changeAviation(client, {
        action: "confirm",
        id: candidate.id,
        fields: Object.fromEntries(draft),
      });
      return line(entry as Entry);
    }
    case "checkYesterday":
      context.assertInvocationCurrent?.();
      return changeAviation(client, { action: "syncDay" });
    case "compare":
      context.assertInvocationCurrent?.();
      return changeAviation(client, { action: "compare" });
    case "documents": {
      const library = await client.readOwnerView<Library>("aviationDocs");
      const needle = params.query?.trim().toLowerCase() ?? "";
      return library.docs
        .filter(
          (d) =>
            (!params.expiring || d.expires_on) &&
            (!needle || `${d.title} ${d.name} ${d.category_label}`.toLowerCase().includes(needle)),
        )
        .slice(0, 40)
        .map(({ id, title, category_label, validity, expires_on }) => ({
          id,
          title,
          category: category_label,
          validity,
          expires: expires_on,
        }));
    }
    case "checkins": {
      const { checkins } = await client.readOwnerView<{ checkins: Checkin[] }>("aviationCheckins");
      return checkins.map((c) => ({
        id: c.id,
        booking: c.pnr,
        airline: c.airline_code,
        status: c.status,
        runsAt: c.scheduled_for,
        legs: c.flight_legs.map((leg) => `${leg.origin}-${leg.destination}`),
        seats: c.seat_chosen?.map((seat) => seat.seat ?? "auto") ?? [],
        boardingPasses: c.boarding_passes.length,
      }));
    }
    case "airlines":
      return client.readOwnerView("aviationAirlines", { q: params.query?.slice(0, 100) ?? "" });
    case "checkin":
      context.assertInvocationCurrent?.();
      return scheduleCheckin(client, {
        pnr: params.pnr,
        airline: params.airline,
        surname: params.surname,
        firstName: params.firstName,
      });
    case "cancelCheckin":
      context.assertInvocationCurrent?.();
      return changeAviation(client, { action: "cancelCheckin", id: params.id });
    case "roster": {
      const { items } = await client.readOwnerView<{ items: WorkItem[] }>("workItems", {
        kind: "duty",
        start: params.from,
        end: params.to,
      });
      return items.map((i) => ({
        title: i.title,
        flight: i.meta.flight ?? null,
        route: i.meta.from && i.meta.to ? `${i.meta.from}-${i.meta.to}` : null,
        report: i.report_at,
        departs: i.departure_at ?? i.starts_at,
        arrives: i.arrival_at ?? i.ends_at,
        status: i.status,
      }));
    }
  }
  throw new NsvxError("invalid", "Unknown action.");
}
