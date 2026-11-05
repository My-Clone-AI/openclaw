/** @jsxImportSource @solidjs/web */
/** Small primitives the AI tab views share: icons, provider marks, states, switches, bars, and changes. */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, Show } from "solid-js";
import type { AiChange } from "./ai-client.js";
import { providerMark, type Tone } from "./ai-data.js";
import type { AiT } from "./ai-i18n.js";
import { errorMessage, type T } from "./ui-kit.js";

const ICONS = {
  routes:
    "M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6m12-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6m0 0a9 9 0 0 1-9 9",
  accounts: "M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7m1 3h.01",
  cloneAi:
    "M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2m3 5h4v4h-4z",
  voice: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3m-7 9a7 7 0 0 0 14 0m-7 7v3",
  log: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  openclaw: "M12 2 3 7v10l9 5 9-5V7zm0 0v20M3 7l9 5 9-5",
  play: "M7 4v16l13-8z",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  skip: "M5 5v14l9-7zm14 0v14",
  restore: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5",
  star: "m12 3 2.7 5.6 6.2.9-4.5 4.4 1 6.1L12 17l-5.5 3 1-6.1L3 9.5l6.2-.9z",
  check: "M5 12l5 5L20 7",
  cross: "M6 6l12 12M18 6 6 18",
  chat: "M8 10h8M8 14h5m-9 7 3-3h11a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  repair: "m8 9-3 3 3 3m8-6 3 3-3 3m-5 4 2-12",
  legal: "M12 3v18M5 21h14M6 7h12M4 15l2-8 2 8a2 2 0 0 1-4 0m12 0 2-8 2 8a2 2 0 0 1-4 0",
  pdf_forms: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5M9 13h6m-6 4h4",
  lane: "M4 12h16m-4-4 4 4-4 4",
  // Brand marks, drawn small so each provider is recognizable at a glance.
  anthropic: "M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4",
  openai: "M12 2 21 7v10l-9 5-9-5V7zm0 5 4.5 2.5v5L12 17l-4.5-2.5v-5z",
  google: "M12 2c.5 5 5 9.5 10 10-5 .5-9.5 5-10 10-.5-5-5-9.5-10-10 5-.5 9.5-5 10-10z",
  muse: "M4 19V6l8 8 8-8v13",
} as const;

type IconKey = keyof typeof ICONS;

/** Lane ids NSVX uses, to the icon each lane shows. */
const LANE_ICON: Record<string, IconKey> = { normal: "chat", clone: "cloneAi" };

export function AiIcon(props: { name: string; class?: string | string[] }) {
  return (
    <svg viewBox="0 0 24 24" class={props.class ?? "nsvx__icon"} aria-hidden="true">
      <path
        d={ICONS[LANE_ICON[props.name] ?? (props.name in ICONS ? (props.name as IconKey) : "lane")]}
      />
    </svg>
  );
}

export function Mark(props: { id: string; size?: "sm" }) {
  const mark = () => providerMark(props.id);
  return (
    <span
      class={[
        "nsvx-ai-mark",
        `nsvx-ai-mark--${mark().family}`,
        { "nsvx-ai-mark--sm": props.size === "sm" },
      ]}
      aria-hidden="true"
    >
      <Show when={mark().family !== "other"} fallback={mark().letter}>
        <AiIcon name={mark().family} />
      </Show>
    </span>
  );
}

export function Dot(props: { tone: Tone; label: string }) {
  return (
    <span class={["nsvx-ai-state", `nsvx-ai-state--${props.tone}`]}>
      <span class="nsvx-ai-state__dot" aria-hidden="true" />
      {props.label}
    </span>
  );
}

export function Toggle(props: {
  checked: boolean;
  label: string;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked ? "true" : "false"}
      aria-label={props.label}
      title={props.label}
      class={["nsvx-ai-toggle", { "nsvx-ai-toggle--on": props.checked }]}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="nsvx-ai-toggle__knob" />
    </button>
  );
}

export function IconButton(props: {
  icon: string;
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class={["nsvx__button", "nsvx__button--icon", { "nsvx-ai-pressed": props.pressed }]}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? "true" : "false"}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <AiIcon name={props.icon} />
    </button>
  );
}

/** `count` bars compare counts in one chart, so they show no percentage. */
export function Bar(props: { value: number | null; label: string; tone?: Tone; count?: boolean }) {
  const pct = () => (props.value === null ? 0 : Math.round(props.value * 100));
  const shown = () => (props.count ? "" : props.value === null ? "—" : `${pct()}%`);
  return (
    <span class="nsvx-ai-bar" role="img" aria-label={`${props.label} ${shown()}`}>
      <span class="nsvx-ai-bar__label">{props.label}</span>
      <span class="nsvx-ai-bar__track">
        <span
          class={["nsvx-ai-bar__fill", props.tone ? `nsvx-ai-bar__fill--${props.tone}` : ""]}
          style={{ width: `${pct()}%` }}
        />
      </span>
      <span class="nsvx-ai-bar__value">{shown()}</span>
    </span>
  );
}

export type Notice = { text: string; bad?: boolean };

/** One change at a time per view; NSVX's answer is the readback, a failure re-reads the owner. */
export function createChanger<V>(
  host: ControlUiHost,
  at: AiT,
  source: { set: (data: V) => void; refresh: () => Promise<void> },
) {
  const [busy, setBusy] = createSignal("");
  const [notice, setNotice] = createSignal<Notice>();
  const run = async (
    key: string,
    change: AiChange,
    apply: (result: unknown) => V | undefined = (result) => result as V,
    done?: (result: unknown) => Notice | undefined,
  ) => {
    setBusy(key);
    setNotice(undefined);
    try {
      const result = await host.request("nsvx.ai.change", change);
      const next = apply(result);
      if (next !== undefined) {
        source.set(next);
      }
      setNotice(done?.(result) ?? { text: at("saved") });
    } catch (cause) {
      setNotice({ text: errorMessage(host, cause), bad: true });
      await source.refresh();
    } finally {
      setBusy("");
    }
  };
  return { busy, notice, run };
}

export function NoticeLine(props: { notice: Notice | undefined }) {
  return (
    <p
      class={["nsvx__notice", { "nsvx__notice--bad": props.notice?.bad }]}
      role={props.notice?.bad ? "alert" : "status"}
    >
      {props.notice?.text ?? ""}
    </p>
  );
}

export type ViewProps = { host: ControlUiHost; t: T; at: AiT; query: string };
