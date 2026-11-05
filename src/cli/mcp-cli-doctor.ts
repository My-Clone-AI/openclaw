import path from "node:path";
import { asNullableRecord as asRecord } from "@openclaw/normalization-core/record-coerce";
import { operatorMcpOAuthIdentity } from "../agents/mcp-oauth-identity.js";
import { readMcpOAuthCredentialsStatus } from "../agents/mcp-oauth.js";
import { resolveMcpTransportConfig } from "../agents/mcp-transport-config.js";
import { renderEnvTemplateToken, scanEnvTemplateTokens } from "../config/env-substitution.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { formatErrorMessage } from "../infra/errors.js";
import { executableFileExists, safeStat } from "../infra/path-existence.js";
import { resolveEnvironmentValue } from "../infra/process-env.js";
import { formatCliCommand } from "./command-format.js";
import { probeMcpServers } from "./mcp-cli-probe.js";

type McpDoctorIssue = {
  level: "error" | "warning" | "info";
  message: string;
};

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "api_key",
]);

const SENSITIVE_KEY_PATTERN =
  /(?:^|[_-])(api[_-]?key|authorization|bearer|password|secret|token)$/i;

function issue(level: McpDoctorIssue["level"], message: string): McpDoctorIssue {
  return { level, message };
}

function hasSensitiveKey(name: string): boolean {
  return SENSITIVE_HEADER_NAMES.has(name.trim().toLowerCase()) || SENSITIVE_KEY_PATTERN.test(name);
}

function hasLiteralSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  const tokens = scanEnvTemplateTokens(value);
  let literal = value;
  for (const token of tokens) {
    if (token.kind === "escaped" || token.defaultValue?.trim()) {
      return true;
    }
    literal = literal.replaceAll(renderEnvTemplateToken(token), "");
  }
  return (
    tokens.length === 0 || (literal.trim().length > 0 && !/^(Bearer|Basic)$/i.test(literal.trim()))
  );
}

function resolveConfiguredPath(filePath: string, cwd: unknown): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  const base = typeof cwd === "string" && cwd.trim() ? cwd.trim() : process.cwd();
  return path.resolve(base, filePath);
}

function executableCandidates(command: string): string[] {
  if (process.platform !== "win32") {
    return [command];
  }
  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (path.extname(command)) {
    return [command];
  }
  return [command, ...extensions.map((extension) => `${command}${extension.toLowerCase()}`)];
}

async function commandExists(
  command: string,
  cwd: unknown,
  env: Record<string, string> | undefined,
): Promise<boolean> {
  const hasPathSeparator =
    path.isAbsolute(command) || command.includes("/") || command.includes("\\");
  if (hasPathSeparator) {
    return executableFileExists(resolveConfiguredPath(command, cwd));
  }
  const configuredPath =
    process.platform === "win32" ? resolveEnvironmentValue(env, "PATH") : env?.PATH;
  const pathEntries = (configuredPath ?? process.env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim() || ".");
  for (const pathEntry of pathEntries) {
    const resolvedPathEntry = path.isAbsolute(pathEntry)
      ? pathEntry
      : resolveConfiguredPath(pathEntry, cwd);
    for (const candidate of executableCandidates(command)) {
      if (await executableFileExists(path.join(resolvedPathEntry, candidate))) {
        return true;
      }
    }
  }
  return false;
}

export async function collectMcpDoctorIssues(params: {
  name: string;
  server: Record<string, unknown>;
  authoredServer?: Record<string, unknown>;
  probe: boolean;
  config: OpenClawConfig;
}): Promise<McpDoctorIssue[]> {
  const issues: McpDoctorIssue[] = [];
  const { name, server } = params;
  const resolved = resolveMcpTransportConfig(name, server);
  const disabled = server.enabled === false;
  if (disabled) {
    issues.push(issue("warning", "server is disabled"));
  }
  if (!disabled) {
    if (!resolved) {
      issues.push(issue("error", "server transport is invalid"));
    }
    if (resolved?.kind === "stdio") {
      if (!(await commandExists(resolved.command, resolved.cwd, resolved.env))) {
        issues.push(
          issue("error", `stdio command not found or not executable: ${resolved.command}`),
        );
      }
      if (resolved.cwd && !(await safeStat(resolved.cwd))?.isDirectory()) {
        issues.push(issue("error", `stdio cwd does not exist: ${resolved.cwd}`));
      }
    }
    if (resolved?.kind === "http") {
      if (server.auth === "oauth") {
        if (asRecord(server.oauth)?.identity !== "per-requester") {
          const authStatus = await readMcpOAuthCredentialsStatus(
            operatorMcpOAuthIdentity(name, resolved.url),
          );
          if (authStatus.state !== "authorized") {
            const state =
              authStatus.state === "requires-authorization"
                ? "require additional authorization"
                : "are not authorized";
            issues.push(
              issue(
                "warning",
                `OAuth credentials ${state}; run ${formatCliCommand(`openclaw mcp login ${name}`)}`,
              ),
            );
          }
        }
        const headers = asRecord(server.headers);
        if (headers && Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
          issues.push(
            issue("warning", "OAuth is enabled and the static Authorization header is ignored"),
          );
        }
      }
      if (resolved.sslVerify === false) {
        issues.push(issue("warning", "TLS certificate verification is disabled"));
      }
      for (const [filePath, label] of [
        [resolved.clientCert, "client certificate"],
        [resolved.clientKey, "client key"],
      ]) {
        if (filePath && !(await safeStat(resolveConfiguredPath(filePath, "")))?.isFile()) {
          issues.push(issue("error", `${label} file does not exist: ${filePath}`));
        }
      }
    }
  }
  for (const [field, values] of [
    ["headers", asRecord(params.authoredServer?.headers)],
    ["env", asRecord(params.authoredServer?.env)],
  ] as const) {
    for (const [key, value] of Object.entries(values ?? {})) {
      if (hasSensitiveKey(key) && hasLiteralSensitiveValue(value)) {
        issues.push(
          issue(
            "warning",
            `${field}.${key} contains a literal sensitive value; prefer an environment-backed value outside committed config`,
          ),
        );
      }
    }
  }
  const toolFilter = asRecord(server.toolFilter);
  if (toolFilter && !Array.isArray(toolFilter.include) && !Array.isArray(toolFilter.exclude)) {
    issues.push(issue("warning", "toolFilter is present but has no include or exclude list"));
  }
  if (
    params.probe &&
    server.enabled !== false &&
    !issues.some((entry) => entry.level === "error")
  ) {
    try {
      const result = await probeMcpServers("openclaw-cli-mcp-doctor", params.config, {
        [name]: server,
      });
      const diagnostic = result.diagnostics[0];
      if (diagnostic) {
        issues.push(issue("error", `check failed: ${diagnostic.message}`));
      } else {
        const connectedServer = result.servers[name];
        if (!connectedServer) {
          issues.push(issue("error", "check did not connect to this server"));
        } else if (connectedServer.approvalHint) {
          issues.push(
            issue(
              "info",
              `Codex approval mode: ${connectedServer.codexApprovalMode}; ${connectedServer.approvalHint}`,
            ),
          );
        }
      }
      if (result.cleanupError) {
        issues.push(issue("error", `cleanup failed: ${result.cleanupError}`));
      }
    } catch (err) {
      issues.push(issue("error", `check failed: ${formatErrorMessage(err)}`));
    }
  }
  return issues;
}
