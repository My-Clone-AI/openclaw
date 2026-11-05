/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  AI_ICON,
  DOC_STATUSES,
  daysUntil,
  dayLabel,
  deadlineTone,
  type AiLane,
  type AiRun,
  type CaseDetail,
  type CaseDocument,
  type Note,
  type Vocab,
} from "./cases-data.js";
import type { DeskKey } from "./desk-i18n.js";
import {
  ConfirmButton,
  createAct,
  Empty,
  ErrorLine,
  IconButton,
  Panel,
  ToneChip,
  when,
  type DeskCtx,
  type Tone,
} from "./desk-ui.js";
import { view } from "./group-ui.js";
import { createSource, Icon, SourceView, type IconName } from "./ui-kit.js";

/** A calendar-page badge: day number and month, colored by how close it is. */
export function DueBadge(props: {
  ctx: DeskCtx;
  date: string | null;
  status?: "open" | "done" | "cancelled";
}) {
  const tone = () => deadlineTone({ due_date: props.date, status: props.status ?? "open" });
  const parts = () => {
    if (!props.date) {
      return { day: "?", month: "" };
    }
    const at = new Date(`${props.date}T12:00:00Z`);
    return {
      day: String(at.getUTCDate()),
      month: new Intl.DateTimeFormat(props.ctx.locale, { month: "short", timeZone: "UTC" }).format(at),
    };
  };
  return (
    <span
      class={["nsvx-desk__due", `nsvx-desk__due--${tone()}`]}
      title={
        props.date
          ? `${dayLabel(props.ctx.locale, props.date)} · ${daysUntil(props.date)} ${props.ctx.d("daysLeft")}`
          : props.ctx.d("toConfirm")
      }
    >
      <strong>{parts().day}</strong>
      <small>{parts().month}</small>
    </span>
  );
}

const DOC_TONE: Record<CaseDocument["status"], Tone> = {
  draft: "off",
  reviewed: "busy",
  approved: "ok",
  signed: "ok",
  sent: "ok",
};

