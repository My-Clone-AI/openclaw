/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { isNegative, money, shortDate } from "./finance-data.js";
import {
  isoDay,
  maxOf,
  stateTone,
  type Earning,
  type FinanceSummary,
  type FleetInvoice,
  type Settlement,
} from "./fleet-data.js";
import { stateLabel } from "./fleet-i18n.js";
import {
  Block,
  Chip,
  Empty,
  fleetView,
  Glyph,
  PlatformMark,
  Seg,
  type Ctx,
  type GlyphName,
} from "./fleet-ui.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

const PARTS = ["summary", "invoices", "payouts", "earnings"] as const;
type Part = (typeof PARTS)[number];
const PART_ICON: Record<Part, GlyphName> = {
  summary: "reports",
  invoices: "receipt",
  payouts: "drivers",
  earnings: "trips",
};
const PERIODS = ["3", "6", "12"] as const;
type Period = (typeof PERIODS)[number];

function range(months: Period) {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - Number(months) + 1, 1);
  return { start: isoDay(start), end: isoDay(end) };
}

function Amount(props: { ctx: Ctx; value: string | null | undefined }) {
  return (
    <span class={["nsvx-fin__money", { "nsvx-fin__money--neg": isNegative(props.value) }]}>
      {money(props.value, "EUR", props.ctx.host.locale)}
    </span>
  );
}

function Kpi(props: {
  ctx: Ctx;
  icon: GlyphName;
  label: string;
  value: string | null | undefined;
  tone?: string;
}) {
  return (
    <div class={["nsvx-kpi", props.tone ? `nsvx-kpi--${props.tone}` : ""]}>
      <span class="nsvx-kpi__label">
        <Glyph name={props.icon} />
        {props.label}
      </span>
      <strong class="nsvx-kpi__value">
        <Amount ctx={props.ctx} value={props.value} />
      </strong>
    </div>
  );
}

