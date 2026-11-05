/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { CasePage } from "./cases-case.js";
import { DueBadge } from "./cases-more.js";
import {
  CASE_FILTERS,
  daysUntil,
  dayLabel,
  deadlineTone,
  filterCases,
  isZero,
  money,
  splitSuggestions,
  STATUS_TONE,
  type CaseFilter,
  type CaseRow,
  type Dashboard,
  type Suggestion,
  type Suggestions,
  type Vocab,
} from "./cases-data.js";
import { Routines } from "./cases-routines.js";
import {
  ConfirmButton,
  createAct,
  Empty,
  ErrorLine,
  IconButton,
  Panel,
  Seg,
  Tile,
  ToneChip,
  when,
  type DeskCtx,
  type Tone,
} from "./desk-ui.js";
import type { DeskKey } from "./desk-i18n.js";
import { view } from "./group-ui.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

type Section = "list" | "ideas" | "steps";
const SECTIONS: Section[] = ["list", "ideas", "steps"];
const SECTION_ICON = { list: "cases", ideas: "spark", steps: "flow" } as const;

/** NSVX Processos: dashboard, cases, ideas NSVX found, and saved routines. The case page owns one case. */
export function CasesTab(props: { ctx: DeskCtx }) {
  const search = new URLSearchParams(location.search);
  const initial = search.get("cas") as Section | null;
  const [section, setSection] = createSignal<Section>(
    initial && SECTIONS.includes(initial) ? initial : "list",
  );
  const [open, setOpen] = createSignal(search.get("case") ?? "");
  const vocab = createSource(props.ctx.host, () => view<Vocab>(props.ctx.host, "casesVocab"));
  void vocab.refresh();
  // Deep links keep the section and the open case (values passed in, not read back).
  const go = (next: Section, ref = "") => {
    setSection(next);
    setOpen(ref);
    const url = new URL(location.href);
    url.searchParams.set("cas", next);
    if (ref) {
      url.searchParams.set("case", ref);
    } else {
      url.searchParams.delete("case");
    }
    history.replaceState(history.state, "", url);
  };
  const d = props.ctx.d;
  return (
    <div class="nsvx-grp nsvx-desk">
      <Show
        when={open()}
        fallback={
          <>
            <Seg
              name={d("cases")}
              items={SECTIONS}
              value={section()}
              label={(key) => d(key)}
              icon={(key) => SECTION_ICON[key]}
              onChange={(key) => go(key)}
            />
            <For each={[section()]} keyed={(key) => key}>
              {() => (
                <>
                  <Show when={section() === "list"}>
                    <CaseList ctx={props.ctx} vocab={vocab.state().data} onOpen={(ref) => go("list", ref)} onIdeas={() => go("ideas")} />
                  </Show>
                  <Show when={section() === "ideas"}>
                    <Ideas ctx={props.ctx} vocab={vocab.state().data} onOpen={(ref) => go("list", ref)} />
                  </Show>
                  <Show when={section() === "steps"}>
                    <Routines ctx={props.ctx} />
                  </Show>
                </>
              )}
            </For>
          </>
        }
      >
        <For each={[open()]} keyed={(key) => key}>
          {(ref) => (
            <CasePage ctx={props.ctx} caseRef={ref()} vocab={vocab.state().data} onBack={() => go("list")} />
          )}
        </For>
      </Show>
    </div>
  );
}

