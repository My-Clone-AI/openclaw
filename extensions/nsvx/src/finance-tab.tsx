/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  AREAS,
  areaQuery,
  bankMark,
  bookedBalance,
  bookOf,
  cardUsedPercent,
  connectionTone,
  daysUntil,
  isNegative,
  monthGrid,
  money,
  obligationTone,
  shortDate,
  totalBooked,
  visibleAccounts,
  type Accounts,
  type Area,
  type BankTask,
  type BankTransaction,
  type Browse,
  type Capability,
  type Card,
  type Connection,
  type Dashboard,
  type DocSearch,
  type DocsOverview,
  type FinanceDoc,
  type IncomeStatement,
  type Invoices,
  type Journal,
  type LedgerKpi,
  type LedgerOverview,
  type Obligation,
  type Preview,
  type Review,
} from "./finance-data.js";
import type { MessageKey } from "./i18n.js";
import { age, createSource, matches, SourceView, type T } from "./ui-kit.js";
import "./finance.css";

type Section = "summary" | "banks" | "docs" | "books";
const SECTIONS: Section[] = ["summary", "banks", "docs", "books"];

const PATHS = {
  summary: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  banks: "M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18M12 3l9 5H3z",
  docs: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5M9 13h6m-6 4h4",
  books: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16m4-14h7",
  personal: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 9a7 7 0 0 1 14 0",
  eni: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  company:
    "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16m0-10h2a2 2 0 0 1 2 2v8M8 7h4m-4 4h4m-4 4h4M2 21h20",
  card: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm0 4h18M7 15h3",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  back: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14m10 3-5-5",
  calendar:
    "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z",
  alert:
    "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  close: "M6 6l12 12M18 6 6 18",
} as const;

function Glyph(props: { name: keyof typeof PATHS; class?: string }) {
  return (
    <svg viewBox="0 0 24 24" class={props.class ?? "nsvx__icon"} aria-hidden="true">
      <path d={PATHS[props.name]} />
    </svg>
  );
}

type Ctx = { host: ControlUiHost; t: T; query: string; area: Area; year: string };

function view<V>(host: ControlUiHost, name: string, params: Record<string, string> = {}) {
  return host.request<V>("nsvx.view", { view: name, params });
}

function Money(props: { ctx: Ctx; value: string | null | undefined; currency?: string | null }) {
  return (
    <span class={["nsvx-fin__money", { "nsvx-fin__money--neg": isNegative(props.value) }]}>
      {money(props.value, props.currency ?? "EUR", props.ctx.host.locale)}
    </span>
  );
}

function Kpi(props: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div class={["nsvx-kpi", props.tone ? `nsvx-kpi--${props.tone}` : ""]}>
      <span class="nsvx-kpi__label">{props.label}</span>
      <strong class="nsvx-kpi__value">{props.value}</strong>
      <Show when={props.sub}>
        <span class="nsvx-kpi__sub">{props.sub}</span>
      </Show>
    </div>
  );
}

function Segments<K extends string>(props: {
  items: K[];
  value: K;
  label: (key: K) => string;
  icon?: (key: K) => keyof typeof PATHS;
  onChange: (key: K) => void;
  name: string;
}) {
  return (
    <div class="nsvx-seg" role="radiogroup" aria-label={props.name}>
      <For each={props.items} keyed={false}>
        {(item) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === item() ? "true" : "false"}
            class={["nsvx-seg__item", { "nsvx-seg__item--on": props.value === item() }]}
            onClick={() => props.onChange(item())}
          >
            <Show when={props.icon}>{(icon) => <Glyph name={icon()(item())} />}</Show>
            <span>{props.label(item())}</span>
          </button>
        )}
      </For>
    </div>
  );
}

function dueLabel(t: T, iso: string | null) {
  const days = daysUntil(iso);
  if (days === null) {
    return "—";
  }
  if (days < 0) {
    return `${t("late")} ${-days}d`;
  }
  return days === 0 ? t("dueToday") : `${days}d`;
}

const TAX: Record<string, string> = {
  irs: "IRS",
  iva: "IVA",
  ss: "SS",
  irc: "IRC",
  ies: "IES",
  imi: "IMI",
  iuc: "IUC",
};

function Deadlines(props: { ctx: Ctx; items: Obligation[] }) {
  const rows = () =>
    props.items.filter((item) => matches(props.ctx.query, item.title, item.tax, item.period));
  return (
    <>
      <ul class="nsvx-list">
        <For each={rows()} keyed={(item) => item.id}>
          {(item) => (
            <li class="nsvx-row">
              <span class="nsvx-fin__tag">{TAX[item().tax] ?? item().tax.toUpperCase()}</span>
              <span class="nsvx-row__main">
                <span class="nsvx-row__title">{item().title}</span>
                <span class="nsvx-row__detail">
                  {shortDate(item().effective_due, props.ctx.host.locale)}
                </span>
              </span>
              <span class={["nsvx-fin__due", `nsvx-fin__due--${obligationTone(item())}`]}>
                {dueLabel(props.ctx.t, item().effective_due)}
              </span>
            </li>
          )}
        </For>
      </ul>
      <Show when={rows().length === 0}>
        <p class="nsvx__empty">{props.ctx.t(props.ctx.query ? "noResults" : "allGood")}</p>
      </Show>
    </>
  );
}

