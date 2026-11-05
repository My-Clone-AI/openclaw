/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import { PLATFORM_LOGOS } from "./brand-logos.js";
import type { Tone } from "./fleet-data.js";
import type { FT } from "./fleet-i18n.js";
import { errorMessage, type T } from "./ui-kit.js";

export type Ctx = { host: ControlUiHost; t: T; ft: FT; query: string };

export function fleetView<V>(
  host: ControlUiHost,
  name: string,
  params: Record<string, string> = {},
) {
  return host.request<V>("nsvx.view", { view: name, params });
}

const PATHS = {
  home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  drivers: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 9a7 7 0 0 1 14 0M18 8h4m-2-2v4",
  cars: "M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13M4 13h16v5H4zm2 5v2m12-2v2M7.5 15.5h.01m9 0h.01",
  plan: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m3 10h3v3H8z",
  money: "M17 5.5A7 7 0 1 0 17 18.5M4 10h9m-9 4h9",
  miles: "M12 14l4-4M3.5 17a9 9 0 1 1 17 0M12 14a1 1 0 1 0 0 .01",
  ask: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  portal: "M15 7a4 4 0 1 1-3.9 5H9v2H7v2H4v-3l5.1-5.1A4 4 0 0 1 15 7m1.5 1.5h.01",
  trips:
    "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M6 15V9a4 4 0 0 1 4-4h4M18 9v6a4 4 0 0 1-4 4h-4",
  alert:
    "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  docs: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5M9 13h6m-6 4h4",
  tasks: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  check: "M5 12l5 5L20 7",
  plus: "M12 5v14M5 12h14",
  sync: "M20 11a8 8 0 0 0-14.3-4L3 10m0-6v6h6m-5 3a8 8 0 0 0 14.3 4L21 14m0 6v-6h-6",
  back: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
  service: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  flows: "M6 3v12m0 0a3 3 0 1 0 0 .01M18 9a3 3 0 1 0 0-.01M18 9c0 5-6 4-9 7",
  cases: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zm0 6v4m0 3h.01",
  card: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm0 4h18M7 15h3",
  hand: "M4 14l4-4 3 3 5-5 4 4M4 20h16",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  news: "M4 5h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2-2V9h-2M4 5v14a2 2 0 0 0 2 2h13M8 9h7m-7 4h7m-7 4h4",
  inbox: "M4 13h4l2 3h4l2-3h4M5 5h14l1 8v6H4v-6z",
  pin: "M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12m0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  rules: "M13 2 4 14h7l-1 8 9-12h-7z",
  reports: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zm3 5h6m-6 4h6m-6 4h3",
  download: "M12 3v12m0 0-5-5m5 5 5-5M4 21h16",
  close: "M6 6l12 12M18 6 6 18",
  drive: "M8 3h8l6 10-4 7H6l-4-7zm0 0 6 10m2-10-6 10M2 13h20",
  gps: "M12 2v3m0 14v3M2 12h3m14 0h3M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12m0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  play: "M7 4v16l13-8z",
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph(props: { name: GlyphName; class?: string }) {
  return (
    <svg viewBox="0 0 24 24" class={props.class ?? "nsvx__icon"} aria-hidden="true">
      <path d={PATHS[props.name]} />
    </svg>
  );
}

/** Official Uber mark (simple-icons, CC0); Bolt has no free mark, so it is its green wordmark as NSVX draws it. */
export function PlatformMark(props: { code: string; large?: boolean }) {
  const uber = PLATFORM_LOGOS.uber;
  return (
    <span
      class={[
        "nsvx-fleet-mark",
        `nsvx-fleet-mark--${props.code}`,
        { "nsvx-fleet-mark--lg": props.large },
      ]}
      aria-hidden="true"
    >
      <Show
        when={props.code === "uber"}
        fallback={
          <Show
            when={props.code === "bolt"}
            fallback={
              <Glyph
                name={props.code === "gps" ? "gps" : props.code === "drive" ? "drive" : "link"}
              />
            }
          >
            <span class="nsvx-fleet-mark__word">Bolt</span>
          </Show>
        }
      >
        <svg viewBox="0 0 24 24" class="nsvx-fleet-mark__svg">
          <path d={uber.path} />
        </svg>
      </Show>
    </span>
  );
}

export function Dot(props: { tone: Tone; label?: string }) {
  return (
    <span
      class={["nsvx__dot", `nsvx__dot--${props.tone}`]}
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      title={props.label}
    />
  );
}

export function Chip(props: { tone: Tone; children: JSX.Element }) {
  return (
    <span class={["nsvx-fleet-chip", `nsvx-fleet-chip--${props.tone}`]}>{props.children}</span>
  );
}

/** Portuguese plate as a small plate, so cars read at a glance. */
export function Plate(props: { plate: string | null | undefined; fleetNo?: string | null }) {
  return (
    <span class="nsvx-plate" aria-label={props.plate ?? props.fleetNo ?? "—"}>
      <span class="nsvx-plate__eu" aria-hidden="true">
        P
      </span>
      <span class="nsvx-plate__text">
        {props.plate ?? (props.fleetNo ? `#${props.fleetNo}` : "—")}
      </span>
    </span>
  );
}

/** A compliance score as a ring with its number in the middle. */
export function Ring(props: { score: number; tone: Tone; label: string }) {
  const r = 15.5;
  const length = 2 * Math.PI * r;
  return (
    <span
      class={["nsvx-ring", `nsvx-ring--${props.tone}`]}
      role="img"
      aria-label={props.label}
      title={props.label}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle class="nsvx-ring__track" cx="18" cy="18" r={r} />
        <circle
          class="nsvx-ring__value"
          cx="18"
          cy="18"
          r={r}
          stroke-dasharray={`${(Math.max(0, Math.min(100, props.score)) / 100) * length} ${length}`}
        />
      </svg>
      <span class="nsvx-ring__text">{Math.round(props.score)}</span>
    </span>
  );
}

export function Seg<K extends string>(props: {
  items: readonly K[];
  value: K;
  label: (key: K) => string;
  icon?: (key: K) => GlyphName;
  onChange: (key: K) => void;
  name: string;
  compact?: boolean;
}) {
  return (
    <div
      class={["nsvx-seg", { "nsvx-seg--compact": props.compact }]}
      role="radiogroup"
      aria-label={props.name}
    >
      <For each={props.items} keyed={false}>
        {(item) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === item() ? "true" : "false"}
            aria-label={props.label(item())}
            title={props.label(item())}
            class={["nsvx-seg__item", { "nsvx-seg__item--on": props.value === item() }]}
            onClick={() => props.onChange(item())}
          >
            <Show when={props.icon}>{(icon) => <Glyph name={icon()(item())} />}</Show>
            <span class="nsvx-seg__label">{props.label(item())}</span>
          </button>
        )}
      </For>
    </div>
  );
}

