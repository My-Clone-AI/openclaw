/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import {
  RUN_TONE,
  safeUrl,
  shortStamp,
  type AiRun,
  type AiState,
  type CaseDetail,
  type Evidence,
  type LawSource,
} from "./legal-data.js";
import { changeCaseRequest, type LegalCtx } from "./legal-tab.js";
import { every } from "./messages-ui.js";
import { Field, Panel, Pill, Reveal, Toggle } from "./office-kit.js";
import { createSource, Icon, SourceView, type IconName } from "./ui-kit.js";

const ACTION_ICON: Record<string, IconName> = {
  analisar: "find",
  resumir_provas: "doc",
  cronologia: "history",
  em_falta: "alert",
  divida: "euro",
  legislacao: "legal",
  criar_documento: "edit",
  rever_minuta: "done",
  advogado: "user",
  responder: "mail",
};

/**
 * The owner sees exactly what goes to the AI and authorizes that list: the hash binds the consent to it. Unticking a
 * proof prepares a new list and cancels the old one.
 */
export function ConsentCard(props: {
  ctx: LegalCtx;
  caseRef: string;
  run: AiRun;
  onClose: () => void;
}) {
  const ctx = () => props.ctx;
  const [current, setCurrent] = createSignal(props.run);
  const [excluded, setExcluded] = createSignal<string[]>([]);
  const [material, setMaterial] = createSignal<string>();
  const action = createAction(ctx);
  const manifest = () => current().manifest;
  const included = () => manifest().items.filter((item) => item.included);
  return (
    <Panel title={ctx().lt("sendToAi")} icon="bot">
      <p class="nsvx-of__body">
        <strong>{manifest().label}</strong>
      </p>
      <p class="nsvx-of__muted">
        {manifest().destination}
        {manifest().web_search ? ` · ${ctx().lt("withWeb")}` : ""}
      </p>
      <div class="nsvx-of__bar">
        <Pill icon="done">
          {manifest().facts} {ctx().lt("facts")}
        </Pill>
        <Pill icon="doc">
          {included().length} {ctx().lt("evidence")}
        </Pill>
        <Pill>{Math.round(manifest().chars / 1000)}k</Pill>
        <Show when={manifest().ledger}>
          <Pill icon="euro">{ctx().lt("payments")}</Pill>
        </Show>
      </div>
      <ul class="nsvx-of__list">
        <For each={manifest().items} keyed={(item) => item.evidence_id}>
          {(item) => (
            <li class={["nsvx-of__row", { "nsvx-of__row--done": !item().included }]}>
              <Show when={item().included} fallback={<Icon name="close" />}>
                <input
                  type="checkbox"
                  aria-label={item().code}
                  checked={!excluded().includes(item().evidence_id)}
                  onChange={(event) =>
                    setExcluded(
                      event.currentTarget.checked
                        ? excluded().filter((id) => id !== item().evidence_id)
                        : [...excluded(), item().evidence_id],
                    )
                  }
                />
              </Show>
              <span class="nsvx-of__main">
                <strong>
                  {item().code} · {item().name}
                </strong>
                <Show when={!item().included}>
                  <span class="nsvx-of__sub">{item().reason}</span>
                </Show>
              </span>
            </li>
          )}
        </For>
      </ul>
      <Show when={manifest().truncated.length}>
        <p class="nsvx-of__warn">
          {ctx().lt("cutShort")}: {manifest().truncated.join(", ")}
        </p>
      </Show>
      <Show when={material()}>
        <div class="nsvx-of__mono">{material()}</div>
      </Show>
      <p class="nsvx-of__muted">{ctx().lt("untrustedProofs")}</p>
      <Note note={action.note()} />
      <div class="nsvx-of__bar">
        <button type="button" class="nsvx__button" onClick={() => props.onClose()}>
          {ctx().lt("dontSend")}
        </button>
        <button
          type="button"
          class="nsvx__button"
          disabled={action.busy()}
          onClick={() =>
            void action.run(async () => {
              const shown = await view<{ text: string }>(ctx().host, "caseRunMaterial", {
                id: current().id,
              });
              setMaterial(shown.text);
            })
          }
        >
          <Icon name="find" />
          <span>{ctx().lt("seeMaterial")}</span>
        </button>
        <Show
          when={excluded().length}
          fallback={
            <button
              type="button"
              class="nsvx__button nsvx__button--primary"
              disabled={action.busy() || !ctx().host.connection.canWrite}
              onClick={() =>
                void action.run(async () => {
                  await changeCaseRequest(ctx(), {
                    action: "aiAuthorize",
                    runId: current().id,
                    manifest_sha256: current().manifest_sha256,
                  });
                  props.onClose();
                })
              }
            >
              <Icon name="send" />
              <span>{ctx().lt("authorize")}</span>
            </button>
          }
        >
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            disabled={action.busy() || !ctx().host.connection.canWrite}
            onClick={() =>
              void action.run(async () => {
                const earlier = (current().params.exclude_ids as string[] | undefined) ?? [];
                const next = await changeCaseRequest<AiRun>(ctx(), {
                  action: "aiPrepare",
                  key: props.caseRef,
                  ai: current().action,
                  aiParams: { ...current().params, exclude_ids: [...earlier, ...excluded()] },
                });
                await changeCaseRequest(ctx(), { action: "aiCancel", runId: current().id });
                setCurrent(next);
                setExcluded([]);
                setMaterial(undefined);
              })
            }
          >
            {ctx().lt("update")}
          </button>
        </Show>
      </div>
    </Panel>
  );
}

