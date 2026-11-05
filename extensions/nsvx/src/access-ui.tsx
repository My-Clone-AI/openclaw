/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import { screenPoint, screenSrc, type Screen, type Tone } from "./access-data.js";
import type { AT } from "./access-i18n.js";
import { errorMessage, Icon, type IconName, type T } from "./ui-kit.js";

export type Ctx = { host: ControlUiHost; t: T; a: AT; query: string; locale: string };

export function view<V>(host: ControlUiHost, name: string, params: Record<string, string> = {}) {
  return host.request<V>("nsvx.view", { view: name, params });
}

export const isUncertain = (cause: unknown) =>
  (cause as { gatewayCode?: string }).gatewayCode === "uncertain";
export const isConflict = (cause: unknown) =>
  (cause as { gatewayCode?: string }).gatewayCode === "conflict";

export function Chip(props: { a: AT; tone: Tone; label?: string }) {
  return (
    <span class={["nsvx-acc__chip", `nsvx-acc__chip--${props.tone}`]}>
      <span class="nsvx-acc__dot" aria-hidden="true" />
      {props.label ?? props.a(props.tone)}
    </span>
  );
}

export function Tiles(props: {
  items: { label: string; value: number; tone: Tone; icon: IconName }[];
}) {
  return (
    <div class="nsvx-acc__tiles">
      <For each={props.items} keyed={(item) => item.label}>
        {(item) => (
          <div class={["nsvx-acc__tile", `nsvx-acc__tile--${item().tone}`]}>
            <Icon name={item().icon} />
            <strong>{item().value}</strong>
            <span>{item().label}</span>
          </div>
        )}
      </For>
    </div>
  );
}

export function Empty(props: { icon: IconName; text: string }) {
  return (
    <p class="nsvx-acc__empty">
      <Icon name={props.icon} />
      <span>{props.text}</span>
    </p>
  );
}

