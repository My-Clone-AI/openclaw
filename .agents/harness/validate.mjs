#!/usr/bin/env node
// Harness state validator: feature_list.json (WIP=1, passing needs evidence) and diagnostics/log.jsonl (five layers).
// Exit 0 when valid, 1 with one line per problem otherwise. No dependencies.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const STATUSES = new Set(["not_started", "in_progress", "blocked", "passing"]);
const LAYERS = new Set([
  "task_specification",
  "context_provision",
  "execution_environment",
  "verification_feedback",
  "state_management",
]);

export function checkFeatures(doc) {
  const errs = [];
  if (!doc || !Array.isArray(doc.features)) return ["feature_list: features must be an array"];
  if (doc.rules?.single_active_feature !== true) errs.push("feature_list: rules.single_active_feature must be true");
  if (doc.rules?.passing_requires_evidence !== true) errs.push("feature_list: rules.passing_requires_evidence must be true");
  const ids = new Set();
  let active = 0;
  for (const f of doc.features) {
    const id = f?.id ?? "?";
    if (typeof f?.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(f.id)) errs.push(`feature ${id}: bad id`);
    if (ids.has(id)) errs.push(`feature ${id}: duplicate id`);
    ids.add(id);
    if (!Number.isInteger(f?.priority) || f.priority < 1) errs.push(`feature ${id}: priority must be an integer >= 1`);
    if (!STATUSES.has(f?.status)) errs.push(`feature ${id}: bad status ${f?.status}`);
    if (!Array.isArray(f?.verification) || f.verification.length === 0) errs.push(`feature ${id}: verification steps required`);
    if (!Array.isArray(f?.evidence)) errs.push(`feature ${id}: evidence must be an array`);
    if (f?.status === "in_progress") active += 1;
    if (f?.status === "passing" && !(Array.isArray(f.evidence) && f.evidence.some((e) => String(e).trim()))) {
      errs.push(`feature ${id}: passing without evidence`);
    }
  }
  if (active > 1) errs.push(`feature_list: ${active} features in_progress (WIP=1)`);
  return errs;
}

export function checkLog(text) {
  const errs = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      errs.push(`log line ${i + 1}: not JSON`);
      return;
    }
    if (typeof row.ts !== "string" || Number.isNaN(Date.parse(row.ts))) errs.push(`log line ${i + 1}: ts must be ISO-8601`);
    if (typeof row.task !== "string" || !row.task.trim()) errs.push(`log line ${i + 1}: task required`);
    if (typeof row.ok !== "boolean") errs.push(`log line ${i + 1}: ok must be boolean`);
    if (row.ok === true && row.layer !== null) errs.push(`log line ${i + 1}: ok rows have layer null`);
    if (row.ok === false && !LAYERS.has(row.layer)) errs.push(`log line ${i + 1}: failed rows need one of the five layers`);
  });
  return errs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errs = [
    ...checkFeatures(JSON.parse(readFileSync(join(here, "feature_list.json"), "utf8"))),
    ...checkLog(readFileSync(join(here, "diagnostics/log.jsonl"), "utf8")),
  ];
  for (const e of errs) console.error(e);
  console.log(errs.length ? `harness state: ${errs.length} problem(s)` : "harness state: ok");
  process.exit(errs.length ? 1 : 0);
}
