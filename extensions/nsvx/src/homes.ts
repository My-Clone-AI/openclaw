import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import {
  EXPENSE_CATEGORIES,
  ISSUE_PRIORITIES,
  MORTGAGE_PURPOSES,
  MORTGAGE_REGIMES,
  STAY_STEPS,
  TASK_ACTIONS,
  type AskAnswer,
  type RateScenarios,
} from "./homes-data.js";

/**
 * Homes changes. Each goes to one fixed NSVX owner route that records it in NSVX only: none issues a tax receipt,
 * contacts a bank, or messages a guest (rent receipts stay off in NSVX; AL notifications are in-app).
 */

type Params = Record<string, unknown>;
type Register = (
  name: `nsvx.${string}`,
  scope: "operator.read" | "operator.write",
  run: (params: Params) => Promise<unknown>,
) => void;

const ID = /^[\w.:-]{1,200}$/;
const KEY = /^[A-Za-z0-9._-]{8,128}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function text(value: unknown, name: string, min: number, max: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length < min || trimmed.length > max) {
    throw new NsvxError("invalid", `${name} must be ${min}-${max} characters.`);
  }
  return trimmed;
}

function oneOf<V extends string>(value: unknown, options: readonly V[], name: string): V {
  if (!options.includes(value as V)) {
    throw new NsvxError("invalid", `${name} must be one of ${options.join(", ")}.`);
  }
  return value as V;
}

function key(value: unknown): string {
  if (typeof value !== "string" || !KEY.test(value)) {
    throw new NsvxError("invalid", "idempotencyKey must be 8-128 letters, digits, dot, dash.");
  }
  return value;
}

function amount(value: unknown, name: string): string {
  const raw = typeof value === "number" ? value.toFixed(2) : value;
  if (typeof raw !== "string" || !AMOUNT.test(raw)) {
    throw new NsvxError("invalid", `${name} must be an amount like 120.50.`);
  }
  return raw;
}

export function askHomes(client: NsvxClient, params: Params) {
  return client.readOwnerPost<AskAnswer>("homesAsk", {
    q: text(params.q, "q", 2, 300),
    ...(params.propertyId ? { property_id: id(params.propertyId, "propertyId") } : {}),
  });
}

/** Rate scenarios for the open loans (-0.5 to +2 points, plus a custom rate). NSVX only calculates. */
export function loanRates(client: NsvxClient, params: Params) {
  const custom = params.customRate;
  if (custom !== undefined && (typeof custom !== "number" || custom < -5 || custom > 50)) {
    throw new NsvxError("invalid", "customRate must be a rate from -5 to 50.");
  }
  return client.readOwnerPost<RateScenarios>("loanRates", {
    custom_rate: custom ?? null,
    property: null,
    bank: null,
  });
}

/** Records a home cost (IMI, condominium, ...). The key makes a repeat return the first record. */
export function addExpense(client: NsvxClient, params: Params) {
  if (typeof params.spentOn !== "string" || !DATE.test(params.spentOn)) {
    throw new NsvxError("invalid", "spentOn must be a date (YYYY-MM-DD).");
  }
  return client.writeOwner(
    "homesExpense",
    id(params.propertyId, "propertyId"),
    {
      category: oneOf(params.category, EXPENSE_CATEGORIES, "category"),
      amount: amount(params.amount, "amount"),
      spent_on: params.spentOn,
      // NSVX stores an empty description, never null.
      description: params.description ? text(params.description, "description", 1, 200) : "",
      status: oneOf(params.status ?? "paid", ["paid", "unpaid"] as const, "status"),
    },
    { idempotencyKey: key(params.idempotencyKey) },
  );
}

export function associatePayment(client: NsvxClient, params: Params) {
  const list = params.allocations;
  if (!Array.isArray(list) || list.length === 0 || list.length > 36) {
    throw new NsvxError("invalid", "allocations is required.");
  }
  return client.writeOwner("rentAssociate", id(params.paymentId, "paymentId"), {
    allocations: list.map((row: Params) => ({
      expected_id: id(row?.expectedId, "expectedId"),
      amount: amount(row?.amount, "amount"),
    })),
    learn: params.learn === true,
  });
}

