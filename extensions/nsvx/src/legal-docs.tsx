/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { saveNsvxFile } from "./aviation-kit.js";
import { ConfirmButton, createAction, Note, view } from "./device-kit.js";
import { ConsentCard } from "./legal-ai.js";
import {
  shortStamp,
  type AiRun,
  type CaseDetail,
  type DocProposal,
  type DocStatus,
  type DocVersion,
} from "./legal-data.js";
import { changeCaseRequest, type LegalCtx } from "./legal-kit.js";
import { Choice, Field, Panel, Picks, Pill, Reveal } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

const DOC_STATUSES: DocStatus[] = ["draft", "reviewed", "approved", "signed", "sent"];
const docTone = (status: DocStatus) =>
  status === "draft" ? "warn" : status === "sent" ? "ok" : "run";
const v = (version: number) => `v${String(version).padStart(2, "0")}`;

function NewDoc(props: {
  ctx: LegalCtx;
  row: CaseDetail;
  close: () => void;
  onCreated: (id: string) => void;
  onConsent: (run: AiRun) => void;
}) {
  const ctx = () => props.ctx;
  const [proposal, setProposal] = createSignal<DocProposal>();
  const [facts, setFacts] = createSignal<string[]>([]);
  const [proofs, setProofs] = createSignal<string[]>([]);
  const [brief, setBrief] = createSignal("");
  const action = createAction(ctx);
  const pick = (template: string) =>
    void action.run(async () => {
      const made = await changeCaseRequest<DocProposal>(ctx(), {
        action: "docProposal",
        key: props.row.ref,
        template,
      });
      setProposal(made);
      setFacts(made.facts.filter((fact) => fact.default).map((fact) => fact.id));
      setProofs(made.evidence.filter((proof) => proof.default).map((proof) => proof.id));
    });
  return (
    <div class="nsvx-of">
      <Show
        when={proposal()}
        fallback={
          <div class="nsvx-of__grid">
            <For each={Object.entries(ctx().vocab()?.templates ?? {})} keyed={(entry) => entry[0]}>
              {(entry) => (
                <button
                  type="button"
                  class="nsvx-of__row"
                  disabled={action.busy()}
                  onClick={() => pick(entry()[0])}
                >
                  <Icon name={entry()[1].consequential ? "mail" : "doc"} />
                  <span class="nsvx-of__main">{entry()[1].label}</span>
                </button>
              )}
            </For>
          </div>
        }
      >
        {(shown) => (
          <>
            <strong>{shown().label}</strong>
            <Show when={shown().consequential}>
              <p class="nsvx-of__warn">{ctx().lt("otherSideEffects")}</p>
            </Show>
            <Show when={shown().missing.length}>
              <p class="nsvx-of__warn">
                {ctx().lt("missing")}: {shown().missing.join(" · ")}
              </p>
            </Show>
            <p class="nsvx-of__sub">
              {ctx().lt("factsToUse")} ({facts().length})
            </p>
            <Picks
              options={shown().facts.map((fact) => ({
                id: fact.id,
                label: fact.text.length > 60 ? `${fact.text.slice(0, 60)}…` : fact.text,
                title: fact.text,
              }))}
              value={facts()}
              onChange={setFacts}
            />
            <p class="nsvx-of__sub">
              {ctx().lt("proofsToCite")} ({proofs().length})
            </p>
            <Picks
              options={shown().evidence.map((proof) => ({
                id: proof.id,
                label: proof.code,
                title: proof.name,
              }))}
              value={proofs()}
              onChange={setProofs}
            />
            <Show when={props.row.ai_allowed}>
              <Field
                label={ctx().lt("forAi")}
                value={brief()}
                rows={2}
                max={2000}
                onInput={setBrief}
              />
            </Show>
            <div class="nsvx-of__bar">
              <button type="button" class="nsvx__button" onClick={() => setProposal(undefined)}>
                {ctx().lt("back")}
              </button>
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy()}
                onClick={() =>
                  void action.run(async () => {
                    const made = await changeCaseRequest<DocVersion>(ctx(), {
                      action: "docAdd",
                      key: props.row.ref,
                      template: shown().template,
                      fact_ids: facts(),
                      evidence_ids: proofs(),
                    });
                    props.close();
                    props.onCreated(made.id);
                  })
                }
              >
                <Icon name="doc" />
                <span>{ctx().lt("fromTemplate")}</span>
              </button>
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                disabled={action.busy() || !props.row.ai_allowed}
                onClick={() =>
                  void action.run(async () => {
                    const run = await changeCaseRequest<AiRun>(ctx(), {
                      action: "aiPrepare",
                      key: props.row.ref,
                      ai: "criar_documento",
                      aiParams: {
                        template: shown().template,
                        fact_ids: facts(),
                        evidence_ids: proofs(),
                        ...(brief().trim() ? { brief: brief().trim() } : {}),
                      },
                    });
                    props.close();
                    props.onConsent(run);
                  })
                }
              >
                <Icon name="bot" />
                <span>{ctx().lt("withAi")}</span>
              </button>
            </div>
          </>
        )}
      </Show>
      <Note note={action.note()} />
    </div>
  );
}