function Summary(props: { ctx: Ctx }) {
  const q = areaQuery(props.ctx.area);
  const dashboard = createSource(props.ctx.host, () =>
    view<Dashboard>(props.ctx.host, "financeDashboard", { ...q, year: props.ctx.year }),
  );
  void dashboard.refresh();
  const t = props.ctx.t;
  return (
    <SourceView source={dashboard} t={t}>
      {(data) => {
        const booked = () =>
          data().balances.totals.find(
            (total) => total.kind === "booked" && total.currency === "EUR",
          )?.amount ?? null;
        const next = () => data().obligations.find((item) => item.effective_due);
        const efatura = () => data().efatura_totals;
        const maxFlow = () =>
          Math.max(1, Number(efatura()?.purchases ?? 0), Number(efatura()?.sales ?? 0));
        return (
          <>
            <div class="nsvx-kpis">
              <Kpi
                label={t("income")}
                value={money(
                  data().summary.totals.revenue?.EUR ?? null,
                  "EUR",
                  props.ctx.host.locale,
                )}
                sub={`${data().summary.months_covered.length} ${t("monthsShort")}`}
              />
              <Show when={props.ctx.area !== "personal"}>
                <Kpi
                  label={t("vat")}
                  value={money(
                    data().summary.totals.vat_output?.EUR ?? null,
                    "EUR",
                    props.ctx.host.locale,
                  )}
                />
              </Show>
              <Kpi
                label={t("balance")}
                value={money(booked(), "EUR", props.ctx.host.locale)}
                sub={`${data().balances.accounts_read}/${data().balances.accounts_total}`}
              />
              <Kpi
                label={t("nextDue")}
                value={next() ? dueLabel(t, next()!.effective_due) : "—"}
                sub={next()?.title}
                tone={next() ? obligationTone(next()!) : undefined}
              />
            </div>
            <Show when={data().overdue > 0}>
              <p class="nsvx__notice nsvx__notice--bad" role="status">
                <Glyph name="alert" /> {data().overdue} {t("overdue")}
              </p>
            </Show>
            <Show when={efatura()}>
              {(flow) => (
                <div class="nsvx-flow" aria-label="e-Fatura">
                  <For
                    each={[
                      {
                        key: "buy" as const,
                        total: flow().purchases,
                        count: flow().purchases_count,
                      },
                      { key: "sell" as const, total: flow().sales, count: flow().sales_count },
                    ]}
                    keyed={(row) => row.key}
                  >
                    {(row) => (
                      <div class="nsvx-flow__row">
                        <span class="nsvx-flow__label">{t(row().key)}</span>
                        <span class="nsvx-flow__bar">
                          <span
                            class={["nsvx-flow__fill", `nsvx-flow__fill--${row().key}`]}
                            style={{ width: `${(Number(row().total) / maxFlow()) * 100}%` }}
                          />
                        </span>
                        <Money ctx={props.ctx} value={row().total} />
                        <span class="nsvx-row__age">{row().count}</span>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </Show>
            <h2 class="nsvx__heading">
              <Glyph name="calendar" /> {t("deadlines")}
            </h2>
            <Deadlines ctx={props.ctx} items={data().obligations} />
          </>
        );
      }}
    </SourceView>
  );
}

function BankMark(props: { code: string | null; label: string }) {
  const mark = () => bankMark(props.code, props.label);
  return (
    <span class="nsvx-bank" aria-hidden="true" style={{ background: mark().bg, color: mark().fg }}>
      {mark().text}
    </span>
  );
}

type BankData = { connections: Connection[]; accounts: Accounts; cards: Card[] };

const OPERATION_KEYS = new Set([
  "accounts",
  "balances",
  "transactions",
  "vault",
  "browser_login",
  "statements",
  "invoices",
  "transfer_preparation",
  "transfer_authorisation",
  "support",
]);

function Broker(props: { ctx: Ctx }) {
  const entity = areaQuery(props.ctx.area).entity;
  const access = createSource(props.ctx.host, async () => {
    const [capabilities, tasks] = await Promise.all([
      view<{ connections: Capability[] }>(props.ctx.host, "bankCapabilities", { entity }),
      view<{ tasks: BankTask[] }>(props.ctx.host, "bankTasks", areaQuery(props.ctx.area)),
    ]);
    return { connections: capabilities.connections, tasks: tasks.tasks };
  });
  void access.refresh();
  const t = props.ctx.t;
  return (
    <SourceView source={access} t={t}>
      {(data) => (
        <>
          <ul class="nsvx-list">
            <For each={data().connections} keyed={(item) => item.code}>
              {(item) => (
                <li class="nsvx-access">
                  <BankMark code={item().code} label={item().label} />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">{item().label}</span>
                    <span class="nsvx-access__ops">
                      <For
                        each={item().operations.filter((op) => OPERATION_KEYS.has(op.operation))}
                        keyed={(op) => op.operation}
                      >
                        {(op) => (
                          <span
                            class={["nsvx-op", `nsvx-op--${op().state}`]}
                            title={op().blocker ?? undefined}
                          >
                            <Show when={op().state === "blocked"}>
                              <Glyph name="lock" />
                            </Show>
                            {t(`op_${op().operation}` as MessageKey)}
                          </span>
                        )}
                      </For>
                    </span>
                  </span>
                </li>
              )}
            </For>
          </ul>
          <Show when={data().tasks.length > 0}>
            <h2 class="nsvx__heading">{t("bankTasks")}</h2>
            <ul class="nsvx-list">
              <For each={data().tasks} keyed={(task) => task.id}>
                {(task) => (
                  <li class="nsvx-row">
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{task().operation.replaceAll("_", " ")}</span>
                      <Show when={task().blocker}>
                        <span class="nsvx-row__detail">{task().blocker}</span>
                      </Show>
                    </span>
                    <span class="nsvx__chip">{task().state}</span>
                    <span class="nsvx-row__age">{age(task().created_at)}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <p class="nsvx-fin__note">
            <Glyph name="lock" /> {t("bankSafe")}
          </p>
        </>
      )}
    </SourceView>
  );
}

function Movements(props: { ctx: Ctx }) {
  const [rows, setRows] = createSignal<BankTransaction[]>([]);
  const [next, setNext] = createSignal<string | null>(null);
  let after: string | null = null;
  const page = createSource(props.ctx.host, async () => {
    const cursor = after;
    const answer = await view<{ transactions: BankTransaction[]; next: string | null }>(
      props.ctx.host,
      "bankTransactions",
      {
        ...areaQuery(props.ctx.area),
        limit: "50",
        ...(cursor ? { cursor } : {}),
      },
    );
    setRows([...(cursor ? rows() : []), ...answer.transactions]);
    after = answer.next;
    setNext(answer.next);
    return true;
  });
  void page.refresh();
  const visible = () =>
    rows().filter((row) =>
      matches(props.ctx.query, row.counterparty, row.description, row.account),
    );
  return (
    <SourceView source={page} t={props.ctx.t}>
      {() => (
        <>
          <ul class="nsvx-list">
            <For each={visible()} keyed={(row) => row.id}>
              {(row) => (
                <li class="nsvx-row">
                  <BankMark code={row().connection} label={row().account} />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">
                      {row().counterparty ?? row().description ?? "—"}
                    </span>
                    <span class="nsvx-row__detail">
                      {row().status === "pending"
                        ? props.ctx.t("pending")
                        : shortDate(row().booking_date ?? row().value_date, props.ctx.host.locale)}
                      {" · "}
                      {row().account}
                    </span>
                  </span>
                  <Money ctx={props.ctx} value={row().amount} currency={row().currency} />
                </li>
              )}
            </For>
          </ul>
          <Show when={visible().length === 0}>
            <p class="nsvx__empty">{props.ctx.t(props.ctx.query ? "noResults" : "nothing")}</p>
          </Show>
          <Show when={next()}>
            <button
              type="button"
              class="nsvx__button nsvx-fin__more"
              disabled={page.state().loading}
              onClick={() => void page.refresh()}
            >
              {props.ctx.t("more")}
            </button>
          </Show>
        </>
      )}
    </SourceView>
  );
}

function Banks(props: { ctx: Ctx }) {
  type Part = "accounts" | "moves" | "access";
  const [part, setPart] = createSignal<Part>("accounts");
  const banks = createSource(props.ctx.host, async (): Promise<BankData> => {
    const [connections, accounts, cards] = await Promise.all([
      view<{ connections: Connection[] }>(props.ctx.host, "financeConnections"),
      view<Accounts>(props.ctx.host, "financeAccounts", areaQuery(props.ctx.area)),
      view<{ cards: Card[] }>(props.ctx.host, "financeCards"),
    ]);
    return { connections: connections.connections, accounts, cards: cards.cards };
  });
  void banks.refresh();
  const t = props.ctx.t;
  const ownerOfArea = { personal: "personal", eni: "eni", company: "company" } as const;
  return (
    <>
      <Segments
        name={t("banks")}
        items={["accounts", "moves", "access"] as Part[]}
        value={part()}
        label={(key) => t(key)}
        onChange={setPart}
      />
      <Show when={part() === "accounts"}>
        <SourceView source={banks} t={t}>
          {(data) => {
            const accounts = () =>
              visibleAccounts(data().accounts.accounts).filter((account) =>
                matches(props.ctx.query, account.label, account.name, account.masked_id),
              );
            const connectionOf = (code: string | null) =>
              data().connections.find((item) => item.code === code);
            const cards = () =>
              data().cards.filter(
                (card) => !card.owner || card.owner === ownerOfArea[props.ctx.area],
              );
            return (
              <>
                <div class="nsvx-kpis">
                  <Kpi
                    label={t("balance")}
                    value={money(
                      totalBooked(data().accounts.accounts),
                      "EUR",
                      props.ctx.host.locale,
                    )}
                    sub={`${accounts().length} ${t("accounts").toLowerCase()}`}
                  />
                  <Kpi
                    label={t("banks")}
                    value={`${data().connections.filter((item) => item.state === "fresh").length}/${data().connections.length}`}
                    sub={t("connected")}
                  />
                </div>
                <ul class="nsvx-list">
                  <For each={accounts()} keyed={(account) => account.id}>
                    {(account) => {
                      const balance = () => bookedBalance(account());
                      const connection = () => connectionOf(account().connection);
                      return (
                        <li class="nsvx-row">
                          <BankMark code={account().connection} label={account().label} />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{account().name ?? account().label}</span>
                            <span class="nsvx-row__detail">
                              <Show when={connection()}>
                                {(item) => (
                                  <span
                                    class={[
                                      "nsvx__dot",
                                      `nsvx__dot--${connectionTone(item().state)}`,
                                    ]}
                                    aria-label={item().state}
                                  />
                                )}
                              </Show>
                              {account().masked_id ?? account().type ?? ""}
                              <Show when={connection()?.last_success_at}>
                                {(at) => <> · {age(at())}</>}
                              </Show>
                            </span>
                          </span>
                          <Show
                            when={balance()}
                            fallback={<span class="nsvx-row__age">{t("unknown")}</span>}
                          >
                            {(value) => (
                              <Money
                                ctx={props.ctx}
                                value={value().amount}
                                currency={value().currency}
                              />
                            )}
                          </Show>
                        </li>
                      );
                    }}
                  </For>
                </ul>
                <Show when={accounts().length === 0}>
                  <p class="nsvx__empty">{t(props.ctx.query ? "noResults" : "nothing")}</p>
                </Show>
                <Show when={cards().length > 0}>
                  <h2 class="nsvx__heading">
                    <Glyph name="card" /> {t("cards")}
                  </h2>
                  <div class="nsvx-cards">
                    <For each={cards()} keyed={(card) => card.id ?? card.label}>
                      {(card) => {
                        const used = () => cardUsedPercent(card());
                        return (
                          <div class={["nsvx-card", `nsvx-card--${card().network}`]}>
                            <span class="nsvx-card__top">
                              <span>{card().label}</span>
                              <span class="nsvx-card__net">{card().network.toUpperCase()}</span>
                            </span>
                            <span class="nsvx-card__num">•••• {card().last4 ?? "····"}</span>
                            <Show when={used() !== null}>
                              <span
                                class="nsvx-card__bar"
                                role="meter"
                                aria-valuemin="0"
                                aria-valuemax="100"
                                aria-valuenow={String(used())}
                                aria-label={t("used")}
                              >
                                <span style={{ width: `${used()}%` }} />
                              </span>
                            </Show>
                            <span class="nsvx-card__foot">
                              <span>{t(card().kind === "credit" ? "credit" : "debit")}</span>
                              <Show when={card().used}>
                                <Money
                                  ctx={props.ctx}
                                  value={card().used}
                                  currency={card().currency}
                                />
                              </Show>
                            </span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </>
            );
          }}
        </SourceView>
      </Show>
      <Show when={part() === "moves"}>
        <Movements ctx={props.ctx} />
      </Show>
      <Show when={part() === "access"}>
        <Broker ctx={props.ctx} />
      </Show>
    </>
  );
}

function MonthCells(props: { row: { months: number[]; missing: number[] }; year: number; t: T }) {
  return (
    <span class="nsvx-months" role="img" aria-label={props.t("months")}>
      <For each={monthGrid(props.row, props.year)} keyed={false}>
        {(state, index) => (
          <span class={["nsvx-month", `nsvx-month--${state()}`]} title={`${index + 1}`} />
        )}
      </For>
    </span>
  );
}

function DocViewer(props: { ctx: Ctx; doc: FinanceDoc; onClose: () => void }) {
  const [pageNo, setPageNo] = createSignal(1);
  // Loaders read plain request state: a signal write is not readable until the next flush.
  let current = 1;
  // NSVX downloads the file from Drive for every preview, so a page turn reuses the first answer.
  let known: Preview | undefined;
  const shown = createSource(props.ctx.host, async () => {
    known ??= await view<Preview>(props.ctx.host, "docPreview", { id: props.doc.id });
    const page =
      known.kind === "pdf"
        ? view<{ src: string }>(props.ctx.host, "docPage", {
            id: props.doc.id,
            page: String(current),
            w: "1000",
          })
        : known.kind === "image"
          ? view<{ src: string }>(props.ctx.host, "docImage", { id: props.doc.id })
          : undefined;
    return { preview: known, src: page ? (await page).src : undefined };
  });
  void shown.refresh();
  const turn = (step: number) => {
    current += step;
    setPageNo(current);
    void shown.refresh();
  };
  return (
    <section class="nsvx-viewer" aria-label={props.doc.name}>
      <header class="nsvx-viewer__head">
        <strong class="nsvx-row__title">{props.doc.name}</strong>
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={props.ctx.t("close")}
          title={props.ctx.t("close")}
          onClick={() => props.onClose()}
        >
          <Glyph name="close" />
        </button>
      </header>
      <SourceView source={shown} t={props.ctx.t}>
        {(data) => (
          <>
            <Show when={data().src}>
              {(src) => <img class="nsvx-viewer__page" src={src()} alt={props.doc.name} />}
            </Show>
            <Show when={(data().preview.pages ?? 1) > 1}>
              <div class="nsvx-viewer__pager">
                <button
                  type="button"
                  class="nsvx__button nsvx__button--icon"
                  aria-label={props.ctx.t("previous")}
                  disabled={pageNo() <= 1 || shown.state().loading}
                  onClick={() => turn(-1)}
                >
                  <Glyph name="back" />
                </button>
                <span>
                  {pageNo()} / {data().preview.pages}
                </span>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--icon"
                  aria-label={props.ctx.t("more")}
                  disabled={pageNo() >= (data().preview.pages ?? 1) || shown.state().loading}
                  onClick={() => turn(1)}
                >
                  <Glyph name="next" />
                </button>
              </div>
            </Show>
            <Show when={data().preview.rows}>
              {(rows) => (
                <div class="nsvx-viewer__table">
                  <table>
                    <tbody>
                      <For each={rows().slice(0, 40)} keyed={false}>
                        {(row) => (
                          <tr>
                            <For each={row().slice(0, 8)} keyed={false}>
                              {(cell) => <td>{cell()}</td>}
                            </For>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              )}
            </Show>
            <Show when={data().preview.text}>
              {(text) => <pre class="nsvx-viewer__text">{text().slice(0, 20_000)}</pre>}
            </Show>
            <Show when={data().preview.error || data().preview.kind === "other"}>
              <p class="nsvx__empty">{props.ctx.t("noPreview")}</p>
            </Show>
          </>
        )}
      </SourceView>
    </section>
  );
}

function DocList(props: { ctx: Ctx; docs: FinanceDoc[]; onOpen: (doc: FinanceDoc) => void }) {
  return (
    <ul class="nsvx-list">
      <For each={props.docs} keyed={(doc) => doc.id}>
        {(doc) => (
          <li>
            <button
              type="button"
              class="nsvx-row nsvx-row--link"
              onClick={() => props.onOpen(doc())}
            >
              <Glyph name="docs" class="nsvx-row__icon" />
              <span class="nsvx-row__main">
                <span class="nsvx-row__title">{doc().counterparty ?? doc().name}</span>
                <span class="nsvx-row__detail">
                  {[
                    doc().kind_label ?? doc().category_label,
                    shortDate(doc().issued_on, props.ctx.host.locale),
                  ]
                    .filter((part) => part && part !== "—")
                    .join(" · ")}
                </span>
              </span>
              <Show when={doc().duplicate || doc().unclassified}>
                <span class="nsvx__chip nsvx__chip--write">
                  {props.ctx.t(doc().duplicate ? "duplicate" : "unsorted")}
                </span>
              </Show>
              <Show when={doc().total}>
                <Money ctx={props.ctx} value={doc().total} />
              </Show>
            </button>
          </li>
        )}
      </For>
    </ul>
  );
}

function DocsBrowse(props: { ctx: Ctx; onOpen: (doc: FinanceDoc) => void }) {
  let path = "";
  const folder = createSource(props.ctx.host, () =>
    view<Browse>(props.ctx.host, "docsBrowse", {
      ...areaQuery(props.ctx.area),
      path,
      limit: "100",
    }),
  );
  void folder.refresh();
  const go = (next: string) => {
    path = next;
    void folder.refresh();
  };
  return (
    <SourceView source={folder} t={props.ctx.t}>
      {(data) => (
        <>
          <nav class="nsvx-crumbs" aria-label={props.ctx.t("folders")}>
            <button type="button" class="nsvx-crumb" onClick={() => go("")}>
              <Glyph name="folder" />
            </button>
            <For each={data().crumbs} keyed={(crumb) => crumb.path}>
              {(crumb) => (
                <>
                  <Glyph name="next" class="nsvx-crumbs__sep" />
                  <button type="button" class="nsvx-crumb" onClick={() => go(crumb().path)}>
                    {crumb().label}
                  </button>
                </>
              )}
            </For>
          </nav>
          <div class="nsvx-folders">
            <For
              each={data().folders.filter((item) => matches(props.ctx.query, item.label))}
              keyed={(item) => item.key}
            >
              {(item) => (
                <button
                  type="button"
                  class="nsvx-folder"
                  onClick={() => go(data().path ? `${data().path}/${item().key}` : item().key)}
                >
                  <Glyph name="folder" />
                  <span class="nsvx-folder__label">{item().label}</span>
                  <strong>{item().count}</strong>
                </button>
              )}
            </For>
          </div>
          <DocList
            ctx={props.ctx}
            docs={data().documents.filter((doc) =>
              matches(props.ctx.query, doc.name, doc.counterparty, doc.category_label),
            )}
            onOpen={props.onOpen}
          />
          <Show when={data().folders.length === 0 && data().documents.length === 0}>
            <p class="nsvx__empty">{props.ctx.t("nothing")}</p>
          </Show>
        </>
      )}
    </SourceView>
  );
}

function DocsOverviewView(props: { ctx: Ctx }) {
  const overview = createSource(props.ctx.host, () =>
    view<DocsOverview>(props.ctx.host, "docsOverview", {
      ...areaQuery(props.ctx.area),
      year: props.ctx.year,
    }),
  );
  void overview.refresh();
  const t = props.ctx.t;
  const year = Number(props.ctx.year);
  return (
    <SourceView source={overview} t={t}>
      {(data) => (
        <>
          <div class="nsvx-kpis">
            <Kpi
              label={t("unsorted")}
              value={String(data().unclassified)}
              tone={data().unclassified ? "warn" : "ok"}
            />
            <Kpi
              label={t("duplicate")}
              value={String(data().duplicates)}
              tone={data().duplicates ? "warn" : "ok"}
            />
            <Kpi label={t("synced")} value={data().last_sync ? age(data().last_sync!.at) : "—"} />
          </div>
          <div class="nsvx-legend nsvx-legend--months">
            <span>
              <span class="nsvx-month nsvx-month--available" /> {t("have")}
            </span>
            <span>
              <span class="nsvx-month nsvx-month--pending" /> {t("pending")}
            </span>
            <span>
              <span class="nsvx-month nsvx-month--missing" /> {t("missing")}
            </span>
            <span>
              <span class="nsvx-month nsvx-month--future" /> {t("later")}
            </span>
          </div>
          <ul class="nsvx-list">
            <For
              each={[
                ...data().statements.map((row) => ({
                  id: `s:${row.account}`,
                  label: row.label,
                  row,
                })),
                ...data().saft.map((row) => ({
                  id: `f:${row.source}`,
                  label: `SAF-T ${row.label}`,
                  row,
                })),
              ]}
              keyed={(item) => item.id}
            >
              {(item) => (
                <li class="nsvx-row nsvx-row--grid">
                  <span class="nsvx-row__title">{item().label}</span>
                  <MonthCells row={item().row} year={year} t={t} />
                </li>
              )}
            </For>
          </ul>
          <Show when={data().invoices.length > 0}>
            <h2 class="nsvx__heading">{t("invoices")}</h2>
            <div class="nsvx-quarters">
              <For each={data().invoices} keyed={(item) => item.quarter}>
                {(item) => (
                  <div class="nsvx-quarter">
                    <span>T{item().quarter}</span>
                    <span class="nsvx-flow__bar">
                      <span
                        class="nsvx-flow__fill nsvx-flow__fill--buy"
                        style={{
                          width: `${item().total ? (item().classified / item().total) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span class="nsvx-row__age">
                      {item().classified}/{item().total}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </>
      )}
    </SourceView>
  );
}

function InvoiceList(props: { ctx: Ctx }) {
  const [role, setRole] = createSignal<"acquirer" | "issuer">("acquirer");
  const [rows, setRows] = createSignal<Invoices["invoices"]>([]);
  const [next, setNext] = createSignal<string | null>(null);
  let wanted: "acquirer" | "issuer" = "acquirer";
  let cursor: string | null = null;
  const page = createSource(props.ctx.host, async () => {
    const before = cursor;
    const answer = await view<Invoices>(props.ctx.host, "financeInvoices", {
      ...areaQuery(props.ctx.area),
      role: wanted,
      year: props.ctx.year,
      limit: "40",
      ...(before ? { before } : {}),
    });
    setRows([...(before ? rows() : []), ...answer.invoices]);
    cursor = answer.next;
    setNext(answer.next);
    return true;
  });
  void page.refresh();
  const pick = (value: "acquirer" | "issuer") => {
    wanted = value;
    cursor = null;
    setRole(value);
    setNext(null);
    setRows([]);
    void page.refresh();
  };
  const visible = () =>
    rows().filter((row) => matches(props.ctx.query, row.counterparty_name, row.number));
  return (
    <>
      <Show when={props.ctx.area !== "personal"}>
        <Segments
          name={props.ctx.t("invoices")}
          items={["acquirer", "issuer"] as const as ("acquirer" | "issuer")[]}
          value={role()}
          label={(key) => props.ctx.t(key === "acquirer" ? "buy" : "sell")}
          onChange={pick}
        />
      </Show>
      <SourceView source={page} t={props.ctx.t}>
        {() => (
          <>
            <ul class="nsvx-list">
              <For each={visible()} keyed={(row) => row.id}>
                {(row) => (
                  <li class="nsvx-row">
                    <span class="nsvx-fin__tag">{row().doc_type}</span>
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{row().counterparty_name ?? row().number}</span>
                      <span class="nsvx-row__detail">
                        {shortDate(row().issued_on, props.ctx.host.locale)} · {row().number}
                      </span>
                    </span>
                    <Money ctx={props.ctx} value={row().total} />
                  </li>
                )}
              </For>
            </ul>
            <Show when={visible().length === 0}>
              <p class="nsvx__empty">{props.ctx.t(props.ctx.query ? "noResults" : "nothing")}</p>
            </Show>
            <Show when={next()}>
              <button
                type="button"
                class="nsvx__button nsvx-fin__more"
                disabled={page.state().loading}
                onClick={() => void page.refresh()}
              >
                {props.ctx.t("more")}
              </button>
            </Show>
          </>
        )}
      </SourceView>
    </>
  );
}

function Docs(props: { ctx: Ctx }) {
  type Part = "overview" | "folders" | "invoices";
  const [part, setPart] = createSignal<Part>("overview");
  const [open, setOpen] = createSignal<FinanceDoc>();
  const [searched, setSearched] = createSignal("");
  let term = "";
  const found = createSource(props.ctx.host, () =>
    view<DocSearch>(props.ctx.host, "docsSearch", { q: term, ...areaQuery(props.ctx.area) }),
  );
  const search = () => {
    term = props.ctx.query.trim();
    setSearched(term);
    void found.refresh();
  };
  const t = props.ctx.t;
  return (
    <>
      <Show when={open()}>
        {(doc) => <DocViewer ctx={props.ctx} doc={doc()} onClose={() => setOpen(undefined)} />}
      </Show>
      <Show when={props.ctx.query.trim().length > 1}>
        <button type="button" class="nsvx__button nsvx-fin__search" onClick={search}>
          <Glyph name="search" /> {t("searchDocs")} “{props.ctx.query.trim()}”
        </button>
      </Show>
      <Show
        when={searched() && searched() === props.ctx.query.trim()}
        fallback={
          <>
            <Segments
              name={t("docs")}
              items={["overview", "folders", "invoices"] as Part[]}
              value={part()}
              label={(key) => t(key)}
              onChange={setPart}
            />
            <Show when={part() === "overview"}>
              <DocsOverviewView ctx={props.ctx} />
            </Show>
            <Show when={part() === "folders"}>
              <DocsBrowse ctx={props.ctx} onOpen={setOpen} />
            </Show>
            <Show when={part() === "invoices"}>
              <InvoiceList ctx={props.ctx} />
            </Show>
          </>
        }
      >
        <SourceView source={found} t={t}>
          {(data) => (
            <>
              <DocList ctx={props.ctx} docs={data().documents} onOpen={setOpen} />
              <Show when={data().documents.length === 0}>
                <p class="nsvx__empty">{t("noResults")}</p>
              </Show>
            </>
          )}
        </SourceView>
      </Show>
    </>
  );
}

const LEDGER_KPIS: { key: LedgerKpi; label: MessageKey }[] = [
  { key: "revenue", label: "income" },
  { key: "fse", label: "costs" },
  { key: "ebitda", label: "ebitda" },
  { key: "net", label: "profit" },
  { key: "cash", label: "cash" },
  { key: "tax", label: "tax" },
];

function Bars(props: { values: (string | null)[]; t: T }) {
  const max = () => Math.max(1, ...props.values.map((value) => Math.abs(Number(value ?? 0))));
  return (
    <div class="nsvx-bars" role="img" aria-label={props.t("income")}>
      <For each={props.values} keyed={false}>
        {(value) => (
          <span
            class={["nsvx-bars__bar", { "nsvx-bars__bar--neg": isNegative(value()) }]}
            style={{ height: `${(Math.abs(Number(value() ?? 0)) / max()) * 100}%` }}
          />
        )}
      </For>
    </div>
  );
}

function Journal(props: { ctx: Ctx; book: string }) {
  const [offset, setOffset] = createSignal(0);
  const [openId, setOpenId] = createSignal<string>();
  let start = 0;
  const journal = createSource(props.ctx.host, () =>
    view<Journal>(props.ctx.host, "ledgerJournal", {
      book: props.book,
      year: props.ctx.year,
      limit: "50",
      offset: String(start),
    }),
  );
  void journal.refresh();
  const turn = (step: number) => {
    start = Math.max(0, start + step * 50);
    setOffset(start);
    void journal.refresh();
  };
  return (
    <SourceView source={journal} t={props.ctx.t}>
      {(data) => (
        <>
          <ul class="nsvx-list">
            <For
              each={data().entries.filter((entry) =>
                matches(props.ctx.query, entry.description, entry.origin),
              )}
              keyed={(entry) => entry.id}
            >
              {(entry) => {
                const total = () =>
                  entry()
                    .lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0)
                    .toFixed(2);
                return (
                  <li>
                    <button
                      type="button"
                      class="nsvx-row nsvx-row--link"
                      aria-expanded={openId() === entry().id ? "true" : "false"}
                      onClick={() => setOpenId(openId() === entry().id ? undefined : entry().id)}
                    >
                      <span class="nsvx-fin__tag">
                        {shortDate(entry().entry_date, props.ctx.host.locale)}
                      </span>
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{entry().description ?? entry().origin}</span>
                      </span>
                      <Money ctx={props.ctx} value={total()} />
                    </button>
                    <Show when={openId() === entry().id}>
                      <table class="nsvx-lines">
                        <tbody>
                          <For each={entry().lines} keyed={(line) => line.line_no}>
                            {(line) => (
                              <tr>
                                <td>{line().account_code}</td>
                                <td>{line().account_name}</td>
                                <td>
                                  <Money ctx={props.ctx} value={line().debit} />
                                </td>
                                <td>
                                  <Money ctx={props.ctx} value={line().credit} />
                                </td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
          <Show when={data().entries.length === 0}>
            <p class="nsvx__empty">{props.ctx.t(props.ctx.query ? "noResults" : "nothing")}</p>
          </Show>
          <Show when={data().total > 50}>
            <div class="nsvx-viewer__pager">
              <button
                type="button"
                class="nsvx__button nsvx__button--icon"
                aria-label={props.ctx.t("previous")}
                disabled={offset() === 0}
                onClick={() => turn(-1)}
              >
                <Glyph name="back" />
              </button>
              <span>
                {offset() + 1}–{Math.min(offset() + 50, data().total)} / {data().total}
              </span>
              <button
                type="button"
                class="nsvx__button nsvx__button--icon"
                aria-label={props.ctx.t("more")}
                disabled={offset() + 50 >= data().total}
                onClick={() => turn(1)}
              >
                <Glyph name="next" />
              </button>
            </div>
          </Show>
        </>
      )}
    </SourceView>
  );
}

function Books(props: { ctx: Ctx }) {
  type Part = "overview" | "review" | "journal" | "results";
  const [book, setBook] = createSignal(bookOf(props.ctx.area));
  const [part, setPart] = createSignal<Part>("overview");
  const t = props.ctx.t;
  return (
    <>
      <div class="nsvx-fin__bar">
        <Segments
          name={t("books")}
          items={["eni", "company"] as ("eni" | "company")[]}
          value={book()}
          label={(key) => (key === "eni" ? "ENI" : "Fortune Comet")}
          icon={(key) => (key === "eni" ? "eni" : "company")}
          onChange={setBook}
        />
        <Segments
          name={t("books")}
          items={["overview", "review", "journal", "results"] as Part[]}
          value={part()}
          label={(key) => t(key)}
          onChange={setPart}
        />
      </div>
      <For each={[`${book()}:${part()}`]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={part() === "overview"}>
              <LedgerOverviewView ctx={props.ctx} book={book()} />
            </Show>
            <Show when={part() === "review"}>
              <ReviewList ctx={props.ctx} book={book()} />
            </Show>
            <Show when={part() === "journal"}>
              <Journal ctx={props.ctx} book={book()} />
            </Show>
            <Show when={part() === "results"}>
              <Results ctx={props.ctx} book={book()} />
            </Show>
          </>
        )}
      </For>
    </>
  );
}

const REPORT_STATUS = new Set(["draft", "provisional", "reviewed", "finalized"]);

function LedgerOverviewView(props: { ctx: Ctx; book: string }) {
  const overview = createSource(props.ctx.host, () =>
    view<LedgerOverview>(props.ctx.host, "ledgerOverview", {
      book: props.book,
      year: props.ctx.year,
    }),
  );
  void overview.refresh();
  const t = props.ctx.t;
  return (
    <SourceView source={overview} t={t}>
      {(data) => (
        <Show when={data().built} fallback={<p class="nsvx__empty">{t("notBuilt")}</p>}>
          <div class="nsvx-fin__chips">
            <Show when={data().status}>
              {(status) => (
                <span class="nsvx__chip">
                  {REPORT_STATUS.has(status()) ? t(`r_${status()}` as MessageKey) : status()}
                </span>
              )}
            </Show>
            <Show when={data().projection}>
              <span class="nsvx__chip">{t("projection")}</span>
            </Show>
            <span class={["nsvx__chip", { "nsvx__chip--write": data().balanced === false }]}>
              {t(data().balanced === false ? "unbalanced" : "balanced")}
            </span>
            <Show when={data().calculated_at}>
              <span class="nsvx-row__age">{age(data().calculated_at)}</span>
            </Show>
          </div>
          <div class="nsvx-kpis">
            <For each={LEDGER_KPIS} keyed={false}>
              {(kpi) => (
                <Kpi
                  label={t(kpi().label)}
                  value={money(data().kpis?.[kpi().key] ?? null, "EUR", props.ctx.host.locale)}
                  tone={
                    kpi().key !== "fse" && isNegative(data().kpis?.[kpi().key]) ? "bad" : undefined
                  }
                />
              )}
            </For>
          </div>
          <Show when={data().monthly?.receitas?.months}>
            {(months) => <Bars values={months()} t={t} />}
          </Show>
          <Show when={data().coverage}>
            {(coverage) => (
              <div class="nsvx-flow">
                <div class="nsvx-flow__row">
                  <span class="nsvx-flow__label">{t("verified")}</span>
                  <span class="nsvx-flow__bar">
                    <span
                      class="nsvx-flow__fill nsvx-flow__fill--buy"
                      style={{ width: `${Number(coverage().pct_confirmed ?? 0)}%` }}
                    />
                  </span>
                  <span class="nsvx-row__age">
                    {Math.round(Number(coverage().pct_confirmed ?? 0))}%
                  </span>
                </div>
                <Show when={coverage().needs_review > 0}>
                  <p class="nsvx__notice" role="status">
                    <Glyph name="alert" /> {coverage().needs_review} {t("review").toLowerCase()}
                  </p>
                </Show>
              </div>
            )}
          </Show>
        </Show>
      )}
    </SourceView>
  );
}

function ReviewList(props: { ctx: Ctx; book: string }) {
  const review = createSource(props.ctx.host, () =>
    view<Review>(props.ctx.host, "ledgerReview", {
      book: props.book,
      year: props.ctx.year,
      status: "needs_review",
      limit: "100",
    }),
  );
  void review.refresh();
  return (
    <SourceView source={review} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().transactions.filter((row) =>
            matches(props.ctx.query, row.description, row.counterparty),
          );
        return (
          <>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(row) => row.id}>
                {(row) => (
                  <li class="nsvx-row">
                    <Glyph name="alert" class="nsvx-row__icon nsvx-row__icon--warn" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">
                        {row().counterparty ?? row().description ?? "—"}
                      </span>
                      <span class="nsvx-row__detail">
                        {[
                          shortDate(row().occurred_on, props.ctx.host.locale),
                          ...(row().classification?.issues ?? []),
                        ].join(" · ")}
                      </span>
                    </span>
                    <Money ctx={props.ctx} value={row().gross} />
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <p class="nsvx__empty">{props.ctx.t(props.ctx.query ? "noResults" : "allGood")}</p>
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function Results(props: { ctx: Ctx; book: string }) {
  const report = createSource(props.ctx.host, () =>
    view<IncomeStatement>(props.ctx.host, "ledgerReport", {
      kind: "income_statement",
      book: props.book,
      year: props.ctx.year,
    }),
  );
  void report.refresh();
  return (
    <SourceView source={report} t={props.ctx.t}>
      {(data) => (
        <Show when={data().report} fallback={<p class="nsvx__empty">{props.ctx.t("notBuilt")}</p>}>
          {(statement) => (
            <table class="nsvx-lines nsvx-lines--report">
              <tbody>
                <For each={statement().lines} keyed={(line) => line.code}>
                  {(line) => (
                    <tr class={{ "nsvx-lines__total": Boolean(line().total) }}>
                      <td>{line().label}</td>
                      <td>
                        <Money ctx={props.ctx} value={line().value} />
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          )}
        </Show>
      )}
    </SourceView>
  );
}

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 2021 }, (_, index) => String(THIS_YEAR - index));
const AREA_LABEL: Record<Area, MessageKey> = {
  personal: "areaPersonal",
  eni: "areaEni",
  company: "areaCompany",
};

/** NSVX Finanças inside Control: one area switch and year, four sections, all reads from NSVX itself. */
export function FinanceTab(props: { host: ControlUiHost; t: T; query: string }) {
  const search = new URLSearchParams(location.search);
  const pick = <K extends string>(value: string | null, allowed: readonly K[], fallback: K) =>
    allowed.includes(value as K) ? (value as K) : fallback;
  const [section, setSection] = createSignal<Section>(pick(search.get("fin"), SECTIONS, "summary"));
  const [area, setArea] = createSignal<Area>(pick(search.get("area"), AREAS, "personal"));
  const [year, setYear] = createSignal(pick(search.get("year"), YEARS, String(THIS_YEAR)));
  // Deep links: the address keeps the section, area and year (values passed in, not read back).
  const remember = (next: { fin?: Section; area?: Area; year?: string }) => {
    const url = new URL(location.href);
    url.searchParams.set("fin", next.fin ?? section());
    url.searchParams.set("area", next.area ?? area());
    url.searchParams.set("year", next.year ?? year());
    history.replaceState(history.state, "", url);
  };
  const ctx = createMemo<Ctx>(() => ({
    host: props.host,
    t: props.t,
    query: props.query,
    area: area(),
    year: year(),
  }));
  return (
    <div class="nsvx-fin">
      <div class="nsvx-fin__bar">
        <Segments
          name={props.t("area")}
          items={AREAS}
          value={area()}
          label={(key) => props.t(AREA_LABEL[key])}
          icon={(key) => key}
          onChange={(next) => {
            setArea(next);
            remember({ area: next });
          }}
        />
        <label class="nsvx-field nsvx-fin__year">
          <span class="nsvx-visually-hidden">{props.t("year")}</span>
          <select
            aria-label={props.t("year")}
            onChange={(event) => {
              setYear(event.currentTarget.value);
              remember({ year: event.currentTarget.value });
            }}
          >
            <For each={YEARS} keyed={false}>
              {(option) => (
                <option value={option()} selected={option() === year()}>
                  {option()}
                </option>
              )}
            </For>
          </select>
        </label>
      </div>
      <Segments
        name={props.t("money")}
        items={SECTIONS}
        value={section()}
        label={(key) => props.t(key)}
        icon={(key) => key}
        onChange={(next) => {
          setSection(next);
          remember({ fin: next });
        }}
      />
      <For each={[`${section()}:${area()}:${year()}`]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={section() === "summary"}>
              <Summary ctx={ctx()} />
            </Show>
            <Show when={section() === "banks"}>
              <Banks ctx={ctx()} />
            </Show>
            <Show when={section() === "docs"}>
              <Docs ctx={ctx()} />
            </Show>
            <Show when={section() === "books"}>
              <Books ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
