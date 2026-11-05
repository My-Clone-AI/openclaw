import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";

/** One row of NSVX's `/api/skills` list (skills.list_skills), the fields Control shows. */
export type Skill = {
  id: string;
  slug: string;
  name: string;
  when_to_use?: string | null;
  source: string;
  enabled: boolean;
  steps_count?: number | null;
  last_run_ts: string | null;
  review_state?: "pending" | "approved" | "rejected" | null;
  review_version: string;
  learned_from?: { app: string; cycle_id: number; merge_sha: string } | null;
  latest_verification?: {
    verified: "confirmed" | "failed" | "unverified";
    outcome: string;
    ts: string;
  } | null;
};

export type SkillRun = {
  id: string;
  app: string | null;
  outcome: string;
  detail: string | null;
  ts: string;
  verified?: "confirmed" | "failed" | "unverified" | null;
};

export type SkillDetail = Skill & { steps: { n: number; text: string }[]; runs: SkillRun[] };

export type SkillAlert = {
  id: string;
  skill_id: string;
  slug: string;
  name: string;
  consecutive_failures: number;
};

/** Slugs and UUIDs; NSVX looks a skill up by either. */
const SKILL_ID = /^[\w-]{1,100}$/;
const REVIEW_VERSION = /^[0-9a-f]{64}$/;

function skillId(value: unknown): string {
  if (typeof value !== "string" || !SKILL_ID.test(value)) {
    throw new NsvxError("invalid", "skillId is required.");
  }
  return value;
}

export function setSkillState(client: NsvxClient, params: Record<string, unknown>) {
  if (typeof params.enabled !== "boolean") {
    throw new NsvxError("invalid", "enabled must be true or false.");
  }
  return client.writeOwner<Skill>("skillState", skillId(params.skillId), {
    enabled: params.enabled,
  });
}

/**
 * Approve turns a learned skill on; reject keeps it off. The review version pins what the owner read:
 * NSVX answers conflict when the proposal changed since.
 */
export function reviewSkill(client: NsvxClient, params: Record<string, unknown>) {
  const decision = params.decision;
  if (decision !== "approve" && decision !== "reject") {
    throw new NsvxError("invalid", "decision must be approve or reject.");
  }
  if (typeof params.reviewVersion !== "string" || !REVIEW_VERSION.test(params.reviewVersion)) {
    throw new NsvxError("invalid", "reviewVersion is required.");
  }
  return client.writeOwner<Skill>("skillReview", skillId(params.skillId), {
    decision,
    review_version: params.reviewVersion,
  });
}
