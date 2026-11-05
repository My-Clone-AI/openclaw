/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import {
  SETTLED_STATES,
  todayKey,
  type CalendarEvent,
  type Intent,
  type Preview,
} from "./agenda-data.js";
import type { AgendaKey, AT } from "./agenda-i18n.js";
import { BrandLogo } from "./messages-ui.js";
import { createSource, errorMessage, SourceView, type T } from "./ui-kit.js";

const PATHS = {
  back: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
  plus: "M12 5v14M5 12h14",
  spark:
    "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  download: "M12 3v12m0 0-5-5m5 5 5-5M4 21h16",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11m0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  check: "M5 12l5 5L20 7",
  alert:
    "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14",
  copy: "M8 8h12v12H8zM4 16V4h12",
  external: "M14 4h6v6m0-6L10 14M18 14v6H4V6h6",
  refresh: "M20 11a8 8 0 0 0-14.3-4L3 10m0-6v6h6m-5 3a8 8 0 0 0 14.3 4L21 14m0 6v-6h-6",
  doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5M9 13h6m-6 4h4",
  task: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  close: "M6 6l12 12M18 6 6 18",
} as const;

export function Glyph(props: { name: keyof typeof PATHS; class?: string }) {
  return (
    <svg viewBox="0 0 24 24" class={props.class ?? "nsvx__icon"} aria-hidden="true">
      <path d={PATHS[props.name]} />
    </svg>
  );
}

export type Ctx = { host: ControlUiHost; t: T; at: AT; zone: string };

export function view<V>(host: ControlUiHost, name: string, params: Record<string, string> = {}) {
  return host.request<V>("nsvx.view", { view: name, params });
}