export function Tile(props: {
  icon: GlyphName;
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      class={["nsvx-fleet-tile", props.tone ? `nsvx-fleet-tile--${props.tone}` : ""]}
      disabled={!props.onClick}
      onClick={() => props.onClick?.()}
    >
      <Glyph name={props.icon} class="nsvx-fleet-tile__icon" />
      <span class="nsvx-fleet-tile__value">{props.value}</span>
      <span class="nsvx-fleet-tile__label">{props.label}</span>
      <Show when={props.sub}>
        <span class="nsvx-fleet-tile__sub">{props.sub}</span>
      </Show>
    </button>
  );
}

export function Block(props: {
  icon: GlyphName;
  title: string;
  count?: number;
  action?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <section class="nsvx-fleet-block">
      <header class="nsvx-fleet-block__head">
        <Glyph name={props.icon} />
        <h3>{props.title}</h3>
        <Show when={props.count}>
          <span class="nsvx-fleet-count">{props.count}</span>
        </Show>
        <span class="nsvx-fleet-block__action">{props.action}</span>
      </header>
      {props.children}
    </section>
  );
}

export function Empty(props: { icon: GlyphName; text: string }) {
  return (
    <p class="nsvx-fleet-empty">
      <Glyph name={props.icon} class="nsvx-fleet-empty__icon" />
      <span>{props.text}</span>
    </p>
  );
}

/**
 * One owner change at a time per surface, with a visible outcome. A conflict reloads instead of overwriting; an
 * uncertain result says so and is never repeated by itself.
 */
export function createFleetChange(ctx: Pick<Ctx, "host" | "ft">, reload: () => unknown) {
  const [busy, setBusy] = createSignal<string>();
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const run = async <V,>(key: string, params: Record<string, unknown>): Promise<V | undefined> => {
    setBusy(key);
    setNote(undefined);
    try {
      const value = await ctx.host.request<V>("nsvx.fleet.change", params);
      setNote({ text: ctx.ft("ok"), bad: false });
      await reload();
      return value;
    } catch (cause) {
      const code = (cause as { gatewayCode?: string }).gatewayCode;
      setNote({
        text:
          code === "conflict"
            ? ctx.ft("conflictReload")
            : code === "uncertain"
              ? ctx.ft("uncertain")
              : errorMessage(ctx.host, cause),
        bad: true,
      });
      if (code === "conflict") {
        await reload();
      }
      return undefined;
    } finally {
      setBusy(undefined);
    }
  };
  return { busy, note, run };
}

export type FleetChange = ReturnType<typeof createFleetChange>;

export function ChangeNote(props: { change: FleetChange }) {
  return (
    <p class="nsvx-fleet-note" role="status" aria-live="polite">
      <Show when={props.change.note()}>
        {(note) => (
          <span class={["nsvx__notice", { "nsvx__notice--bad": note().bad }]}>{note().text}</span>
        )}
      </Show>
    </p>
  );
}

/** A tap that asks once more before an action that reaches drivers or runs automation. */
export function ConfirmButton(props: {
  ft: FT;
  label: string;
  hint?: string;
  icon?: GlyphName;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = createSignal(false);
  return (
    <Show
      when={asking()}
      fallback={
        <button
          type="button"
          class={["nsvx__button", { "nsvx__button--primary": props.primary }]}
          disabled={props.disabled || props.busy}
          onClick={() => setAsking(true)}
        >
          <Show when={props.icon}>{(icon) => <Glyph name={icon()} />}</Show>
          <span>{props.label}</span>
        </button>
      }
    >
      <span class="nsvx-confirm" role="group" aria-label={props.label}>
        <span class="nsvx-confirm__text">{props.hint ?? props.ft("sure")}</span>
        <button type="button" class="nsvx__button" onClick={() => setAsking(false)}>
          {props.ft("cancel")}
        </button>
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={props.busy}
          onClick={() => {
            setAsking(false);
            props.onConfirm();
          }}
        >
          {props.label}
        </button>
      </span>
    </Show>
  );
}
