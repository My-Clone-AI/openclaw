/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { DT } from "./device-i18n.js";
import { createAction, Note, Segs, view } from "./device-kit.js";
import { CaseView as CasePage } from "./legal-case.js";
import {
  CASE_VIEWS,
  eur,
  filterCases,
  isZero,
  shortDay,
  STATUS_TONE,
  type BankCoverage,
  type CaseRow,
  type CaseView,
  type Dashboard,
  type Lane,
  type Vocab,
} from "./legal-data.js";
import type { LT } from "./legal-i18n.js";
import { changeCaseRequest, type LegalCtx } from "./legal-kit.js";
import { LegalProcedures } from "./legal-procedures.js";
import { Suggestions } from "./legal-suggestions.js";
import { every } from "./messages-ui.js";
import { Choice, Field, Panel, Picks, Pill, Reveal, Stats, Toggle } from "./office-kit.js";
import { createSource, SourceView, type IconName, type T } from "./ui-kit.js";
import "./device.css";
import "./office.css";

const VIEW_ICON: Record<CaseView, IconName> = {
  all: "folder",
  suggestions: "spark",
  active: "legal",
  resolved: "done",
  archived: "archive",
};

type Area = "cases" | "procedures";

function CaseCard(props: { ctx: LegalCtx; row: CaseRow; onOpen: () => void }) {
  const ctx = () => props.ctx;
  const row = () => props.row;
  return (
    <li>
      <button type="button" class="nsvx-of__row" onClick={() => props.onOpen()}>
        <span class="nsvx-of__main">
          <span class="nsvx-of__ref">{row().ref}</span>
          <strong>{row().title}</strong>
          <Show when={row().respondent}>
            <span class="nsvx-of__sub">{row().respondent}</span>
          </Show>
        </span>
        <Pill tone={STATUS_TONE[row().status]}>{ctx().lt(row().status)}</Pill>
        <Show when={row().nature === "formal"}>
          <Pill tone="run">{ctx().lt("formal")}</Pill>
        </Show>
        <Show when={row().priority === "urgent" || row().priority === "high"}>
          <Pill tone="bad" icon="alert">
            {ctx().lt(row().priority === "urgent" ? "urgent" : "high")}
          </Pill>
        </Show>
        <span class="nsvx-of__amount">
          {isZero(row().verified_principal)
            ? isZero(row().outstanding)
              ? "—"
              : `${eur(row().outstanding, ctx().locale)}*`
            : eur(row().verified_principal, ctx().locale)}
        </span>
        <Pill icon="folder" tone={row().evidence_attention ? "warn" : "off"}>
          {row().evidence}
        </Pill>
        <Pill
          icon="agenda"
          tone={row().next_deadline ? "run" : row().deadlines_unconfirmed ? "warn" : "off"}
        >
          {row().next_deadline
            ? shortDay(row().next_deadline, ctx().locale)
            : row().deadlines_unconfirmed
              ? ctx().lt("toConfirm")
              : "—"}
        </Pill>
      </button>
    </li>
  );
}

function CaseList(props: {
  ctx: LegalCtx;
  view: CaseView;
  dash: Dashboard | undefined;
  onOpen: (ref: string) => void;
}) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ cases: CaseRow[] }>(
      ctx().host,
      "cases",
      props.view === "all" ? {} : { status: props.view },
    ),
  );
  void source.refresh();
  every(30_000, () => void source.refresh());
  const [category, setCategory] = createSignal("");
  const [attention, setAttention] = createSignal(false);
  const rows = createMemo(() =>
    filterCases(source.state().data?.cases ?? [], {
      query: ctx().query,
      category: category(),
      attention: attention(),
    }),
  );
  const categories = createMemo(() =>
    Object.entries(ctx().vocab()?.categories ?? {}).map(
      ([key, value]) => [key, `${value.group} · ${value.label}`] as const,
    ),
  );
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__form">
        <Choice
          label={ctx().lt("category")}
          value={category()}
          options={[["", ctx().lt("all")], ...categories()]}
          onChange={setCategory}
        />
        <Toggle label={ctx().lt("needsLook")} checked={attention()} onChange={setAttention} />
      </div>
      <Show when={props.view === "all" && props.dash?.deadlines.length}>
        <Panel title={ctx().lt("deadlines")} icon="agenda" count={props.dash?.deadlines.length}>
          <ul class="nsvx-of__list">
            <For each={props.dash?.deadlines.slice(0, 4) ?? []} keyed={(row) => row.id}>
              {(row) => (
                <li>
                  <button
                    type="button"
                    class="nsvx-of__row"
                    onClick={() => props.onOpen(row().ref)}
                  >
                    <span class="nsvx-of__main">
                      <strong>{row().title}</strong>
                      <span class="nsvx-of__sub">{row().ref}</span>
                    </span>
                    <Pill tone={row().due_date ? "run" : "warn"} icon="agenda">
                      {row().due_date
                        ? shortDay(row().due_date, ctx().locale)
                        : ctx().lt("toConfirm")}
                    </Pill>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Panel>
      </Show>
      <SourceView source={source} t={ctx().t}>
        {() => (
          <ul class="nsvx-of__list">
            <For
              each={rows()}
              keyed={(row) => row.id}
              fallback={<p class="nsvx__empty">{ctx().lt("noCases")}</p>}
            >
              {(row) => <CaseCard ctx={ctx()} row={row()} onOpen={() => props.onOpen(row().ref)} />}
            </For>
          </ul>
        )}
      </SourceView>
    </div>
  );
}

