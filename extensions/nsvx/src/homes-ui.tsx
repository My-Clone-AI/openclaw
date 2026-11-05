/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import { STAY_LOGOS } from "./brand-logos.js";
import type { Tone } from "./homes-data.js";
import type { HK, HT } from "./homes-i18n.js";
import { errorMessage, type T } from "./ui-kit.js";

export const PATHS = {
  homes: "M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10",
  rent: "M15 7a3 3 0 1 0 0 .01M13 9.5 4 18.5V21h3v-2h2v-2h2l1.6-1.6",
  loans: "M3 10 12 4l9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18",
  stays: "M3 18v-6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6M3 14h18M7 9V6h4v3M3 18v3m18-3v3",
  back: "M15 18l-6-6 6-6",
  prev: "M15 18l-6-6 6-6",
  next: "M9 6l6 6-6 6",
  check: "M5 12l5 5 9-10",
  close: "M18 6 6 18M6 6l12 12",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zm4 4h4",
  ask: "M4 5h16v11H8l-4 4zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4M12 14.5h.01",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  plus: "M12 5v14M5 12h14",
  phone:
    "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  door: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12h.01",
  out: "M16 17l5-5-5-5M21 12H9M13 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8",
  broom: "M14 4 9 13m-5 1h10l1 7H3zM6 18v3m4-3v3",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zm0 0 9 4 9-4M12 11v10",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6m-6 4h6",
  bank: "M3 10 12 4l9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18",
  play: "M7 4v16l13-8z",
  flag: "M5 21V4h11l-2 4 2 4H5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  sync: "M20 11a8 8 0 0 0-14.3-4L3 10m0-6v6h6m-5 3a8 8 0 0 0 14.3 4L21 14m0 6v-6h-6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 9a7 7 0 0 1 14 0",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11",
  flame: "M12 22a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8a6 6 0 0 0 6 6",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
} as const;
export type GlyphName = keyof typeof PATHS;

export function Glyph(props: { name: GlyphName; class?: string }) {
  return (
    <svg viewBox="0 0 24 24" class={props.class ?? "nsvx__icon"} aria-hidden="true">
      <path d={PATHS[props.name]} />
    </svg>
  );
}

export type Ctx = { host: ControlUiHost; t: T; h: HT; locale: string; query: string };

export function view<V>(host: ControlUiHost, name: string, params: Record<string, string> = {}) {
  return host.request<V>("nsvx.view", { view: name, params });
}

export const newKey = () => `oc-${crypto.randomUUID()}`;

