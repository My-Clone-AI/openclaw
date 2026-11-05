import { tryReadSecretFileSync } from "openclaw/plugin-sdk/secret-file-runtime";

export const DEFAULT_NSVX_URL = "https://nsvx.com";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function parseNsvxConfig(raw: unknown): { baseUrl: string } {
  const value = (raw ?? {}) as { baseUrl?: unknown };
  const baseUrl = value.baseUrl ?? DEFAULT_NSVX_URL;
  let url: URL;
  try {
    url = new URL(typeof baseUrl === "string" ? baseUrl : "");
  } catch {
    throw new Error("nsvx baseUrl must be a valid address, such as https://nsvx.com.");
  }
  const secure =
    url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  if (!secure || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(
      "nsvx baseUrl must be an HTTPS origin with no path or sign-in; use HTTP only with localhost or 127.0.0.1.",
    );
  }
  return { baseUrl: url.origin };
}

/**
 * The AgentOS token, trimmed. `NSVX_AGENTOS_TOKEN_FILE` is the sanctioned source; a missing, empty, or refused file means
 * no token (Control shows Not connected), never a fall back to the inline variable.
 */
export function readNsvxToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const file = env.NSVX_AGENTOS_TOKEN_FILE?.trim();
  if (!file) {
    return env.NSVX_AGENTOS_TOKEN?.trim() || undefined;
  }
  try {
    return tryReadSecretFileSync(file, "NSVX AgentOS token");
  } catch {
    return undefined;
  }
}
