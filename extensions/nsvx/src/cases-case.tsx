/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { AiSection, DocsSection, DueBadge, LawSection, LogSection } from "./cases-more.js";
import {
  CASE_STATUSES,
  DEADLINE_KINDS,
  dayLabel,
  isZero,
  money,
  STATUS_TONE,
  type CaseDetail,
  type Deadline,
  type Ledger,
  type Proof,
  type TimelineEvent,
  type Vocab,
} from "./cases-data.js";
import type { DeskKey } from "./desk-i18n.js";
import {
  BackButton,
  createAct,
  Empty,
  ErrorLine,
  IconButton,
  Initial,
  Panel,
  Seg,
  Tile,
  ToneChip,
  type DeskCtx,
  type Tone,
} from "./desk-ui.js";
import { view } from "./group-ui.js";
import { createSource, Icon, SourceView, type IconName } from "./ui-kit.js";

type Section = "summary" | "dates" | "timeline" | "proof" | "money" | "docs" | "ai" | "law" | "log";
const SECTIONS: Section[] = ["summary", "dates", "timeline", "proof", "money", "docs", "ai", "law", "log"];
const ICON: Record<Section, IconName> = {
  summary: "doc",
  dates: "agenda",
  timeline: "history",
  proof: "archive",
  money: "money",
  docs: "edit",
  ai: "bot",
  law: "legal",
  log: "activity",
};
const LABEL: Record<Section, DeskKey> = {
  summary: "summary",
  dates: "dates",
  timeline: "timeline",
  proof: "proofs",
  money: "money",
  docs: "docs",
  ai: "ai",
  law: "law",
  log: "log",
};

