import { jsonResult } from "openclaw/plugin-sdk/core";
import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import type {
  AiState,
  CaseDetail,
  CaseRow,
  Dashboard,
  Deadline,
  DocVersion,
  Evidence,
  Ledger,
  Procedure,
  Suggestion,
  TimelineEvent,
} from "./legal-data.js";
import { changeCase, changeProcedure } from "./legal.js";

const ACTIONS = [
  "dashboard",
  "cases",
  "case",
  "suggestions",
  "deadlines",
  "evidence",
  "payments",
  "timeline",
  "documents",
  "aiRuns",
  "procedures",
  "procedure",
  "createCase",
  "setStatus",
  "addDeadline",
  "doneDeadline",
  "addEvent",
  "addFact",
  "prepareAi",
  "runDiscovery",
  "runProcedure",
] as const;

type LegalToolParams = {
  action: (typeof ACTIONS)[number];
  caseRef?: string;
  id?: string;
  status?: string;
  query?: string;
  title?: string;
  nature?: string;
  date?: string;
  ai?: string;
  clientKey?: string;
};

const caseLine = (row: CaseRow) => ({
  ref: row.ref,
  title: row.title,
  status: row.status,
  nature: row.nature,
  priority: row.priority,
  respondent: row.respondent,
  documentedDebt: row.verified_principal,
  totalDebt: row.outstanding,
  evidence: row.evidence,
  evidenceToReview: row.evidence_attention,
  nextDeadline: row.next_deadline,
  deadlinesUnconfirmed: row.deadlines_unconfirmed,
});

/**
 * Owner-only chat path to NSVX cases and procedures.
 *
 * Evidence text, document bodies, and AI answers stay out of chat: NSVX lets that material reach a model only through
 * the owner's consent to a listed manifest, with privileged and excluded evidence left out. Case facts and descriptions
 * appear only where the owner turned the legal AI on for that case. Authorizing AI, exports, deletes, and
 * legal-hold changes stay on the page.
 */
