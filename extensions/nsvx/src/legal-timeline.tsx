/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import {
  dueTone,
  FACT_CHOICES,
  FACT_TONE,
  shortDay,
  shortStamp,
  type Deadline,
  type FactStatus,
  type TimelineEvent,
} from "./legal-data.js";
import { changeCaseRequest, type LegalCtx } from "./legal-kit.js";
import { Choice, Field, Picks, Pill, Reveal, Toggle } from "./office-kit.js";
import { createSource, SourceView } from "./ui-kit.js";

function EventForm(props: {
  ctx: LegalCtx;
  caseRef: string;
  base?: TimelineEvent;
  close: () => void;
  onSaved: () => void;
}) {
  const ctx = () => props.ctx;
  const [title, setTitle] = createSignal(props.base?.title ?? "");
  const [date, setDate] = createSignal(props.base?.date ?? "");
  const [status, setStatus] = createSignal<FactStatus>(
    props.base?.status && props.base.status !== "ai_inference" ? props.base.status : "owner",
  );
  const action = createAction(ctx);
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await changeCaseRequest(ctx(), {
            action: "addEvent",
            key: props.caseRef,
            title: title(),
            on_date: date(),
            status: status(),
            evidence_ids: props.base?.evidence_ids ?? [],
            ...(props.base ? { supersedes: props.base.id } : {}),
          });
          props.onSaved();
          props.close();
        });
      }}
    >
      <Field
        label={ctx().lt("whatHappened")}
        value={title()}
        max={300}
        required
        onInput={setTitle}
      />
      <Field label={ctx().lt("date")} type="date" value={date()} onInput={setDate} />
      <Choice
        label={ctx().lt("state")}
        value={status()}
        options={FACT_CHOICES.map((value) => [value, ctx().lt(`fact_${value}`)] as const)}
        onChange={setStatus}
      />
      <Show when={props.base}>
        <p class="nsvx-of__muted nsvx-of__wide">{ctx().lt("originalKept")}</p>
      </Show>
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !title().trim()}
        >
          {ctx().lt("save")}
        </button>
      </div>
    </form>
  );
}

export function Timeline(props: { ctx: LegalCtx; caseRef: string }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ events: TimelineEvent[] }>(ctx().host, "caseTimeline", { id: props.caseRef }),
  );
  void source.refresh();
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__bar">
        <Reveal label={ctx().lt("addEvent")} icon="plus" disabled={!ctx().host.connection.canWrite}>
          {(close) => (
            <EventForm
              ctx={ctx()}
              caseRef={props.caseRef}
              close={close}
              onSaved={() => void source.refresh()}
            />
          )}
        </Reveal>
      </div>
      <SourceView source={source} t={ctx().t}>
        {(data) => (
          <ol class="nsvx-of__timeline">
            <For
              each={data().events}
              keyed={(event) => event.id}
              fallback={<p class="nsvx__empty">{ctx().lt("noEvents")}</p>}
            >
              {(event) => (
                <li>
                  <span class="nsvx-of__sub">
                    {event().date ? shortDay(event().date, ctx().locale) : ctx().lt("noDate")}
                    {event().precision !== "day" && event().date ? " ~" : ""}
                  </span>
                  <strong>{event().title}</strong>
                  <span class="nsvx-of__bar">
                    <Pill tone={FACT_TONE[event().status]}>
                      {ctx().lt(`fact_${event().status}`)}
                    </Pill>
                    <For each={event().codes} keyed={false}>
                      {(code) => <Pill icon="folder">{code()}</Pill>}
                    </For>
                    <Show when={!event().auto}>
                      <Reveal
                        label={ctx().lt("correct")}
                        disabled={!ctx().host.connection.canWrite}
                      >
                        {(close) => (
                          <EventForm
                            ctx={ctx()}
                            caseRef={props.caseRef}
                            base={event()}
                            close={close}
                            onSaved={() => void source.refresh()}
                          />
                        )}
                      </Reveal>
                    </Show>
                  </span>
                </li>
              )}
            </For>
          </ol>
        )}
      </SourceView>
    </div>
  );
}

const SUGGESTED_TASKS = [
  "taskContract",
  "taskBank",
  "taskDocs",
  "taskLetter",
  "taskLawyer",
  "taskReply",
];