/** Document versions; a status is the owner's record of what happened outside NSVX, never a send. */
export function DocsSection(props: { ctx: DeskCtx; caseRef: string }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const list = createSource(host, () =>
    view<{ documents: CaseDocument[] }>(host, "caseDocuments", { key: props.caseRef }),
  );
  void list.refresh();
  const [open, setOpen] = createSignal<string>();
  const ask = { id: "" };
  const doc = createSource(host, () => view<CaseDocument>(host, "caseDocument", { did: ask.id }));
  const show = (id: string) => {
    const next = open() === id ? undefined : id;
    setOpen(next);
    if (next) {
      ask.id = next;
      void doc.refresh();
    }
  };
  const mark = async (id: string, status: string) => {
    if (await act.run("nsvx.cases.document", { document: id, status })) {
      await list.refresh();
      if (open() === id) {
        void doc.refresh();
      }
    }
  };
  return (
    <Panel icon="edit" title={d("docs")}>
      <SourceView source={list} t={props.ctx.t}>
        {(data) => (
          <Show when={data().documents.length > 0} fallback={<Empty icon="edit" text={d("noDocs")} />}>
            <ul class="nsvx-list">
              <For each={data().documents} keyed={(x) => x.id}>
                {(x) => {
                  const next = () => DOC_STATUSES[DOC_STATUSES.indexOf(x().status) + 1];
                  return (
                    <li class="nsvx-desk__doc">
                      <div class="nsvx-row">
                        <Icon name={x().origin === "ai" ? "bot" : "doc"} class="nsvx-row__icon" />
                        <button type="button" class="nsvx-row__main nsvx-desk__link" onClick={() => show(x().id)}>
                          <span class="nsvx-row__title">
                            {x().title} v{String(x().version).padStart(2, "0")}
                          </span>
                        </button>
                        <ToneChip tone={DOC_TONE[x().status]} label={d(x().status)} />
                        <Show when={next()}>
                          {(status) => (
                            <IconButton
                              icon="done"
                              label={d(status() as DeskKey)}
                              disabled={act.busy()}
                              onClick={() => void mark(x().id, status())}
                            />
                          )}
                        </Show>
                      </div>
                      <Show when={open() === x().id}>
                        <SourceView source={doc} t={props.ctx.t}>
                          {(body) => <pre class="nsvx-desk__body">{body().body}</pre>}
                        </SourceView>
                      </Show>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        )}
      </SourceView>
      <ErrorLine error={act.error()} />
    </Panel>
  );
}

/** AI actions that need nothing more than the case; the others pick a document in NSVX's own screen. */
const SIMPLE_AI = ["analisar", "resumir_provas", "cronologia", "em_falta", "divida", "legislacao", "advogado"];
const RUN_TONE: Record<string, Tone> = {
  awaiting_consent: "warn",
  queued: "busy",
  waiting_quota: "warn",
  running: "busy",
  done: "ok",
  failed: "bad",
  cancelled: "off",
};
const LIVE = new Set(["queued", "running", "waiting_quota"]);

type AiData = { ai_allowed: boolean; lane: AiLane; runs: AiRun[]; actions: Record<string, string> };

/**
 * NSVX's consent flow: Prepare lists exactly what the AI would read; Allow sends that list's hash, so NSVX runs only
 * what the owner saw. Inference runs on NSVX's own subscription route.
 */
export function AiSection(props: { ctx: DeskCtx; c: CaseDetail; vocab: Vocab | undefined; onAllow: () => void }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const data = createSource(host, () => view<AiData>(host, "caseAi", { key: props.c.ref }));
  void data.refresh();
  const [pending, setPending] = createSignal<AiRun>();
  const [shown, setShown] = createSignal<string>();
  const follow = async () => {
    for (let i = 0; i < 60 && !host.signal.aborted; i++) {
      await new Promise((resolve) => {
        setTimeout(resolve, 4000);
      });
      await data.refresh();
      if (!data.state().data?.runs.some((r) => LIVE.has(r.status))) {
        return;
      }
    }
  };
  const prepare = async (action: string) => {
    const run = await act.run<AiRun>("nsvx.cases.aiPrepare", { case: props.c.ref, action });
    if (run) {
      setPending(run);
      void data.refresh();
    }
  };
  const allow = async (run: AiRun) => {
    if (await act.run("nsvx.cases.aiAuthorize", { run: run.id, manifest: run.manifest_sha256 })) {
      setPending(undefined);
      setShown(run.id);
      await data.refresh();
      void follow();
    }
  };
  const cancel = async (run: AiRun) => {
    if (await act.run("nsvx.cases.aiCancel", { run: run.id })) {
      setPending(undefined);
      await data.refresh();
    }
  };
  const label = (action: string) => data.state().data?.actions[action] ?? props.vocab?.ai_actions[action] ?? action;
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(ai) => (
        <div class="nsvx-desk__cols">
          <Panel
            icon="bot"
            title={d("aiAsk")}
            end={<ToneChip tone={ai().lane.eligible ? "ok" : "warn"} label={ai().lane.eligible ? d("available") : ai().lane.status} />}
          >
            <p class="nsvx-grp__note">{ai().lane.label}</p>
            <Show
              when={ai().ai_allowed}
              fallback={
                <div class="nsvx-desk__stack">
                  <p class="nsvx-grp__note">{d("aiOff")}</p>
                  <IconButton icon="done" label={d("aiOn")} onClick={props.onAllow} />
                </div>
              }
            >
              <div class="nsvx-desk__actions">
                <For each={SIMPLE_AI.filter((a) => a in ai().actions)} keyed={(a) => a}>
                  {(a) => (
                    <button
                      type="button"
                      class="nsvx-grp__op nsvx-desk__ai"
                      disabled={act.busy() || !!pending()}
                      onClick={() => void prepare(a())}
                    >
                      <Icon name={(AI_ICON[a()] ?? "spark") as IconName} />
                      <span>{label(a())}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={pending()}>
              {(run) => (
                <div class="nsvx-grp__preview nsvx-desk__consent" data-consent={run().id}>
                  <strong>{run().label}</strong>
                  <span class="nsvx-grp__note">{run().manifest.destination ?? run().manifest.model}</span>
                  <small>
                    {d("willRead")}: {run().manifest.items.filter((i) => i.included).length} {d("items")} ·{" "}
                    {new Intl.NumberFormat(props.ctx.locale).format(run().manifest.chars)}
                  </small>
                  <ul class="nsvx-desk__bullets">
                    <For each={run().manifest.items} keyed={(i) => i.code ?? i.name}>
                      {(i) => (
                        <li class={i().included ? undefined : "nsvx-desk__struck"}>
                          <Icon name={i().included ? "done" : "close"} /> {i().code ? `${i().code} · ` : ""}
                          {i().name}
                        </li>
                      )}
                    </For>
                  </ul>
                  <div class="nsvx-grp__acts">
                    <IconButton icon="close" label={d("cancel")} disabled={act.busy()} onClick={() => void cancel(run())} />
                    <IconButton icon="done" label={d("allow")} primary disabled={act.busy()} onClick={() => void allow(run())} />
                  </div>
                </div>
              )}
            </Show>
            <ErrorLine error={act.error()} />
          </Panel>
          <Panel icon="history" title={d("runs")}>
            <Show when={ai().runs.length > 0} fallback={<Empty icon="bot" text={d("noRuns")} />}>
              <ul class="nsvx-list">
                <For each={ai().runs} keyed={(r) => r.id}>
                  {(r) => (
                    <li class="nsvx-desk__doc" data-run={r().id}>
                      <button type="button" class="nsvx-row nsvx-row--link nsvx-desk__row" onClick={() => setShown(shown() === r().id ? undefined : r().id)}>
                        <Icon name={(AI_ICON[r().action] ?? "spark") as IconName} class="nsvx-row__icon" />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{r().label}</span>
                          <span class="nsvx-row__detail">{when(props.ctx.locale, r().created_at)}</span>
                        </span>
                        <ToneChip tone={RUN_TONE[r().status] ?? "busy"} label={runWord(d, r().status)} />
                      </button>
                      <Show when={shown() === r().id && (r().output || r().error)}>
                        <pre class={["nsvx-desk__body", { "nsvx-desk__warn": !r().output }]}>{r().output ?? r().error}</pre>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Panel>
        </div>
      )}
    </SourceView>
  );
}

function runWord(d: DeskCtx["d"], status: string) {
  switch (status) {
    case "awaiting_consent":
    case "queued":
    case "running":
    case "failed":
    case "cancelled":
      return d(status);
    case "waiting_quota":
      return d("waitingQuota");
    case "done":
      return d("done");
    default:
      return status;
  }
}

export function LawSection(props: { ctx: DeskCtx; caseRef: string }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const data = createSource(host, () =>
    view<{ research: Note[]; official_sources: { name: string; url: string }[] }>(host, "caseResearch", {
      key: props.caseRef,
    }),
  );
  void data.refresh();
  const [title, setTitle] = createSignal("");
  const [law, setLaw] = createSignal("");
  const [url, setUrl] = createSignal("");
  const change = async (method: string, params: Record<string, unknown>) => {
    if (await act.run(method, { case: props.caseRef, ...params })) {
      await data.refresh();
      return true;
    }
    return false;
  };
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(n) => (
        <Panel icon="legal" title={d("law")}>
          <Show when={n().research.length > 0} fallback={<Empty icon="legal" text={d("noNotes")} />}>
            <ul class="nsvx-list">
              <For each={n().research} keyed={(x) => x.id}>
                {(x) => (
                  <li class="nsvx-row" data-note={x().id}>
                    <Icon name={x().added_by === "ai" ? "bot" : "legal"} class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{x().title}</span>
                      <span class="nsvx-row__detail">
                        {[x().law_ref, x().source].filter(Boolean).join(" · ")}
                        <Show when={x().url}>
                          {(href) => (
                            <>
                              {" · "}
                              <a href={href()} target="_blank" rel="noreferrer noopener">
                                {d("link")}
                              </a>
                            </>
                          )}
                        </Show>
                      </span>
                    </span>
                    <Show
                      when={x().verified}
                      fallback={
                        <IconButton icon="done" label={d("verify")} disabled={act.busy()} onClick={() => void change("nsvx.cases.noteUpdate", { note: x().id, verified: true })} />
                      }
                    >
                      <ToneChip tone="ok" label={d("checked")} />
                    </Show>
                    <ConfirmButton
                      d={d}
                      icon="trash"
                      label={d("remove")}
                      question={d("remove")}
                      danger
                      disabled={act.busy()}
                      onConfirm={() => void change("nsvx.cases.noteUpdate", { note: x().id, remove: true })}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <div class="nsvx-grp__acts">
            <label class="nsvx-field nsvx-desk__grow">
              <span>{d("title")}</span>
              <input value={title()} maxLength={300} onInput={(e) => setTitle(e.currentTarget.value)} />
            </label>
            <label class="nsvx-field">
              <span>{d("lawRef")}</span>
              <input value={law()} maxLength={200} onInput={(e) => setLaw(e.currentTarget.value)} />
            </label>
            <label class="nsvx-field">
              <span>{d("link")}</span>
              <input type="url" value={url()} maxLength={500} placeholder="https://" onInput={(e) => setUrl(e.currentTarget.value)} />
            </label>
            <IconButton
              icon="plus"
              label={d("add")}
              disabled={!title().trim() || act.busy()}
              onClick={() =>
                void change("nsvx.cases.note", { title: title(), law: law(), url: url() }).then(
                  (ok) => ok && (setTitle(""), setLaw(""), setUrl("")),
                )
              }
            />
          </div>
          <ErrorLine error={act.error()} />
          <div class="nsvx-desk__stack">
            <small>{d("sources")}</small>
            <div class="nsvx-grp__chips">
              <For each={n().official_sources} keyed={(s) => s.url}>
                {(s) => (
                  <a class="nsvx-grp__chip nsvx-grp__chip--button" href={s().url} target="_blank" rel="noreferrer noopener">
                    <Icon name="legal" class="nsvx-desk__chip-icon" />
                    {s().name}
                  </a>
                )}
              </For>
            </div>
          </div>
        </Panel>
      )}
    </SourceView>
  );
}

export function LogSection(props: { ctx: DeskCtx; caseRef: string }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const data = createSource(host, () =>
    view<{ history: { at: string; actor: string; action: string }[] }>(host, "caseHistory", { key: props.caseRef }),
  );
  void data.refresh();
  return (
    <Panel icon="activity" title={d("log")}>
      <SourceView source={data} t={props.ctx.t}>
        {(h) => (
          <Show when={h().history.length > 0} fallback={<Empty icon="activity" text={d("noEvents")} />}>
            <ol class="nsvx-desk__timeline">
              <For each={h().history.slice(0, 100)} keyed={false}>
                {(e) => (
                  <li>
                    <span class="nsvx-grp__dot nsvx-desk__dot--off" />
                    <time>{when(props.ctx.locale, e().at)}</time>
                    <span>{e().action}</span>
                    <small>{e().actor}</small>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        )}
      </SourceView>
    </Panel>
  );
}