function CaseList(props: {
  ctx: DeskCtx;
  vocab: Vocab | undefined;
  onOpen: (ref: string) => void;
  onIdeas: () => void;
}) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const [filter, setFilter] = createSignal<CaseFilter>("all");
  const [creating, setCreating] = createSignal(false);
  const [settings, setSettings] = createSignal(false);
  const dash = createSource(host, () => view<Dashboard>(host, "casesDashboard"));
  void dash.refresh();
  return (
    <>
      <div class="nsvx-grp__bar nsvx-desk__bar">
        <Seg
          name={d("status")}
          items={CASE_FILTERS}
          value={filter()}
          label={(key) => d(key)}
          onChange={setFilter}
        />
        <span class="nsvx-desk__spacer" />
        <IconButton icon="setup" label={d("settings")} onClick={() => setSettings(!settings())} />
        <IconButton icon="plus" label={d("new")} primary onClick={() => setCreating(!creating())} />
      </div>
      <Show when={settings()}>
        <CaseSettings ctx={props.ctx} onClose={() => setSettings(false)} />
      </Show>
      <Show when={creating()}>
        <NewCase
          ctx={props.ctx}
          vocab={props.vocab}
          onClose={() => setCreating(false)}
          onCreated={(ref) => props.onOpen(ref)}
        />
      </Show>
      <SourceView source={dash} t={props.ctx.t}>
        {(data) => {
          const rows = createMemo(() => filterCases(data().cases, filter(), props.ctx.query));
          return (
            <>
              <div class="nsvx-grp__tiles">
                <Tile
                  icon="cases"
                  label={d("active")}
                  value={data().counts.active}
                  tone="busy"
                  pressed={filter() === "active"}
                  onClick={() => setFilter(filter() === "active" ? "all" : "active")}
                />
                <Tile
                  icon="spark"
                  label={d("ideas")}
                  value={data().counts.suggestions}
                  tone={data().counts.suggestions ? "warn" : "off"}
                  onClick={props.onIdeas}
                />
                <Tile
                  icon="alert"
                  label={d("attention")}
                  value={data().counts.attention}
                  tone={data().counts.attention ? "bad" : "off"}
                />
                <Tile
                  icon="money"
                  label={d("owed")}
                  value={money(props.ctx.locale, data().outstanding_verified)}
                  tone={isZero(data().outstanding_verified) ? "off" : "bad"}
                  hint={
                    !isZero(data().outstanding) && data().outstanding !== data().outstanding_verified
                      ? `${money(props.ctx.locale, data().outstanding)} ${d("withEstimates")}`
                      : undefined
                  }
                />
              </div>
              <Show when={filter() === "all" && data().deadlines.length > 0}>
                <Panel icon="agenda" title={d("dates")}>
                  <ul class="nsvx-list">
                    <For each={data().deadlines.slice(0, 4)} keyed={(x) => x.id}>
                      {(x) => (
                        <li>
                          <button type="button" class="nsvx-row nsvx-row--link nsvx-desk__row" onClick={() => props.onOpen(x().ref)}>
                            <DueBadge ctx={props.ctx} date={x().due_date} />
                            <span class="nsvx-row__main">
                              <span class="nsvx-row__title">{x().title}</span>
                              <span class="nsvx-row__detail">
                                {x().ref} · {x().case_title}
                              </span>
                            </span>
                            <Show when={x().kind === "legal_deadline" && !x().verified}>
                              <ToneChip tone="warn" label={d("toConfirm")} />
                            </Show>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Panel>
              </Show>
              <Show
                when={rows().length > 0}
                fallback={<Empty icon="cases" text={data().cases.length ? d("noResults") : d("noCases")} />}
              >
                <div class="nsvx-grp__grid">
                  <For each={rows()} keyed={(c) => c.id}>
                    {(c) => <CaseCard ctx={props.ctx} row={c()} vocab={props.vocab} onOpen={props.onOpen} />}
                  </For>
                </div>
              </Show>
            </>
          );
        }}
      </SourceView>
    </>
  );
}

function CaseCard(props: { ctx: DeskCtx; row: CaseRow; vocab: Vocab | undefined; onOpen: (ref: string) => void }) {
  const d = props.ctx.d;
  const c = () => props.row;
  const tone = (): Tone => STATUS_TONE[c().status];
  return (
    <article class={["nsvx-grp__card", `nsvx-desk__card--${tone()}`]} data-case={c().ref}>
      <button type="button" class="nsvx-grp__open nsvx-desk__open" onClick={() => props.onOpen(c().ref)}>
        <span class="nsvx-desk__card-top">
          <code class="nsvx-desk__ref">{c().ref}</code>
          <ToneChip tone={tone()} label={d(c().status as DeskKey)} />
          <Show when={c().nature === "formal"}>
            <span class="nsvx-grp__chip">
              <Icon name="legal" class="nsvx-desk__chip-icon" />
              {d("formal")}
            </span>
          </Show>
          <Show when={c().priority === "urgent" || c().priority === "high"}>
            <ToneChip tone="bad" icon="alert" label={d(c().priority === "urgent" ? "urgent" : "high")} />
          </Show>
        </span>
        <strong class="nsvx-desk__title">{c().title}</strong>
        <span class="nsvx-desk__meta">
          <Show when={c().respondent}>
            <span>
              <Icon name="user" />
              {c().respondent}
            </span>
          </Show>
          <For each={c().categories.slice(0, 2)} keyed={(k) => k}>
            {(k) => <span class="nsvx-grp__chip">{props.vocab?.categories[k()]?.label ?? k()}</span>}
          </For>
        </span>
        <span class="nsvx-desk__facts">
          <span title={d("owed")}>
            <Icon name="money" />
            {isZero(c().verified_principal)
              ? isZero(c().outstanding)
                ? "—"
                : `${money(props.ctx.locale, c().outstanding)}*`
              : money(props.ctx.locale, c().verified_principal)}
          </span>
          <span title={d("proofs")}>
            <Icon name="doc" />
            {c().evidence}
            <Show when={c().evidence_attention}>
              <em class="nsvx-desk__warn">!{c().evidence_attention}</em>
            </Show>
          </span>
          <span title={d("nextDate")}>
            <Icon name="agenda" />
            {c().next_deadline
              ? dayLabel(props.ctx.locale, c().next_deadline)
              : c().deadlines_unconfirmed
                ? d("toConfirm")
                : "—"}
          </span>
        </span>
      </button>
    </article>
  );
}

function NewCase(props: {
  ctx: DeskCtx;
  vocab: Vocab | undefined;
  onClose: () => void;
  onCreated: (ref: string) => void;
}) {
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const [title, setTitle] = createSignal("");
  const [respondent, setRespondent] = createSignal("");
  const [nature, setNature] = createSignal<"potential" | "formal">("potential");
  const [cats, setCats] = createSignal<string[]>([]);
  const groups = createMemo(() => {
    const out: Record<string, [string, string][]> = {};
    for (const [key, value] of Object.entries(props.vocab?.categories ?? {})) {
      (out[value.group] ??= []).push([key, value.label]);
    }
    return Object.entries(out);
  });
  const create = async () => {
    const made = await act.run<{ ref: string }>("nsvx.cases.create", {
      title: title(),
      respondent: respondent(),
      nature: nature(),
      categories: cats(),
    });
    if (made) {
      props.onCreated(made.ref);
    }
  };
  return (
    <Panel icon="plus" title={d("new")}>
      <fieldset class="nsvx-grp__form" disabled={act.busy()}>
        <label class="nsvx-field">
          <span>{d("title")}</span>
          <input value={title()} maxLength={200} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <label class="nsvx-field">
          <span>{d("counterparty")}</span>
          <input value={respondent()} maxLength={200} onInput={(e) => setRespondent(e.currentTarget.value)} />
        </label>
        <div class="nsvx-grp__chips nsvx-desk__wide" role="radiogroup" aria-label={d("kind")}>
          <For each={["potential", "formal"] as const} keyed={false}>
            {(n) => (
              <button
                type="button"
                role="radio"
                class="nsvx-grp__chip nsvx-grp__chip--button"
                aria-checked={nature() === n() ? "true" : "false"}
                aria-pressed={nature() === n() ? "true" : "false"}
                onClick={() => setNature(n())}
              >
                <Icon name={n() === "formal" ? "legal" : "alert"} class="nsvx-desk__chip-icon" />
                {d(n() === "formal" ? "formalCase" : "possible")}
              </button>
            )}
          </For>
        </div>
        <For each={groups()} keyed={(g) => g[0]}>
          {(group) => (
            <div class="nsvx-desk__wide nsvx-desk__group">
              <small>{group()[0]}</small>
              <div class="nsvx-grp__chips">
                <For each={group()[1]} keyed={(c) => c[0]}>
                  {(c) => (
                    <button
                      type="button"
                      class="nsvx-grp__chip nsvx-grp__chip--button"
                      aria-pressed={cats().includes(c()[0]) ? "true" : "false"}
                      onClick={() =>
                        setCats(
                          cats().includes(c()[0]) ? cats().filter((x) => x !== c()[0]) : [...cats(), c()[0]],
                        )
                      }
                    >
                      {c()[1]}
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
        <div class="nsvx-grp__acts">
          <IconButton icon="close" label={d("cancel")} onClick={props.onClose} />
          <IconButton icon="done" label={d("create")} primary disabled={!title().trim() || act.busy()} onClick={() => void create()} />
        </div>
      </fieldset>
      <ErrorLine error={act.error()} />
    </Panel>
  );
}

type CaseSettingsData = {
  attention_days: number;
  discovery_enabled: boolean;
  bank_coverage: { accounts_total: number; accounts_read: number; note: string };
  ai: { label: string; eligible: boolean; status: string; billing: string };
};

function CaseSettings(props: { ctx: DeskCtx; onClose: () => void }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const data = createSource(host, () => view<CaseSettingsData>(host, "caseSettings"));
  void data.refresh();
  const [days, setDays] = createSignal<number>();
  const save = async (change: Record<string, unknown>) => {
    if (await act.run("nsvx.cases.settings", change)) {
      setDays(undefined);
      await data.refresh();
    }
  };
  return (
    <Panel icon="setup" title={d("settings")} end={<IconButton icon="close" label={d("close")} onClick={props.onClose} />}>
      <SourceView source={data} t={props.ctx.t}>
        {(s) => (
          <div class="nsvx-desk__stack">
            <label class="nsvx-grp__check">
              <input
                type="checkbox"
                role="switch"
                checked={s().discovery_enabled}
                disabled={act.busy()}
                onChange={(e) => void save({ discovery: e.currentTarget.checked })}
              />
              {d("lookForDisputes")}
            </label>
            <div class="nsvx-grp__acts">
              <label class="nsvx-field">
                <span>{d("alertAfter")}</span>
                <input
                  type="number"
                  min="7"
                  max="3650"
                  inputMode="numeric"
                  value={String(days() ?? s().attention_days)}
                  onInput={(e) => setDays(Number(e.currentTarget.value))}
                />
              </label>
              <IconButton
                icon="done"
                label={d("save")}
                disabled={act.busy() || days() === undefined || days() === s().attention_days}
                onClick={() => void save({ attentionDays: days() })}
              />
            </div>
            <p class="nsvx-desk__line">
              <Icon name="bot" />
              <span>{s().ai.label}</span>
              <ToneChip tone={s().ai.eligible ? "ok" : "warn"} label={s().ai.eligible ? d("available") : s().ai.status} />
            </p>
            <p class="nsvx-desk__line">
              <Icon name="bank" />
              <span>
                {s().bank_coverage.accounts_read}/{s().bank_coverage.accounts_total}
              </span>
              <small>{s().bank_coverage.note}</small>
            </p>
          </div>
        )}
      </SourceView>
      <ErrorLine error={act.error()} />
    </Panel>
  );
}

const COVERAGE_TONE: Record<Suggestion["coverage"], Tone> = { high: "ok", medium: "warn", low: "off" };
const COVERAGE_WORD = { high: "strong", medium: "medium", low: "low" } as const;

function Ideas(props: { ctx: DeskCtx; vocab: Vocab | undefined; onOpen: (ref: string) => void }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const [asked, setAsked] = createSignal(false);
  const [showClosed, setShowClosed] = createSignal(false);
  const data = createSource(host, () => view<Suggestions>(host, "caseSuggestions"));
  void data.refresh();
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(s) => {
        const split = createMemo(() => splitSuggestions(s().suggestions));
        return (
          <>
            <div class="nsvx-grp__bar nsvx-desk__bar">
              <span class="nsvx-grp__note">
                {d("lastLook")}: {s().last_run ? when(props.ctx.locale, s().last_run?.at) : d("never")}
              </span>
              <span class="nsvx-desk__spacer" />
              <IconButton
                icon="refresh"
                label={asked() ? d("asked") : d("runNow")}
                disabled={act.busy() || asked()}
                onClick={() =>
                  void act.run("nsvx.cases.discover", {}).then((ok) => ok && setAsked(true))
                }
              />
            </div>
            <ErrorLine error={act.error()} />
            <Show when={split().open.length > 0} fallback={<Empty icon="spark" text={d("noIdeas")} />}>
              <div class="nsvx-grp__grid">
                <For each={split().open} keyed={(x) => x.id}>
                  {(x) => <IdeaCard ctx={props.ctx} idea={x()} onChange={() => void data.refresh()} onOpen={props.onOpen} />}
                </For>
              </div>
            </Show>
            <Show when={split().closed.length > 0}>
              <button type="button" class="nsvx__button nsvx-desk__more" onClick={() => setShowClosed(!showClosed())}>
                {d("closed")} · {split().closed.length}
              </button>
              <Show when={showClosed()}>
                <div class="nsvx-grp__grid">
                  <For each={split().closed} keyed={(x) => x.id}>
                    {(x) => <IdeaCard ctx={props.ctx} idea={x()} onChange={() => void data.refresh()} onOpen={props.onOpen} />}
                  </For>
                </div>
              </Show>
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function IdeaCard(props: { ctx: DeskCtx; idea: Suggestion; onChange: () => void; onOpen: (ref: string) => void }) {
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const s = () => props.idea;
  const [open, setOpen] = createSignal(s().status === "reviewing");
  const [ignoring, setIgnoring] = createSignal(false);
  const [reason, setReason] = createSignal("");
  const status = async (next: string, why?: string) => {
    if (await act.run("nsvx.cases.suggestion", { suggestion: s().id, status: next, reason: why })) {
      props.onChange();
    }
  };
  const convert = async () => {
    const made = await act.run<{ ref: string }>("nsvx.cases.suggestion", { suggestion: s().id, convert: true });
    if (made) {
      props.onOpen(made.ref);
    }
  };
  const facts = () => {
    const m = s().metrics ?? {};
    const out: [string, string, Tone?][] = [
      [d("lastPaid"), m.last_payment ? dayLabel(props.ctx.locale, m.last_payment.date) : d("notConfirmed"), m.last_payment ? undefined : "warn"],
    ];
    if (m.outstanding) {
      out.push([d("owed"), money(props.ctx.locale, m.outstanding.amount), m.outstanding.estimate ? "warn" : undefined]);
    }
    if (m.months_unpaid) {
      out.push([d("periods"), String(m.months_unpaid)]);
    }
    if (m.oldest_unpaid) {
      out.push([d("unpaidSince"), dayLabel(props.ctx.locale, m.oldest_unpaid.date)]);
    }
    out.push([d("proofs"), String(s().evidence.length)]);
    return out;
  };
  return (
    <article class={["nsvx-grp__card", `nsvx-desk__card--${COVERAGE_TONE[s().coverage]}`]} data-idea={s().id}>
      <div class="nsvx-desk__card-top">
        <ToneChip tone={COVERAGE_TONE[s().coverage]} label={d(COVERAGE_WORD[s().coverage])} />
        <Show when={s().status !== "new"}>
          <span class="nsvx-grp__chip">{s().status === "rejected" ? d("ignored") : s().status === "converted" ? d("cases") : d(s().status === "confirmed" ? "confirmed" : "look")}</span>
        </Show>
      </div>
      <strong class="nsvx-desk__title">{s().title}</strong>
      <span class="nsvx-desk__meta">
        <Show when={s().counterparty}>
          <span>
            <Icon name="user" />
            {s().counterparty}
          </span>
        </Show>
        <Show when={s().context}>
          <span>
            <Icon name="doc" />
            {s().context}
          </span>
        </Show>
      </span>
      <dl class="nsvx-grp__fields">
        <For each={facts()} keyed={(f) => f[0]}>
          {(f) => (
            <div class={f()[2] ? `nsvx-desk__tone-text--${f()[2]}` : undefined}>
              <dt>{f()[0]}</dt>
              <dd>{f()[1]}</dd>
            </div>
          )}
        </For>
      </dl>
      <Show when={open()}>
        <div class="nsvx-desk__stack">
          <small>{d("why")}</small>
          <ul class="nsvx-desk__bullets">
            <For each={s().reasons} keyed={false}>
              {(r) => <li>{r().text}</li>}
            </For>
          </ul>
          <Show when={s().missing.length > 0}>
            <small>{d("missing")}</small>
            <ul class="nsvx-desk__bullets nsvx-desk__warn">
              <For each={s().missing} keyed={(m) => m}>
                {(m) => <li>{m()}</li>}
              </For>
            </ul>
          </Show>
          <ul class="nsvx-desk__bullets">
            <For each={s().evidence} keyed={(e) => e.drive_file_id}>
              {(e) => (
                <li>
                  <Icon name="doc" /> {e().name}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <Show
        when={s().status === "converted" && s().case_id}
        fallback={
          <div class="nsvx-grp__acts">
            <IconButton
              icon="find"
              label={open() ? d("close") : d("look")}
              onClick={() => {
                // Signal writes are read back only after the next flush, so use the new value directly.
                const next = !open();
                setOpen(next);
                if (next && s().status === "new") {
                  void status("reviewing");
                }
              }}
            />
            <Show when={s().status !== "confirmed" && s().status !== "rejected"}>
              <IconButton icon="done" label={d("confirm")} disabled={act.busy()} onClick={() => void status("confirmed")} />
            </Show>
            <Show when={s().status !== "rejected"}>
              <IconButton icon="plus" label={d("makeCase")} primary disabled={act.busy()} onClick={() => void convert()} />
              <IconButton icon="close" label={d("ignore")} disabled={act.busy()} onClick={() => setIgnoring(true)} />
            </Show>
            <Show when={s().status === "rejected"}>
              <IconButton icon="undo" label={d("reopen")} disabled={act.busy()} onClick={() => void status("new")} />
            </Show>
          </div>
        }
      >
        <IconButton icon="cases" label={d("cases")} onClick={() => props.onOpen(s().case_id ?? "")} />
      </Show>
      <Show when={ignoring()}>
        <div class="nsvx-grp__acts">
          <label class="nsvx-field nsvx-desk__grow">
            <span>{d("reason")}</span>
            <input value={reason()} maxLength={300} onInput={(e) => setReason(e.currentTarget.value)} />
          </label>
          <ConfirmButton
            d={d}
            icon="close"
            label={d("ignore")}
            question={d("ignore")}
            disabled={act.busy()}
            onConfirm={() => {
              setIgnoring(false);
              void status("rejected", reason().trim() || undefined);
            }}
          />
        </div>
      </Show>
      <ErrorLine error={act.error()} />
    </article>
  );
}