export function Segments<K extends string>(props: {
  name: string;
  items: readonly K[];
  value: K;
  label: (key: K) => string;
  icon?: (key: K) => GlyphName;
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

/** A number tile; `tone` colors its edge so the state reads before the label. With `onClick` it opens its area. */
export function Tile(props: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  icon?: GlyphName;
  onClick?: () => void;
}) {
  const body = () => (
    <>
      <span>
        <Show when={props.icon}>{(icon) => <Glyph name={icon()} />}</Show>
        {props.label}
      </span>
      <strong>{props.value}</strong>
      <Show when={props.sub}>
        <small>{props.sub}</small>
      </Show>
    </>
  );
  const tone = () => ["nsvx-homes__tile", `nsvx-homes__tile--${props.tone ?? "off"}`];
  return (
    <Show when={props.onClick} fallback={<div class={tone()}>{body()}</div>}>
      {(click) => (
        <button
          type="button"
          class={[...tone(), "nsvx-homes__tile--link"]}
          onClick={() => click()()}
        >
          {body()}
        </button>
      )}
    </Show>
  );
}

/** The booking channel's official mark (Airbnb, Booking.com), or a plain label for direct and other bookings. */
export function StayMark(props: { source: string; label: string }) {
  const logo = () =>
    props.source === "airbnb"
      ? STAY_LOGOS.airbnb
      : props.source === "booking"
        ? STAY_LOGOS.booking
        : undefined;
  return (
    <Show when={logo()} fallback={<span class="nsvx-homes__source">{props.label}</span>}>
      {(mark) => (
        <svg
          viewBox="0 0 24 24"
          class="nsvx-homes__mark"
          role="img"
          aria-label={mark().title}
          style={{ fill: mark().color }}
        >
          <title>{mark().title}</title>
          <path d={mark().path} />
        </svg>
      )}
    </Show>
  );
}

export function Tiles(props: { label: string; children: JSX.Element }) {
  return (
    <div class="nsvx-homes__tiles" role="group" aria-label={props.label}>
      {props.children}
    </div>
  );
}

export function Chip(props: { tone: Tone; children: JSX.Element }) {
  return (
    <span class={["nsvx-homes__chip", `nsvx-homes__chip--${props.tone}`]}>{props.children}</span>
  );
}

export function Section(props: {
  title: string;
  icon?: GlyphName;
  count?: number;
  children: JSX.Element;
}) {
  return (
    <section class="nsvx-homes__section" aria-label={props.title}>
      <h3>
        <Show when={props.icon}>{(icon) => <Glyph name={icon()} />}</Show>
        <span>{props.title}</span>
        <Show when={props.count !== undefined}>
          <span class="nsvx-homes__count">{props.count}</span>
        </Show>
      </h3>
      {props.children}
    </section>
  );
}

export function Empty(props: { text: string }) {
  return <p class="nsvx__empty">{props.text}</p>;
}

/** Short date in the viewer's locale; NSVX dates are ISO days or timestamps. */
export function day(locale: string, value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const at = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(at.getTime())
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(at)
    : value;
}

/**
 * One owner tap on a fixed NSVX route. `confirm` asks once before a change; failures show NSVX's own words and
 * an unclear result says to check before repeating (the same tap is never retried on its own).
 */
export function Act(props: {
  ctx: Ctx;
  label: string;
  icon?: GlyphName;
  primary?: boolean;
  confirm?: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
  run: () => Promise<unknown>;
  onDone?: () => void;
}) {
  const h = () => props.ctx.h;
  const [asking, setAsking] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const go = async () => {
    setBusy(true);
    setNote(undefined);
    try {
      await props.run();
      setNote({ text: h()("done"), bad: false });
      props.onDone?.();
    } catch (cause) {
      const unclear = (cause as { gatewayCode?: string }).gatewayCode === "uncertain";
      setNote({ text: unclear ? h()("unclear") : errorMessage(props.ctx.host, cause), bad: true });
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };
  return (
    <span class="nsvx-homes__act">
      <Show
        when={asking()}
        fallback={
          <button
            type="button"
            class={[
              "nsvx__button",
              { "nsvx__button--primary": props.primary, "nsvx__button--icon": props.iconOnly },
            ]}
            disabled={props.disabled || busy()}
            aria-busy={busy() ? "true" : undefined}
            aria-label={props.iconOnly ? props.label : undefined}
            title={props.iconOnly ? props.label : undefined}
            onClick={() => (props.confirm ? setAsking(true) : void go())}
          >
            <Show when={props.icon}>{(icon) => <Glyph name={icon()} />}</Show>
            <Show when={!props.iconOnly}>
              <span>{props.label}</span>
            </Show>
          </button>
        }
      >
        <span class="nsvx-homes__confirm" role="group" aria-label={props.label}>
          <span>{props.label}?</span>
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            disabled={busy()}
            onClick={() => void go()}
          >
            {h()("confirm")}
          </button>
          <button type="button" class="nsvx__button" onClick={() => setAsking(false)}>
            {h()("cancel")}
          </button>
        </span>
      </Show>
      <Show when={note()}>
        {(n) => (
          <span class={["nsvx-homes__note", { "nsvx-homes__note--bad": n().bad }]} role="status">
            {n().text}
          </span>
        )}
      </Show>
    </span>
  );
}

/** Bars for a money series (positive up, negative down), with future months faded. */
export function Bars(props: {
  label: string;
  rows: { key: string; value: number | null; future?: boolean; title: string }[];
}) {
  const max = () => Math.max(1, ...props.rows.map((row) => Math.abs(row.value ?? 0)));
  const width = () => 100 / Math.max(1, props.rows.length);
  return (
    <svg
      class="nsvx-homes__bars"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      role="img"
      aria-label={props.label}
    >
      <line x1="0" x2="100" y1="20" y2="20" class="nsvx-homes__axis" />
      <For each={props.rows} keyed={(row) => row.key}>
        {(row, index) => {
          const h = () => (Math.abs(row().value ?? 0) / max()) * 19;
          return (
            <rect
              x={index() * width() + width() * 0.15}
              width={width() * 0.7}
              y={(row().value ?? 0) >= 0 ? 20 - h() : 20}
              height={Math.max(h(), 0.4)}
              class={[
                "nsvx-homes__bar",
                {
                  "nsvx-homes__bar--neg": (row().value ?? 0) < 0,
                  "nsvx-homes__bar--future": row().future,
                },
              ]}
            >
              <title>{row().title}</title>
            </rect>
          );
        }}
      </For>
    </svg>
  );
}

export type { HK };
