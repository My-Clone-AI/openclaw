/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { For, Show } from "solid-js";
import { BRAND_LOGOS } from "./brand-logos.js";
import type { Tone } from "./group-data.js";
import type { GT } from "./group-i18n.js";
import type { T } from "./ui-kit.js";

export const PATHS = {
  apps: "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z",
  errors:
    "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  metrics: "M3 3v18h18M7 15l4-4 3 3 5-6",
  servers: "M4 4h16v6H4zm0 10h16v6H4zM8 7h.01M8 17h.01",
  mail: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1m-1 1 9 7 9-7",
  back: "M15 18l-6-6 6-6",
  ci_run: "M7 4v16l13-8z",
  redeploy: "M20 11a8 8 0 0 0-14.3-4L3 10m0-6v6h6m-5 3a8 8 0 0 0 14.3 4L21 14m0 6v-6h-6",
  restart_dev:
    "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  grow_run: "M13 2 4 14h7l-1 8 9-12h-7z",
  grow_pause: "M10 4H6v16h4zm8 0h-4v16h4z",
  grow_resume: "M7 4v16l13-8z",
  download: "M12 3v12m0 0-5-5m5 5 5-5M4 21h16",
  clip: "M21 11.5 12.5 20a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z",
  send: "M4 12 20 4l-4 16-4-7zm8 1 8-9",
  close: "M18 6 6 18M6 6l12 12",
} as const;

export function Glyph(props: { name: keyof typeof PATHS; class?: string }) {
  return (
    <svg viewBox="0 0 24 24" class={props.class ?? "nsvx__icon"} aria-hidden="true">
      <path d={PATHS[props.name]} />
    </svg>
  );
}

export function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" class="nsvx-grp__brand" role="img" aria-label="GitHub">
      <path d={BRAND_LOGOS.github.path} fill="currentColor" />
    </svg>
  );
}

export type Ctx = { host: ControlUiHost; t: T; g: GT; query: string; locale: string };

export function view<V>(host: ControlUiHost, name: string, params: Record<string, string> = {}) {
  return host.request<V>("nsvx.view", { view: name, params });
}

/** A stable hue per app, so each app keeps its color across cards, charts, and lists. */
export function hue(id: string) {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

export function AppMark(props: { id: string; name: string; size?: "sm" }) {
  return (
    <span
      class={["nsvx-grp__mark", { "nsvx-grp__mark--sm": props.size === "sm" }]}
      style={{ "--nsvx-hue": String(hue(props.id)) }}
      aria-hidden="true"
    >
      {props.name.trim().charAt(0).toLowerCase() || "?"}
    </span>
  );
}

export function Dot(props: { tone: Tone }) {
  return <span class={["nsvx-grp__dot", `nsvx-grp__dot--${props.tone}`]} aria-hidden="true" />;
}

export function StatusChip(props: { g: GT; tone: Tone }) {
  return (
    <span class={["nsvx-grp__status", `nsvx-grp__status--${props.tone}`]}>
      <Dot tone={props.tone} />
      {props.g(props.tone)}
    </span>
  );
}

export function Segments<K extends string>(props: {
  name: string;
  items: readonly K[];
  value: K;
  label: (key: K) => string;
  icon?: (key: K) => keyof typeof PATHS;
  onChange: (key: K) => void;
}) {
  return (
    <div class="nsvx-seg" role="radiogroup" aria-label={props.name}>
      <For each={props.items} keyed={false}>
        {(item) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === item() ? "true" : "false"}
            class={["nsvx-seg__item", { "nsvx-seg__item--on": props.value === item() }]}
            onClick={() => props.onChange(item())}
          >
            <Show when={props.icon}>{(icon) => <Glyph name={icon()(item())} />}</Show>
            <span>{props.label(item())}</span>
          </button>
        )}
      </For>
    </div>
  );
}

export const newKey = () => `oc-${crypto.randomUUID()}`;

export function stamp(locale: string, value: string) {
  const at = new Date(value);
  return Number.isFinite(at.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(at)
    : value;
}
export const isUncertain = (cause: unknown) =>
  (cause as { gatewayCode?: string }).gatewayCode === "uncertain";

/** Confirm, then run once; an uncertain answer keeps the key so a repeat is replayed by NSVX, not redone. */
export function Fields(props: { fields: Record<string, unknown> }) {
  const text = (value: unknown) =>
    value === null || value === undefined
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return (
    <dl class="nsvx-grp__fields">
      <For each={Object.entries(props.fields)} keyed={(entry) => entry[0]}>
        {(entry) => (
          <div>
            <dt>{entry()[0]}</dt>
            <dd>{text(entry()[1])}</dd>
          </div>
        )}
      </For>
    </dl>
  );
}