function Summary(props: { ctx: Ctx; period: Period }) {
  const ft = props.ctx.ft;
  const summary = createSource(props.ctx.host, () =>
    fleetView<FinanceSummary>(props.ctx.host, "fleetFinance", range(props.period)),
  );
  void summary.refresh();
  return (
    <SourceView source={summary} t={props.ctx.t}>
      {(s) => {
        const top = () => maxOf(s().by_month.flatMap((m) => [m.revenue, m.expenses]));
        const platformTop = () => maxOf(Object.values(s().by_platform));
        return (
          <>
            <div class="nsvx-kpis">
              <Kpi
                ctx={props.ctx}
                icon="trips"
                label={ft("revenue")}
                value={s().revenue.net}
                tone="ok"
              />
              <Kpi
                ctx={props.ctx}
                icon="receipt"
                label={ft("expenses")}
                value={s().expenses.total}
              />
              <Kpi
                ctx={props.ctx}
                icon="reports"
                label={ft("result")}
                value={s().operating_result}
                tone={isNegative(s().operating_result) ? "bad" : "ok"}
              />
              <Kpi
                ctx={props.ctx}
                icon="drivers"
                label={ft("owedDrivers")}
                value={s().owed_to_drivers}
                tone="warn"
              />
              <Kpi ctx={props.ctx} icon="inbox" label={ft("toReceive")} value={s().receivables} />
              <Kpi ctx={props.ctx} icon="money" label={ft("toPay")} value={s().payables} />
            </div>
            <div class="nsvx-fleet-cols">
              <Block icon="reports" title={ft("byMonth")}>
                <div class="nsvx-fleet-bars" role="list">
                  <For each={s().by_month} keyed={(m) => m.month}>
                    {(m) => (
                      <div
                        class="nsvx-fleet-bars__col"
                        role="listitem"
                        aria-label={`${m().month} ${m().revenue} / ${m().expenses}`}
                      >
                        <span class="nsvx-fleet-bars__pair">
                          <span
                            class="nsvx-fleet-bars__bar nsvx-fleet-bars__bar--in"
                            style={{ height: `${(Math.abs(Number(m().revenue)) / top()) * 100}%` }}
                          />
                          <span
                            class="nsvx-fleet-bars__bar nsvx-fleet-bars__bar--out"
                            style={{ height: `${(Math.abs(Number(m().expenses)) / top()) * 100}%` }}
                          />
                        </span>
                        <span class="nsvx-fleet-bars__label">{m().month.slice(5)}</span>
                      </div>
                    )}
                  </For>
                </div>
                <div class="nsvx-legend">
                  <span>
                    <span class="nsvx-fleet-swatch nsvx-fleet-swatch--in" /> {ft("revenue")}
                  </span>
                  <span>
                    <span class="nsvx-fleet-swatch nsvx-fleet-swatch--out" /> {ft("expenses")}
                  </span>
                </div>
              </Block>
              <Block icon="link" title={ft("byPlatform")}>
                <ul class="nsvx-fleet-split">
                  <For each={Object.entries(s().by_platform)} keyed={([key]) => key}>
                    {(entry) => (
                      <li>
                        <PlatformMark code={entry()[0]} large />
                        <span class="nsvx-fleet-split__bar">
                          <span
                            style={{
                              width: `${(Math.abs(Number(entry()[1])) / platformTop()) * 100}%`,
                            }}
                          />
                        </span>
                        <Amount ctx={props.ctx} value={entry()[1]} />
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={Object.keys(s().by_platform).length === 0}>
                  <Empty icon="trips" text={ft("noneYet")} />
                </Show>
              </Block>
            </div>
          </>
        );
      }}
    </SourceView>
  );
}

function Invoices(props: { ctx: Ctx; period: Period }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ invoices: FleetInvoice[] }>(props.ctx.host, "fleetInvoices", range(props.period)),
  );
  void list.refresh();
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().invoices.filter((i) =>
            matches(props.ctx.query, i.counterparty, i.reference, i.category, i.holder),
          );
        return (
          <>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(i) => i.id}>
                {(invoice) => (
                  <li class="nsvx-row">
                    <span
                      class={[
                        "nsvx-fleet-dir",
                        `nsvx-fleet-dir--${invoice().direction === "in" ? "return" : "delivery"}`,
                      ]}
                      aria-hidden="true"
                    >
                      <Glyph name={invoice().direction === "in" ? "back" : "next"} />
                    </span>
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">
                        {invoice().counterparty ?? invoice().reference ?? "—"}
                      </span>
                      <span class="nsvx-row__detail">
                        {[
                          invoice().category,
                          invoice().holder,
                          shortDate(invoice().issued_on, props.ctx.host.locale),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Chip tone={stateTone(invoice().display_status)}>
                      {stateLabel(ft, "st_", invoice().display_status)}
                    </Chip>
                    <Amount ctx={props.ctx} value={invoice().gross} />
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty icon="receipt" text={ft("noneYet")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function Payouts(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ settlements: Settlement[] }>(props.ctx.host, "fleetSettlements"),
  );
  void list.refresh();
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().settlements.filter((s) => matches(props.ctx.query, s.driver_name));
        return (
          <>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(s) => s.id}>
                {(s) => (
                  <li class="nsvx-row">
                    <Glyph name="drivers" class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{s().driver_name}</span>
                      <span class="nsvx-row__detail">
                        {shortDate(s().period_start, props.ctx.host.locale)} –{" "}
                        {shortDate(s().period_end, props.ctx.host.locale)}
                      </span>
                    </span>
                    <Show when={s().changed_since_approval}>
                      <Chip tone="warn">{ft("changed")}</Chip>
                    </Show>
                    <Chip tone={stateTone(s().status)}>{stateLabel(ft, "st_", s().status)}</Chip>
                    <Amount ctx={props.ctx} value={s().owed_to_driver} />
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty icon="drivers" text={ft("noneYet")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function Earnings(props: { ctx: Ctx; period: Period }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ earnings: Earning[] }>(props.ctx.host, "fleetEarnings", range(props.period)),
  );
  void list.refresh();
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().earnings.filter((e) => matches(props.ctx.query, e.driver_name, e.platform));
        return (
          <>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(e) => e.id}>
                {(e) => (
                  <li class="nsvx-row">
                    <PlatformMark code={e().platform} />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{e().driver_name ?? "—"}</span>
                      <span class="nsvx-row__detail">
                        {shortDate(e().period_start, props.ctx.host.locale)} –{" "}
                        {shortDate(e().period_end, props.ctx.host.locale)}
                      </span>
                    </span>
                    <Amount ctx={props.ctx} value={e().net ?? e().gross} />
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty icon="trips" text={ft("noneYet")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

/** TVDE money, read only: settlements and invoices are approved and paid in NSVX, never from here. */
export function FleetMoney(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const [part, setPart] = createSignal<Part>("summary");
  const [period, setPeriod] = createSignal<Period>("6");
  return (
    <div class="nsvx-fleet-roster">
      <div class="nsvx-fin__bar">
        <Seg
          compact
          name={ft("money")}
          items={PARTS}
          value={part()}
          label={(key) => ft(key)}
          icon={(key) => PART_ICON[key]}
          onChange={setPart}
        />
        <span class="nsvx-fleet-bar-end">
          <Chip tone="off">
            <Glyph name="docs" /> {ft("readOnly")}
          </Chip>
          <Seg
            compact
            name={ft("byMonth")}
            items={PERIODS}
            value={period()}
            label={(key) => `${key}m`}
            onChange={setPeriod}
          />
        </span>
      </div>
      <For each={[`${part()}:${period()}`]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={part() === "summary"}>
              <Summary ctx={props.ctx} period={period()} />
            </Show>
            <Show when={part() === "invoices"}>
              <Invoices ctx={props.ctx} period={period()} />
            </Show>
            <Show when={part() === "payouts"}>
              <Payouts ctx={props.ctx} />
            </Show>
            <Show when={part() === "earnings"}>
              <Earnings ctx={props.ctx} period={period()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
