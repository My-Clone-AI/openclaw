import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkFeatures, checkLog, formatHistogram, summarizeLayers } from "./validate.mjs";

function featureDoc(features) {
  return {
    project: "openclaw-controller",
    rules: {
      single_active_feature: true,
      passing_requires_evidence: true,
      do_not_skip_verification: true,
      verification_levels: ["unit", "integration", "e2e"],
    },
    features,
  };
}

function feature(overrides = {}) {
  return {
    id: "probe",
    priority: 1,
    area: "harness",
    title: "Probe",
    user_visible_behavior: "Probe behavior.",
    status: "not_started",
    verification: ["unit"],
    evidence: [],
    ...overrides,
  };
}

describe("validate.mjs no-early-victory", () => {
  it("fails closed on WIP=2 (two in_progress)", () => {
    const errs = checkFeatures(
      featureDoc([feature({ id: "a", status: "in_progress" }), feature({ id: "b", status: "in_progress" })]),
    );
    assert.match(errs.join("\n"), /2 features in_progress \(WIP=1\)/);
  });

  it("fails closed on passing with empty evidence", () => {
    const errs = checkFeatures(featureDoc([feature({ status: "passing", evidence: [] })]));
    assert.match(errs.join("\n"), /passing without evidence/);
  });

  it("fails closed on passing with blank-only evidence", () => {
    const errs = checkFeatures(featureDoc([feature({ status: "passing", evidence: ["   "] })]));
    assert.ok(errs.some((e) => e.includes("passing")), `expected a passing guard, got: ${errs.join("; ")}`);
  });

  it("fails closed on passing with a junk evidence entry", () => {
    const errs = checkFeatures(featureDoc([feature({ status: "passing", evidence: ["real proof", ""] })]));
    assert.match(errs.join("\n"), /must all be non-empty strings/);
  });

  it("accepts one in_progress and passing with real evidence", () => {
    const errs = checkFeatures(
      featureDoc([
        feature({ id: "a", status: "in_progress" }),
        feature({ id: "b", status: "passing", evidence: ["init.sh exit 0"] }),
      ]),
    );
    assert.deepEqual(errs, []);
  });
});

describe("validate.mjs diagnostic layer histogram", () => {
  const sample = [
    `{"ts":"2026-11-06T20:00:00.000Z","task":"a","ok":true,"layer":null,"detail":"","fix":""}`,
    `{"ts":"2026-11-06T20:01:00.000Z","task":"b","ok":false,"layer":"verification_feedback","detail":"x","fix":"y"}`,
    `{"ts":"2026-11-06T20:02:00.000Z","task":"c","ok":false,"layer":"execution_environment","detail":"x","fix":"y"}`,
    `{"ts":"2026-11-06T20:03:00.000Z","task":"d","ok":false,"layer":"verification_feedback","detail":"x","fix":"y"}`,
    "not json",
  ].join("\n");

  it("counts ok, per-layer failures, and malformed lines", () => {
    const summary = summarizeLayers(sample);
    assert.equal(summary.total, 4);
    assert.equal(summary.ok, 1);
    assert.equal(summary.failed.verification_feedback, 2);
    assert.equal(summary.failed.execution_environment, 1);
    assert.equal(summary.failed.task_specification, 0);
    assert.equal(summary.malformed, 1);
  });

  it("prints a deterministic one-line histogram", () => {
    assert.equal(
      formatHistogram(summarizeLayers(sample)),
      "diagnostic layers: total=4 ok=1 task_specification=0 context_provision=0 " +
        "execution_environment=1 verification_feedback=2 state_management=0 malformed=1",
    );
  });

  it("reports zeros on an empty log", () => {
    const summary = summarizeLayers("");
    assert.equal(summary.total, 0);
    assert.equal(summary.malformed, 0);
    assert.deepEqual(checkLog(""), []);
  });
});
