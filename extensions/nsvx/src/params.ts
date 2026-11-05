import { NsvxError } from "./client.js";

/** Untrusted Gateway params for the Legal, Research, and Marketing changes, checked once at this boundary. */
export type Params = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^\d{1,12}(?:[.,]\d{1,2})?$/;

export function uuid(params: Params, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

export function text(params: Params, name: string, max: number, min = 1): string {
  const value = params[name];
  if (typeof value !== "string" || value.includes("\0")) {
    throw new NsvxError("invalid", `${name} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new NsvxError("invalid", `${name} must be ${min} to ${max} characters.`);
  }
  return trimmed;
}

/** Absent and empty both mean "no value", which NSVX stores as null. */
export function optional(params: Params, name: string, max: number): string | null {
  const value = params[name];
  return value === undefined || value === null || value === "" ? null : text(params, name, max);
}

export function flag(params: Params, name: string): boolean {
  const value = params[name];
  if (typeof value !== "boolean") {
    throw new NsvxError("invalid", `${name} must be true or false.`);
  }
  return value;
}

export function whole(params: Params, name: string, min: number, max: number): number {
  const value = params[name];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new NsvxError("invalid", `${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

export function oneOf<V extends string>(params: Params, name: string, allowed: readonly V[]): V {
  const value = params[name];
  if (typeof value !== "string" || !allowed.includes(value as V)) {
    throw new NsvxError("invalid", `${name} must be one of ${allowed.join(", ")}.`);
  }
  return value as V;
}

/** A calendar date, or null when absent. */
export function day(params: Params, name: string): string | null {
  const value = params[name];
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !DAY.test(value)) {
    throw new NsvxError("invalid", `${name} must be YYYY-MM-DD.`);
  }
  return value;
}

/** NSVX keeps money as decimal strings; both Portuguese and English decimal marks arrive from the form. */
export function amount(params: Params, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || !AMOUNT.test(value.trim())) {
    throw new NsvxError("invalid", `${name} must be an amount.`);
  }
  return value.trim().replace(",", ".");
}

export function strings(params: Params, name: string, maxItems: number, maxLength = 200): string[] {
  const value = params[name] ?? [];
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some((item) => typeof item !== "string" || !item || item.length > maxLength)
  ) {
    throw new NsvxError("invalid", `${name} must be a short list.`);
  }
  return value as string[];
}

/** A plain JSON object passed through for NSVX to validate (procedure definitions, AI run params). */
export function object(params: Params, name: string, maxChars: number): Record<string, unknown> {
  const value = params[name];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new NsvxError("invalid", `${name} must be an object.`);
  }
  if (JSON.stringify(value).length > maxChars) {
    throw new NsvxError("invalid", `${name} is too large.`);
  }
  return value as Record<string, unknown>;
}
