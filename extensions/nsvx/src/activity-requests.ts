import { FIND_GROUPS, FIND_MIN, type FindGroup } from "./activity-data.js";
import { NsvxError } from "./client.js";

/** NSVX bounds: a query of 2..200 characters, at most 30 rows per group, 80 ids per export. */
const FIND_MAX = 200;
const FIND_LIMIT_MAX = 30;
const IDS_MAX = 80;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(params: Record<string, unknown>, name: "start" | "end"): string {
  const value = params[name];
  if (typeof value !== "string" || !DAY.test(value) || Number.isNaN(Date.parse(value))) {
    throw new NsvxError("invalid", `${name} must be a day like 2026-11-05.`);
  }
  return value;
}

/** Validates an export or summary request once, at the Gateway boundary. */
export function activityRange(params: Record<string, unknown>): {
  start: string;
  end: string;
  ids?: number[];
} {
  const start = day(params, "start");
  const end = day(params, "end");
  if (start > end) {
    throw new NsvxError("invalid", "start must not be after end.");
  }
  const ids = params.ids;
  if (ids === undefined || ids === null) {
    return { start, end };
  }
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > IDS_MAX ||
    ids.some((id) => !Number.isSafeInteger(id) || (id as number) < 0)
  ) {
    throw new NsvxError("invalid", `ids must be 1 to ${IDS_MAX} activity ids.`);
  }
  return { start, end, ids: ids as number[] };
}

/** Validates a unified search request; NSVX checks the same bounds again. */
export function findRequest(params: Record<string, unknown>): Record<string, unknown> {
  const q = typeof params.q === "string" ? params.q.replace(/\s+/g, " ").trim() : "";
  if (q.length < FIND_MIN || q.length > FIND_MAX) {
    throw new NsvxError("invalid", `Search needs ${FIND_MIN} to ${FIND_MAX} characters.`);
  }
  const groups = params.groups;
  if (
    groups !== undefined &&
    (!Array.isArray(groups) ||
      groups.length === 0 ||
      groups.some((group) => !FIND_GROUPS.includes(group as FindGroup)))
  ) {
    throw new NsvxError("invalid", `groups must be some of ${FIND_GROUPS.join(", ")}.`);
  }
  const limit = params.limit ?? 5;
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > FIND_LIMIT_MAX) {
    throw new NsvxError("invalid", `limit must be 1 to ${FIND_LIMIT_MAX}.`);
  }
  const cursor = params.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 600)) {
    throw new NsvxError("invalid", "cursor is not valid.");
  }
  return { q, limit, ...(groups ? { groups } : {}), ...(cursor ? { cursor } : {}) };
}