function NewCase(props: { ctx: LegalCtx; close: () => void; onOpen: (ref: string) => void }) {
  const ctx = () => props.ctx;
  const [title, setTitle] = createSignal("");
  const [respondent, setRespondent] = createSignal("");
  const [nature, setNature] = createSignal<"potential" | "formal">("potential");
  const [categories, setCategories] = createSignal<string[]>([]);
  const action = createAction(ctx);
  const options = createMemo(() =>
    Object.entries(ctx().vocab()?.categories ?? {}).map(([id, value]) => ({
      id,
      label: value.label,
      title: value.group,
    })),
  );
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          const made = await changeCaseRequest<{ ref: string }>(ctx(), {
            action: "create",
            title: title(),
            categories: categories(),
            nature: nature(),
          });
          if (respondent().trim()) {
            await changeCaseRequest(ctx(), {
              action: "addParty",
              key: made.ref,
              name: respondent(),
              role: "respondent",
              kind: "person",
            });
          }
          props.close();
          props.onOpen(made.ref);
        });
      }}
    >
      <Field label={ctx().lt("title")} value={title()} max={200} required onInput={setTitle} />
      <Field label={ctx().lt("otherSide")} value={respondent()} max={200} onInput={setRespondent} />
      <Choice
        label={ctx().lt("kind")}
        value={nature()}
        options={[
          ["potential", ctx().lt("potential")],
          ["formal", ctx().lt("formal")],
        ]}
        onChange={setNature}
      />
      <Picks options={options()} value={categories()} onChange={setCategories} />
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !title().trim() || !ctx().host.connection.canWrite}
        >
          {ctx().lt("create")}
        </button>
      </div>
    </form>
  );
}

function CaseSettings(props: { ctx: LegalCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{
      attention_days: number;
      discovery_enabled: boolean;
      bank_coverage: BankCoverage;
      ai: Lane;
    }>(ctx().host, "caseSettings"),
  );
  void source.refresh();
  const action = createAction(ctx);
  const [days, setDays] = createSignal<string>();
  const put = (body: Record<string, unknown>, done?: string) =>
    void action.run(async () => {
      await changeCaseRequest(ctx(), { action: "settings", ...body });
      await source.refresh();
    }, done);
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => (
        <div class="nsvx-of__form">
          <Toggle
            label={ctx().lt("lookForCases")}
            checked={data().discovery_enabled}
            disabled={action.busy() || !ctx().host.connection.canWrite}
            onChange={(discovery_enabled) => put({ discovery_enabled })}
          />
          <Field
            label={ctx().lt("alertDays")}
            type="number"
            min="7"
            mode="numeric"
            value={days() ?? String(data().attention_days)}
            onInput={setDays}
          />
          <div class="nsvx-dev__bar">
            <button
              type="button"
              class="nsvx__button"
              disabled={action.busy() || !days() || !ctx().host.connection.canWrite}
              onClick={() => {
                put({ attention_days: Number(days()) }, ctx().lt("saved"));
                setDays(undefined);
              }}
            >
              {ctx().lt("save")}
            </button>
          </div>
          <Note note={action.note()} />
          <dl class="nsvx-of__dl nsvx-of__wide">
            <dt>{data().ai.label}</dt>
            <dd>
              <Pill tone={data().ai.eligible ? "ok" : "warn"}>
                {data().ai.eligible ? ctx().lt("available") : data().ai.status}
              </Pill>
            </dd>
            <dt>{ctx().lt("bankRead")}</dt>
            <dd>
              {data().bank_coverage.accounts_read}/{data().bank_coverage.accounts_total}
            </dd>
          </dl>
          <p class="nsvx-of__muted nsvx-of__wide">{data().bank_coverage.note}</p>
        </div>
      )}
    </SourceView>
  );
}

