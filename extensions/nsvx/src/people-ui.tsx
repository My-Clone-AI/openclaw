/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, onSettled, Show } from "solid-js";
import type { PT } from "./people-i18n.js";
import { createSource, errorMessage, Icon, type IconName, type T } from "./ui-kit.js";

export type Base = { host: ControlUiHost; t: T; pt: PT };

export type PeopleMethod = "nsvx.people.change" | "nsvx.groups.change";

/**
 * One owner change at a time per surface, with a visible outcome. A stale revision reloads instead of overwriting;
 * an uncertain result says so and is never repeated by itself.
 */
export function createChange(host: ControlUiHost, pt: PT, reload: () => unknown) {
  const [busy, setBusy] = createSignal<string>();
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const run = async <V,>(
    key: string,
    method: PeopleMethod,
    params: Record<string, unknown>,
    after?: (value: V) => unknown,
  ): Promise<V | undefined> => {
    setBusy(key);
    setNote(undefined);
    try {
      const value = await host.request<V>(method, params);
      setNote({ text: pt("done"), bad: false });
      await after?.(value);
      await reload();
      return value;
    } catch (cause) {
      const code = (cause as { gatewayCode?: string }).gatewayCode;
      setNote({
        text:
          code === "conflict"
            ? pt("changed")
            : code === "uncertain"
              ? pt("uncertain")
              : errorMessage(host, cause),
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

export type Change = ReturnType<typeof createChange>;

export function Note(props: { change: Change }) {
  return (
    <p class="nsvx-ppl__note" role="status" aria-live="polite">
      <Show when={props.change.note()}>
        {(note) => (
          <span class={["nsvx__notice", { "nsvx__notice--bad": note().bad }]}>{note().text}</span>
        )}
      </Show>
    </p>
  );
}

export function Section(props: {
  icon: IconName;
  title: string;
  count?: number;
  action?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <section class="nsvx-ppl-sec">
      <header class="nsvx-ppl-sec__head">
        <Icon name={props.icon} />
        <h3>{props.title}</h3>
        <Show when={props.count}>
          <span class="nsvx-ppl__count">{props.count}</span>
        </Show>
        <span class="nsvx-ppl-sec__action">{props.action}</span>
      </header>
      {props.children}
    </section>
  );
}

/** Icon button with its label as tooltip and accessible name. */
export function IconButton(props: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      class={["nsvx__button", "nsvx__button--icon", { "nsvx__button--danger": props.danger }]}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? "true" : "false"}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <Icon name={props.icon} />
    </button>
  );
}

export function Switch(props: {
  label: string;
  icon?: IconName;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      class="nsvx-ppl-switch"
      aria-checked={props.on ? "true" : "false"}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.on)}
    >
      <Show when={props.icon}>{(icon) => <Icon name={icon()} />}</Show>
      <span>{props.label}</span>
      <span class="nsvx-ppl-switch__track" aria-hidden="true" />
    </button>
  );
}

/** A second tap confirms; used for changes that drop drafts or delete. */
export function ConfirmBar(props: {
  pt: PT;
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
        {props.pt("cancel")}
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

/** Initial in a circle; the NSVX photo replaces it once loaded. */
export function PersonAvatar(props: {
  host: ControlUiHost;
  personId: string;
  name: string;
  large?: boolean;
  photo?: boolean;
}) {
  const image = createSource(props.host, () =>
    props.host.request<{ src: string }>("nsvx.view", {
      view: "personAvatar",
      params: { id: props.personId },
    }),
  );
  onSettled(() => {
    if (props.photo) {
      void image.refresh();
    }
  });
  return (
    <span class={["nsvx-avatar", { "nsvx-ppl-avatar--large": props.large }]} aria-hidden="true">
      <Show
        when={image.state().data?.src}
        fallback={
          <span class="nsvx-avatar__initial">
            {props.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
        }
      >
        {(src) => <img class="nsvx-ppl-avatar__img" src={src()} alt="" />}
      </Show>
    </span>
  );
}
