import { describe, expect, it } from "vitest";
import { applySecurityAuditSuppressions } from "./audit-suppressions.js";
import type { SecurityAuditFinding } from "./audit.types.js";

describe("security audit suppressions", () => {
  it("matches exact IDs and case-insensitive trimmed text, preserving order and first reason", () => {
    const findings: SecurityAuditFinding[] = [
      { checkId: "check.one", severity: "warn", title: "Title One", detail: "Dangerous detail" },
      { checkId: "check.one", severity: "info", title: "Other", detail: "Safe detail" },
      { checkId: "check.two", severity: "warn", title: "Title One", detail: "Dangerous detail" },
    ];
    expect(applySecurityAuditSuppressions(findings, [
      { checkId: " check.one ", titleIncludes: " TITLE ", detailIncludes: " DANGEROUS ", reason: " accepted " },
      { checkId: "check.one", reason: "second" },
    ])).toEqual({
      findings: [findings[2]],
      suppressedFindings: [
        { ...findings[0], suppression: { reason: "accepted" } },
        { ...findings[1], suppression: { reason: "second" } },
      ],
    });
  });

  it("leaves findings untouched without matching suppressions", () => {
    const findings: SecurityAuditFinding[] = [
      { checkId: "check.one", severity: "warn", title: "Title", detail: "Detail" },
    ];
    expect(applySecurityAuditSuppressions(findings, [{ checkId: "CHECK.ONE" }])).toEqual({ findings, suppressedFindings: [] });
    expect(applySecurityAuditSuppressions(findings, undefined)).toEqual({ findings, suppressedFindings: [] });
  });
});
