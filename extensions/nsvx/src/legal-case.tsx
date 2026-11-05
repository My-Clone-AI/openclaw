/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { saveNsvxFile } from "./aviation-kit.js";
import { createAction, Note, Segs, view } from "./device-kit.js";
import { LegalAi } from "./legal-ai.js";
import {
  CASE_SECTIONS,
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
} from "./legal-data.js";
import { LegalDocs } from "./legal-docs.js";
import { AddFact, AddParty, EditCase } from "./legal-edit.js";
import { changeCaseRequest, type CaseProps, type LegalCtx } from "./legal-kit.js";
import { LegalMoney } from "./legal-money.js";
import { LegalProofs } from "./legal-proofs.js";
import { Deadlines, History, Timeline } from "./legal-timeline.js";
import { every } from "./messages-ui.js";
import { Choice, Field, Panel, Pill, Reveal, Stats, Toggle, sizeWord } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, SourceView, type IconName } from "./ui-kit.js";

const STATUSES: CaseStatus[] = ["open", "waiting_docs", "attention", "resolved", "archived"];

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
