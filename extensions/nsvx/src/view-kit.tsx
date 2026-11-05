/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, Show } from "solid-js";
import type { MessageKey } from "./i18n.js";

export type Tab = "team" | "actions" | "progress";
export type T = (key: MessageKey) => string;
/** One source's lifecycle; `data` survives a failed refresh so rows never vanish. */
export type Source<V> = { data?: V; error?: string; loading: boolean };

export const ICONS: Record<Tab | "refresh" | "stop" | "task", string> = {
  team: "M12 3v5m0 0a3 3 0 1 0 0 .01M5 21v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M12 11v4",
  actions: "M13 2 4 14h7l-1 8 9-12h-7z",
  progress: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  stop: "M6 6h12v12H6z",
  task: "M4 12 20 4l-4 16-4-7zm8 1 8-9",
  refresh: "M20 11a8 8 0 0 0-14.3-4L3 10m0-6v6h6m-5 3a8 8 0 0 0 14.3 4L21 14m0 6v-6h-6",
};

export function Icon(props: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" class="nsvx__icon" aria-hidden="true">
      <path d={ICONS[props.name]} />
    </svg>
  );
}

export function matches(query: string, ...values: (string | undefined)[]) {
  const needle = query.trim().toLowerCase();
  return !needle || values.some((value) => value?.toLowerCase().includes(needle));
}

export function errorMessage(host: ControlUiHost, cause: unknown) {
  return host.redact(cause instanceof Error ? cause.message : String(cause));
}

/** Loads a source, dropping any answer that a newer load or disposal has replaced. */
export function createSource<V>(host: ControlUiHost, load: () => Promise<V>) {
  const [state, setState] = createSignal<Source<V>>({ loading: false });
  let generation = 0;
  const refresh = async () => {
    const id = ++generation;
    setState((previous) => ({ ...previous, loading: true }));
    try {
      const data = await load();
      if (id === generation && !host.signal.aborted) {
        setState({ data, loading: false });
      }
    } catch (cause) {
      if (id === generation && !host.signal.aborted) {
        setState((previous) => ({
          data: previous.data,
          error: errorMessage(host, cause),
          loading: false,
        }));
      }
    }
  };
  return { state, refresh };
}

/** Shared loading, failure, and retry states; loaded rows never return to a skeleton. */
export function SourceView<V>(props: {
  source: { state: () => Source<V>; refresh: () => Promise<void> };
  t: T;
  children: (data: () => V) => unknown;
}) {
  const data = createMemo(() => props.source.state().data);
  return (
    <>
      <Show when={props.source.state().error}>
        <p class="nsvx__error" role="alert">
          <span>{props.source.state().error}</span>
          <button type="button" class="nsvx__button" onClick={() => void props.source.refresh()}>
            {props.t("retry")}
          </button>
        </p>
      </Show>
      <Show
        when={data()}
        fallback={
          <Show when={!props.source.state().error}>
            <p class="nsvx__empty" aria-busy="true">
              {props.t("loading")}
            </p>
          </Show>
        }
      >
        {(loaded) => props.children(loaded) as never}
      </Show>
    </>
  );
}
