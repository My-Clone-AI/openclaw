/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { saveNsvxFile } from "./aviation-kit.js";
import { ConfirmButton, createAction, Note, Segs, view } from "./device-kit.js";
import { LegalAi } from "./legal-ai.js";
import {
  CASE_SECTIONS,
  dueTone,
  eur,
  FACT_TONE,
  isZero,
  shortDay,
  shortStamp,
  STATUS_TONE,
  type CaseDetail,
  type CaseExport,
  type CaseSection,
  type CaseStatus,
  type Deadline,
  type Evidence,
  type FactStatus,
  type TimelineEvent,
} from "./legal-data.js";
import { LegalDocs } from "./legal-docs.js";
import { LegalMoney } from "./legal-money.js";
import { LegalProofs } from "./legal-proofs.js";
import { changeCaseRequest, type LegalCtx } from "./legal-tab.js";
import { every } from "./messages-ui.js";
import { Choice, Field, Panel, Picks, Pill, Reveal, Stats, Toggle, sizeWord } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, SourceView, type IconName } from "./ui-kit.js";

const SECTION_ICON: Record<CaseSection, IconName> = {
  summary: "doc",
  timeline: "history",
  evidence: "folder",
  money: "euro",
  documents: "edit",
  ai: "bot",
  deadlines: "agenda",
  history: "activity",
};

const STATUSES: CaseStatus[] = ["open", "waiting_docs", "attention", "resolved", "archived"];
const FACT_CHOICES: FactStatus[] = ["owner", "confirmed", "extracted", "disputed"];

export type CaseProps = { ctx: LegalCtx; row: CaseDetail; reload: () => Promise<void> };

function EditCase(props: CaseProps & { close: () => void }) {
  const ctx = () => props.ctx;
  const row = () => props.row;
  const [values, setValues] = createSignal<Record<string, string>>({
    title: row().title,
    issue: row().issue ?? "",
    description: row().description ?? "",
    stage: row().stage ?? "",
    jurisdiction: row().jurisdiction ?? "",
    court: row().court ?? "",
    external_ref: row().external_ref ?? "",
    procedure: row().procedure ?? "",
    governing_law: row().governing_law ?? "",
    legal_rep: row().legal_rep ?? "",
    amount_claimed: row().amount_claimed ?? "",
    amount_disputed: row().amount_disputed ?? "",
    notes: row().notes ?? "",
    outcome: row().outcome ?? "",
  });
  const [nature, setNature] = createSignal(row().nature);
  const [priority, setPriority] = createSignal(row().priority);
  const [categories, setCategories] = createSignal(row().categories);
  const action = createAction(ctx);
  const field = (name: string, label: string, rows?: number) => (
    <Field
      label={label}
      value={values()[name] ?? ""}
      {...(rows ? { rows } : {})}
      onInput={(value) => setValues({ ...values(), [name]: value })}
    />
  );
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await changeCaseRequest(ctx(), {
            action: "update",
            key: row().ref,
            revision: row().revision,
            ...values(),
            nature: nature(),
            priority: priority(),
            categories: categories(),
          });
          await props.reload();
          props.close();
        });
      }}
    >
      {field("title", ctx().lt("title"))}
      {field("issue", ctx().lt("issue"), 2)}
      {field("description", ctx().lt("description"), 3)}
      <Choice
        label={ctx().lt("kind")}
        value={nature()}
        options={[
          ["potential", ctx().lt("potential")],
          ["formal", ctx().lt("formal")],
        ]}
        onChange={setNature}
      />
      <Choice
        label={ctx().lt("priority")}
        value={priority()}
        options={Object.entries(ctx().vocab()?.priority ?? { [priority()]: priority() })}
        onChange={setPriority}
      />
      <Picks
        options={Object.entries(ctx().vocab()?.categories ?? {}).map(([id, value]) => ({
          id,
          label: value.label,
        }))}
        value={categories()}
        onChange={setCategories}
      />
      {field("stage", ctx().lt("stage"))}
      {field("jurisdiction", ctx().lt("jurisdiction"))}
      {field("court", ctx().lt("court"))}
      {field("external_ref", ctx().lt("externalRef"))}
      {field("procedure", ctx().lt("procedure"))}
      {field("governing_law", ctx().lt("law"))}
      {field("legal_rep", ctx().lt("lawyer"))}
      {field("amount_claimed", ctx().lt("claimed"))}
      {field("amount_disputed", ctx().lt("disputedAmount"))}
      {field("notes", ctx().lt("notes"), 3)}
      {field("outcome", ctx().lt("outcome"), 2)}
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !values().title?.trim()}
        >
          {ctx().lt("save")}
        </button>
      </div>
    </form>
  );
}

