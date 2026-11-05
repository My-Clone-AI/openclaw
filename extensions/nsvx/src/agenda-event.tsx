/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  cancelPayload,
  dayKey,
  followUpPayload,
  REPLY_STANCES,
  type CalendarEvent,
  type EventDetail,
  type MeetingAiKind,
  type Reminder,
} from "./agenda-data.js";
import type { AgendaKey } from "./agenda-i18n.js";
import {
  ChangeFlow,
  dayLabel,
  Glyph,
  intentKey,
  intentTone,
  timeOf,
  view,
  whenText,
  type Ctx,
} from "./agenda-ui.js";
import { BrandLogo } from "./messages-ui.js";
import { createSource, errorMessage, SourceView } from "./ui-kit.js";

export function EventView(props: {
  ctx: Ctx;
  id: string;
  onBack: () => void;
  onEdit: (event: CalendarEvent) => void;
  onCancelled: () => void;
  onMission: (id: string) => void;
}) {
  const { ctx } = props;
  const detail = createSource(ctx.host, () =>
    view<EventDetail>(ctx.host, "calendarEvent", { id: props.id }),
  );
  void detail.refresh();
  const [cancelling, setCancelling] = createSignal(false);
  const [notify, setNotify] = createSignal(true);
  // The change under review: cancelling the event or the follow-up email, each with its own NSVX client key.
  const [pending, setPending] = createSignal<{
    built: { operation: string; payload: Record<string, unknown> };
    key: string;
  }>();
  const [mail, setMail] = createSignal<{ subject: string; body: string }>();
  const [remindAt, setRemindAt] = createSignal<string>();
  const reminders = createSource(ctx.host, () =>
    view<{ reminders: Reminder[] }>(ctx.host, "ownerReminders", { kind: "calendar" }),
  );
  void reminders.refresh();
  const reminder = () =>
    reminders.state().data?.reminders.find((item) => item.target_id === props.id);
  const [help, setHelp] = createSignal<{
    kind: MeetingAiKind;
    text: string | null;
    busy: boolean;
  }>();
  const [stance, setStance] = createSignal<(typeof REPLY_STANCES)[number]>("neutral");
  const [notice, setNotice] = createSignal<string>();
  const cancelKey = crypto.randomUUID();
  const mailKey = crypto.randomUUID();
  const remind = async (action: "set" | "dismiss", label: string) => {
    const at = remindAt();
    try {
      await ctx.host.request("nsvx.agenda.remind", {
        eventId: props.id,
        action,
        label,
        // datetime-local is the browser's wall time; NSVX stores an instant.
        ...(action === "set" && at ? { at: new Date(at).toISOString() } : {}),
      });
      setRemindAt(undefined);
      setNotice(action === "set" ? ctx.at("reminderSet") : undefined);
    } catch (cause) {
      setNotice(errorMessage(ctx.host, cause));
    } finally {
      await reminders.refresh();
    }
  };
  const ask = async (kind: MeetingAiKind) => {
    setHelp({ kind, text: null, busy: true });
    try {
      const result = await ctx.host.request<{ text: string | null }>("nsvx.agenda.help", {
        eventId: props.id,
        kind,
        stance: stance(),
      });
      setHelp({ kind, text: result.text ?? ctx.at("noText"), busy: false });
    } catch (cause) {
      setHelp({ kind, text: errorMessage(ctx.host, cause), busy: false });
    }
  };
  const follow = async (action: "refresh" | "agenda" | "minutes") => {
    try {
      await ctx.host.request("nsvx.agenda.meeting", { eventId: props.id, action });
      setNotice(ctx.at("asked"));
      setTimeout(() => void detail.refresh(), 5000);
    } catch (cause) {
      setNotice(errorMessage(ctx.host, cause));
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(ctx.at("copied"));
    } catch (cause) {
      setNotice(errorMessage(ctx.host, cause));
    }
  };
  return (
    <div class="nsvx-agenda__detail">
      <button
        type="button"
        class="nsvx__button nsvx-agenda__back"
        aria-label={ctx.at("back")}
        onClick={() => props.onBack()}
      >
        <Glyph name="back" />
        <span>{ctx.at("agenda")}</span>
      </button>
      <SourceView source={detail} t={ctx.t}>
        {(data) => {
          const event = () => data().event;
          const guests = () => event().attendees.filter((attendee) => !attendee.self);
          return (
            <>
              <header class="nsvx-agenda__head">
                <BrandLogo channel="googlecalendar" size={40} />
                <div class="nsvx-agenda__main">
                  <h2>{event().summary}</h2>
                  <span>
                    {dayLabel(ctx, dayKey(event(), ctx.zone))} · {whenText(ctx, event())}
                  </span>
                  <Show when={event().location}>
                    <span class="nsvx-agenda__meta-item">
                      <Glyph name="pin" />
                      {event().location}
                    </span>
                  </Show>
                </div>
              </header>
              <Show
                when={pending()}
                fallback={
                  <>
                    <div class="nsvx-agenda__actions nsvx-agenda__actions--start">
                      <Show when={event().meet_url}>
                        {(url) => (
                          <a
                            class="nsvx__button nsvx__button--primary"
                            href={url()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <BrandLogo channel="googlemeet" size={18} />
                            <span>{ctx.at("join")}</span>
                          </a>
                        )}
                      </Show>
                      <Show when={event().can_edit}>
                        <button
                          type="button"
                          class="nsvx__button"
                          disabled={!ctx.host.connection.canWrite}
                          onClick={() => props.onEdit(event())}
                        >
                          <Glyph name="edit" />
                          <span>{ctx.at("change")}</span>
                        </button>
                        <button
                          type="button"
                          class="nsvx__button nsvx__button--danger"
                          disabled={!ctx.host.connection.canWrite}
                          onClick={() => setCancelling(!cancelling())}
                        >
                          <Glyph name="trash" />
                          <span>{ctx.at("cancelEvent")}</span>
                        </button>
                      </Show>
                      <Show when={event().html_link}>
                        {(link) => (
                          <a
                            class="nsvx__button nsvx__button--icon"
                            href={link()}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={ctx.at("google")}
                            title={ctx.at("google")}
                          >
                            <Glyph name="external" />
                          </a>
                        )}
                      </Show>
                      <Show when={guests().length > 0}>
                        <button
                          type="button"
                          class="nsvx__button"
                          aria-pressed={mail() ? "true" : "false"}
                          disabled={!ctx.host.connection.canWrite}
                          onClick={() =>
                            setMail(
                              mail()
                                ? undefined
                                : {
                                    subject: `${ctx.at("followUpSubject")}${event().summary}`,
                                    body: "",
                                  },
                            )
                          }
                        >
                          <BrandLogo channel="gmail" size={18} />
                          <span>{ctx.at("followUp")}</span>
                        </button>
                      </Show>
                      <button
                        type="button"
                        class="nsvx__button"
                        aria-pressed={remindAt() !== undefined ? "true" : "false"}
                        disabled={!ctx.host.connection.canWrite}
                        onClick={() => setRemindAt(remindAt() === undefined ? "" : undefined)}
                      >
                        <Glyph name="bell" />
                        <span>{ctx.at("remind")}</span>
                      </button>
                    </div>
                    <Show when={reminder()}>
                      {(set) => (
                        <p class="nsvx-agenda__reminder" role="status">
                          <Glyph name="bell" />
                          <span>
                            {dayLabel(
                              ctx,
                              dayKey(
                                { start: set().due_at, start_date: null, all_day: false },
                                ctx.zone,
                              ),
                            )}{" "}
                            · {timeOf(ctx, set().due_at)}
                          </span>
                          <button
                            type="button"
                            class="nsvx__button nsvx__button--icon"
                            aria-label={ctx.at("dismiss")}
                            title={ctx.at("dismiss")}
                            disabled={!ctx.host.connection.canWrite}
                            onClick={() => void remind("dismiss", event().summary)}
                          >
                            <Glyph name="check" />
                          </button>
                        </p>
                      )}
                    </Show>
                    <Show when={remindAt() !== undefined}>
                      <form
                        class="nsvx-agenda__remind-form"
                        onSubmit={(submit) => {
                          submit.preventDefault();
                          void remind("set", event().summary);
                        }}
                      >
                        <label class="nsvx-field">
                          <span>{ctx.at("remindAt")}</span>
                          <input
                            type="datetime-local"
                            required
                            value={remindAt() ?? ""}
                            onInput={(input) => setRemindAt(input.currentTarget.value)}
                          />
                        </label>
                        <button
                          type="submit"
                          class="nsvx__button nsvx__button--primary"
                          disabled={!remindAt()}
                        >
                          <Glyph name="check" />
                          <span>{ctx.at("save")}</span>
                        </button>
                      </form>
                    </Show>
                    <Show when={mail()}>
                      {(draft) => (
                        <div class="nsvx-agenda__mail">
                          <div class="nsvx-agenda__to">
                            <span class="nsvx-agenda__meta">{ctx.at("to")}</span>
                            <For each={guests()} keyed={(attendee) => attendee.email}>
                              {(attendee) => <span class="nsvx__chip">{attendee().email}</span>}
                            </For>
                          </div>
                          <label class="nsvx-field">
                            <span>{ctx.at("subject")}</span>
                            <input
                              value={draft().subject}
                              maxlength={250}
                              onInput={(input) =>
                                setMail({ ...draft(), subject: input.currentTarget.value })
                              }
                            />
                          </label>
                          <label class="nsvx-field">
                            <span>{ctx.at("message")}</span>
                            <textarea
                              rows={6}
                              value={draft().body}
                              onInput={(input) =>
                                setMail({ ...draft(), body: input.currentTarget.value })
                              }
                            />
                          </label>
                          <div class="nsvx-agenda__actions">
                            <button
                              type="button"
                              class="nsvx__button"
                              disabled={!draft().body.trim()}
                              onClick={() =>
                                setPending({
                                  built: followUpPayload(event(), draft(), false),
                                  key: `${mailKey}:draft`,
                                })
                              }
                            >
                              <Glyph name="doc" />
                              <span>{ctx.at("draft")}</span>
                            </button>
                            <button
                              type="button"
                              class="nsvx__button nsvx__button--primary"
                              disabled={!draft().body.trim()}
                              onClick={() =>
                                setPending({
                                  built: followUpPayload(event(), draft(), true),
                                  key: mailKey,
                                })
                              }
                            >
                              <Glyph name="send" />
                              <span>{ctx.at("review")}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </Show>
                    <Show when={!event().can_edit}>
                      <p class="nsvx__notice">
                        <Glyph name="lock" /> {ctx.at("organizerOnly")}
                        {event().organizer ? ` · ${event().organizer}` : ""}
                      </p>
                    </Show>
                    <Show when={cancelling()}>
                      <div class="nsvx-confirm nsvx-agenda__confirm">
                        <Show when={guests().length > 0}>
                          <label class="nsvx-agenda__switch">
                            <input
                              type="checkbox"
                              checked={notify()}
                              onChange={(change) => setNotify(change.currentTarget.checked)}
                            />
                            <span>{ctx.at("notify")}</span>
                          </label>
                        </Show>
                        <button
                          type="button"
                          class="nsvx__button"
                          onClick={() => setCancelling(false)}
                        >
                          {ctx.at("keep")}
                        </button>
                        <button
                          type="button"
                          class="nsvx__button nsvx__button--danger"
                          onClick={() =>
                            setPending({ built: cancelPayload(event(), notify()), key: cancelKey })
                          }
                        >
                          {ctx.at("review")}
                        </button>
                      </div>
                    </Show>
                  </>
                }
              >
                {(shown) => (
                  <ChangeFlow
                    ctx={ctx}
                    built={shown().built}
                    clientKey={shown().key}
                    onBack={() => {
                      setPending(undefined);
                      setCancelling(false);
                    }}
                    onDone={() => {
                      if (shown().key === cancelKey) {
                        props.onCancelled();
                        return;
                      }
                      setPending(undefined);
                      setMail(undefined);
                      void detail.refresh();
                    }}
                  />
                )}
              </Show>
              <Show when={notice()}>
                <p class="nsvx__notice" role="status">
                  {notice()}
                </p>
              </Show>
              <Show when={guests().length > 0}>
                <h3 class="nsvx__heading">
                  {ctx.at("guests")} · {guests().length}
                </h3>
                <ul class="nsvx-agenda__people">
                  <For each={guests()} keyed={(attendee) => attendee.email}>
                    {(attendee) => (
                      <li>
                        <span class="nsvx-agenda__initial" aria-hidden="true">
                          {(attendee().name ?? attendee().email).slice(0, 1).toUpperCase()}
                        </span>
                        <span class="nsvx-agenda__main">
                          <span class="nsvx-agenda__title">
                            {attendee().name ?? attendee().email}
                          </span>
                          <Show when={attendee().name}>
                            <span class="nsvx-agenda__meta">{attendee().email}</span>
                          </Show>
                        </span>
                        <span
                          class={[
                            "nsvx__chip",
                            `nsvx-agenda__rsvp--${attendee().response ?? "needsAction"}`,
                          ]}
                        >
                          {ctx.at(`rsvp_${attendee().response ?? "needsAction"}` as AgendaKey) ??
                            attendee().response}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={event().meet_url}>
                <h3 class="nsvx__heading nsvx-agenda__brand-head">
                  <BrandLogo channel="googlemeet" size={16} />
                  {ctx.at("meeting")}
                </h3>
                <ul class="nsvx-agenda__facts">
                  <li>
                    <Glyph name="clock" />
                    <span class="nsvx__chip">{ctx.at(`m_${data().meeting.status}`)}</span>
                  </li>
                  <Show when={data().meeting.participants.length > 0}>
                    <li>
                      <Glyph name="people" />
                      <span>{ctx.at("joined")}</span>
                      <strong>{data().meeting.participants.join(", ")}</strong>
                    </li>
                  </Show>
                  <For each={Object.entries(data().meeting.artifacts)} keyed={([kind]) => kind}>
                    {(artifact) => (
                      <li>
                        <Glyph name="doc" />
                        <span>{ctx.at(artifact()[0] as AgendaKey) ?? artifact()[0]}</span>
                        <span class="nsvx__chip">
                          {artifact()[1]
                            .map((state) => ctx.at(`a_${state}` as AgendaKey) ?? state)
                            .join(", ")}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={!ctx.host.connection.canWrite}
                  onClick={() => void follow("refresh")}
                >
                  <Glyph name="refresh" />
                  <span>{ctx.at("checkMeet")}</span>
                </button>
              </Show>
              <h3 class="nsvx__heading">
                <Glyph name="spark" /> clone
              </h3>
              <div class="nsvx-agenda__actions nsvx-agenda__actions--start">
                <button type="button" class="nsvx__button" onClick={() => void ask("prep")}>
                  {ctx.at("prep")}
                </button>
                <button type="button" class="nsvx__button" onClick={() => void ask("agenda")}>
                  {ctx.at("agendaDraft")}
                </button>
                <span class="nsvx-agenda__reply">
                  <select
                    aria-label={ctx.at("reply")}
                    onChange={(change) =>
                      setStance(change.currentTarget.value as (typeof REPLY_STANCES)[number])
                    }
                  >
                    <For each={[...REPLY_STANCES]}>
                      {(value) => (
                        <option value={value} selected={value === stance()}>
                          {ctx.at(`r_${value}`)}
                        </option>
                      )}
                    </For>
                  </select>
                  <button type="button" class="nsvx__button" onClick={() => void ask("reply")}>
                    {ctx.at("reply")}
                  </button>
                </span>
              </div>
              <Show when={help()}>
                {(shown) => (
                  <div class="nsvx-agenda__help" aria-busy={shown().busy ? "true" : "false"}>
                    <textarea
                      rows={6}
                      aria-label={ctx.at(
                        shown().kind === "prep"
                          ? "prep"
                          : shown().kind === "agenda"
                            ? "agendaDraft"
                            : "reply",
                      )}
                      readonly={shown().busy}
                      value={shown().busy ? ctx.t("loading") : (shown().text ?? "")}
                      onInput={(input) => setHelp({ ...shown(), text: input.currentTarget.value })}
                    />
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={shown().busy || !shown().text}
                      onClick={() => void copy(shown().text ?? "")}
                    >
                      <Glyph name="copy" />
                      <span>{ctx.at("copy")}</span>
                    </button>
                  </div>
                )}
              </Show>
              <h3 class="nsvx__heading">{ctx.at("docs")}</h3>
              <ul class="nsvx-agenda__docs">
                <For each={data().documents} keyed={(doc) => doc.id}>
                  {(doc) => (
                    <li>
                      <Glyph name="doc" />
                      <Show when={doc().web_link} fallback={<span>{doc().title}</span>}>
                        {(link) => (
                          <a href={link()} target="_blank" rel="noopener noreferrer">
                            {doc().title}
                          </a>
                        )}
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
              <div class="nsvx-agenda__actions nsvx-agenda__actions--start">
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={!ctx.host.connection.canWrite}
                  onClick={() => void follow("agenda")}
                >
                  <Glyph name="doc" />
                  <span>{ctx.at("agendaDoc")}</span>
                </button>
                <Show when={data().meeting.status === "ended"}>
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={!ctx.host.connection.canWrite}
                    onClick={() => void follow("minutes")}
                  >
                    <Glyph name="doc" />
                    <span>{ctx.at("minutes")}</span>
                  </button>
                </Show>
              </div>
              <Show when={data().mission}>
                {(mission) => (
                  <button
                    type="button"
                    class="nsvx-row nsvx-row--link"
                    onClick={() => props.onMission(mission().id)}
                  >
                    <Glyph name="task" class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{mission().title}</span>
                      <span class="nsvx-row__detail">{ctx.at("task")}</span>
                    </span>
                    <Glyph name="next" class="nsvx-row__icon" />
                  </button>
                )}
              </Show>
              <Show when={data().intents.length > 0}>
                <h3 class="nsvx__heading">{ctx.at("changes")}</h3>
                <ul class="nsvx-agenda__facts">
                  <For each={data().intents} keyed={(intent) => intent.id}>
                    {(intent) => (
                      <li>
                        <span class={["nsvx__dot", `nsvx__dot--${intentTone(intent())}`]} />
                        <span class="nsvx-agenda__main">
                          {intent().summary ?? intent().operation}
                        </span>
                        <span class="nsvx__chip">{ctx.at(intentKey(intent()))}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}
