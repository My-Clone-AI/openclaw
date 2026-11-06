/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import { SHOP_LOGOS } from "./brand-logos.js";
import {
  currentQuarter,
  PROVIDER_COLORS,
  PROVIDER_NAMES,
  quarterOpen,
  UPLOAD_LIMIT,
  type Provider,
  type Tone,
} from "./business-data.js";
import type { BT, BusinessKey } from "./business-i18n.js";
import { errorMessage, type T } from "./ui-kit.js";

export type Ctx = { host: ControlUiHost; t: T; b: BT; query: string; locale: string };

export const PATHS = {
  suppliers: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6",
  quarter:
    "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
  orders: "M3 7l9-4 9 4v10l-9 4-9-4zm0 0 9 4 9-4m-9 4v10",
  home: "M3 11 12 3l9 8M5 9v12h14V9M10 21v-6h4v6",
  readings: "M12 3a9 9 0 1 0 9 9M12 12l5-5M12 3v3M3 12h3",
  warranty: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm-3 10 2 2 4-4",
  grants: "M15 7a4 4 0 1 1-3.9 5H7v3H4v-3H2v-3h9.1A4 4 0 0 1 15 7m0 3h.01",
  download: "M12 3v12m0 0-5-5m5 5 5-5M4 21h16",
  camera: "M4 7h3l2-3h6l2 3h3v13H4zm8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  file: "M6 2h9l5 5v15H6zM14 2v6h6",
  mic: "M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3M5 11a7 7 0 0 0 14 0M12 18v4",
  stop: "M6 6h12v12H6z",
  key: "M15 7a4 4 0 1 1-3.9 5H7v3H4v-3H2v-3h9.1A4 4 0 0 1 15 7",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  plug: "M9 2v6m6-6v6M6 8h12v4a6 6 0 0 1-12 0zm6 10v4",
  refresh: "M20 11a8 8 0 0 0-14.3-4L3 10m0-6v6h6m-5 3a8 8 0 0 0 14.3 4L21 14m0 6v-6h-6",
  rotate: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  check: "m5 12 5 5L20 7",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3",
  back: "M15 18l-6-6 6-6",
  external: "M14 4h6v6m0-6-9 9M18 14v6H4V6h6",
  close: "M18 6 6 18M6 6l12 12",
  spark: "m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
} as const;
export type Glyph = keyof typeof PATHS;

export function Glyph(props: { name: Glyph; class?: string }) {
  return (
    <svg viewBox="0 0 24 24" class={props.class ?? "nsvx__icon"} aria-hidden="true">
      <path d={PATHS[props.name]} />
    </svg>
  );
}

/** The provider's official mark where simple-icons has one, else its initial on its brand color. */
export function Mark(props: { provider: Provider }) {
  const logo = () => (props.provider === "glovo" ? SHOP_LOGOS.glovo : undefined);
  return (
    <Show
      when={logo()}
      fallback={
        <span
          class="nsvx-biz__mark"
          style={{ "--nsvx-brand": PROVIDER_COLORS[props.provider] }}
          aria-hidden="true"
        >
          {PROVIDER_NAMES[props.provider].charAt(0)}
        </span>
      }
    >
      {(brand) => (
        <svg class="nsvx-biz__mark nsvx-biz__mark--logo" viewBox="0 0 24 24" aria-hidden="true">
          <path d={brand().path} fill={brand().color} />
        </svg>
      )}
    </Show>
  );
}

export function Chip(props: { tone: Tone; children: unknown }) {
  return (
    <span class={["nsvx-biz__chip", `nsvx-biz__chip--${props.tone}`]}>
      {props.children as never}
    </span>
  );
}

export function Segments<K extends string>(props: {
  name: string;
  items: readonly K[];
  value: K;
  label: (key: K) => string;
  icon: (key: K) => Glyph;
  onChange: (key: K) => void;
}) {
  return (
    <div class="nsvx-seg nsvx-biz__seg" role="radiogroup" aria-label={props.name}>
      <For each={props.items} keyed={false}>
        {(item) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === item() ? "true" : "false"}
            class={["nsvx-seg__item", { "nsvx-seg__item--on": props.value === item() }]}
            onClick={() => props.onChange(item())}
          >
            <Glyph name={props.icon(item())} />
            <span>{props.label(item())}</span>
          </button>
        )}
      </For>
    </div>
  );
}

