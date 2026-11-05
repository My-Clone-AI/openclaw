/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show, type JSX } from "solid-js";
import type { DT } from "./desk-i18n.js";
import { errorMessage, Icon, type IconName, type T } from "./ui-kit.js";

/** Shared pieces of the Cases, Research, and Marketing views. They reuse the Group view's styles. */

export type Tone = "ok" | "warn" | "bad" | "busy" | "off";
export type DeskCtx = { host: ControlUiHost; t: T; d: DT; query: string; locale: string };

export const isUncertain = (cause: unknown) =>
  (cause as { gatewayCode?: string }).gatewayCode === "uncertain";

/**
 * One owner tap: busy while it runs, the error in words, and "uncertain" spelled out so nobody repeats a change NSVX
 * may already have made.
 */
export function createAct(ctx: () => DeskCtx) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const run = async <V,>(method: string, params: Record<string, unknown>): Promise<V | undefined> => {
    setBusy(true);
    setError(undefined);
    try {
      return await ctx().host.request<V>(method, params);
    } catch (cause) {
      setError(isUncertain(cause) ? ctx().d("uncertain") : errorMessage(ctx().host, cause));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

export function ErrorLine(props: { error: string | undefined }) {
  return (
    <Show when={props.error}>
      <p class="nsvx__error" role="alert">
        {props.error}
      </p>
    </Show>
  );
}

export function ToneChip(props: { tone: Tone; label: string; icon?: IconName }) {
  return (
    <span class={["nsvx-grp__status", `nsvx-desk__tone--${props.tone}`]}>
      <Show when={props.icon} fallback={<span class={["nsvx-grp__dot", `nsvx-desk__dot--${props.tone}`]} />}>
        {(icon) => <Icon name={icon()} class="nsvx-desk__chip-icon" />}
      </Show>
      {props.label}
    </span>
  );
}

export function Tile(props: {
  icon: IconName;
  label: string;
  value: string | number;
  tone?: Tone;
  pressed?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      class={["nsvx-grp__tile", "nsvx-desk__tile", `nsvx-desk__tile--${props.tone ?? "off"}`]}
      aria-pressed={props.onClick ? (props.pressed ? "true" : "false") : undefined}
      disabled={!props.onClick}
      onClick={() => props.onClick?.()}
    >
      <span class="nsvx-desk__tile-head">
        <Icon name={props.icon} />
        {props.label}
      </span>
      <strong>{props.value}</strong>
      <Show when={props.hint}>
        <small>{props.hint}</small>
      </Show>
    </button>
  );
}

export function IconButton(props: {
  icon: IconName;
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class={[
        "nsvx__button",
        { "nsvx__button--primary": props.primary, "nsvx__button--danger": props.danger },
      ]}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <Icon name={props.icon} />
      <span>{props.label}</span>
    </button>
  );
}

/** A tap that asks once more before it runs: for changes that reach people or cannot be undone. */
export function ConfirmButton(props: {
  d: DT;
  icon: IconName;
  label: string;
  question: string;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = createSignal(false);
  return (
    <Show
      when={asking()}
      fallback={
        <IconButton
          icon={props.icon}
          label={props.label}
          danger={props.danger}
          primary={props.primary}
          disabled={props.disabled}
          onClick={() => setAsking(true)}
        />
      }
    >
      <span class="nsvx-grp__confirm" role="group" aria-label={props.question}>
        <span>{props.question}</span>
        <button
          type="button"
          class={["nsvx__button", props.danger ? "nsvx__button--danger" : "nsvx__button--primary"]}
          disabled={props.disabled}
          onClick={() => {
            setAsking(false);
            props.onConfirm();
          }}
        >
          {props.d("confirm")}
        </button>
        <button type="button" class="nsvx__button" onClick={() => setAsking(false)}>
          {props.d("cancel")}
        </button>
      </span>
    </Show>
  );
}

export function Panel(props: { icon: IconName; title: string; children: JSX.Element; end?: JSX.Element }) {
  return (
    <section class="nsvx-grp__panel nsvx-desk__panel">
      <header class="nsvx-grp__panel-head">
        <Icon name={props.icon} />
        <strong>{props.title}</strong>
        {props.end}
      </header>
      {props.children}
    </section>
  );
}

export function BackButton(props: { d: DT; onClick: () => void }) {
  return (
    <button type="button" class="nsvx__button nsvx-grp__back" onClick={() => props.onClick()}>
      <Icon name="back" />
      <span>{props.d("back")}</span>
    </button>
  );
}

/** First letter of a name in a colored square: a face where NSVX has no photo. */
export function Initial(props: { name: string; size?: "sm" }) {
  let hash = 0;
  for (const char of props.name) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return (
    <span
      class={["nsvx-grp__mark", { "nsvx-grp__mark--sm": props.size === "sm" }]}
      style={{ "--nsvx-hue": String(hash) }}
      aria-hidden="true"
    >
      {props.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function Empty(props: { icon: IconName; text: string; children?: JSX.Element }) {
  return (
    <div class="nsvx-desk__empty">
      <Icon name={props.icon} class="nsvx-desk__empty-icon" />
      <span>{props.text}</span>
      {props.children}
    </div>
  );
}

export function when(locale: string, value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(at);
}

/** A small horizontal bar per key, for counts NSVX keeps (no invented numbers). */
export function Bars(props: { counts: Record<string, number>; empty: string }) {
  const max = () => Math.max(1, ...Object.values(props.counts));
  return (
    <Show when={Object.keys(props.counts).length > 0} fallback={<p class="nsvx-grp__note">{props.empty}</p>}>
      <ul class="nsvx-desk__bars">
        <For each={Object.entries(props.counts).toSorted((a, b) => b[1] - a[1])} keyed={(e) => e[0]}>
          {(entry) => (
            <li>
              <span>{entry()[0]}</span>
              <span class="nsvx-grp__bar-track">
                <span
                  class="nsvx-grp__bar-fill nsvx-grp__bar-fill--ok"
                  style={{ width: `${(entry()[1] / max()) * 100}%` }}
                />
              </span>
              <strong>{entry()[1]}</strong>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

/** The Group view's segmented control, with the shared tab glyphs. */
export function Seg<K extends string>(props: {
  name: string;
  items: readonly K[];
  value: K;
  label: (key: K) => string;
  icon?: (key: K) => IconName;
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
            <Show when={props.icon}>{(icon) => <Icon name={icon()(item())} />}</Show>
            <span>{props.label(item())}</span>
          </button>
        )}
      </For>
    </div>
  );
}
