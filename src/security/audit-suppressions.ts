import type { SecurityAuditSuppression } from "../config/types.openclaw.js";
import type { SecurityAuditFinding, SecurityAuditSuppressedFinding } from "./audit.types.js";

function normalizeSuppressionText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function findingMatchesSuppression(
  finding: SecurityAuditFinding,
  suppression: SecurityAuditSuppression,
): boolean {
  const checkId = suppression.checkId.trim();
  if (!checkId || finding.checkId !== checkId) {
    return false;
  }
  const titleNeedle = normalizeSuppressionText(suppression.titleIncludes);
  if (titleNeedle && !finding.title.toLowerCase().includes(titleNeedle)) {
    return false;
  }
  const detailNeedle = normalizeSuppressionText(suppression.detailIncludes);
  if (detailNeedle && !finding.detail.toLowerCase().includes(detailNeedle)) {
    return false;
  }
  return true;
}

export function applySecurityAuditSuppressions(
  findings: SecurityAuditFinding[],
  suppressions: SecurityAuditSuppression[] | undefined,
): { findings: SecurityAuditFinding[]; suppressedFindings: SecurityAuditSuppressedFinding[] } {
  if (!Array.isArray(suppressions) || suppressions.length === 0) {
    return { findings, suppressedFindings: [] };
  }
  const active: SecurityAuditFinding[] = [];
  const suppressedFindings: SecurityAuditSuppressedFinding[] = [];
  for (const finding of findings) {
    const suppression = suppressions.find((candidate) =>
      findingMatchesSuppression(finding, candidate),
    );
    if (!suppression) {
      active.push(finding);
      continue;
    }
    const reason = suppression.reason?.trim();
    suppressedFindings.push({
      ...finding,
      suppression: reason ? { reason } : {},
    });
  }
  return { findings: active, suppressedFindings };
}
