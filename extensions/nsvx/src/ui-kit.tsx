/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, Show } from "solid-js";
import type { MessageKey } from "./i18n.js";

export type T = (key: MessageKey) => string;
/** One source's lifecycle; `data` survives a failed refresh so rows never vanish. */
type Source<V> = { data?: V; error?: string; code?: string; loading: boolean };

const ICONS = {
  today:
    "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m4 11 2 2 4-4",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  work: "m8 9-3 3 3 3m8-6 3 3-3 3m-5 4 2-12",
  team: "M12 3v5m0 0a3 3 0 1 0 0 .01M5 21v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M12 11v4",
  actions: "M13 2 4 14h7l-1 8 9-12h-7z",
  progress: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  refresh: "M20 11a8 8 0 0 0-14.3-4L3 10m0-6v6h6m-5 3a8 8 0 0 0 14.3 4L21 14m0 6v-6h-6",
  decide: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  ask: "M8 10h8M8 14h5m-9 7 3-3h11a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13",
  done: "M5 12l5 5L20 7",
  alert:
    "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  pause: "M10 4H6v16h4zm8 0h-4v16h4z",
  plug: "M9 7V3m6 4V3M7 7h10v5a5 5 0 0 1-10 0zm5 10v4",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon(props: { name: IconName; class?: string | string[] }) {
  return (
    <svg viewBox="0 0 24 24" class={props.class ?? "nsvx__icon"} aria-hidden="true">
      <path d={ICONS[props.name]} />
    </svg>
  );
}

export function matches(query: string, ...values: (string | null | undefined)[]) {
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
          code: (cause as { gatewayCode?: string }).gatewayCode,
          loading: false,
        }));
      }
    }
  };
  return { state, refresh };
}

/** Connection states that need the owner, not a retry of the same request. */
const CONNECT_COPY: Record<string, { title: MessageKey; help: MessageKey }> = {
  unconfigured: { title: "unconfigured", help: "ownerUnconfiguredHelp" },
  "signed-out": { title: "signedOut", help: "ownerSignedOutHelp" },
  offline: { title: "offline", help: "offlineHelp" },
};

/** Shared loading, failure, sign-in, and retry states; loaded rows never return to a skeleton. */
export function SourceView<V>(props: {
  source: { state: () => Source<V>; refresh: () => Promise<void> };
  t: T;
  children: (data: () => V) => unknown;
}) {
  const data = createMemo(() => props.source.state().data);
  const connect = createMemo(() => {
    const state = props.source.state();
    return state.data === undefined && state.code ? CONNECT_COPY[state.code] : undefined;
  });
  return (
    <>
      <Show
        when={connect()}
        fallback={
          <Show when={props.source.state().error}>
            <p class="nsvx__error" role="alert">
              <span>{props.source.state().error}</span>
              <button
                type="button"
                class="nsvx__button"
                onClick={() => void props.source.refresh()}
              >
                {props.t("retry")}
              </button>
            </p>
          </Show>
        }
      >
        {(copy) => (
          <ConnectCard
            t={props.t}
            title={copy().title}
            help={copy().help}
            onRetry={() => void props.source.refresh()}
          />
        )}
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

export function ConnectCard(props: {
  t: T;
  title: MessageKey;
  help: MessageKey;
  address?: string;
  onRetry: () => void;
}) {
  return (
    <div class="nsvx-connect" role="status">
      <Icon name="plug" class="nsvx-connect__icon" />
      <strong>{props.t(props.title)}</strong>
      <span>{props.t(props.help)}</span>
      <Show when={props.address}>
        <code>{props.address}</code>
      </Show>
      <button type="button" class="nsvx__button" onClick={() => props.onRetry()}>
        {props.t("retry")}
      </button>
    </div>
  );
}

/** Short relative time ("5m", "3h", "2d") in the viewer's locale-neutral form. */
export function age(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(at)) {
    return "";
  }
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) {
    return "<1m";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}
