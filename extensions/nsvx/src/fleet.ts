import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import {
  TASK_STATES,
  REQUEST_STATES,
  STEP_STATES,
  INCIDENT_STATES,
  SERVICE_STATES,
  SHIFT_STATES,
  ACCESS_ROLES,
  PLATFORMS,
  UBER_ACCOUNTS,
} from "./fleet-data.js";

/**
 * The owner's Fleet (TVDE and Transports) changes. Each maps to one fixed NSVX route with a body NSVX's own contract
 * accepts. None pays, approves money, or messages anyone: settlements and invoices stay read-only here, and NSVX never
 * sends access links or announcements by itself (drivers read them in their own portal).
 */

type Params = Record<string, unknown>;

const ID = /^[\w-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function id(params: Params, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || !ID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function optionalId(params: Params, name: string): string | null {
  return params[name] === undefined || params[name] === null || params[name] === ""
    ? null
    : id(params, name);
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

function oneOf<V extends string>(params: Params, name: string, values: readonly V[]): V {
  const value = params[name];
  if (typeof value !== "string" || !values.includes(value as V)) {
    throw new NsvxError("invalid", `${name} must be one of ${values.join(", ")}.`);
  }
  return value as V;
}

function whole(params: Params, name: string, min: number, max: number): number {
  const value = params[name];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new NsvxError("invalid", `${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function optionalDay(params: Params, name: string): string | null {
  const value = params[name];
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !DAY.test(value)) {
    throw new NsvxError("invalid", `${name} must be YYYY-MM-DD.`);
  }
  return value;
}

function optionalFlag(params: Params, name: string): boolean | undefined {
  const value = params[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new NsvxError("invalid", `${name} must be true or false.`);
  }
  return value;
}

function key(params: Params): string {
  const value = text(params, "key", 100);
  if (value.length < 8) {
    throw new NsvxError("invalid", "key must have at least 8 characters.");
  }
  return value;
}

function quarter(params: Params) {
  return { year: whole(params, "year", 2000, 2100), quarter: whole(params, "quarter", 1, 4) };
}

export async function changeFleet(client: NsvxClient, params: Params): Promise<unknown> {
  switch (params.action) {
    case "ackAlert":
      return client.writeOwner("fleetAlertAck", id(params, "alertId"), {});
    case "ackAlerts": {
      const ids = params.alertIds;
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > 100 ||
        ids.some((v) => typeof v !== "string" || !ID.test(v))
      ) {
        throw new NsvxError("invalid", "alertIds must be 1 to 100 ids.");
      }
      return client.writeOwner("fleetAlertsAck", undefined, { ids });
    }
    case "task":
      return client.writeOwner("fleetTask", id(params, "taskId"), {
        status: oneOf(params, "status", TASK_STATES),
      });
    case "createTask":
      return client.writeOwner(
        "fleetTaskCreate",
        undefined,
        {
          title: text(params, "title", 200),
          priority: params.priority
            ? oneOf(params, "priority", ["high", "normal", "low"])
            : "normal",
          due_on: optionalDay(params, "dueOn"),
          driver_id: optionalId(params, "driverId"),
          vehicle_id: optionalId(params, "vehicleId"),
        },
        { idempotencyKey: key(params) },
      );
    case "request":
      return client.writeOwner("fleetRequest", id(params, "requestId"), {
        status: oneOf(params, "status", REQUEST_STATES),
        answer: optionalText(params, "answer", 1000),
      });
    case "step":
      return client.writeOwner(
        "fleetWorkflowStep",
        id(params, "workflowId"),
        { status: oneOf(params, "status", STEP_STATES), note: optionalText(params, "note", 500) },
        { params: { key: id(params, "stepKey") } },
      );
    case "incident":
      return client.writeOwner("fleetIncident", id(params, "incidentId"), {
        status: oneOf(params, "status", INCIDENT_STATES),
      });
    case "maintenance":
      return client.writeOwner("fleetMaintenance", id(params, "maintenanceId"), {
        status: oneOf(params, "status", SERVICE_STATES),
      });
    case "shift":
      return client.writeOwner("fleetShift", id(params, "shiftId"), {
        status: oneOf(params, "status", SHIFT_STATES),
      });
    case "rule": {
      const enabled = optionalFlag(params, "enabled");
      const paused = optionalFlag(params, "paused");
      if (enabled === undefined && paused === undefined) {
        throw new NsvxError("invalid", "enabled or paused is required.");
      }
      return client.writeOwner("fleetRule", id(params, "code"), {
        ...(enabled === undefined ? {} : { enabled }),
        ...(paused === undefined ? {} : { schedule_paused: paused }),
      });
    }
    case "runRules":
      return client.writeOwner("fleetRulesRun", undefined, {});
    case "sync":
      return client.writeOwner("fleetPlatformSync", oneOf(params, "platform", PLATFORMS), {});
    case "mileage": {
      const decision = oneOf(params, "decision", ["confirm", "reject"]);
      const body: Record<string, unknown> = {
        action: decision,
        revision: whole(params, "revision", 0, 1_000_000),
        reason: optionalText(params, "reason", 500) ?? "",
      };
      if (decision === "confirm") {
        body.value = text(params, "value", 100);
        body.unit = oneOf(params, "unit", ["km", "mi"]);
        body.observed_on = optionalDay(params, "observedOn");
        if (!body.observed_on) {
          throw new NsvxError("invalid", "observedOn is required.");
        }
        body.vehicle_confirmed = optionalFlag(params, "vehicleConfirmed") ?? false;
        body.issues_resolved = optionalFlag(params, "issuesResolved") ?? false;
      }
      return client.writeOwner("fleetMileageDecision", id(params, "vehicleId"), body, {
        params: { reading: id(params, "readingId") },
      });
    }
    case "mileageRetry":
      return client.writeOwner(
        "fleetMileageRetry",
        id(params, "vehicleId"),
        {},
        {
          params: { reading: id(params, "readingId") },
        },
      );
    case "accessCreate": {
      const role = oneOf(params, "role", ACCESS_ROLES);
      const made = await client.writeOwner<{ id: string; path: string; expires_at: string }>(
        "fleetAccessCreate",
        undefined,
        {
          role,
          driver_id: role === "driver" ? id(params, "driverId") : null,
          label: optionalText(params, "label", 120),
          days: params.days === undefined ? 30 : whole(params, "days", 1, 365),
        },
      );
      // NSVX shows the link once and keeps only its hash; the owner copies it and sends it themself.
      return { id: made.id, url: `${client.baseUrl}${made.path}`, expiresAt: made.expires_at };
    }
    case "accessRevoke":
      return client.writeOwner("fleetAccessRevoke", id(params, "accessId"), {});
    case "announce":
      return client.writeOwner("fleetAnnounce", undefined, {
        title: text(params, "title", 160),
        body: optionalText(params, "body", 4000),
      });
    case "announceArchive":
      return client.writeOwner("fleetAnnounceArchive", id(params, "announcementId"), {});
    case "uberCheck": {
      const account = oneOf(params, "account", UBER_ACCOUNTS);
      return account === "personal"
        ? client.writeOwner("uberPersonalCheck", undefined, {})
        : client.writeOwner("uberBusinessCheck", undefined, quarter(params));
    }
    case "uberCollect": {
      const account = oneOf(params, "account", UBER_ACCOUNTS);
      return client.writeOwner(
        account === "personal" ? "uberPersonalCollect" : "uberBusinessCollect",
        undefined,
        quarter(params),
      );
    }
  }
  throw new NsvxError("invalid", "Unknown fleet change.");
}

export type FleetAnswer = {
  answer: string;
  items: { label: string; detail: string; link: string }[];
  source: "registos" | "ia" | "indisponível" | string;
  as_of: string;
};

/** Asks the NSVX TVDE assistant: exact answers from records, otherwise its own inference, or it says it cannot. */
export async function askFleet(client: NsvxClient, params: Params): Promise<FleetAnswer> {
  const question = text(params, "question", 600);
  if (question.length < 2) {
    throw new NsvxError("invalid", "question is too short.");
  }
  return client.readOwnerPost<FleetAnswer>("fleetAsk", { question });
}