/** Opens a mortgage case. NSVX needs the key and replays the first answer for a repeat. */
export function createMortgageCase(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "mortgageCreate",
    undefined,
    {
      title: text(params.title, "title", 1, 120),
      purpose: oneOf(params.purpose ?? "acquisition", MORTGAGE_PURPOSES, "purpose"),
      regime: oneOf(params.regime ?? "unknown", MORTGAGE_REGIMES, "regime"),
    },
    { idempotencyKey: key(params.idempotencyKey) },
  );
}

/** Adds one bank's document list to a case. NSVX skips papers the case already has; `revision` guards edits. */
export function mortgageChecklist(client: NsvxClient, params: Params) {
  const revision = params.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) {
    throw new NsvxError("invalid", "revision is required.");
  }
  return client.writeOwner("mortgageChecklist", id(params.caseId, "caseId"), {
    revision,
    lender: text(params.lender, "lender", 1, 80),
    key: crypto.randomUUID(),
    document_ids: [],
  });
}

export function stayStep(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "stayStep",
    id(params.reservationId, "reservationId"),
    {},
    { params: { step: oneOf(params.step, STAY_STEPS, "step") } },
  );
}

export function stayTask(client: NsvxClient, params: Params) {
  const action = oneOf(
    params.action,
    Object.keys(TASK_ACTIONS) as (keyof typeof TASK_ACTIONS)[],
    "action",
  );
  const note = params.note ? text(params.note, "note", 1, 2000) : undefined;
  if (action === "problem" && !note) {
    throw new NsvxError("invalid", "note is required for a problem.");
  }
  return client.writeOwner("stayTask", id(params.taskId, "taskId"), {
    action,
    ...(note ? { note } : {}),
  });
}

export function reportIssue(client: NsvxClient, params: Params) {
  return client.writeOwner<{ id: string }>("stayIssue", undefined, {
    property_id: id(params.house, "house"),
    title: text(params.title, "title", 2, 160),
    ...(params.description
      ? { description: text(params.description, "description", 1, 4000) }
      : {}),
    priority: oneOf(params.priority ?? "media", ISSUE_PRIORITIES, "priority"),
    unfit: params.unfit === true,
  });
}

export function registerHomesMethods(method: Register, client: NsvxClient) {
  // Reads NSVX answers from stored data, sent as POST so the question stays out of URLs.
  method("nsvx.homes.ask", "operator.read", (params) => askHomes(client, params));
  method("nsvx.homes.rates", "operator.read", (params) => loanRates(client, params));
  method("nsvx.homes.alertRead", "operator.write", (params) =>
    client.writeOwner("homesAlertRead", id(params.alertId, "alertId"), {}),
  );
  method("nsvx.homes.notice", "operator.write", (params) =>
    client.writeOwner(
      "homesNotice",
      id(params.noticeId, "noticeId"),
      {},
      { params: { action: oneOf(params.action, ["read", "dismiss"] as const, "action") } },
    ),
  );
  method("nsvx.homes.expense", "operator.write", (params) => addExpense(client, params));
  method("nsvx.rent.reconcile", "operator.write", () =>
    client.writeOwner("rentReconcile", undefined, {}),
  );
  method("nsvx.rent.associate", "operator.write", (params) => associatePayment(client, params));
  method("nsvx.rent.reverse", "operator.write", (params) =>
    client.writeOwner("rentReverse", id(params.matchId, "matchId"), {}),
  );
  method("nsvx.mortgage.create", "operator.write", (params) => createMortgageCase(client, params));
  method("nsvx.mortgage.checklist", "operator.write", (params) =>
    mortgageChecklist(client, params),
  );
  method("nsvx.stay.step", "operator.write", (params) => stayStep(client, params));
  method("nsvx.stay.task", "operator.write", (params) => stayTask(client, params));
  method("nsvx.stay.issue", "operator.write", (params) => reportIssue(client, params));
  method("nsvx.stay.noticesRead", "operator.write", (params) => {
    const ids = params.ids ?? [];
    if (!Array.isArray(ids) || ids.length > 100 || ids.some((n) => !Number.isInteger(n))) {
      throw new NsvxError("invalid", "ids must be notice numbers.");
    }
    return client.writeOwner("stayNoticesRead", undefined, { ids });
  });
}