export function dayLabel(ctx: Ctx, key: string) {
  if (key === todayKey(ctx.zone)) {
    return ctx.at("today");
  }
  return new Intl.DateTimeFormat(ctx.host.locale, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${key}T12:00:00Z`));
}

export function timeOf(ctx: Ctx, iso: string | null) {
  return iso
    ? new Intl.DateTimeFormat(ctx.host.locale, {
        timeZone: ctx.zone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "";
}

export function whenText(ctx: Ctx, event: CalendarEvent) {
  return event.all_day ? ctx.at("allDay") : `${timeOf(ctx, event.start)}–${timeOf(ctx, event.end)}`;
}

export function intentKey(intent: Pick<Intent, "state">): AgendaKey {
  switch (intent.state) {
    case "accepted":
    case "failed":
    case "blocked":
    case "cancelled":
    case "unknown":
      return `st_${intent.state}`;
    case "in_flight":
      return "st_running";
    default:
      return "st_queued";
  }
}

export function intentTone(intent: Pick<Intent, "state">) {
  return intent.state === "accepted"
    ? "ok"
    : intent.state === "failed" || intent.state === "blocked"
      ? "bad"
      : "run";
}

export function Seg<K extends string>(props: {
  items: K[];
  value: K;
  label: (key: K) => string;
  name: string;
  onChange: (key: K) => void;
}) {
  return (
    <div class="nsvx-seg" role="radiogroup" aria-label={props.name}>
      <For each={props.items}>
        {(item) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === item ? "true" : "false"}
            class={["nsvx-seg__item", { "nsvx-seg__item--on": props.value === item }]}
            onClick={() => props.onChange(item)}
          >
            {props.label(item)}
          </button>
        )}
      </For>
    </div>
  );
}

async function track(ctx: Ctx, intent: Intent, onState: (intent: Intent) => void) {
  let current = intent;
  for (let tries = 0; tries < 40 && !SETTLED_STATES.includes(current.state); tries += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
    if (ctx.host.signal.aborted) {
      return;
    }
    current = await view<Intent>(ctx.host, "workspaceIntent", { id: current.id });
    onState(current);
  }
}

/** Shows NSVX's exact terms for a change, then runs exactly those terms once and follows Google's answer. */
export function ChangeFlow(props: {
  ctx: Ctx;
  built: { operation: string; payload: Record<string, unknown> };
  clientKey: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { ctx } = props;
  const preview = createSource(ctx.host, () =>
    ctx.host.request<Preview>("nsvx.agenda.preview", props.built),
  );
  void preview.refresh();
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const [intent, setIntent] = createSignal<Intent>();
  const commitLabel = (terms: Preview): AgendaKey => {
    const external = terms.effect === "external";
    if (props.built.operation === "calendar.cancel_event") {
      return "cancelEvent";
    }
    if (props.built.operation === "calendar.update_event") {
      return external ? "saveTell" : "save";
    }
    return external ? "bookInvite" : "book";
  };
  const commit = async (terms: Preview) => {
    setBusy(true);
    setNote(undefined);
    try {
      const started = await ctx.host.request<Intent>("nsvx.agenda.submit", {
        ...props.built,
        termsHash: terms.terms_hash,
        clientKey: props.clientKey,
      });
      setIntent(started);
      await track(ctx, started, setIntent);
      if (intent()?.state === "accepted" || started.state === "accepted") {
        setTimeout(props.onDone, 900);
      }
    } catch (cause) {
      const code = (cause as { gatewayCode?: string }).gatewayCode;
      if (code === "conflict") {
        setNote({ text: ctx.at("termsChanged"), bad: true });
        void preview.refresh();
      } else {
        setNote({
          text: code === "uncertain" ? ctx.at("uncertain") : errorMessage(ctx.host, cause),
          bad: true,
        });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="nsvx-agenda__review">
      <SourceView source={preview} t={ctx.t}>
        {(terms) => (
          <>
            <p class="nsvx-agenda__terms">{terms().summary}</p>
            <ul class="nsvx-agenda__facts">
              <li>
                <BrandLogo channel="googlecalendar" size={18} />
                <span>{ctx.at("account")}</span>
                <strong>{terms().account}</strong>
              </li>
              <li class={terms().effect === "external" ? "nsvx-agenda__fact--warn" : ""}>
                <Glyph name={terms().effect === "external" ? "send" : "lock"} />
                <strong>{ctx.at(terms().effect === "external" ? "guestsTold" : "onlyYou")}</strong>
              </li>
            </ul>
            <Show
              when={intent()}
              fallback={
                <div class="nsvx-agenda__actions">
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={busy()}
                    onClick={() => props.onBack()}
                  >
                    {ctx.at("back")}
                  </button>
                  <button
                    type="button"
                    class={[
                      "nsvx__button",
                      props.built.operation === "calendar.cancel_event"
                        ? "nsvx__button--danger"
                        : "nsvx__button--primary",
                    ]}
                    disabled={busy() || !ctx.host.connection.canWrite}
                    onClick={() => void commit(terms())}
                  >
                    <Glyph name={terms().effect === "external" ? "send" : "check"} />
                    <span>{ctx.at(commitLabel(terms()))}</span>
                  </button>
                </div>
              }
            >
              {(current) => (
                <div class="nsvx-agenda__progress" role="status" aria-live="polite">
                  <span class={["nsvx__dot", `nsvx__dot--${intentTone(current())}`]} />
                  <strong>{ctx.at(intentKey(current()))}</strong>
                  <Show when={current().state === "unknown"}>
                    <span>{ctx.at("uncertain")}</span>
                  </Show>
                  <Show when={current().error}>
                    <span class="nsvx__notice--bad">{current().error}</span>
                  </Show>
                  <Show when={SETTLED_STATES.includes(current().state)}>
                    <button type="button" class="nsvx__button" onClick={props.onDone}>
                      {ctx.t("close")}
                    </button>
                  </Show>
                </div>
              )}
            </Show>
          </>
        )}
      </SourceView>
      <Show when={note()}>
        {(shown) => (
          <p class={["nsvx__notice", { "nsvx__notice--bad": shown().bad }]} role="alert">
            {shown().text}
          </p>
        )}
      </Show>
    </div>
  );
}