function Editor(props: {
  ctx: LegalCtx;
  row: CaseDetail;
  id: string;
  onBack: () => void;
  onOpen: (id: string) => void;
  onConsent: (run: AiRun) => void;
}) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<DocVersion>(ctx().host, "caseDocument", { id: props.id }),
  );
  void source.refresh();
  const [body, setBody] = createSignal<string>();
  const [section, setSection] = createSignal("");
  const action = createAction(ctx);
  const canWrite = () => ctx().host.connection.canWrite;
  const save = (format: "pdf" | "docx") =>
    void action.run(() =>
      saveNsvxFile(
        ctx().host,
        { kind: "document", documentId: props.id, format },
        "nsvx.cases.file",
      ),
    );
  const setStatus = (status: DocStatus) =>
    void action.run(async () => {
      await changeCaseRequest(ctx(), { action: "docStatus", documentId: props.id, status });
      await source.refresh();
    });
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__bar">
        <IconButton icon="back" label={ctx().lt("back")} onClick={() => props.onBack()} />
      </div>
      <SourceView source={source} t={ctx().t}>
        {(doc) => {
          const latest = createMemo(() => !doc().versions || doc().versions?.[0]?.id === doc().id);
          const text = () => body() ?? doc().body;
          const dirty = () => body() !== undefined && body() !== doc().body;
          return (
            <>
              <header class="nsvx-of__head">
                <h2>
                  {doc().title} {v(doc().version)}
                </h2>
                <Pill tone={docTone(doc().status)}>{ctx().lt(`doc_${doc().status}`)}</Pill>
                <Pill icon={doc().origin === "ai" ? "bot" : "doc"}>
                  {ctx().lt(`origin_${doc().origin}`)}
                </Pill>
              </header>
              <div class="nsvx-of__bar">
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={action.busy()}
                  onClick={() => save("pdf")}
                >
                  <Icon name="download" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={action.busy()}
                  onClick={() => save("docx")}
                >
                  <Icon name="download" />
                  <span>DOCX</span>
                </button>
                <Show when={latest() && props.row.ai_allowed}>
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={action.busy() || !canWrite()}
                    onClick={() =>
                      void action.run(async () =>
                        props.onConsent(
                          await changeCaseRequest<AiRun>(ctx(), {
                            action: "aiPrepare",
                            key: props.row.ref,
                            ai: "rever_minuta",
                            aiParams: { document_id: doc().id },
                          }),
                        ),
                      )
                    }
                  >
                    <Icon name="bot" />
                    <span>{ctx().lt("reviewAi")}</span>
                  </button>
                </Show>
              </div>
              <Note note={action.note()} />
              <Show when={latest()} fallback={<div class="nsvx-of__mono">{doc().body}</div>}>
                <Field label={ctx().lt("text")} value={text()} rows={16} onInput={setBody} />
                <p class="nsvx-of__muted">{ctx().lt("editorHint")}</p>
                <div class="nsvx-of__bar">
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--primary"
                    disabled={action.busy() || !dirty() || !canWrite()}
                    onClick={() =>
                      void action.run(async () => {
                        const next = await changeCaseRequest<DocVersion>(ctx(), {
                          action: "docEdit",
                          documentId: doc().id,
                          body: text(),
                        });
                        setBody(undefined);
                        props.onOpen(next.id);
                      })
                    }
                  >
                    {ctx().lt("saveVersion")}
                  </button>
                  <div class="nsvx-of__bar" role="group" aria-label={ctx().lt("state")}>
                    <For
                      each={DOC_STATUSES.filter((status) => status !== doc().status)}
                      keyed={false}
                    >
                      {(status) => (
                        <Show
                          when={status() === "sent" || status() === "signed"}
                          fallback={
                            <button
                              type="button"
                              class="nsvx__button"
                              disabled={action.busy() || !canWrite()}
                              onClick={() => setStatus(status())}
                            >
                              {ctx().lt(`doc_${status()}`)}
                            </button>
                          }
                        >
                          <ConfirmButton
                            label={ctx().lt(`doc_${status()}`)}
                            confirm={ctx().lt("onlyRecords")}
                            cancel={ctx().lt("keep")}
                            disabled={action.busy() || !canWrite()}
                            onConfirm={() => setStatus(status())}
                          />
                        </Show>
                      )}
                    </For>
                  </div>
                </div>
                <Show when={props.row.ai_allowed && doc().sections.length}>
                  <div class="nsvx-of__form">
                    <Choice
                      label={ctx().lt("section")}
                      value={section()}
                      options={[["", "—"], ...doc().sections.map((name) => [name, name] as const)]}
                      onChange={setSection}
                    />
                    <div class="nsvx-dev__bar">
                      <button
                        type="button"
                        class="nsvx__button"
                        disabled={action.busy() || !section() || !canWrite()}
                        onClick={() =>
                          void action.run(async () =>
                            props.onConsent(
                              await changeCaseRequest<AiRun>(ctx(), {
                                action: "aiPrepare",
                                key: props.row.ref,
                                ai: "criar_documento",
                                aiParams: {
                                  template: doc().doc_type,
                                  document_id: doc().id,
                                  section: section(),
                                  fact_ids: doc().facts_used,
                                  title: doc().title,
                                },
                              }),
                            ),
                          )
                        }
                      >
                        <Icon name="refresh" />
                        <span>{ctx().lt("rewriteSection")}</span>
                      </button>
                    </div>
                  </div>
                </Show>
              </Show>
              <Show when={(doc().versions?.length ?? 0) > 1}>
                <Panel title={ctx().lt("versions")} icon="history" count={doc().versions?.length}>
                  <ul class="nsvx-of__list">
                    <For each={doc().versions ?? []} keyed={(row) => row.id}>
                      {(row) => (
                        <li>
                          <button
                            type="button"
                            class="nsvx-of__row"
                            aria-current={row().id === doc().id ? "true" : undefined}
                            onClick={() => props.onOpen(row().id)}
                          >
                            <span class="nsvx-of__main">
                              <strong>
                                {v(row().version)} · {ctx().lt(`doc_${row().status}`)}
                              </strong>
                              <span class="nsvx-of__sub">{shortStamp(row().at, ctx().locale)}</span>
                            </span>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Panel>
              </Show>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}

/** The document studio. A status like "sent" is only a record: Control never sends, files, or notifies anything. */
export function LegalDocs(props: { ctx: LegalCtx; row: CaseDetail }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ documents: DocVersion[] }>(ctx().host, "caseDocuments", { id: props.row.ref }),
  );
  void source.refresh();
  const [opened, setOpened] = createSignal("");
  const [consent, setConsent] = createSignal<AiRun>();
  return (
    <div class="nsvx-of">
      <Show when={consent()}>
        {(run) => (
          <ConsentCard
            ctx={ctx()}
            caseRef={props.row.ref}
            run={run()}
            onClose={() => {
              setConsent(undefined);
              void source.refresh();
            }}
          />
        )}
      </Show>
      <Show
        when={!opened()}
        fallback={
          <For each={[opened()]} keyed={(id) => id}>
            {(id) => (
              <Editor
                ctx={ctx()}
                row={props.row}
                id={id()}
                onBack={() => {
                  setOpened("");
                  void source.refresh();
                }}
                onOpen={setOpened}
                onConsent={setConsent}
              />
            )}
          </For>
        }
      >
        <div class="nsvx-of__bar">
          <Reveal
            label={ctx().lt("newDocument")}
            icon="plus"
            primary
            disabled={!ctx().host.connection.canWrite}
          >
            {(close) => (
              <NewDoc
                ctx={ctx()}
                row={props.row}
                close={close}
                onCreated={(id) => {
                  void source.refresh();
                  setOpened(id);
                }}
                onConsent={setConsent}
              />
            )}
          </Reveal>
        </div>
        <SourceView source={source} t={ctx().t}>
          {(data) => (
            <ul class="nsvx-of__list">
              <For
                each={data().documents}
                keyed={(row) => row.id}
                fallback={<p class="nsvx__empty">{ctx().lt("noDocuments")}</p>}
              >
                {(row) => (
                  <li>
                    <button type="button" class="nsvx-of__row" onClick={() => setOpened(row().id)}>
                      <Icon name={row().origin === "ai" ? "bot" : "doc"} />
                      <span class="nsvx-of__main">
                        <strong>{row().title}</strong>
                        <span class="nsvx-of__sub">
                          {v(row().version)} · {shortStamp(row().created_at, ctx().locale)}
                        </span>
                      </span>
                      <Pill tone={docTone(row().status)}>{ctx().lt(`doc_${row().status}`)}</Pill>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          )}
        </SourceView>
      </Show>
    </div>
  );
}
