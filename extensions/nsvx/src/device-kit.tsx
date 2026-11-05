/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import type { DT } from "./device-i18n.js";
import { errorMessage, Icon, type IconName, type T } from "./ui-kit.js";

export type Ctx = { host: ControlUiHost; t: T; dt: DT; query: string };

export function view<V>(host: ControlUiHost, name: string, params: Record<string, string> = {}) {
  return host.request<V>("nsvx.view", { view: name, params });
}

export function Segs<K extends string>(props: {
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

/** One owner tap: busy while it runs, then a short result line; uncertain and conflict get their own words. */
export function createAction(ctx: () => Ctx) {
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<{ text: string; bad: boolean; code?: string }>();
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
        text:
          code === "uncertain"
            ? ctx().dt("uncertain")
            : code === "conflict"
              ? ctx().dt("changedElsewhere")
              : errorMessage(ctx().host, cause),
        bad: true,
        ...(code ? { code } : {}),
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, note, run };
}

export function Note(props: { note: { text: string; bad: boolean } | undefined }) {
  return (
    <Show when={props.note}>
      {(shown) => (
        <p role="status" class={["nsvx__notice", { "nsvx__notice--bad": shown().bad }]}>
          {shown().text}
        </p>
      )}
    </Show>
  );
}

/** A destructive or outward tap asks once more in place; no modal. */
export function ConfirmButton(props: {
  label: string;
  confirm: string;
  cancel: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = createSignal(false);
  return (
    <Show
      when={asking()}
      fallback={
        <button
          type="button"
          class={["nsvx__button", { "nsvx__button--danger": props.danger }]}
          disabled={props.disabled}
          onClick={() => setAsking(true)}
        >
          <Show when={props.icon}>{(icon) => <Icon name={icon()} />}</Show>
          <span>{props.label}</span>
        </button>
      }
    >
      <span class="nsvx-dev__confirm">
        <button type="button" class="nsvx__button" onClick={() => setAsking(false)}>
          {props.cancel}
        </button>
        <button
          type="button"
          class={["nsvx__button", props.danger ? "nsvx__button--danger" : "nsvx__button--primary"]}
          disabled={props.disabled}
          onClick={() => {
            setAsking(false);
            props.onConfirm();
          }}
        >
          {props.confirm}
        </button>
      </span>
    </Show>
  );
}
