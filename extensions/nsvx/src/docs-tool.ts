import { jsonResult } from "openclaw/plugin-sdk/core";
import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import type {
  Doc,
  DocDetail,
  DocList,
  DriveFile,
  Overview,
  SignDetail,
  SignDoc,
} from "./docs-data.js";
import { askDocs, changeDocs, changeSignatures } from "./docs.js";

const ACTIONS = [
  "overview",
  "search",
  "review",
  "document",
  "explain",
  "approve",
  "categorize",
  "rename",
  "reprocess",
  "drive",
  "driveSync",
  "signatures",
  "signature",
  "prepareSignature",
] as const;

type DocsToolParams = {
  action: (typeof ACTIONS)[number];
  id?: string;
  query?: string;
  category?: string;
  from?: string;
  to?: string;
  name?: string;
  state?: string;
};

const row = (d: Doc) => ({
  id: d.id,
  name: d.current_name,
  type: d.document_type,
  issuer: d.issuer,
  number: d.document_number,
  date: d.document_date,
  period: d.period_start && d.period_end ? `${d.period_start}..${d.period_end}` : null,
  category: d.subcategory ?? d.category,
  source: d.source,
  state: d.status === "processed" ? d.review_status : d.status,
  ...(d.drive_path ? { drivePath: d.drive_path } : {}),
});

const signRow = (d: SignDoc) => ({
  id: d.id,
  name: d.name,
  pages: d.pages,
  state: d.state ?? "ready_review",
  created: d.created_at.slice(0, 10),
});

/**
 * Owner-only chat path to NSVX Documentos, the Drive index, and Assinaturas. Approving, choosing a category, renaming,
 * re-reading, the Drive sync, and preparing a PDF for signature are the only changes. Requesting a signature stays in
 * Control, where the owner reviews every page first; forgetting a document and settings stay there too.
 */
export function createNsvxDocsTool(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "senderIsOwner" | "assertInvocationCurrent">,
): AnyAgentTool {
  return {
    name: "nsvx_documents",
    label: "NSVX documents",
    description:
      "The owner's documents in NSVX (uploads, Google Drive, bank files) and digital signatures. overview gives counts, items to review, and the Drive link state; search finds documents (query matches name, text, issuer, number; category; from, to as YYYY-MM-DD); review lists documents waiting for confirmation; document reads one with its text excerpt and history (id); explain asks NSVX to explain one in plain words (id); approve confirms one as classified (id); categorize sets its category code (id, category); rename sets its name (id, name); reprocess asks NSVX to read it again (id); drive searches Google Drive file names (query); driveSync asks NSVX to check Drive now; signatures lists PDFs for signature (query, state); signature reads one with its requests (id); prepareSignature makes a document ready to sign (id of a document). The owner signs in Control after reviewing every page.",
    parameters: Type.Object(
      {
        action: Type.Union(ACTIONS.map((action) => Type.Literal(action))),
        id: Type.Optional(Type.String()),
        query: Type.Optional(Type.String()),
        category: Type.Optional(Type.String()),
        from: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
        to: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
        name: Type.Optional(Type.String()),
        state: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, params: DocsToolParams) => {
      try {
        if (context.senderIsOwner !== true) {
          throw new NsvxError("denied", "Only the owner may use the NSVX documents tool.");
        }
        return jsonResult(await runDocs(client, context, params));
      } catch (cause) {
        if (cause instanceof NsvxError) {
          return jsonResult({ ok: false, reason: cause.kind, message: cause.message });
        }
        throw cause;
      }
    },
  } as AnyAgentTool;
}

function need(value: string | undefined, name: string): string {
  if (!value) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

async function runDocs(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "assertInvocationCurrent">,
  params: DocsToolParams,
): Promise<unknown> {
  const change = (body: Record<string, unknown>) => {
    context.assertInvocationCurrent?.();
    return changeDocs(client, body);
  };
  switch (params.action) {
    case "overview": {
      const o = await client.readOwnerView<Overview>("documentsOverview");
      return {
        counts: o.counts,
        byCategory: o.by_category,
        notices: o.notices.slice(0, 10).map(({ title, body }) => ({ title, body })),
        drive: {
          connected: o.drive.connected,
          state: o.drive.state,
          lastDocument: o.drive.last_processed_at,
        },
      };
    }
    case "search":
    case "review": {
      const list = await client.readOwnerView<DocList>("documents", {
        q: params.query?.slice(0, 120),
        category: params.category,
        date_from: params.from,
        date_to: params.to,
        review: params.action === "review" ? "open" : undefined,
        limit: "30",
      });
      return { total: list.total, documents: list.items.map(row) };
    }
    case "document": {
      const d = await client.readOwnerView<DocDetail>("document", { id: need(params.id, "id") });
      return {
        ...row(d),
        reasons: d.review_reasons,
        account: d.account,
        entity: d.entity?.label ?? null,
        property: d.property?.name ?? null,
        excerpt: d.text_excerpt?.slice(0, 1500) ?? null,
        filedAt: d.filing?.receipt?.verified ? d.filing.receipt.path : null,
        events: d.events.slice(0, 10).map(({ kind, created_at }) => ({ kind, at: created_at })),
      };
    }
    case "explain":
      return askDocs(client, { kind: "explain", id: need(params.id, "id") });
    case "approve":
      return row((await change({ action: "approve", id: params.id })) as Doc);
    case "categorize":
      return row(
        (await change({
          action: "update",
          id: params.id,
          patch: { subcategory: params.category },
        })) as Doc,
      );
    case "rename":
      return change({ action: "rename", id: params.id, name: params.name });
    case "reprocess":
      return change({ action: "reprocess", id: params.id });
    case "drive": {
      const files = await client.readOwnerView<DriveFile[]>("driveFiles", {
        q: need(params.query?.trim(), "query").slice(0, 120),
      });
      return files.map((f) => ({
        name: f.name,
        path: f.path,
        type: f.mime_type,
        modified: f.modified_time,
      }));
    }
    case "driveSync":
      return change({ action: "driveSync" });
    case "signatures": {
      const { documents } = await client.readOwnerView<{ documents: SignDoc[] }>("signatures", {
        q: params.query?.slice(0, 120),
        state: params.state,
      });
      return documents.map(signRow);
    }
    case "signature": {
      const d = await client.readOwnerView<SignDetail>("signature", { id: need(params.id, "id") });
      return {
        ...signRow({ ...d.document, state: d.requests[0]?.state }),
        requests: d.requests.map((r) => ({
          id: r.id,
          mode: r.mode,
          state: r.state,
          signed: !!r.signed_sha256,
          issues: r.validation.issues ?? [],
        })),
      };
    }
    case "prepareSignature":
      context.assertInvocationCurrent?.();
      return changeSignatures(client, { action: "fromDocument", id: params.id });
  }
  throw new NsvxError("invalid", "Unknown action.");
}