function AddParty(props: CaseProps & { close: () => void }) {
  const ctx = () => props.ctx;
  const [name, setName] = createSignal("");
  const [role, setRole] = createSignal("respondent");
  const [kind, setKind] = createSignal("person");
  const [contact, setContact] = createSignal("");
  const action = createAction(ctx);
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await changeCaseRequest(ctx(), {
            action: "addParty",
            key: props.row.ref,
            name: name(),
            role: role(),
            kind: kind(),
            contact: contact(),
          });
          await props.reload();
          props.close();
        });
      }}
    >
      <Field label={ctx().lt("nameAsDocs")} value={name()} max={200} required onInput={setName} />
      <Choice
        label={ctx().lt("role")}
        value={role()}
        options={[
          ["respondent", ctx().lt("respondent")],
          ["claimant", ctx().lt("claimant")],
          ["witness", ctx().lt("witness")],
          ["lawyer", ctx().lt("lawyerRole")],
          ["other", ctx().lt("other")],
        ]}
        onChange={setRole}
      />
      <Choice
        label={ctx().lt("kind")}
        value={kind()}
        options={[
          ["person", ctx().lt("person")],
          ["company", ctx().lt("company")],
          ["public_body", ctx().lt("publicBody")],
        ]}
        onChange={setKind}
      />
      <Field label={ctx().lt("contact")} value={contact()} max={500} onInput={setContact} />
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !name().trim()}
        >
          {ctx().lt("save")}
        </button>
      </div>
    </form>
  );
}

function AddFact(props: CaseProps & { close: () => void }) {
  const ctx = () => props.ctx;
  const [text, setText] = createSignal("");
  const [status, setStatus] = createSignal<FactStatus>("owner");
  const [disputed, setDisputed] = createSignal(false);
  const [proofs, setProofs] = createSignal<string[]>([]);
  const evidence = createSource(ctx().host, () =>
    view<{ evidence: Evidence[] }>(ctx().host, "caseEvidence", { id: props.row.ref }),
  );
  void evidence.refresh();
  const action = createAction(ctx);
  // NSVX refuses a confirmed fact without evidence, so the form says so first.
  const blocked = () => !text().trim() || (status() === "confirmed" && proofs().length === 0);
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await changeCaseRequest(ctx(), {
            action: "addFact",
            key: props.row.ref,
            text: text(),
            status: status(),
            disputed: disputed(),
            evidence_ids: proofs(),
          });
          await props.reload();
          props.close();
        });
      }}
    >
      <Field label={ctx().lt("fact")} value={text()} rows={3} max={4000} required onInput={setText} />
      <Choice
        label={ctx().lt("state")}
        value={status()}
        options={FACT_CHOICES.map((value) => [value, ctx().lt(`fact_${value}`)] as const)}
        onChange={setStatus}
      />
      <Toggle label={ctx().lt("inDispute")} checked={disputed()} onChange={setDisputed} />
      <Show when={status() === "confirmed"}>
        <p class="nsvx-of__muted nsvx-of__wide">{ctx().lt("linkProof")}</p>
      </Show>
      <Picks
        options={(evidence.state().data?.evidence ?? []).map((row) => ({
          id: row.id,
          label: row.code ?? row.name,
          title: row.name,
        }))}
        value={proofs()}
        onChange={setProofs}
      />
      <Note note={action.note()} />
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
  );
}