function RunCard(props: {
  ctx: LegalCtx;
  run: AiRun;
  onConsent: () => void;
  onChange: () => void;
}) {
  const ctx = () => props.ctx;
  const run = () => props.run;
  const [open, setOpen] = createSignal(run().status === "done");
  const action = createAction(ctx);
  return (
    <li class="nsvx-of__panel">
      <header class="nsvx-of__head">
        <Icon name={ACTION_ICON[run().action] ?? "bot"} />
        <strong class="nsvx-of__grow">{run().label}</strong>
        <Pill tone={RUN_TONE[run().status]}>{ctx().lt(`run_${run().status}`)}</Pill>
      </header>
      <p class="nsvx-of__muted">{shortStamp(run().created_at, ctx().locale)}</p>
      <Show when={run().status === "waiting_quota"}>
        <p class="nsvx-of__muted">{ctx().lt("waitingQuota")}</p>
      </Show>
      <Show when={run().error}>
        <p class="nsvx-of__warn">{run().error}</p>
      </Show>
      <div class="nsvx-of__bar">
        <Show when={run().status === "awaiting_consent"}>
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            onClick={() => props.onConsent()}
          >
            {ctx().lt("reviewAuthorize")}
          </button>
        </Show>
        <Show when={["awaiting_consent", "queued", "waiting_quota", "running"].includes(run().status)}>
          <button
            type="button"
            class="nsvx__button"
            disabled={action.busy() || !ctx().host.connection.canWrite}
            onClick={() =>
              void action.run(async () => {
                await changeCaseRequest(ctx(), { action: "aiCancel", runId: run().id });
                props.onChange();
              })
            }
          >
            {ctx().lt("cancel")}
          </button>
        </Show>
        <Show when={run().output}>
          <button
            type="button"
            class="nsvx__button"
            aria-expanded={open() ? "true" : "false"}
            onClick={() => setOpen(!open())}
          >
            {ctx().lt(open() ? "hide" : "show")}
          </button>
          <button
            type="button"
            class="nsvx__button"
            onClick={() => void navigator.clipboard.writeText(run().output ?? "")}
          >
            <Icon name="copy" />
            <span>{ctx().lt("copy")}</span>
          </button>
        </Show>
      </div>
      <Note note={action.note()} />
      <Show when={open() && run().output}>
        <p class="nsvx-of__warn">{ctx().lt("notLawyer")}</p>
        <div class="nsvx-of__mono">{run().output}</div>
      </Show>
    </li>
  );
}

