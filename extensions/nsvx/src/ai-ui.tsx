/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, onSettled, Show } from "solid-js";
import { markOf, type Lane, type Tone } from "./ai-data.js";
import { aiKey, type AiKey, type AT } from "./ai-i18n.js";
import { AI_LOGOS, type AiMark } from "./ai-logos.js";
import { errorMessage, Icon, type IconName, type T } from "./ui-kit.js";

export const LANE_ICONS: Record<Lane, IconName> = {
  normal: "messages",
  tasks: "tasks",
  repair: "work",
  legal: "scale",
  pdf_forms: "doc",
};

export type AiBase = { host: ControlUiHost; t: T; at: AT; query: string };

export function laneTitle(at: AT, lane: string): string {
  const key = aiKey("l_", lane);
  return key ? at(key) : lane;
}

/** The word for an NSVX code (`t_prepared`, `st_friendly`), or `fallback` when the catalog has none. */
export function codeLabel(
  at: AT,
  prefix: string,
  code: string | null | undefined,
  fallback: AiKey,
): string {
  return at(aiKey(prefix, code) ?? fallback);
}

export function effortLabel(at: AT, effort: string | null | undefined): string {
  const key = aiKey("e_", effort ?? "default");
  return key ? at(key) : (effort ?? "");
}

/** Repeats `load` while the page is visible; stops with the view. */
export function poll(load: () => unknown, ms: number) {
  onSettled(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, ms);
    return () => clearInterval(timer);
  });
}

/** Official provider mark on a light tile; Clone AI and Muse have no published mark, so they get the bot and spark. */
export function AiLogo(props: { provider: string | null | undefined; size?: "s" | "l" }) {
  const mark = () => markOf(props.provider);
  const brand = () => AI_LOGOS[mark() as AiMark] as (typeof AI_LOGOS)[AiMark] | undefined;
  return (
    <span
      class={["nsvx-ai-logo", { "nsvx-ai-logo--l": props.size === "l" }]}
      role="img"
      aria-label={brand()?.title ?? (mark() === "muse" ? "Muse" : "Clone AI")}
    >
      <Show
        when={brand()}
        fallback={<Icon name={mark() === "muse" ? "spark" : "bot"} class="nsvx-ai-logo__icon" />}
      >
        {(b) => (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={b().path} fill={b().color} />
          </svg>
        )}
      </Show>
    </span>
  );
}

export function StateChip(props: { tone: Tone; label: string }) {
  return (
    <span class={["nsvx-ai-chip", `nsvx-ai-chip--${props.tone}`]}>
      <span class="nsvx-ai-chip__dot" aria-hidden="true" />
      {props.label}
    </span>
  );
}

/** A 0..1 reading as a bar; `null` means NSVX had no fresh reading, shown as such rather than as zero. */
export function Meter(props: { label: string; value: number | null; at: AT; hint?: string }) {
  const pct = () => (props.value === null ? null : Math.round(props.value * 100));
  return (
    <div class="nsvx-ai-meter" title={props.hint}>
      <span class="nsvx-ai-meter__label">{props.label}</span>
      <Show
        when={pct() !== null}
        fallback={<span class="nsvx-ai-meter__track nsvx-ai-meter__track--unknown" />}
      >
        <span
          class="nsvx-ai-meter__track"
          role="meter"
          aria-label={props.label}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={String(pct())}
        >
          <span
            class={["nsvx-ai-meter__fill", { "nsvx-ai-meter__fill--hot": (pct() ?? 0) >= 90 }]}
            style={{ width: `${pct()}%` }}
          />
        </span>
      </Show>
      <span class="nsvx-ai-meter__value">{pct() === null ? props.at("unknown") : `${pct()}%`}</span>
    </div>
  );
}

/**
 * One AI change at a time per screen, with a visible outcome. NSVX answers with the new state, which `after`
 * shows; an uncertain result says so and is never repeated by itself.
 */
export function createAiChange(host: ControlUiHost, at: AT, reload: () => unknown) {
  const [busy, setBusy] = createSignal<string>();
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const run = async <V,>(
    key: string,
    params: Record<string, unknown>,
    after?: (value: V) => string | void,
  ): Promise<V | undefined> => {
    setBusy(key);
    setNote(undefined);
    try {
      const value = await host.request<V>("nsvx.ai.change", params);
      const text = after?.(value);
      setNote({ text: text ?? at("done"), bad: false });
      return value;
    } catch (cause) {
      const code = (cause as { gatewayCode?: string }).gatewayCode;
      setNote({
        text:
          code === "uncertain"
            ? at("uncertain")
            : code === "conflict"
              ? at("changed")
              : errorMessage(host, cause),
        bad: true,
      });
      if (code === "conflict" || code === "uncertain") {
        await reload();
      }
      return undefined;
    } finally {
      setBusy(undefined);
    }
  };
  return { busy, note, run };
}

export type AiChange = ReturnType<typeof createAiChange>;

export function ChangeNote(props: { change: AiChange }) {
  return (
    <p class="nsvx-ai__note" role="status" aria-live="polite">
      <Show when={props.change.note()}>
        {(note) => (
          <span class={["nsvx__notice", { "nsvx__notice--bad": note().bad }]}>{note().text}</span>
        )}
      </Show>
    </p>
  );
}

/** A second tap confirms changes that are hard to take back. */
export function Confirm(props: {
  at: AT;
  text: string;
  label: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div class="nsvx-confirm" role="group" aria-label={props.label}>
      <span class="nsvx-confirm__text">{props.text}</span>
      <button type="button" class="nsvx__button" onClick={() => props.onCancel()}>
        {props.at("cancel")}
      </button>
      <button
        type="button"
        class="nsvx__button nsvx__button--danger"
        disabled={props.busy}
        onClick={() => props.onConfirm()}
      >
        {props.label}
      </button>
    </div>
  );
}
