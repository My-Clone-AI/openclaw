/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { Icon, type IconName } from "./ui-kit.js";

/** Small form and status parts shared by the Legal, Research, and Marketing tabs (`office.css`). */
export type OfficeTone = "ok" | "run" | "warn" | "bad" | "off";

export function Pill(props: { tone?: OfficeTone; icon?: IconName; children: unknown }) {
  return (
    <span class={["nsvx-of__pill", `nsvx-of__pill--${props.tone ?? "off"}`]}>
      <Show when={props.icon}>{(icon) => <Icon name={icon()} />}</Show>
      <span>{props.children as never}</span>
    </span>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onInput: (value: string) => void;
  type?: string;
  rows?: number;
  max?: number;
  min?: string;
  required?: boolean;
  placeholder?: string;
  mode?: "text" | "decimal" | "numeric";
}) {
  return (
    <label class="nsvx-of__field">
      <span>{props.label}</span>
      <Show
        when={props.rows}
        fallback={
          <input
            type={props.type ?? "text"}
            value={props.value}
            required={props.required}
            maxlength={props.max}
            min={props.min}
            placeholder={props.placeholder}
            inputmode={props.mode}
            onInput={(event) => props.onInput(event.currentTarget.value)}
          />
        }
      >
        <textarea
          rows={props.rows}
          value={props.value}
          required={props.required}
          maxlength={props.max}
          placeholder={props.placeholder}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
      </Show>
    </label>
  );
}

export function Choice<V extends string>(props: {
  label: string;
  value: V;
  options: readonly (readonly [V, string])[];
  onChange: (value: V) => void;
  disabled?: boolean;
}) {
  return (
    <label class="nsvx-of__field">
      <span>{props.label}</span>
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.currentTarget.value as V)}
      >
        <For each={props.options} keyed={(option) => option[0]}>
          {(option) => (
            <option value={option()[0]} selected={option()[0] === props.value}>
              {option()[1]}
            </option>
          )}
        </For>
      </select>
    </label>
  );
}

export function Toggle(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label class="nsvx-of__toggle">
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

/** A multi-pick row of small chips; the picked ones are filled. */
export function Picks(props: {
  options: readonly { id: string; label: string; title?: string }[];
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div class="nsvx-of__picks">
      <For each={props.options} keyed={(option) => option.id}>
        {(option) => {
          const on = () => props.value.includes(option().id);
          return (
            <button
              type="button"
              class={["nsvx-of__pick", { "nsvx-of__pick--on": on() }]}
              title={option().title}
              aria-pressed={on() ? "true" : "false"}
              onClick={() =>
                props.onChange(
                  on()
                    ? props.value.filter((id) => id !== option().id)
                    : [...props.value, option().id],
                )
              }
            >
              {option().label}
            </button>
          );
        }}
      </For>
    </div>
  );
}

export function Stats(props: {
  items: readonly {
    icon: IconName;
    label: string;
    value: string;
    sub?: string | undefined;
    tone?: OfficeTone | undefined;
    onClick?: (() => void) | undefined;
  }[];
}) {
  return (
    <div class="nsvx-of__stats">
      <For each={props.items} keyed={(item) => item.label}>
        {(item) => (
          <button
            type="button"
            class={["nsvx-of__stat", item().tone ? `nsvx-of__stat--${item().tone}` : ""]}
            disabled={!item().onClick}
            onClick={() => item().onClick?.()}
          >
            <Icon name={item().icon} />
            <strong>{item().value}</strong>
            <span>{item().label}</span>
            <Show when={item().sub}>
              <small>{item().sub}</small>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}

export function Panel(props: {
  title: string;
  icon?: IconName;
  count?: number;
  action?: unknown;
  children: unknown;
}) {
  return (
    <section class="nsvx-of__panel">
      <header class="nsvx-of__panel-head">
        <Show when={props.icon}>{(icon) => <Icon name={icon()} />}</Show>
        <h3>{props.title}</h3>
        <Show when={props.count}>
          <span class="nsvx-of__count">{props.count}</span>
        </Show>
        <span class="nsvx-of__panel-action">{props.action as never}</span>
      </header>
      {props.children as never}
    </section>
  );
}

/** Opens a short form in place, under its button; no modal, so phones keep their scroll position. */
export function Reveal(props: {
  label: string;
  icon?: IconName;
  primary?: boolean;
  disabled?: boolean;
  children: (close: () => void) => unknown;
}) {
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <button
        type="button"
        class={["nsvx__button", { "nsvx__button--primary": props.primary && !open() }]}
        aria-expanded={open() ? "true" : "false"}
        disabled={props.disabled}
        onClick={() => setOpen(!open())}
      >
        <Show when={props.icon}>{(icon) => <Icon name={icon()} />}</Show>
        <span>{props.label}</span>
      </button>
      <Show when={open()}>
        <div class="nsvx-of__reveal">{props.children(() => setOpen(false)) as never}</div>
      </Show>
    </>
  );
}

/** Bytes as a short size; empty when NSVX does not know. */
export function sizeWord(bytes: number | null | undefined): string {
  if (!bytes) {
    return "";
  }
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
