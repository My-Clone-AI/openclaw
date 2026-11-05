/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, Show } from "solid-js";
import {
  SETTLED_INTENT_STATES,
  type AgendaEvent,
  type AgendaIntent,
  type AgendaPreview,
} from "./agenda-data.js";
import { errorMessage, type T } from "./ui-kit.js";

export const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Lisbon";

const GLYPHS = {
  prev: "m15 18-6-6 6-6",
  next: "m9 18 6-6-6-6",
  plus: "M12 5v14M5 12h14",
  video: "m16 10 5-3v10l-5-3zM3 6h13v12H3z",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11m0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  spark:
    "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  back: "M19 12H5m6-6-6 6 6 6",
  live: "M20 11a8 8 0 0 0-14.3-4L3 10m0-6v6h6m-5 3a8 8 0 0 0 14.3 4L21 14m0 6v-6h-6",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
} as const;

export function Glyph(props: { name: keyof typeof GLYPHS }) {
  return (
    <svg viewBox="0 0 24 24" class="nsvx__icon" aria-hidden="true">
      <path d={GLYPHS[props.name]} />
    </svg>
  );
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const newKey = () => `oc-${crypto.randomUUID()}`;

export function timeText(locale: string, iso: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function rangeText(locale: string, event: AgendaEvent, t: T) {
  if (event.all_day || !event.start) {
    return t("allDay");
  }
  return event.end
    ? `${timeText(locale, event.start)}–${timeText(locale, event.end)}`
    : timeText(locale, event.start);
}

export function dayText(locale: string, day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

const REPLY: Record<string, { glyph: string; tone: string }> = {
  accepted: { glyph: "✓", tone: "ok" },
  declined: { glyph: "✕", tone: "bad" },
  tentative: { glyph: "?", tone: "warn" },
  needsAction: { glyph: "•", tone: "muted" },
};

export function ReplyMark(props: { response: string | null }) {
  const mark = () => REPLY[props.response ?? "needsAction"] ?? REPLY.needsAction;
  return (
    <span class={["nsvx-reply", `nsvx-reply--${mark()!.tone}`]} aria-hidden="true">
      {mark()!.glyph}
    </span>
  );
}

/** How long the page follows an NSVX change before leaving it to the event's own status. */
const INTENT_WAIT_MS = 45_000;

/** Follows one NSVX intent until it settles, the wait ends, or the page closes. */
async function followIntent(
  host: ControlUiHost,
  id: string,
  onState: (intent: AgendaIntent) => void,
): Promise<AgendaIntent | undefined> {
  const until = Date.now() + INTENT_WAIT_MS;
  let last: AgendaIntent | undefined;
  while (!host.signal.aborted && Date.now() < until) {
    last = await host.request<AgendaIntent>("nsvx.view", { view: "agendaIntent", params: { id } });
    onState(last);
    if ((SETTLED_INTENT_STATES as readonly string[]).includes(last.state)) {
      return last;
    }
    await sleep(1500);
  }
  return last;
}

type Change = { operation: string; payload: Record<string, unknown> };

/**
 * Preview, then confirm: NSVX shows the exact terms (who gets an invitation, from which account) and runs the change
 * only with that terms hash. One key per opened change, so a repeated confirm replays instead of inviting twice.
 */
export function ChangeReview(props: {
  host: ControlUiHost;
  t: T;
  change: () => Change;
  label: string;
  danger?: boolean;
  onSettled: (intent: AgendaIntent) => void;
}) {
  const [preview, setPreview] = createSignal<AgendaPreview>();
  const [intent, setIntent] = createSignal<AgendaIntent>();
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const key = newKey();
  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await step();
    } catch (cause) {
      const code = (cause as { gatewayCode?: string }).gatewayCode;
      if (code === "conflict") {
        setPreview(undefined);
        setNotice(props.t("changedReview"));
      } else {
        setNotice(code === "uncertain" ? props.t("uncertain") : errorMessage(props.host, cause));
      }
    } finally {
      setBusy(false);
    }
  };
  const review = () =>
    run(async () => {
      setPreview(await props.host.request<AgendaPreview>("nsvx.agenda.preview", props.change()));
    });
  const confirm = (shown: AgendaPreview) =>
    run(async () => {
      const started = await props.host.request<AgendaIntent>("nsvx.agenda.act", {
        ...props.change(),
        termsHash: shown.terms_hash,
        clientKey: key,
      });
      setIntent(started);
      const settled = await followIntent(props.host, started.id, setIntent);
      if (settled && (SETTLED_INTENT_STATES as readonly string[]).includes(settled.state)) {
        props.onSettled(settled);
      }
    });
  return (
    <div class="nsvx-review">
      <Show
        when={preview()}
        fallback={
          <button
            type="button"
            class={[
              "nsvx__button",
              props.danger ? "nsvx__button--danger" : "nsvx__button--primary",
            ]}
            disabled={busy() || !props.host.connection.canWrite}
            onClick={() => void review()}
          >
            {props.label}
          </button>
        }
      >
        {(shown) => (
          <div class="nsvx-review__terms" role="group" aria-label={props.t("review")}>
            <p class="nsvx-review__summary">{shown().summary}</p>
            <p class="nsvx-review__account">
              <span class={["nsvx__chip", { "nsvx__chip--write": shown().effect === "external" }]}>
                {props.t(shown().effect === "external" ? "notifiesGuests" : "onlyYou")}
              </span>
              <span>{shown().account}</span>
            </p>
            <Show
              when={intent()}
              fallback={
                <span class="nsvx-review__actions">
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={busy()}
                    onClick={() => setPreview(undefined)}
                  >
                    {props.t("back")}
                  </button>
                  <button
                    type="button"
                    class={[
                      "nsvx__button",
                      props.danger ? "nsvx__button--danger" : "nsvx__button--primary",
                    ]}
                    disabled={busy()}
                    onClick={() => void confirm(shown())}
                  >
                    {props.t("confirm")}
                  </button>
                </span>
              }
            >
              {(current) => (
                <p class="nsvx-review__state" role="status">
                  <span
                    class={[
                      "nsvx__dot",
                      current().state === "accepted"
                        ? "nsvx__dot--ok"
                        : (SETTLED_INTENT_STATES as readonly string[]).includes(current().state)
                          ? "nsvx__dot--bad"
                          : "nsvx__dot--run",
                    ]}
                    aria-hidden="true"
                  />
                  {current().lifecycle_label}
                  <Show when={current().error}>
                    <span class="nsvx-review__error">{current().error}</span>
                  </Show>
                </p>
              )}
            </Show>
          </div>
        )}
      </Show>
      <Show when={notice()}>
        <p class="nsvx__notice nsvx__notice--bad" role="alert">
          {notice()}
        </p>
      </Show>
    </div>
  );
}