/** One case: header with its state, four numbers, and one section at a time. */
export function CasePage(props: { ctx: DeskCtx; caseRef: string; vocab: Vocab | undefined; onBack: () => void }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const initial = new URLSearchParams(location.search).get("cs") as Section | null;
  const [section, setSection] = createSignal<Section>(
    initial && SECTIONS.includes(initial) ? initial : "summary",
  );
  const detail = createSource(host, () => view<CaseDetail>(host, "case", { key: props.caseRef }));
  void detail.refresh();
  const act = createAct(() => props.ctx);
  const pick = (next: Section) => {
    setSection(next);
    const url = new URL(location.href);
    url.searchParams.set("cs", next);
    history.replaceState(history.state, "", url);
  };
  const update = async (c: CaseDetail, change: Record<string, unknown>) => {
    if (await act.run("nsvx.cases.update", { case: c.ref, revision: c.revision, ...change })) {
      await detail.refresh();
    } else if (act.error()) {
      // A newer revision on NSVX: show it, so the next tap starts from what NSVX holds.
      await detail.refresh();
    }
  };
  return (
    <div class="nsvx-grp__company">
      <BackButton d={d} onClick={props.onBack} />
      <SourceView source={detail} t={props.ctx.t}>
        {(c) => (
          <>
            <header class="nsvx-desk__hero" data-case-page={c().ref}>
              <Icon name="cases" class="nsvx-desk__hero-icon" />
              <div class="nsvx-desk__hero-main">
                <span class="nsvx-desk__card-top">
                  <code class="nsvx-desk__ref">{c().ref}</code>
                  <ToneChip tone={STATUS_TONE[c().status]} label={d(c().status as DeskKey)} />
                  <Show when={c().legal_hold}>
                    <span class="nsvx-grp__chip">
                      <Icon name="lock" class="nsvx-desk__chip-icon" />
                    </span>
                  </Show>
                </span>
                <h2 class="nsvx-desk__h">{c().title}</h2>
              </div>
              <label class="nsvx-field">
                <span>{d("status")}</span>
                <select
                  value={c().status}
                  disabled={act.busy()}
                  onChange={(e) => void update(c(), { status: e.currentTarget.value })}
                >
                  <For each={CASE_STATUSES} keyed={false}>
                    {(s) => <option value={s()}>{d(s() as DeskKey)}</option>}
                  </For>
                </select>
              </label>
            </header>
            <ErrorLine error={act.error()} />
            <div class="nsvx-grp__tiles">
              <Tile
                icon="money"
                label={d("owed")}
                value={money(props.ctx.locale, c().verified_principal)}
                tone={isZero(c().verified_principal) ? "off" : "bad"}
                hint={isZero(c().outstanding) ? undefined : `${money(props.ctx.locale, c().outstanding)} ${d("withEstimates")}`}
                onClick={() => pick("money")}
                pressed={section() === "money"}
              />
              <Tile
                icon="archive"
                label={d("proofs")}
                value={c().evidence}
                tone={c().evidence_attention ? "warn" : "off"}
                onClick={() => pick("proof")}
                pressed={section() === "proof"}
              />
              <Tile
                icon="agenda"
                label={d("dates")}
                value={c().deadlines_open}
                tone={c().deadlines_unconfirmed ? "warn" : "off"}
                onClick={() => pick("dates")}
                pressed={section() === "dates"}
              />
              <Tile
                icon="history"
                label={d("nextDate")}
                value={c().next_deadline ? dayLabel(props.ctx.locale, c().next_deadline) : "—"}
                tone={c().next_deadline ? "busy" : "off"}
              />
            </div>
            <Seg name={c().ref} items={SECTIONS} value={section()} label={(k) => d(LABEL[k])} icon={(k) => ICON[k]} onChange={pick} />
            <For each={[section()]} keyed={(key) => key}>
              {() => (
                <>
                  <Show when={section() === "summary"}>
                    <SummarySection ctx={props.ctx} c={c()} vocab={props.vocab} onChanged={() => void detail.refresh()} onAi={(on) => void update(c(), { aiAllowed: on })} busy={act.busy()} />
                  </Show>
                  <Show when={section() === "dates"}>
                    <DatesSection ctx={props.ctx} caseRef={c().ref} onChanged={() => void detail.refresh()} />
                  </Show>
                  <Show when={section() === "timeline"}>
                    <TimelineSection ctx={props.ctx} caseRef={c().ref} />
                  </Show>
                  <Show when={section() === "proof"}>
                    <ProofSection ctx={props.ctx} caseRef={c().ref} />
                  </Show>
                  <Show when={section() === "money"}>
                    <MoneySection ctx={props.ctx} caseRef={c().ref} />
                  </Show>
                  <Show when={section() === "docs"}>
                    <DocsSection ctx={props.ctx} caseRef={c().ref} />
                  </Show>
                  <Show when={section() === "ai"}>
                    <AiSection ctx={props.ctx} c={c()} vocab={props.vocab} onAllow={() => void update(c(), { aiAllowed: true })} />
                  </Show>
                  <Show when={section() === "law"}>
                    <LawSection ctx={props.ctx} caseRef={c().ref} />
                  </Show>
                  <Show when={section() === "log"}>
                    <LogSection ctx={props.ctx} caseRef={c().ref} />
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

function SummarySection(props: {
  ctx: DeskCtx;
  c: CaseDetail;
  vocab: Vocab | undefined;
  busy: boolean;
  onChanged: () => void;
  onAi: (on: boolean) => void;
}) {
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const [fact, setFact] = createSignal("");
  const [disputed, setDisputed] = createSignal(false);
  const [role, setRole] = createSignal("respondent");
  const [party, setParty] = createSignal("");
  const roles = () => Object.entries(props.vocab?.party_roles ?? { respondent: d("counterparty") });
  const addFact = async () => {
    if (await act.run("nsvx.cases.fact", { case: props.c.ref, text: fact(), disputed: disputed() })) {
      setFact("");
      setDisputed(false);
      props.onChanged();
    }
  };
  const addParty = async () => {
    if (await act.run("nsvx.cases.party", { case: props.c.ref, role: role(), name: party() })) {
      setParty("");
      props.onChanged();
    }
  };
  return (
    <div class="nsvx-desk__cols">
      <Show when={props.c.issue || props.c.description}>
        <Panel icon="doc" title={d("summary")}>
          <p class="nsvx-desk__text">{props.c.issue || props.c.description}</p>
        </Panel>
      </Show>
      <Panel icon="people" title={d("parties")}>
        <ul class="nsvx-list">
          <For each={props.c.parties} keyed={(p) => p.id}>
            {(p) => (
              <li class="nsvx-row">
                <Initial name={p().name} size="sm" />
                <span class="nsvx-row__main">
                  <span class="nsvx-row__title">{p().name}</span>
                  <span class="nsvx-row__detail">{props.vocab?.party_roles[p().role] ?? p().role}</span>
                </span>
              </li>
            )}
          </For>
        </ul>
        <div class="nsvx-grp__acts">
          <label class="nsvx-field">
            <span>{d("role")}</span>
            <select value={role()} onChange={(e) => setRole(e.currentTarget.value)}>
              <For each={roles()} keyed={(r) => r[0]}>
                {(r) => <option value={r()[0]}>{r()[1]}</option>}
              </For>
            </select>
          </label>
          <label class="nsvx-field nsvx-desk__grow">
            <span>{d("name")}</span>
            <input value={party()} maxLength={200} onInput={(e) => setParty(e.currentTarget.value)} />
          </label>
          <IconButton icon="plus" label={d("add")} disabled={!party().trim() || act.busy()} onClick={() => void addParty()} />
        </div>
      </Panel>
      <Panel icon="done" title={d("facts")}>
        <Show when={props.c.facts.length > 0} fallback={<p class="nsvx-grp__note">{d("noEvents")}</p>}>
          <ul class="nsvx-list">
            <For each={props.c.facts} keyed={(f) => f.id}>
              {(f) => (
                <li class="nsvx-row">
                  <span class={["nsvx-grp__dot", `nsvx-desk__dot--${factTone(f().status, f().disputed)}`]} />
                  <span class="nsvx-row__main">
                    <span class="nsvx-desk__text">{f().text}</span>
                    <span class="nsvx-row__detail">
                      {f().disputed ? d("disputed") : f().status === "confirmed" ? d("confirmed") : d("unconfirmed")}
                      {f().codes.length ? ` · ${f().codes.join(", ")}` : ""}
                    </span>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <div class="nsvx-desk__stack">
          <textarea
            class="nsvx-desk__area"
            rows={2}
            maxLength={4000}
            aria-label={d("addFact")}
            placeholder={d("addFact")}
            value={fact()}
            onInput={(e) => setFact(e.currentTarget.value)}
          />
          <div class="nsvx-grp__acts">
            <label class="nsvx-grp__check">
              <input type="checkbox" checked={disputed()} onChange={(e) => setDisputed(e.currentTarget.checked)} />
              {d("disputed")}
            </label>
            <IconButton icon="plus" label={d("add")} disabled={!fact().trim() || act.busy()} onClick={() => void addFact()} />
          </div>
        </div>
      </Panel>
      <Panel icon="bot" title={d("ai")}>
        <label class="nsvx-grp__check">
          <input
            type="checkbox"
            role="switch"
            checked={props.c.ai_allowed}
            disabled={props.busy}
            onChange={(e) => props.onAi(e.currentTarget.checked)}
          />
          {d("aiOn")}
        </label>
      </Panel>
      <ErrorLine error={act.error()} />
    </div>
  );
}

const factTone = (status: string, disputed: boolean): Tone =>
  disputed ? "bad" : status === "confirmed" ? "ok" : status === "owner" ? "busy" : "warn";

function DatesSection(props: { ctx: DeskCtx; caseRef: string; onChanged: () => void }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const data = createSource(host, () => view<{ deadlines: Deadline[] }>(host, "caseDeadlines", { key: props.caseRef }));
  void data.refresh();
  const [title, setTitle] = createSignal("");
  const [due, setDue] = createSignal("");
  const [kind, setKind] = createSignal<(typeof DEADLINE_KINDS)[number]>("task");
  const change = async (method: string, params: Record<string, unknown>) => {
    if (await act.run(method, { case: props.caseRef, ...params })) {
      await data.refresh();
      props.onChanged();
      return true;
    }
    return false;
  };
  return (
    <Panel icon="agenda" title={d("dates")}>
      <SourceView source={data} t={props.ctx.t}>
        {(list) => (
          <Show when={list().deadlines.length > 0} fallback={<Empty icon="agenda" text={d("noDates")} />}>
            <ul class="nsvx-list">
              <For each={list().deadlines} keyed={(x) => x.id}>
                {(x) => (
                  <li class={["nsvx-row", { "nsvx-desk__row--done": x().status !== "open" }]} data-deadline={x().id}>
                    <DueBadge ctx={props.ctx} date={x().due_date} status={x().status} />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{x().title}</span>
                      <span class="nsvx-row__detail">
                        {d(x().kind)}
                        {x().kind === "legal_deadline" ? ` · ${x().verified ? d("confirmed") : d("unconfirmed")}` : ""}
                        {x().basis ? ` · ${x().basis}` : ""}
                      </span>
                    </span>
                    <Show
                      when={x().status === "open"}
                      fallback={
                        <IconButton icon="undo" label={d("reopen")} disabled={act.busy()} onClick={() => void change("nsvx.cases.deadlineUpdate", { deadline: x().id, status: "open" })} />
                      }
                    >
                      <IconButton icon="done" label={d("done")} disabled={act.busy()} onClick={() => void change("nsvx.cases.deadlineUpdate", { deadline: x().id, status: "done" })} />
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        )}
      </SourceView>
      <div class="nsvx-grp__acts">
        <label class="nsvx-field nsvx-desk__grow">
          <span>{d("title")}</span>
          <input value={title()} maxLength={300} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <label class="nsvx-field">
          <span>{d("due")}</span>
          <input type="date" value={due()} onInput={(e) => setDue(e.currentTarget.value)} />
        </label>
        <label class="nsvx-field">
          <span>{d("kind")}</span>
          <select value={kind()} onChange={(e) => setKind(e.currentTarget.value as typeof DEADLINE_KINDS[number])}>
            <For each={DEADLINE_KINDS} keyed={false}>
              {(k) => <option value={k()}>{d(k())}</option>}
            </For>
          </select>
        </label>
        <IconButton
          icon="plus"
          label={d("add")}
          disabled={!title().trim() || act.busy()}
          onClick={() =>
            void change("nsvx.cases.deadline", { title: title(), due: due() || null, kind: kind() }).then(
              (ok) => ok && (setTitle(""), setDue("")),
            )
          }
        />
      </div>
      <ErrorLine error={act.error()} />
    </Panel>
  );
}

function TimelineSection(props: { ctx: DeskCtx; caseRef: string }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const data = createSource(host, () => view<{ events: TimelineEvent[] }>(host, "caseTimeline", { key: props.caseRef }));
  void data.refresh();
  const [title, setTitle] = createSignal("");
  const [date, setDate] = createSignal("");
  const add = async () => {
    if (await act.run("nsvx.cases.event", { case: props.caseRef, title: title(), date: date() || null })) {
      setTitle("");
      setDate("");
      await data.refresh();
    }
  };
  return (
    <Panel icon="history" title={d("timeline")}>
      <SourceView source={data} t={props.ctx.t}>
        {(list) => (
          <Show when={list().events.length > 0} fallback={<Empty icon="history" text={d("noEvents")} />}>
            <ol class="nsvx-desk__timeline">
              <For each={list().events} keyed={(e) => e.id}>
                {(e) => (
                  <li>
                    <span class={["nsvx-grp__dot", `nsvx-desk__dot--${factTone(e().status, e().status === "disputed")}`]} />
                    <time>{dayLabel(props.ctx.locale, e().date)}</time>
                    <span>{e().title}</span>
                    <Show when={e().codes.length > 0}>
                      <small>{e().codes.join(", ")}</small>
                    </Show>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        )}
      </SourceView>
      <div class="nsvx-grp__acts">
        <label class="nsvx-field nsvx-desk__grow">
          <span>{d("title")}</span>
          <input value={title()} maxLength={300} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <label class="nsvx-field">
          <span>{d("due")}</span>
          <input type="date" value={date()} onInput={(e) => setDate(e.currentTarget.value)} />
        </label>
        <IconButton icon="plus" label={d("add")} disabled={!title().trim() || act.busy()} onClick={() => void add()} />
      </div>
      <ErrorLine error={act.error()} />
    </Panel>
  );
}

const TYPE_ICON: Record<string, IconName> = {
  contract: "doc",
  receipt: "money",
  invoice: "money",
  bank: "bank",
  email: "mail",
  letter: "mail",
  message: "messages",
  photo: "find",
  screenshot: "find",
  official: "legal",
  id: "user",
};

const needsCare = (p: Proof) =>
  ["ocr_low", "needs_ocr", "inaccessible", "screened_out"].includes(p.extraction_state) ||
  ["changed", "removed", "inaccessible"].includes(p.source_state);

function ProofSection(props: { ctx: DeskCtx; caseRef: string }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const data = createSource(host, () => view<{ evidence: Proof[] }>(host, "caseEvidence", { key: props.caseRef }));
  void data.refresh();
  const [open, setOpen] = createSignal<Proof>();
  return (
    <div class="nsvx-desk__cols">
      <Panel icon="archive" title={d("proofs")}>
        <SourceView source={data} t={props.ctx.t}>
          {(list) => (
            <Show when={list().evidence.length > 0} fallback={<Empty icon="archive" text={d("noProof")} />}>
              <ul class="nsvx-list">
                <For each={list().evidence} keyed={(p) => p.id}>
                  {(p) => (
                    <li>
                      <button
                        type="button"
                        class="nsvx-row nsvx-row--link nsvx-desk__row"
                        aria-pressed={open()?.id === p().id ? "true" : "false"}
                        onClick={() => setOpen(open()?.id === p().id ? undefined : p())}
                      >
                        <Icon name={TYPE_ICON[p().type] ?? "doc"} class="nsvx-row__icon" />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">
                            <Show when={p().code}>
                              <code class="nsvx-desk__ref">{p().code}</code>{" "}
                            </Show>
                            {p().name}
                          </span>
                          <span class="nsvx-row__detail">
                            {dayLabel(props.ctx.locale, p().doc_date)}
                            {p().pages ? ` · ${p().pages} ${d("pages")}` : ""}
                          </span>
                        </span>
                        <Show when={needsCare(p())} fallback={<ToneChip tone="ok" label={d("readOk")} />}>
                          <ToneChip tone="warn" label={d("needsCare")} />
                        </Show>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          )}
        </SourceView>
      </Panel>
      <Show when={open()}>
        {(p) => (
          <For each={[p().id]} keyed={(key) => key}>
            {() => <ProofViewer ctx={props.ctx} proof={p()} caseRef={props.caseRef} />}
          </For>
        )}
      </Show>
    </div>
  );
}

/** Pages are images NSVX renders from the original; the PDF itself never reaches the browser. */
function ProofViewer(props: { ctx: DeskCtx; proof: Proof; caseRef: string }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const [page, setPage] = createSignal(1);
  const ask = { page: 1 };
  const image = createSource(host, () =>
    view<{ src: string }>(host, "caseProofPage", { eid: props.proof.id, n: String(ask.page), w: "1000" }),
  );
  if (props.proof.previewable) {
    void image.refresh();
  }
  const go = (next: number) => {
    ask.page = next;
    setPage(next);
    void image.refresh();
  };
  return (
    <Panel icon="find" title={props.proof.name}>
      <Show when={props.proof.previewable} fallback={<p class="nsvx-grp__note">{d("noData")}</p>}>
        <SourceView source={image} t={props.ctx.t}>
          {(img) => <img class="nsvx-desk__page" src={img().src} alt={`${props.proof.name} · ${d("page")} ${page()}`} />}
        </SourceView>
        <Show when={(props.proof.pages ?? 1) > 1}>
          <div class="nsvx-grp__acts nsvx-desk__pager">
            <IconButton icon="back" label={d("back")} disabled={page() <= 1} onClick={() => go(page() - 1)} />
            <span>
              {page()} / {props.proof.pages}
            </span>
            <IconButton icon="resume" label={d("page")} disabled={page() >= (props.proof.pages ?? 1)} onClick={() => go(page() + 1)} />
          </div>
        </Show>
      </Show>
    </Panel>
  );
}

const OBLIGATION_TONE: Record<Ledger["obligations"][number]["status"], Tone> = {
  paid: "ok",
  partial: "warn",
  open: "bad",
  future: "off",
  disputed: "busy",
};

function MoneySection(props: { ctx: DeskCtx; caseRef: string }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const data = createSource(host, () => view<Ledger>(host, "casePayments", { key: props.caseRef }));
  void data.refresh();
  const eur = (value: string) => money(props.ctx.locale, value);
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(l) => (
        <>
          <div class="nsvx-grp__tiles">
            <Tile icon="agenda" label={d("expected")} value={eur(l().totals.expected)} />
            <Tile icon="done" label={d("received")} value={eur(l().totals.received_verified)} tone="ok" />
            <Tile icon="money" label={d("owed")} value={eur(l().totals.verified_outstanding)} tone={isZero(l().totals.verified_outstanding) ? "off" : "bad"} />
            <Tile icon="alert" label={d("withEstimates")} value={eur(l().totals.estimated_outstanding)} tone={isZero(l().totals.estimated_outstanding) ? "off" : "warn"} />
          </div>
          <Panel icon="money" title={d("money")}>
            <Show when={l().obligations.length > 0} fallback={<Empty icon="money" text={d("noMoney")} />}>
              <ul class="nsvx-list">
                <For each={l().obligations} keyed={(o) => o.id}>
                  {(o) => (
                    <li class="nsvx-row">
                      <span class={["nsvx-grp__dot", `nsvx-desk__dot--${OBLIGATION_TONE[o().status]}`]} />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{o().description}</span>
                        <span class="nsvx-row__detail">
                          {dayLabel(props.ctx.locale, o().due_date)} · {d(o().status === "open" ? "owed" : o().status === "disputed" ? "disputed" : o().status)}
                        </span>
                      </span>
                      <strong class="nsvx-desk__amount">{eur(o().outstanding === "0" || isZero(o().outstanding) ? o().amount : o().outstanding)}</strong>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Panel>
        </>
      )}
    </SourceView>
  );
}