function Sources(props: { ctx: LegalCtx; caseRef: string }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ research: LawSource[]; official_sources: { name: string; url: string }[] }>(
      ctx().host,
      "caseResearch",
      { id: props.caseRef },
    ),
  );
  void source.refresh();
  const action = createAction(ctx);
  const [title, setTitle] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [lawRef, setLawRef] = createSignal("");
  const [note, setNote] = createSignal("");
  const canWrite = () => ctx().host.connection.canWrite;
  return (
    <Panel
      title={ctx().lt("sources")}
      icon="legal"
      action={
        <Reveal label={ctx().lt("add")} icon="plus" disabled={!canWrite()}>
          {(close) => (
            <form
              class="nsvx-of__form"
              onSubmit={(event) => {
                event.preventDefault();
                void action.run(async () => {
                  await changeCaseRequest(ctx(), {
                    action: "addSource",
                    key: props.caseRef,
                    title: title(),
                    url: url(),
                    law_ref: lawRef(),
                    version_note: note(),
                  });
                  setTitle("");
                  setUrl("");
                  setLawRef("");
                  setNote("");
                  await source.refresh();
                  close();
                });
              }}
            >
              <Field label={ctx().lt("title")} value={title()} max={300} required onInput={setTitle} />
              <Field label={ctx().lt("address")} type="url" value={url()} max={500} onInput={setUrl} />
              <Field label={ctx().lt("article")} value={lawRef()} max={200} onInput={setLawRef} />
              <Field label={ctx().lt("version")} value={note()} max={300} onInput={setNote} />
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
          )}
        </Reveal>
      }
    >
      <SourceView source={source} t={ctx().t}>
        {(data) => (
          <div class="nsvx-of">
            <div class="nsvx-of__bar">
              <For each={data().official_sources} keyed={(row) => row.url}>
                {(row) => (
                  <a
                    class="nsvx-of__pill nsvx-of__pill--run"
                    href={safeUrl(row().url)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {row().name}
                  </a>
                )}
              </For>
            </div>
            <Note note={action.note()} />
            <ul class="nsvx-of__list">
              <For
                each={data().research}
                keyed={(row) => row.id}
                fallback={<p class="nsvx-of__muted">{ctx().lt("noSources")}</p>}
              >
                {(row) => (
                  <li class="nsvx-of__row">
                    <span class="nsvx-of__main">
                      <Show when={safeUrl(row().url)} fallback={<strong>{row().title}</strong>}>
                        {(href) => (
                          <a href={href()} target="_blank" rel="noreferrer noopener">
                            {row().title}
                          </a>
                        )}
                      </Show>
                      <span class="nsvx-of__sub">
                        {[row().law_ref, row().version_note, row().added_by === "ai" ? ctx().lt("byAi") : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      class={["nsvx__button", { "nsvx__button--primary": row().verified }]}
                      aria-pressed={row().verified ? "true" : "false"}
                      disabled={action.busy() || !canWrite()}
                      onClick={() =>
                        void action.run(async () => {
                          await changeCaseRequest(ctx(), {
                            action: "verifySource",
                            key: props.caseRef,
                            sourceId: row().id,
                            verified: !row().verified,
                          });
                          await source.refresh();
                        })
                      }
                    >
                      <Icon name="done" />
                      <span>{ctx().lt(row().verified ? "verified" : "verify")}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        )}
      </SourceView>
    </Panel>
  );
}

function PickReceived(props: { ctx: LegalCtx; caseRef: string; onPick: (id: string) => void }) {
  const source = createSource(props.ctx.host, () =>
    view<{ evidence: Evidence[] }>(props.ctx.host, "caseEvidence", { id: props.caseRef }),
  );
  void source.refresh();
  return (
    <SourceView source={source} t={props.ctx.t}>
      {(data) => (
        <ul class="nsvx-of__list">
          <For
            each={data().evidence.filter((row) => row.has_text)}
            keyed={(row) => row.id}
            fallback={<p class="nsvx-of__muted">{props.ctx.lt("noTextProofs")}</p>}
          >
            {(row) => (
              <li>
                <button type="button" class="nsvx-of__row" onClick={() => props.onPick(row().id)}>
                  <Icon name="doc" />
                  <span class="nsvx-of__main">
                    {row().code} · {row().name}
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      )}
    </SourceView>
  );
}

/** Legal AI: subscription routes only, each run bound to the owner's consent before anything is sent. */
export function LegalAi(props: { ctx: LegalCtx; row: CaseDetail; reload: () => Promise<void> }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<AiState>(ctx().host, "caseAi", { id: props.row.ref }),
  );
  void source.refresh();
  every(5_000, () => void source.refresh());
  const [consent, setConsent] = createSignal<AiRun>();
  const [responding, setResponding] = createSignal(false);
  const action = createAction(ctx);
  const canWrite = () => ctx().host.connection.canWrite;
  const prepare = (ai: string, aiParams: Record<string, unknown> = {}) =>
    void action.run(async () => {
      setConsent(
        await changeCaseRequest<AiRun>(ctx(), {
          action: "aiPrepare",
          key: props.row.ref,
          ai,
          aiParams,
        }),
      );
    });
  return (
    <div class="nsvx-of">
      <SourceView source={source} t={ctx().t}>
        {(data) => (
          <>
            <div class="nsvx-of__panel">
              <div class="nsvx-of__bar">
                <Icon name="bot" />
                <strong>{data().lane.label}</strong>
                <Pill tone={data().lane.eligible ? "ok" : "warn"}>
                  {data().lane.eligible
                    ? ctx().lt("available")
                    : ctx().lt(data().lane.reason === "exhausted" ? "limitReached" : "unavailable")}
                </Pill>
              </div>
              <p class="nsvx-of__muted">
                {data().lane.billing}
                {!data().lane.eligible && data().lane.reset_at
                  ? ` · ${shortStamp(data().lane.reset_at, ctx().locale)}`
                  : ""}
              </p>
              <Toggle
                label={ctx().lt("useAi")}
                checked={data().ai_allowed}
                disabled={action.busy() || !canWrite()}
                onChange={(ai_allowed) =>
                  void action.run(async () => {
                    await changeCaseRequest(ctx(), {
                      action: "update",
                      key: props.row.ref,
                      revision: props.row.revision,
                      ai_allowed,
                    });
                    await props.reload();
                    await source.refresh();
                  })
                }
              />
              <Show when={ctx().vocab()?.disclaimer}>
                <p class="nsvx-of__muted">{ctx().vocab()?.disclaimer}</p>
              </Show>
            </div>
            <Note note={action.note()} />
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
              when={data().ai_allowed}
              fallback={<p class="nsvx-of__warn">{ctx().lt("turnOnAi")}</p>}
            >
              <div class="nsvx-of__grid">
                <For
                  each={Object.entries(data().actions).filter(
                    ([key]) => key !== "criar_documento" && key !== "rever_minuta",
                  )}
                  keyed={(entry) => entry[0]}
                >
                  {(entry) => (
                    <button
                      type="button"
                      class="nsvx-of__row"
                      disabled={action.busy() || !canWrite()}
                      onClick={() =>
                        entry()[0] === "responder" ? setResponding(!responding()) : prepare(entry()[0])
                      }
                    >
                      <Icon name={ACTION_ICON[entry()[0]] ?? "bot"} />
                      <span class="nsvx-of__main">{entry()[1]}</span>
                    </button>
                  )}
                </For>
              </div>
              <Show when={responding()}>
                <Panel title={ctx().lt("replyTo")} icon="mail">
                  <PickReceived
                    ctx={ctx()}
                    caseRef={props.row.ref}
                    onPick={(id) => {
                      setResponding(false);
                      prepare("responder", { evidence_id: id });
                    }}
                  />
                </Panel>
              </Show>
            </Show>
            <Show when={data().runs.length}>
              <Panel title={ctx().lt("requests")} icon="history" count={data().runs.length}>
                <ul class="nsvx-of__list">
                  <For each={data().runs} keyed={(run) => run.id}>
                    {(run) => (
                      <RunCard
                        ctx={ctx()}
                        run={run()}
                        onConsent={() => setConsent(run())}
                        onChange={() => void source.refresh()}
                      />
                    )}
                  </For>
                </ul>
              </Panel>
            </Show>
          </>
        )}
      </SourceView>
      <Sources ctx={ctx()} caseRef={props.row.ref} />
    </div>
  );
}
