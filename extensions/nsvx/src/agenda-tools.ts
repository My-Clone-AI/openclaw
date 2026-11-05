import { jsonResult } from "openclaw/plugin-sdk/core";
import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  addDays,
  chatEvent,
  dayIn,
  eventsWindow,
  type AgendaEvents,
  type AgendaSlots,
} from "./agenda-data.js";
import { agendaRange, zoneOf } from "./agenda-gateway.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";

/** NSVX's own default zone for the Agenda. */
const NSVX_ZONE = "Europe/Lisbon";

export const NSVX_AGENDA_TOOL = "nsvx_agenda";

/**
 * The owner's NSVX calendar for chat. Read only: the model lists events and free times, and the owner makes, moves, or
 * cancels events in the Agenda tab, where NSVX shows the exact terms before any invitation. Always offered so the
 * prompt prefix stays stable; it answers only on the owner's own turn.
 */
export function createNsvxAgendaTool(
  client: NsvxClient,
  context: OpenClawPluginToolContext<2>,
): AnyAgentTool {
  return {
    name: NSVX_AGENDA_TOOL,
    label: "NSVX agenda",
    description:
      "Read the owner's NSVX calendar (Google Calendar through NSVX): events between two days, or free times for a meeting of freeMinutes. Read only; to make, move, or cancel an event, tell the owner to use the Agenda tab in Control.",
    parameters: Type.Object(
      {
        start: Type.Optional(Type.String({ description: "First day, YYYY-MM-DD. Default today." })),
        end: Type.Optional(
          Type.String({ description: "Last day, YYYY-MM-DD. Default six days after start." }),
        ),
        query: Type.Optional(Type.String({ maxLength: 200, description: "Words in the title." })),
        freeMinutes: Type.Optional(
          Type.Integer({ minimum: 15, maximum: 480, description: "Find free times this long." }),
        ),
        guests: Type.Optional(
          Type.Array(Type.String({ maxLength: 200 }), {
            maxItems: 20,
            description: "Emails that must also be free.",
          }),
        ),
        tz: Type.Optional(Type.String({ description: `Time zone. Default ${NSVX_ZONE}.` })),
      },
      { additionalProperties: false },
    ),
    execute: async (
      _toolCallId: string,
      params: {
        start?: string;
        end?: string;
        query?: string;
        freeMinutes?: number;
        guests?: string[];
        tz?: string;
      },
    ) => {
      try {
        context.assertInvocationCurrent();
        if (context.senderIsOwner !== true) {
          throw new NsvxError("denied", "Only the owner can read the NSVX agenda.");
        }
        const zone = zoneOf(params.tz ?? NSVX_ZONE);
        const range = agendaRange(params, dayIn(new Date(), zone));
        const window = eventsWindow(range.start, range.days, zone);
        if (params.freeMinutes) {
          const slots = await client.postOwner<AgendaSlots>("agendaSlots", {
            start: window.start,
            end: window.end,
            duration_min: params.freeMinutes,
            attendees: params.guests ?? [],
            time_zone: zone,
          });
          return jsonResult({
            zone,
            complete: slots.availability_complete,
            unverified: slots.unverified,
            free: slots.slots.map((slot) => ({ start: slot.start, end: slot.end })),
          });
        }
        const result = await client.readOwnerView<AgendaEvents>("agendaEvents", window);
        const needle = params.query?.trim().toLowerCase() ?? "";
        const events = result.events.filter(
          (event) => !needle || event.summary.toLowerCase().includes(needle),
        );
        return jsonResult({
          zone,
          from: range.start,
          to: addDays(range.start, range.days - 1),
          syncedAt: result.fresh_at,
          count: events.length,
          events: events.slice(0, 100).map(chatEvent),
        });
      } catch (cause) {
        if (cause instanceof NsvxError) {
          return jsonResult({ ok: false, reason: cause.kind, message: cause.message });
        }
        throw cause;
      }
    },
  } as AnyAgentTool;
}