/** Short relative time, or "never". */
export function since(locale: string, iso: string | null | undefined, never: string) {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(at)) {
    return never;
  }
  const minutes = Math.round((at - Date.now()) / 60_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (Math.abs(minutes) < 60) {
    return format.format(minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  return Math.abs(hours) < 48
    ? format.format(hours, "hour")
    : format.format(Math.round(hours / 24), "day");
}

/**
 * A button that runs one Gateway change. `confirm` asks first; an uncertain answer says so instead of offering a
 * blind retry, because NSVX may already have applied it.
 */
export function Action(props: {
  ctx: Ctx;
  label: string;
  icon?: IconName;
  method: string;
  params: () => Record<string, unknown>;
  confirm?: boolean;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
  /** The caller shows the result itself (no "Done" note). */
  quiet?: boolean;
  onDone?: (result: unknown) => void;
}) {
  const a = props.ctx.a;
  const [asking, setAsking] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const run = async () => {
    setBusy(true);
    setNote(undefined);
    try {
      const result = await props.ctx.host.request(props.method, props.params());
      setAsking(false);
      setNote(props.quiet ? undefined : { text: a("done"), bad: false });
      props.onDone?.(result);
    } catch (cause) {
      setNote({
        text: isUncertain(cause) ? a("uncertain") : errorMessage(props.ctx.host, cause),
        bad: true,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <span class="nsvx-acc__act">
      <Show
        when={asking()}
        fallback={
          <button
            type="button"
            class={[
              "nsvx__button",
              {
                "nsvx__button--danger": props.danger,
                "nsvx__button--primary": props.primary,
              },
            ]}
            disabled={busy() || props.disabled}
            aria-busy={busy() ? "true" : "false"}
            onClick={() => (props.confirm ? setAsking(true) : void run())}
          >
            <Show when={props.icon}>{(icon) => <Icon name={icon()} />}</Show>
            {props.label}
          </button>
        }
      >
        <span class="nsvx-acc__confirm" role="group" aria-label={props.label}>
          <button
            type="button"
            class={[
              "nsvx__button",
              props.danger ? "nsvx__button--danger" : "nsvx__button--primary",
            ]}
            disabled={busy()}
            onClick={() => void run()}
          >
            {a("confirm")} · {props.label}
          </button>
          <button
            type="button"
            class="nsvx__button"
            disabled={busy()}
            onClick={() => setAsking(false)}
          >
            {a("cancel")}
          </button>
        </span>
      </Show>
      <Show when={note()}>
        {(n) => (
          <span class={["nsvx-acc__note", { "nsvx-acc__note--bad": n().bad }]} role="status">
            {n().text}
          </span>
        )}
      </Show>
    </span>
  );
}

const SCREEN_KEYS = [
  { key: "Tab", label: "⇥" },
  { key: "Shift+Tab", label: "⇤" },
  { key: "Enter", label: "⏎" },
  { key: "Escape", label: "Esc" },
] as const;

/**
 * NSVX's remote browser page as an image: a tap becomes a click at the same spot in NSVX's browser, keys and
 * scroll go the same way. NSVX answers each input with or without a new screen; `onInput` reloads it.
 */
export function RemoteScreen(props: {
  ctx: Ctx;
  screen: Screen;
  alt: string;
  send: (input: Record<string, unknown>) => Promise<unknown>;
  onInput: () => void;
  typing?: boolean;
  scroll?: boolean;
}) {
  const a = props.ctx.a;
  const [busy, setBusy] = createSignal(false);
  const [text, setText] = createSignal("");
  const [error, setError] = createSignal<string>();
  const input = async (value: Record<string, unknown>) => {
    if (busy()) {
      return;
    }
    setBusy(true);
    try {
      await props.send(value);
      setError(undefined);
      props.onInput();
    } catch (cause) {
      setError(errorMessage(props.ctx.host, cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="nsvx-acc__screen">
      <button
        type="button"
        class="nsvx-acc__screen-tap"
        aria-label={a("tapScreen")}
        disabled={busy()}
        onClick={(event) => {
          if (event.detail === 0) {
            void input({ kind: "key", key: "Enter" });
            return;
          }
          const box = event.currentTarget.getBoundingClientRect();
          void input({
            kind: "click",
            ...screenPoint(props.screen, box, { x: event.clientX, y: event.clientY }),
          });
        }}
      >
        <img src={screenSrc(props.screen)} alt={props.alt} draggable="false" />
      </button>
      <div class="nsvx-acc__keys">
        <For each={SCREEN_KEYS} keyed={(k) => k.key}>
          {(k) => (
            <button
              type="button"
              class="nsvx__button"
              aria-label={k().key}
              disabled={busy()}
              onClick={() => void input({ kind: "key", key: k().key })}
            >
              {k().label}
            </button>
          )}
        </For>
        <Show when={props.scroll}>
          <button
            type="button"
            class="nsvx__button"
            aria-label={a("scrollUp")}
            disabled={busy()}
            onClick={() => void input({ kind: "scroll", dy: -300 })}
          >
            ↑
          </button>
          <button
            type="button"
            class="nsvx__button"
            aria-label={a("scrollDown")}
            disabled={busy()}
            onClick={() => void input({ kind: "scroll", dy: 300 })}
          >
            ↓
          </button>
        </Show>
      </div>
      <Show when={props.typing}>
        <form
          class="nsvx-acc__type"
          onSubmit={(event) => {
            event.preventDefault();
            const value = text();
            if (value) {
              void input({ kind: "type", text: value }).then(() => setText(""));
            }
          }}
        >
          <input
            class="nsvx-acc__input"
            aria-label={a("type")}
            placeholder={a("type")}
            autocomplete="off"
            value={text()}
            onInput={(event) => setText(event.currentTarget.value)}
          />
          <button type="submit" class="nsvx__button" disabled={busy() || !text()}>
            <Icon name="send" />
            {a("send")}
          </button>
        </form>
      </Show>
      <Show when={error()}>
        <p class="nsvx__error" role="alert">
          {error()}
        </p>
      </Show>
    </div>
  );
}
