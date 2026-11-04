#!/usr/bin/env node
// Run with Node 24: pass --help for the dry-run and live verification options.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const master = "51.255.87.117";
const organizations = ["My-Clone-AI", "bitcoinuniverseio", "Project-Boden", "Echelon-RSVP"];

type Config = {
  gateway?: { mode?: string; remote?: { transport?: string; url?: string; sshTarget?: string } };
};

export function verifyConfig(config: Config): void {
  const gateway = config.gateway;
  const remote = gateway?.remote;
  if (gateway?.mode !== "remote" || !remote) {
    throw new Error("Gateway configuration must use remote mode.");
  }
  let directHost = "";
  try {
    const url = new URL(remote.url ?? "");
    if (url.protocol === "wss:" || url.protocol === "ws:") {
      directHost = url.hostname;
    }
  } catch {
    // Report a single configuration error without exposing the URL or credentials.
  }
  const transport =
    remote.transport ??
    (directHost && directHost !== "127.0.0.1" && directHost !== "localhost" ? "direct" : "ssh");
  const sshHost = remote.sshTarget?.trim().split("@").at(-1);
  if (
    (transport === "direct" && directHost === master) ||
    (transport === "ssh" && sshHost === master)
  ) {
    return;
  }
  throw new Error("Remote Gateway target is not the expected Master host.");
}

type Picker = {
  selectOrg(org: string): Promise<void>;
  search(query: string): Promise<void>;
  remoteCount(org: string): Promise<number>;
};

export async function verifyPicker(picker: Picker, org: string, query: string): Promise<void> {
  await picker.selectOrg(org);
  await picker.search(query);
  if ((await picker.remoteCount(org)) < 1) {
    throw new Error(`No ${org} repositories appeared in the remote picker.`);
  }
}

async function main(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.log(
      "Usage: node scripts/ops/verify-thin-client-remote-picker.ts [--execute --config PATH --cdp URL --org ORG --query TEXT]\nDefault: dry run, no config read or network access. For --execute, open the authenticated Control UI new-session project picker in a local CDP browser first. Export the thin client's config locally; never include credentials in reports. The query must match at least one accessible repository.",
    );
    return;
  }
  if (!args.includes("--execute")) {
    console.log(
      "Dry run: would check remote Gateway configuration and search the open Control UI picker. Use --help for live verification.",
    );
    return;
  }
  const value = (name: string) => {
    const index = args.indexOf(name);
    const result = index < 0 ? undefined : args[index + 1];
    if (!result || result.startsWith("--")) throw new Error(`Missing ${name}.`);
    return result;
  };
  const configPath = value("--config");
  const cdp = new URL(value("--cdp"));
  const org = value("--org");
  const query = value("--query");
  if (!organizations.includes(org) || query.trim().length < 2)
    throw new Error("Choose a supported organization and a query of at least two characters.");
  if (
    !(
      ["http:", "https:"].includes(cdp.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(cdp.hostname)
    )
  )
    throw new Error("CDP must be a local HTTP endpoint.");
  verifyConfig(JSON.parse(await readFile(configPath, "utf8")) as Config);
  const { chromium } = await import("playwright");
  const browser = await chromium.connectOverCDP(cdp.href);
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const candidates = [];
    for (const page of pages) {
      if (await page.getByRole("group", { name: "GitHub organization" }).count())
        candidates.push(page);
    }
    if (candidates.length !== 1)
      throw new Error("Open exactly one authenticated new-session project picker in the browser.");
    const page = candidates[0];
    await verifyPicker(
      {
        selectOrg: async (name) => {
          await page
            .getByRole("group", { name: "GitHub organization" })
            .getByRole("button", { name, exact: true })
            .click();
        },
        search: async (text) => {
          const input = page.locator('input[type="search"]:visible');
          if (!(await input.count())) await page.locator(".header-search__toggle:visible").click();
          await page.locator('input[type="search"]:visible').fill(text);
        },
        remoteCount: async (name) => {
          const rows = page.locator('[data-value^="remote-project:"]');
          await rows.first().waitFor({ state: "visible", timeout: 15000 });
          const values = await rows.evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-value") ?? ""),
          );
          return values.filter((value) =>
            value.toLowerCase().startsWith(`remote-project:${name.toLowerCase()}/`),
          ).length;
        },
      },
      org,
      query,
    );
    console.log(
      `PASS: configured Master target and ${org} remote picker results verified. Confirm this browser is connected to the checked thin-client Gateway.`,
    );
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    // Browser and config errors can contain credentials or private URLs.
    console.error(
      "Verification failed. Check the config, local browser connection, picker, and search query; no secrets were printed.",
    );
    process.exitCode = 1;
  });
}