/** NSVX Processos (`/processos`) and Procedures, natively: dossiers, suggestions, and saved routines. */
export function LegalTab(props: {
  host: ControlUiHost;
  t: T;
  dt: DT;
  lt: LT;
  locale: string;
  query: string;
}) {
  const search = new URLSearchParams(location.search);
  const [opened, setOpened] = createSignal(search.get("case") ?? "");
  const [area, setArea] = createSignal<Area>(
    search.get("legal") === "procedures" ? "procedures" : "cases",
  );
  const [picked, setPicked] = createSignal<CaseView>(
    CASE_VIEWS.includes(search.get("cases") as CaseView)
      ? (search.get("cases") as CaseView)
      : "all",
  );
  const vocab = createSource(props.host, () => view<Vocab>(props.host, "casesVocab"));
  void vocab.refresh();
  const dash = createSource(props.host, () => view<Dashboard>(props.host, "casesDashboard"));
  void dash.refresh();
  every(30_000, () => void dash.refresh());
  const ctx = createMemo<LegalCtx>(() => ({
    host: props.host,
    t: props.t,
    dt: props.dt,
    lt: props.lt,
    locale: props.locale,
    query: props.query,
    vocab: () => vocab.state().data,
  }));
  const remember = (name: string, value: string) => {
    const url = new URL(location.href);
    if (value) {
      url.searchParams.set(name, value);
    } else {
      url.searchParams.delete(name);
    }
    history.replaceState(history.state, "", url);
  };
  const open = (ref: string) => {
    setOpened(ref);
    remember("case", ref);
  };
  const counts = () => dash.state().data?.counts;
  return (
    <div class="nsvx-dev nsvx-of">
      <Show
        when={!opened()}
        fallback={
          <For each={[opened()]} keyed={(ref) => ref}>
            {(ref) => (
              <CasePage
                ctx={ctx()}
                caseRef={ref()}
                onBack={() => {
                  open("");
                  void dash.refresh();
                }}
              />
            )}
          </For>
        }
      >
        <div class="nsvx-of__bar">
          <Segs
            name={props.lt("legal")}
            items={["cases", "procedures"] as const}
            value={area()}
            label={(key) => props.lt(key)}
            icon={(key) => (key === "cases" ? "legal" : "flow")}
            onChange={(next) => {
              setArea(next);
              remember("legal", next === "cases" ? "" : next);
            }}
          />
          <Show when={area() === "cases"}>
            <span class="nsvx-dev__spacer" />
            <Reveal label={props.lt("settings")} icon="setup">
              {() => <CaseSettings ctx={ctx()} />}
            </Reveal>
            <Reveal label={props.lt("newCase")} icon="plus" primary>
              {(close) => <NewCase ctx={ctx()} close={close} onOpen={open} />}
            </Reveal>
          </Show>
        </div>
        <Show when={area() === "procedures"}>
          <LegalProcedures ctx={ctx()} />
        </Show>
        <Show when={area() === "cases"}>
          <Show when={counts()}>
            {(count) => (
              <Stats
                items={[
                  {
                    icon: "legal",
                    label: props.lt("open"),
                    value: String(count().active),
                    sub: count().waiting_docs
                      ? `${count().waiting_docs} ${props.lt("waiting_docs")}`
                      : undefined,
                    onClick: () => setPicked("active"),
                  },
                  {
                    icon: "spark",
                    label: props.lt("suggestions"),
                    value: String(count().suggestions),
                    onClick: () => setPicked("suggestions"),
                  },
                  {
                    icon: "alert",
                    label: props.lt("attention"),
                    value: String(count().attention),
                    tone: count().attention ? "warn" : undefined,
                  },
                  {
                    icon: "euro",
                    label: props.lt("owed"),
                    value: eur(dash.state().data?.outstanding_verified, props.locale),
                    tone: isZero(dash.state().data?.outstanding_verified) ? undefined : "bad",
                  },
                ]}
              />
            )}
          </Show>
          <Segs
            name={props.lt("cases")}
            items={CASE_VIEWS}
            value={picked()}
            label={(key) => props.lt(key)}
            icon={(key) => VIEW_ICON[key]}
            onChange={(next) => {
              setPicked(next);
              remember("cases", next === "all" ? "" : next);
            }}
          />
          <For each={[picked()]} keyed={(key) => key}>
            {(key) => (
              <Show
                when={key() === "suggestions"}
                fallback={
                  <CaseList ctx={ctx()} view={key()} dash={dash.state().data} onOpen={open} />
                }
              >
                <Suggestions ctx={ctx()} onOpen={open} onChange={() => void dash.refresh()} />
              </Show>
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
}