export function Deadlines(props: { ctx: LegalCtx; caseRef: string }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ deadlines: Deadline[] }>(ctx().host, "caseDeadlines", { id: props.caseRef }),
  );
  void source.refresh();
  const action = createAction(ctx);
  const [title, setTitle] = createSignal("");
  const [kind, setKind] = createSignal<Deadline["kind"]>("task");
  const [date, setDate] = createSignal("");
  const [verified, setVerified] = createSignal(false);
  const [basis, setBasis] = createSignal("");
  const canWrite = () => ctx().host.connection.canWrite;
  // A confirmed legal deadline needs its date and its basis; without them NSVX keeps it "to confirm".
  const blocked = () =>
    !title().trim() || (kind() === "legal_deadline" && verified() && (!date() || !basis().trim()));
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__bar">
        <Reveal label={ctx().lt("addDeadline")} icon="plus" disabled={!canWrite()}>
          {(close) => (
            <form
              class="nsvx-of__form"
              onSubmit={(event) => {
                event.preventDefault();
                void action.run(async () => {
                  await changeCaseRequest(ctx(), {
                    action: "addDeadline",
                    key: props.caseRef,
                    title: title(),
                    kind: kind(),
                    due_date: date(),
                    verified: verified(),
                    basis: basis(),
                  });
                  setTitle("");
                  setDate("");
                  setVerified(false);
                  setBasis("");
                  await source.refresh();
                  close();
                });
              }}
            >
              <Picks
                options={SUGGESTED_TASKS.map((key) => ({ id: key, label: ctx().lt(key) }))}
                value={[]}
                onChange={(picked) => {
                  const key = picked[picked.length - 1];
                  if (key) {
                    setTitle(ctx().lt(key));
                  }
                }}
              />
              <Field
                label={ctx().lt("title")}
                value={title()}
                max={300}
                required
                onInput={setTitle}
              />
              <Choice
                label={ctx().lt("kind")}
                value={kind()}
                options={[
                  ["task", ctx().lt("task")],
                  ["legal_deadline", ctx().lt("legalDeadline")],
                  ["reminder", ctx().lt("reminder")],
                ]}
                onChange={setKind}
              />
              <Field label={ctx().lt("date")} type="date" value={date()} onInput={setDate} />
              <Show when={kind() === "legal_deadline"}>
                <Toggle
                  label={ctx().lt("confirmedDeadline")}
                  checked={verified()}
                  onChange={setVerified}
                />
                <Field label={ctx().lt("basis")} value={basis()} max={500} onInput={setBasis} />
              </Show>
              <div class="nsvx-dev__bar">
                <button
                  type="submit"
                  class="nsvx__button nsvx__button--primary"
                  disabled={action.busy() || blocked()}
                >
                  {ctx().lt("save")}
                </button>
              </div>
            </form>
          )}
        </Reveal>
      </div>
      <Note note={action.note()} />
      <SourceView source={source} t={ctx().t}>
        {(data) => (
          <ul class="nsvx-of__list">
            <For
              each={data().deadlines}
              keyed={(row) => row.id}
              fallback={<p class="nsvx__empty">{ctx().lt("noDeadlines")}</p>}
            >
              {(row) => (
                <li class={["nsvx-of__row", { "nsvx-of__row--done": row().status !== "open" }]}>
                  <input
                    type="checkbox"
                    aria-label={row().title}
                    checked={row().status === "done"}
                    disabled={action.busy() || !canWrite()}
                    onChange={(event) => {
                      const status = event.currentTarget.checked ? "done" : "open";
                      void action.run(async () => {
                        await changeCaseRequest(ctx(), {
                          action: "setDeadline",
                          key: props.caseRef,
                          deadlineId: row().id,
                          status,
                        });
                        await source.refresh();
                      });
                    }}
                  />
                  <span class="nsvx-of__main">
                    <strong>{row().title}</strong>
                    <Show when={row().basis}>
                      <span class="nsvx-of__sub">{row().basis}</span>
                    </Show>
                  </span>
                  <Pill tone={dueTone(row())} icon="agenda">
                    {row().due_date
                      ? shortDay(row().due_date, ctx().locale)
                      : ctx().lt("toConfirm")}
                  </Pill>
                  <Pill
                    tone={
                      row().kind === "legal_deadline" ? (row().verified ? "ok" : "warn") : "off"
                    }
                  >
                    {ctx().lt(
                      row().kind === "legal_deadline"
                        ? row().verified
                          ? "confirmedDeadline"
                          : "legalDeadline"
                        : row().kind === "task"
                          ? "task"
                          : "reminder",
                    )}
                  </Pill>
                </li>
              )}
            </For>
          </ul>
        )}
      </SourceView>
    </div>
  );
}

export function History(props: { ctx: LegalCtx; caseRef: string }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ history: { at: string; actor: string; action: string }[] }>(ctx().host, "caseHistory", {
      id: props.caseRef,
    }),
  );
  void source.refresh();
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => (
        <ol class="nsvx-of__timeline">
          <For
            each={data().history}
            keyed={false}
            fallback={<p class="nsvx__empty">{ctx().lt("noHistory")}</p>}
          >
            {(row) => (
              <li>
                <span class="nsvx-of__sub">
                  {shortStamp(row().at, ctx().locale)} ·{" "}
                  {ctx().lt(row().actor === "owner" ? "you" : "system")}
                </span>
                <span>{row().action}</span>
              </li>
            )}
          </For>
        </ol>
      )}
    </SourceView>
  );
}
