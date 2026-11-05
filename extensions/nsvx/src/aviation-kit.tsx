/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import { hm, type Tone } from "./aviation-data.js";
import type { AT } from "./aviation-i18n.js";
import { errorMessage, Icon, type IconName, type T } from "./ui-kit.js";

export type AvCtx = {
  host: ControlUiHost;
  t: T;
  at: AT;
  query: string;
  locale: string;
  onMission: (id: string) => void;
};

export function change<V = unknown>(host: ControlUiHost, params: Record<string, unknown>) {
  return host.request<V>("nsvx.aviation.change", params);
}

/** One owner tap: busy while it runs, then a short result line; an uncertain result says to check first. */
export function createAction(ctx: () => AvCtx) {
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const run = async (fn: () => Promise<unknown>, done?: string): Promise<boolean> => {
    setBusy(true);
    setNote(undefined);
    try {
      await fn();
      if (done) {
        setNote({ text: done, bad: false });
      }
      return true;
    } catch (cause) {
      const code = (cause as { gatewayCode?: string }).gatewayCode;
      setNote({
        text: code === "uncertain" ? ctx().at("uncertain") : errorMessage(ctx().host, cause),
        bad: true,
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, note, run };
}

/** Saves a file NSVX produced (base64 over the Gateway socket) without leaving Control. */
export async function saveNsvxFile(host: ControlUiHost, params: Record<string, unknown>) {
  const file = await host.request<{ fileName: string; mime: string; data: string }>(
    "nsvx.aviation.file",
    params,
  );
  const bytes = Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = file.fileName || "nsvx-file";
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Chip(props: { on: boolean; label: string; icon?: IconName; onClick: () => void }) {
  return (
    <button
      type="button"
      class={["nsvx-av__chip", { "nsvx-av__chip--on": props.on }]}
      aria-pressed={props.on ? "true" : "false"}
      onClick={() => props.onClick()}
    >
      <Show when={props.icon}>{(icon) => <Icon name={icon()} />}</Show>
      <span>{props.label}</span>
    </button>
  );
}

export function Badge(props: { tone: Tone; label: string }) {
  return (
    <span class={["nsvx-av__badge", `nsvx-av__badge--${props.tone || "none"}`]}>{props.label}</span>
  );
}

export function Kpi(props: { icon: IconName; label: string; value: string; sub?: string }) {
  return (
    <div class="nsvx-av__kpi">
      <Icon name={props.icon} />
      <span class="nsvx-av__kpi-label">{props.label}</span>
      <strong class="nsvx-av__kpi-value">{props.value}</strong>
      <Show when={props.sub}>
        <span class="nsvx-av__kpi-sub">{props.sub}</span>
      </Show>
    </div>
  );
}

/** Horizontal bars of minutes, longest first, as the NSVX hub draws aircraft and routes. */
export function Bars(props: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = () => Math.max(1, ...props.rows.map((row) => row.value));
  return (
    <ul class="nsvx-av__bars">
      <For each={props.rows} keyed={(row) => row.label}>
        {(row) => (
          <li>
            <span class="nsvx-av__bars-label">{row().label}</span>
            <span class="nsvx-av__bars-track">
              <span style={{ width: `${Math.max(2, (row().value / max()) * 100)}%` }} />
            </span>
            <span class="nsvx-av__bars-value">
              {hm(row().value)}
              <Show when={row().sub}>
                <span class="nsvx-av__muted"> · {row().sub}</span>
              </Show>
            </span>
          </li>
        )}
      </For>
    </ul>
  );
}

export function Card(props: {
  title: string;
  icon: IconName;
  children: unknown;
  action?: unknown;
}) {
  return (
    <section class="nsvx-av__card" aria-label={props.title}>
      <h3 class="nsvx-av__card-title">
        <Icon name={props.icon} />
        <span>{props.title}</span>
        <Show when={props.action}>
          <span class="nsvx-av__card-action">{props.action as never}</span>
        </Show>
      </h3>
      {props.children as never}
    </section>
  );
}

/** "2026-10-23" -> "23/10/2026" in the viewer's language. */
export function dayLabel(locale: string, iso: string | null | undefined, year = true) {
  if (!iso) {
    return "";
  }
  const at = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(at.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        ...(year ? { year: "numeric" } : {}),
        timeZone: "UTC",
      }).format(at);
}

export function monthLabel(locale: string, ym: string, short = false) {
  const at = new Date(`${ym}-15T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    ...(short ? {} : { year: "2-digit" }),
    timeZone: "UTC",
  }).format(at);
}

/** Lisbon wall time with its zone, as NSVX shows check-in openings. */
export function lisbonTime(locale: string, iso: string) {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ""
    : new Intl.DateTimeFormat(locale, {
        timeZone: "Europe/Lisbon",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZoneName: "short",
      }).format(at);
}

export function Counter(props: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div class="nsvx-av__counter" role="group" aria-label={props.label}>
      <span class="nsvx-av__counter-label">{props.label}</span>
      <button
        type="button"
        class="nsvx__button nsvx__button--icon"
        aria-label={`${props.label} −`}
        onClick={() => props.onChange(Math.max(0, props.value - 1))}
      >
        −
      </button>
      <output>{props.value}</output>
      <button
        type="button"
        class="nsvx__button nsvx__button--icon"
        aria-label={`${props.label} +`}
        onClick={() => props.onChange(Math.min(9, props.value + 1))}
      >
        +
      </button>
    </div>
  );
}