/** Year and quarter: only past and current quarters can be picked. */
export function QuarterPick(props: {
  b: BT;
  year: number;
  quarter: number;
  from?: number;
  onChange: (next: { year: number; quarter: number }) => void;
}) {
  const now = currentQuarter();
  const years = () =>
    Array.from({ length: 6 }, (_, i) => now.year - i).filter((y) => y >= (props.from ?? 2000));
  return (
    <span class="nsvx-biz__quarter">
      <select
        class="nsvx-biz__input"
        aria-label={props.b("year")}
        value={String(props.year)}
        onChange={(event) => {
          const year = Number(event.currentTarget.value);
          props.onChange({
            year,
            quarter: quarterOpen(year, props.quarter) ? props.quarter : now.quarter,
          });
        }}
      >
        <For each={years()} keyed={false}>
          {(year) => <option value={String(year())}>{year()}</option>}
        </For>
      </select>
      <span class="nsvx-biz__quarters" role="radiogroup" aria-label={props.b("quarter")}>
        <For each={[1, 2, 3, 4]} keyed={false}>
          {(q) => (
            <button
              type="button"
              role="radio"
              aria-checked={props.quarter === q() ? "true" : "false"}
              aria-label={`${props.b("quarter")} ${q()}`}
              disabled={!quarterOpen(props.year, q())}
              class={["nsvx-biz__q", { "nsvx-biz__q--on": props.quarter === q() }]}
              onClick={() => props.onChange({ year: props.year, quarter: q() })}
            >
              Q{q()}
            </button>
          )}
        </For>
      </span>
    </span>
  );
}

export function Meter(props: { done: number; total: number; label: string }) {
  const pct = () =>
    props.total > 0 ? Math.min(100, Math.round((props.done / props.total) * 100)) : 0;
  return (
    <span
      class="nsvx-biz__meter"
      role="progressbar"
      aria-label={props.label}
      aria-valuenow={pct()}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${pct()}%` }} />
    </span>
  );
}

export type Note = { text: string; bad: boolean };

/**
 * One owner tap at a time: busy while it runs, then a short result. An uncertain answer says to check before
 * repeating, because these NSVX routes carry no idempotency key.
 */
export function createAction(ctx: () => Ctx) {
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<Note>();
  const run = async <V,>(work: () => Promise<V>, done?: BusinessKey): Promise<V | undefined> => {
    setBusy(true);
    setNote(undefined);
    try {
      const value = await work();
      if (done) {
        setNote({ text: ctx().b(done), bad: false });
      }
      return value;
    } catch (cause) {
      const uncertain = (cause as { gatewayCode?: string }).gatewayCode === "uncertain";
      setNote({
        text: uncertain ? ctx().b("uncertain") : errorMessage(ctx().host, cause),
        bad: true,
      });
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, note, run, clear: () => setNote(undefined) };
}

export function NoteLine(props: { note: Note | undefined }) {
  return (
    <Show when={props.note}>
      {(n) => (
        <p class={["nsvx-biz__note", { "nsvx-biz__note--bad": n().bad }]} role="status">
          {n().text}
        </p>
      )}
    </Show>
  );
}

/** One NSVX read for this tab (business-routes.ts names the views). */
export function businessView<V>(
  host: ControlUiHost,
  view: string,
  params: Record<string, string> = {},
) {
  return host.request<V>("nsvx.view", { view, params });
}

export type Upload = { name: string; type: string; base64: string };

/** Reads a picked file for the Gateway; NSVX checks the type and bytes again. */
export async function toUpload(file: File): Promise<Upload> {
  if (file.size > UPLOAD_LIMIT) {
    throw new Error("8 MB max");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { name: file.name || "file", type: file.type, base64: btoa(binary) };
}

/** A file as `readOwnerFile` sends it over the Gateway socket. */
export type FileAnswer = { fileName: string; mime: string; data: string };

export const dataUrl = (file: FileAnswer) => `data:${file.mime};base64,${file.data}`;

/** Saves a file NSVX sent (export, packet) on this device. */
export function saveFile(file: FileAnswer, fallback: string) {
  const link = document.createElement("a");
  link.href = dataUrl(file);
  link.download = file.fileName || fallback;
  link.click();
}

export function driveUrl(id: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

export function when(locale: string, value: string | number | null | undefined) {
  const at = typeof value === "number" ? new Date(value * 1000) : new Date(value ?? "");
  return Number.isFinite(at.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(at)
    : "";
}