function Dossier(props: CaseProps) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ exports: CaseExport[]; pending: boolean; last_error: string | null }>(
      ctx().host,
      "caseExports",
      { id: props.row.ref },
    ),
  );
  void source.refresh();
  every(4_000, () => {
    if (source.state().data?.pending) {
      void source.refresh();
    }
  });
  const [originals, setOriginals] = createSignal(true);
  const [redacted, setRedacted] = createSignal(true);
  const [privileged, setPrivileged] = createSignal(false);
  const action = createAction(ctx);
  return (
    <div class="nsvx-of__form">
      <Toggle label={ctx().lt("withOriginals")} checked={originals()} onChange={setOriginals} />
      <Toggle label={ctx().lt("preferRedacted")} checked={redacted()} onChange={setRedacted} />
      <Toggle label={ctx().lt("withPrivileged")} checked={privileged()} onChange={setPrivileged} />
      <div class="nsvx-dev__bar">
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={
            action.busy() || source.state().data?.pending || !ctx().host.connection.canWrite
          }
          onClick={() =>
            void action.run(async () => {
              await changeCaseRequest(ctx(), {
                action: "export",
                key: props.row.ref,
                include_originals: originals(),
                include_privileged: privileged(),
                prefer_redacted: redacted(),
              });
              await source.refresh();
            }, ctx().lt("preparing"))
          }
        >
          <Icon name="download" />
          <span>{ctx().lt("makeDossier")}</span>
        </button>
      </div>
      <Note note={action.note()} />
      <Show when={source.state().data?.pending}>
        <p class="nsvx-of__muted nsvx-of__wide" role="status">
          {ctx().lt("preparing")}
        </p>
      </Show>
      <Show when={source.state().data?.last_error}>
        <p class="nsvx-of__warn nsvx-of__wide" role="alert">
          {source.state().data?.last_error}
        </p>
      </Show>
      <ul class="nsvx-of__list nsvx-of__wide">
        <For each={source.state().data?.exports ?? []} keyed={(row) => row.file}>
          {(row) => (
            <li>
              <button
                type="button"
                class="nsvx-of__row"
                disabled={action.busy()}
                onClick={() =>
                  void action.run(() =>
                    saveNsvxFile(
                      ctx().host,
                      { kind: "export", key: props.row.ref, file: row().file },
                      "nsvx.cases.file",
                    ),
                  )
                }
              >
                <Icon name={row().format === "zip" ? "folder" : "doc"} />
                <span class="nsvx-of__main">
                  <strong>{row().name}</strong>
                  <span class="nsvx-of__sub">
                    {shortStamp(row().at, ctx().locale)} · {sizeWord(row().bytes)}
                  </span>
                </span>
                <Icon name="download" />
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

function Summary(props: CaseProps) {
  const ctx = () => props.ctx;
  const row = () => props.row;
  const action = createAction(ctx);
  const [draft, setDraft] = createSignal("");
  const canWrite = () => ctx().host.connection.canWrite;
  const patch = (body: Record<string, unknown>) =>
    void action.run(async () => {
      await changeCaseRequest(ctx(), {
        action: "update",
        key: row().ref,
        revision: row().revision,
        ...body,
      });
      await props.reload();
    });
  return (
    <div class="nsvx-of">
      <Stats
        items={[
          {
            icon: "euro",
            label: ctx().lt("owed"),
            value: eur(row().summary.verified_principal, ctx().locale),
            sub:
              !isZero(row().summary.outstanding) &&
              row().summary.outstanding !== row().summary.verified_principal
                ? `${eur(row().summary.outstanding, ctx().locale)} ${ctx().lt("total")}`
                : undefined,
            tone: isZero(row().summary.verified_principal) ? undefined : "bad",
          },
          {
            icon: "folder",
            label: ctx().lt("evidence"),
            value: String(row().summary.evidence),
            sub: row().summary.evidence_attention
              ? `${row().summary.evidence_attention} ${ctx().lt("toReview")}`
              : undefined,
          },
          {
            icon: "agenda",
            label: ctx().lt("nextDeadline"),
            value: shortDay(row().summary.next_deadline, ctx().locale),
            sub: row().summary.deadlines_unconfirmed
              ? `${row().summary.deadlines_unconfirmed} ${ctx().lt("toConfirm")}`
              : undefined,
          },
        ]}
      />
      <div class="nsvx-of__bar">
        <Choice
          label={ctx().lt("state")}
          value={row().status}
          options={STATUSES.map((value) => [value, ctx().lt(value)] as const)}
          disabled={action.busy() || !canWrite()}
          onChange={(status) => patch({ status })}
        />
        <Show when={row().ai_allowed}>
          <button
            type="button"
            class="nsvx__button"
            disabled={action.busy() || !canWrite()}
            onClick={() =>
              void action.run(async () => {
                const made = await changeCaseRequest<{ text: string | null }>(ctx(), {
                  action: "summary",
                  key: row().ref,
                });
                setDraft(made.text ?? "");
                if (!made.text) {
                  throw new Error(ctx().lt("summaryOff"));
                }
              })
            }
          >
            <Icon name="spark" />
            <span>{ctx().lt("summarize")}</span>
          </button>
        </Show>
        <Reveal label={ctx().lt("edit")} icon="edit" disabled={!canWrite()}>
          {(close) => <EditCase {...props} close={close} />}
        </Reveal>
        <Reveal label={ctx().lt("dossier")} icon="download">
          {() => <Dossier {...props} />}
        </Reveal>
      </div>
      <Note note={action.note()} />
      <Show when={draft()}>
        <Panel title={ctx().lt("summaryDraft")} icon="spark">
          <Field label={ctx().lt("summaryDraft")} value={draft()} rows={5} onInput={setDraft} />
          <div class="nsvx-dev__bar">
            <button
              type="button"
              class="nsvx__button"
              onClick={() => void navigator.clipboard.writeText(draft())}
            >
              <Icon name="copy" />
              <span>{ctx().lt("copy")}</span>
            </button>
          </div>
        </Panel>
      </Show>
      <Show when={row().issue || row().description}>
        <Panel title={ctx().lt("issue")} icon="doc">
          <Show when={row().issue}>
            <p class="nsvx-of__body">
              <strong>{row().issue}</strong>
            </p>
          </Show>
          <Show when={row().description}>
            <p class="nsvx-of__body">{row().description}</p>
          </Show>
        </Panel>
      </Show>
      <Panel
        title={ctx().lt("parties")}
        icon="people"
        count={row().parties.length}
        action={
          <Reveal label={ctx().lt("add")} icon="plus" disabled={!canWrite()}>
            {(close) => <AddParty {...props} close={close} />}
          </Reveal>
        }
      >
        <ul class="nsvx-of__list">
          <For each={row().parties} keyed={(party) => party.id}>
            {(party) => (
              <li class="nsvx-of__row">
                <Icon name={party().kind === "company" ? "group" : "user"} />
                <span class="nsvx-of__main">
                  <strong>{party().name}</strong>
                  <span class="nsvx-of__sub">
                    {ctx().vocab()?.party_roles[party().role] ?? party().role}
                    {party().contact ? ` · ${party().contact}` : ""}
                  </span>
                </span>
                <Show
                  when={party().identity_state === "unverified"}
                  fallback={<Pill tone="ok">{ctx().lt("confirmed")}</Pill>}
                >
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={action.busy() || !canWrite()}
                    onClick={() =>
                      void action.run(async () => {
                        await changeCaseRequest(ctx(), {
                          action: "confirmParty",
                          key: row().ref,
                          partyId: party().id,
                          role: party().role,
                          name: party().name,
                          identity_state: "owner_confirmed",
                        });
                        await props.reload();
                      })
                    }
                  >
                    <Icon name="done" />
                    <span>{ctx().lt("confirmId")}</span>
                  </button>
                </Show>
                <IconButton
                  icon="close"
                  label={ctx().lt("remove")}
                  disabled={action.busy() || !canWrite()}
                  onClick={() =>
                    void action.run(async () => {
                      await changeCaseRequest(ctx(), {
                        action: "removeParty",
                        key: row().ref,
                        partyId: party().id,
                      });
                      await props.reload();
                    })
                  }
                />
              </li>
            )}
          </For>
        </ul>
      </Panel>
      <Panel
        title={ctx().lt("facts")}
        icon="done"
        count={row().facts.length}
        action={
          <Reveal label={ctx().lt("add")} icon="plus" disabled={!canWrite()}>
            {(close) => <AddFact {...props} close={close} />}
          </Reveal>
        }
      >
        <ul class="nsvx-of__list">
          <For
            each={row().facts}
            keyed={(fact) => fact.id}
            fallback={<p class="nsvx-of__muted">{ctx().lt("noFacts")}</p>}
          >
            {(fact) => (
              <li class="nsvx-of__row">
                <span class="nsvx-of__main">
                  <span>{fact().text}</span>
                  <span class="nsvx-of__bar">
                    <Pill tone={FACT_TONE[fact().status]}>{ctx().lt(`fact_${fact().status}`)}</Pill>
                    <Show when={fact().disputed}>
                      <Pill tone="bad">{ctx().lt("inDispute")}</Pill>
                    </Show>
                    <For each={fact().codes} keyed={false}>
                      {(code) => <Pill icon="folder">{code()}</Pill>}
                    </For>
                  </span>
                </span>
              </li>
            )}
          </For>
        </ul>
      </Panel>
      <Show when={row().links.length}>
        <Panel title={ctx().lt("links")} icon="link">
          <div class="nsvx-of__bar">
            <For each={row().links} keyed={(link) => link.id}>
              {(link) => <Pill>{link().label}</Pill>}
            </For>
          </div>
        </Panel>
      </Show>
      <div class="nsvx-of__panel">
        <Toggle
          label={ctx().lt("useAi")}
          checked={row().ai_allowed}
          disabled={action.busy() || !canWrite()}
          onChange={(ai_allowed) => patch({ ai_allowed })}
        />
        <Toggle
          label={ctx().lt("legalHold")}
          checked={row().legal_hold}
          disabled={action.busy() || !canWrite()}
          onChange={(legal_hold) => patch({ legal_hold })}
        />
      </div>
    </div>
  );
}

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
      <Field label={ctx().lt("whatHappened")} value={title()} max={300} required onInput={setTitle} />
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

function Timeline(props: { ctx: LegalCtx; caseRef: string }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ events: TimelineEvent[] }>(ctx().host, "caseTimeline", { id: props.caseRef }),
  );
  void source.refresh();
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__bar">
        <Reveal
          label={ctx().lt("addEvent")}
          icon="plus"
          disabled={!ctx().host.connection.canWrite}
        >
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
                    <Pill tone={FACT_TONE[event().status]}>{ctx().lt(`fact_${event().status}`)}</Pill>
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

const SUGGESTED_TASKS = ["taskContract", "taskBank", "taskDocs", "taskLetter", "taskLawyer", "taskReply"];

function Deadlines(props: { ctx: LegalCtx; caseRef: string }) {
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
              <Field label={ctx().lt("title")} value={title()} max={300} required onInput={setTitle} />
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
                <Toggle label={ctx().lt("confirmedDeadline")} checked={verified()} onChange={setVerified} />
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
                    {row().due_date ? shortDay(row().due_date, ctx().locale) : ctx().lt("toConfirm")}
                  </Pill>
                  <Pill tone={row().kind === "legal_deadline" ? (row().verified ? "ok" : "warn") : "off"}>
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

function History(props: { ctx: LegalCtx; caseRef: string }) {
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
                  {shortStamp(row().at, ctx().locale)} · {ctx().lt(row().actor === "owner" ? "you" : "system")}
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

/** One case dossier, as NSVX's `LegalCase.tsx`. */
export function CaseView(props: { ctx: LegalCtx; caseRef: string; onBack: () => void }) {
  const ctx = () => props.ctx;
  const pick = new URLSearchParams(location.search).get("caseTab");
  const [section, setSection] = createSignal<CaseSection>(
    CASE_SECTIONS.includes(pick as CaseSection) ? (pick as CaseSection) : "summary",
  );
  const source = createSource(ctx().host, () =>
    view<CaseDetail>(ctx().host, "case", { id: props.caseRef }),
  );
  void source.refresh();
  every(30_000, () => void source.refresh());
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__bar">
        <IconButton icon="back" label={ctx().lt("back")} onClick={() => props.onBack()} />
        <span class="nsvx-of__ref">{source.state().data?.ref ?? props.caseRef}</span>
      </div>
      <SourceView source={source} t={ctx().t}>
        {(row) => (
          <>
            <header class="nsvx-of__head">
              <h2>{row().title}</h2>
              <Pill tone={STATUS_TONE[row().status]}>{ctx().lt(row().status)}</Pill>
              <Pill tone={row().nature === "formal" ? "run" : "off"}>{ctx().lt(row().nature)}</Pill>
              <Show when={row().legal_hold}>
                <Pill tone="warn" icon="lock">
                  {ctx().lt("hold")}
                </Pill>
              </Show>
            </header>
            <Segs
              name={ctx().lt("cases")}
              items={CASE_SECTIONS}
              value={section()}
              label={(key) => ctx().lt(key)}
              icon={(key) => SECTION_ICON[key]}
              onChange={(next) => {
                setSection(next);
                const url = new URL(location.href);
                url.searchParams.set("caseTab", next);
                history.replaceState(history.state, "", url);
              }}
            />
            <For each={[section()]} keyed={(key) => key}>
              {(key) => (
                <>
                  <Show when={key() === "summary"}>
                    <Summary ctx={ctx()} row={row()} reload={source.refresh} />
                  </Show>
                  <Show when={key() === "timeline"}>
                    <Timeline ctx={ctx()} caseRef={row().ref} />
                  </Show>
                  <Show when={key() === "evidence"}>
                    <LegalProofs ctx={ctx()} row={row()} />
                  </Show>
                  <Show when={key() === "money"}>
                    <LegalMoney ctx={ctx()} caseRef={row().ref} />
                  </Show>
                  <Show when={key() === "documents"}>
                    <LegalDocs ctx={ctx()} row={row()} />
                  </Show>
                  <Show when={key() === "ai"}>
                    <LegalAi ctx={ctx()} row={row()} reload={source.refresh} />
                  </Show>
                  <Show when={key() === "deadlines"}>
                    <Deadlines ctx={ctx()} caseRef={row().ref} />
                  </Show>
                  <Show when={key() === "history"}>
                    <History ctx={ctx()} caseRef={row().ref} />
                  </Show>
                </>
              )}
            </For>
          </>
        )}
      </SourceView>
    </div>
  );
}