export function createNsvxLegalTool(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "senderIsOwner" | "assertInvocationCurrent">,
): AnyAgentTool {
  return {
    name: "nsvx_legal",
    label: "NSVX legal",
    description:
      "The owner's legal cases and procedures in NSVX. dashboard gives counts, money owed, and next deadlines; cases lists them (status active, resolved, or archived; query); case reads one (caseRef), with facts only if its legal AI is on; suggestions lists possible cases to review; deadlines, evidence (names and codes only, never text), payments, timeline, documents (titles only), and aiRuns read one case (caseRef); procedures and procedure (id) read saved routines. createCase opens one (title, nature potential or formal); setStatus changes a case (caseRef, status); addDeadline (caseRef, title, date YYYY-MM-DD); doneDeadline (caseRef, id); addEvent (caseRef, title, date); addFact (caseRef, title as the fact text); prepareAi (caseRef, ai) lists what the legal AI would read, which only the owner can authorize in Control; runDiscovery asks NSVX to look for possible cases; runProcedure (id, clientKey as a new UUID per request) runs an enabled procedure, whose steps keep their own approvals. Nothing here sends anything to anyone.",
    parameters: Type.Object(
      {
        action: Type.Union(ACTIONS.map((action) => Type.Literal(action))),
        caseRef: Type.Optional(Type.String({ description: "PROC-2026-0001" })),
        id: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        query: Type.Optional(Type.String()),
        title: Type.Optional(Type.String()),
        nature: Type.Optional(Type.String()),
        date: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
        ai: Type.Optional(Type.String()),
        clientKey: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, params: LegalToolParams) => {
      try {
        if (context.senderIsOwner !== true) {
          throw new NsvxError("denied", "Only the owner may use the NSVX legal tool.");
        }
        return jsonResult(await runLegal(client, context, params));
      } catch (cause) {
        if (cause instanceof NsvxError) {
          return jsonResult({ ok: false, reason: cause.kind, message: cause.message });
        }
        throw cause;
      }
    },
  } as AnyAgentTool;
}

async function runLegal(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "assertInvocationCurrent">,
  params: LegalToolParams,
): Promise<unknown> {
  const id = { id: params.caseRef };
  const change = (body: Record<string, unknown>) => {
    context.assertInvocationCurrent?.();
    return changeCase(client, body);
  };
  switch (params.action) {
    case "dashboard": {
      const data = await client.readOwnerView<Dashboard>("casesDashboard");
      return {
        counts: data.counts,
        documentedDebt: data.outstanding_verified,
        totalDebt: data.outstanding,
        deadlines: data.deadlines.slice(0, 20),
        toReview: data.documents_pending.slice(0, 20).map(({ id: docId, title, version, ref }) => ({
          id: docId,
          title,
          version,
          ref,
        })),
      };
    }
    case "cases": {
      const { cases } = await client.readOwnerView<{ cases: CaseRow[] }>("cases", {
        status: params.status,
      });
      const needle = params.query?.toLowerCase();
      return {
        cases: cases
          .filter(
            (row) =>
              !needle ||
              `${row.ref} ${row.title} ${row.respondent ?? ""}`.toLowerCase().includes(needle),
          )
          .slice(0, 50)
          .map(caseLine),
      };
    }
    case "case": {
      const row = await client.readOwnerView<CaseDetail>("case", id);
      return {
        ...caseLine(row),
        aiAllowed: row.ai_allowed,
        legalHold: row.legal_hold,
        court: row.court,
        externalRef: row.external_ref,
        parties: row.parties.map(({ name, role, identity_state }) => ({
          name,
          role,
          identity: identity_state,
        })),
        ...(row.ai_allowed
          ? {
              issue: row.issue,
              description: row.description,
              facts: row.facts.map(({ text: fact, status, disputed }) => ({
                text: fact,
                status,
                disputed,
              })),
            }
          : {
              withheld:
                "Facts stay out of chat until the owner turns on the legal AI for this case.",
            }),
      };
    }
    case "suggestions": {
      const { suggestions } = await client.readOwnerView<{ suggestions: Suggestion[] }>(
        "caseSuggestions",
      );
      return {
        suggestions: suggestions.slice(0, 30).map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          coverage: row.coverage,
          counterparty: row.counterparty,
          missing: row.missing,
          evidence: row.evidence.length,
        })),
      };
    }
    case "deadlines":
      return client.readOwnerView<{ deadlines: Deadline[] }>("caseDeadlines", id);
    case "evidence": {
      const { evidence } = await client.readOwnerView<{ evidence: Evidence[] }>("caseEvidence", id);
      return {
        evidence: evidence.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          type: row.type,
          date: row.doc_date,
          state: row.extraction_state,
          source: row.source_state,
          privileged: row.privileged,
        })),
      };
    }
    case "payments": {
      const ledger = await client.readOwnerView<Ledger>("casePayments", id);
      return {
        totals: ledger.totals,
        obligations: ledger.obligations,
        payments: ledger.payments,
        bank: ledger.bank_coverage.note,
      };
    }
    case "timeline":
      return client
        .readOwnerView<{ events: TimelineEvent[] }>("caseTimeline", id)
        .then(({ events }) => ({
          events: events.map(({ date, title, status }) => ({ date, title, status })),
        }));
    case "documents": {
      const { documents } = await client.readOwnerView<{ documents: DocVersion[] }>(
        "caseDocuments",
        id,
      );
      return {
        documents: documents.map(({ id: docId, title, version, status, origin, created_at }) => ({
          id: docId,
          title,
          version,
          status,
          origin,
          at: created_at,
        })),
      };
    }
    case "aiRuns": {
      const state = await client.readOwnerView<AiState>("caseAi", id);
      return {
        aiAllowed: state.ai_allowed,
        available: state.lane.eligible,
        actions: state.actions,
        runs: state.runs.map(({ id: runId, label, status, error }) => ({
          id: runId,
          label,
          status,
          error,
        })),
      };
    }
    case "procedures": {
      const { items } = await client.readOwnerView<{ items: Procedure[] }>("procedures");
      return {
        procedures: items.map(({ id: itemId, title, version, state, outcome }) => ({
          id: itemId,
          title,
          version,
          state,
          outcome,
        })),
      };
    }
    case "procedure":
      return client.readOwnerView<Procedure>("procedure", { id: params.id }).then((row) => ({
        id: row.id,
        title: row.title,
        version: row.version,
        state: row.state,
        outcome: row.definition.outcome,
        steps: row.definition.plan.steps.map((step) => step.type),
        inputs: row.definition.inputs,
        runs: row.runs.slice(0, 10).map(({ id: runId, state, reason, created_at }) => ({
          id: runId,
          state,
          reason,
          at: created_at,
        })),
      }));
    case "createCase":
      return change({
        action: "create",
        title: params.title,
        categories: [],
        nature: params.nature ?? "potential",
      }).then((row) => {
        const made = row as CaseDetail;
        return { ref: made.ref, title: made.title, status: made.status };
      });
    case "setStatus": {
      const row = await client.readOwnerView<CaseDetail>("case", id);
      await change({
        action: "update",
        key: params.caseRef,
        status: params.status,
        revision: row.revision,
      });
      return { ref: row.ref, status: params.status };
    }
    case "addDeadline":
      return change({
        action: "addDeadline",
        key: params.caseRef,
        title: params.title,
        kind: "task",
        due_date: params.date,
      });
    case "doneDeadline":
      return change({
        action: "setDeadline",
        key: params.caseRef,
        deadlineId: params.id,
        status: "done",
      });
    case "addEvent":
      return change({
        action: "addEvent",
        key: params.caseRef,
        title: params.title,
        on_date: params.date,
        status: "owner",
      });
    case "addFact":
      return change({
        action: "addFact",
        key: params.caseRef,
        text: params.title,
        status: "owner",
      });
    case "prepareAi":
      return change({
        action: "aiPrepare",
        key: params.caseRef,
        ai: params.ai,
        aiParams: {},
      }).then((run) => {
        const { id: runId, label, status, manifest } = run as AiState["runs"][number];
        return {
          needsOwner: true,
          id: runId,
          label,
          status,
          destination: manifest.destination,
          evidence: manifest.items.filter((item) => item.included).map((item) => item.code),
        };
      });
    case "runDiscovery":
      return change({ action: "discovery" });
    case "runProcedure": {
      const row = await client.readOwnerView<Procedure>("procedure", { id: params.id });
      context.assertInvocationCurrent?.();
      return changeProcedure(client, {
        action: "run",
        id: params.id,
        version: row.version,
        clientKey: params.clientKey,
        inputs: Object.fromEntries(
          Object.entries(row.definition.inputs).map(([name, field]) => [name, field.example]),
        ),
      });
    }
  }
  throw new NsvxError("invalid", "Unknown action.");
}
