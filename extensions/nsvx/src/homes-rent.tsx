/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  euro,
  lisbonMonth,
  num,
  rentTone,
  type RentBoard,
  type RentMonth,
  type Suggestion,
} from "./homes-data.js";
import type { HK } from "./homes-i18n.js";
import { Act, Chip, day, Empty, Glyph, Section, Tile, Tiles, view, type Ctx } from "./homes-ui.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

function shift(month: string, by: number) {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const at = new Date(Date.UTC(year, m - 1 + by, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthName(locale: string, month: string) {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, m - 1, 15)));
}

/**
 * Rent: what each contract expects this month, bank payments still to match, and matches to undo. Matching only
 * records which payment paid which rent in NSVX; no receipt is issued (NSVX keeps receipts off) and no bank is called.
 */
export function Rent(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const [month, setMonth] = createSignal(lisbonMonth());
  const data = createSource(props.ctx.host, async () => {
    const [board, units] = await Promise.allSettled([
      view<RentBoard>(props.ctx.host, "rentBoard", { month: month() }),
      view<RentMonth>(props.ctx.host, "homesRent", { month: month() }),
    ]);
    if (board.status === "rejected" && units.status === "rejected") {
      throw board.reason;
    }
    return {
      board: board.status === "fulfilled" ? board.value : undefined,
      units: units.status === "fulfilled" ? units.value : undefined,
    };
  });
  void data.refresh();
  const go = (by: number) => {
    setMonth(shift(month(), by));
    void data.refresh();
  };
  const reload = () => void data.refresh();
  return (
    <div class="nsvx-homes__stack">
      <div class="nsvx-homes__monthbar">
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={h()("prev")}
          title={h()("prev")}
          onClick={() => go(-1)}
        >
          <Glyph name="prev" />
        </button>
        <strong class="nsvx-homes__month">{monthName(props.ctx.locale, month())}</strong>
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={h()("next")}
          title={h()("next")}
          onClick={() => go(1)}
        >
          <Glyph name="next" />
        </button>
      </div>
      <SourceView source={data} t={props.ctx.t}>
        {(loaded) => {
          const board = () => loaded().board;
          // Contracts (Arrendamento) first; the unit ledger (Imóveis) when no contract is set up.
          const totals = () => {
            const contracts = board()?.summary;
            const units = loaded().units?.summary;
            return contracts
              ? {
                  received: contracts.received,
                  outstanding: contracts.outstanding,
                  overdue: contracts.overdue,
                }
              : units
                ? {
                    received: units.collected,
                    outstanding: units.outstanding,
                    overdue: units.overdue_total,
                  }
                : undefined;
          };
          const tenantOf = (contractId: string) => {
            const contract = board()?.contracts.find((c) => c.id === contractId);
            const names = (contract?.tenant_ids ?? [])
              .map((id) => board()?.tenants.find((t) => t.id === id)?.name)
              .filter(Boolean);
            const home = board()?.properties.find((p) => p.id === contract?.property_id);
            return { tenant: names.join(", "), home: home?.name ?? home?.code ?? "" };
          };
          const expected = () =>
            (board()?.expected ?? [])
              .filter((row) => row.period === month())
              .filter((row) => {
                const who = tenantOf(row.contract_id);
                return matches(props.ctx.query, who.tenant, who.home);
              });
          // What is still unallocated on each bank payment, as NSVX counts it.
          const left = () =>
            new Map(
              (board()?.pending ?? [])
                .filter((p) => p.kind === "unmatched_payment")
                .map((p) => [p.target, p.amount]),
            );
          const unmatched = () =>
            (board()?.payments ?? []).filter((payment) => left().has(payment.id));
          const matched = () => (board()?.matches ?? []).filter((m) => !m.reversed_at).slice(0, 12);
          const overdueUnits = () =>
            (loaded().units?.overdue ?? []).filter((c) =>
              matches(props.ctx.query, c.unit, c.tenant, c.property),
            );
          return (
            <>
              <Show when={totals()}>
                {(sum) => (
                  <Tiles label={h()("rent")}>
                    <Tile
                      icon="check"
                      label={h()("received")}
                      value={euro(props.ctx.locale, sum().received)}
                      tone="ok"
                    />
                    <Tile
                      icon="calendar"
                      label={h()("toReceive")}
                      value={euro(props.ctx.locale, sum().outstanding)}
                      tone={(num(sum().outstanding) ?? 0) > 0 ? "warn" : "ok"}
                    />
                    <Tile
                      icon="flag"
                      label={h()("late")}
                      value={euro(props.ctx.locale, sum().overdue)}
                      tone={(num(sum().overdue) ?? 0) > 0 ? "bad" : "ok"}
                    />
                    <Show when={board()}>
                      <Tile
                        icon="link"
                        label={h()("toMatch")}
                        value={`${unmatched().length}`}
                        tone={unmatched().length ? "warn" : "ok"}
                      />
                    </Show>
                  </Tiles>
                )}
              </Show>

              <Show when={board()}>
                <div class="nsvx-homes__cols">
                  <Section title={h()("rents")} icon="rent" count={expected().length}>
                    <ul class="nsvx-list">
                      <For each={expected()} keyed={(row) => row.id}>
                        {(row) => (
                          <li class="nsvx-row">
                            <Glyph
                              name="user"
                              class={`nsvx-row__icon nsvx-row__icon--${rentTone(row().status)}`}
                            />
                            <span class="nsvx-row__main">
                              <span class="nsvx-row__title">
                                {tenantOf(row().contract_id).tenant ||
                                  tenantOf(row().contract_id).home}
                              </span>
                              <span class="nsvx-row__detail">
                                {tenantOf(row().contract_id).home} ·{" "}
                                {day(props.ctx.locale, row().due_on)}
                              </span>
                            </span>
                            <span class="nsvx-homes__amount">
                              {euro(props.ctx.locale, row().amount, true)}
                            </span>
                            <Chip tone={rentTone(row().status)}>
                              {h()(`rent_${row().status}` as HK)}
                            </Chip>
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={expected().length === 0}>
                      <Empty text={h()("noneYet")} />
                    </Show>
                  </Section>

                  <Section title={h()("payments")} icon="link" count={unmatched().length}>
                    <Show when={unmatched().length}>
                      <Act
                        ctx={props.ctx}
                        label={h()("autoMatch")}
                        icon="sync"
                        confirm
                        disabled={!props.ctx.host.connection.canWrite}
                        run={() => props.ctx.host.request("nsvx.rent.reconcile", {})}
                        onDone={reload}
                      />
                    </Show>
                    <ul class="nsvx-list">
                      <For each={unmatched()} keyed={(p) => p.id}>
                        {(payment) => (
                          <Payment
                            ctx={props.ctx}
                            payment={payment()}
                            left={left().get(payment().id) ?? payment().amount}
                            period={(id) =>
                              board()?.expected.find((row) => row.id === id)?.period ?? ""
                            }
                            onDone={reload}
                          />
                        )}
                      </For>
                    </ul>
                    <Show when={unmatched().length === 0}>
                      <Empty text={h()("allMatched")} />
                    </Show>
                    <Show when={matched().length}>
                      <details class="nsvx-homes__more">
                        <summary>
                          <Glyph name="check" />
                          <span>
                            {h()("matched")} · {matched().length}
                          </span>
                        </summary>
                        <ul class="nsvx-list">
                          <For each={matched()} keyed={(m) => m.id}>
                            {(match) => {
                              const payment = () =>
                                board()?.payments.find((p) => p.id === match().payment_id);
                              return (
                                <li class="nsvx-row">
                                  <span class="nsvx-row__main">
                                    <span class="nsvx-row__title">
                                      {payment()?.payer ?? payment()?.reference ?? "—"}
                                    </span>
                                    <span class="nsvx-row__detail">
                                      {day(props.ctx.locale, payment()?.received_on)}
                                    </span>
                                  </span>
                                  <span class="nsvx-homes__amount">
                                    {euro(props.ctx.locale, match().amount, true)}
                                  </span>
                                  <Act
                                    ctx={props.ctx}
                                    label={h()("undo")}
                                    icon="undo"
                                    iconOnly
                                    confirm
                                    disabled={!props.ctx.host.connection.canWrite}
                                    run={() =>
                                      props.ctx.host.request("nsvx.rent.reverse", {
                                        matchId: match().id,
                                      })
                                    }
                                    onDone={reload}
                                  />
                                </li>
                              );
                            }}
                          </For>
                        </ul>
                      </details>
                    </Show>
                  </Section>
                </div>
                <Show when={!board()?.issuance_enabled}>
                  <p class="nsvx-homes__hint">
                    <Glyph name="doc" />
                    {h()("receiptsOff")}
                  </p>
                </Show>
              </Show>

              <Show when={loaded().units}>
                <Section title={h()("lateUnits")} icon="door" count={overdueUnits().length}>
                  <ul class="nsvx-list">
                    <For each={overdueUnits()} keyed={(c) => c.id}>
                      {(charge) => (
                        <li class="nsvx-row">
                          <Glyph name="door" class="nsvx-row__icon nsvx-row__icon--bad" />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{charge().tenant ?? charge().unit}</span>
                            <span class="nsvx-row__detail">
                              {charge().unit} · {day(props.ctx.locale, charge().due_date)}
                            </span>
                          </span>
                          <span class="nsvx-homes__amount">
                            {euro(props.ctx.locale, charge().outstanding, true)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={overdueUnits().length === 0}>
                    <Empty text={h()("allGood")} />
                  </Show>
                </Section>
              </Show>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}

/** A bank payment not yet tied to a rent: NSVX ranks the rents it may pay; the owner picks one. */
function Payment(props: {
  ctx: Ctx;
  payment: RentBoard["payments"][number];
  left: string;
  period: (expectedId: string) => string;
  onDone: () => void;
}) {
  const h = () => props.ctx.h;
  const [open, setOpen] = createSignal(false);
  const options = createSource(props.ctx.host, () =>
    view<{ items: Suggestion[] }>(props.ctx.host, "rentSuggestions", { id: props.payment.id }),
  );
  return (
    <li class="nsvx-homes__payment">
      <div class="nsvx-row">
        <span class="nsvx-row__main">
          <span class="nsvx-row__title">
            {props.payment.payer ?? props.payment.reference ?? "—"}
          </span>
          <span class="nsvx-row__detail">{day(props.ctx.locale, props.payment.received_on)}</span>
        </span>
        <span class="nsvx-homes__amount">{euro(props.ctx.locale, props.left, true)}</span>
        <button
          type="button"
          class="nsvx__button"
          aria-expanded={open() ? "true" : "false"}
          onClick={() => {
            setOpen(!open());
            if (!options.state().data) {
              void options.refresh();
            }
          }}
        >
          <Glyph name="link" />
          <span>{h()("match")}</span>
        </button>
      </div>
      <Show when={open()}>
        <SourceView source={options} t={props.ctx.t}>
          {(loaded) => (
            <ul class="nsvx-list nsvx-homes__options">
              <For each={loaded().items.slice(0, 3)}>
                {(option) => (
                  <li class="nsvx-row">
                    <Chip tone={option.exact ? "ok" : "accent"}>{option.score}%</Chip>
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">
                        {option.expected_ids.map(props.period).join(" + ")}
                      </span>
                      <span class="nsvx-row__detail">
                        {option.reasons.map((why) => h()(`why_${why}` as HK)).join(" · ")}
                      </span>
                    </span>
                    <Act
                      ctx={props.ctx}
                      label={h()("link")}
                      icon="check"
                      primary
                      disabled={!props.ctx.host.connection.canWrite}
                      run={() =>
                        props.ctx.host.request("nsvx.rent.associate", {
                          paymentId: props.payment.id,
                          allocations: option.expected_ids.map((expectedId, index) => ({
                            expectedId,
                            amount: option.allocations[index],
                          })),
                        })
                      }
                      onDone={props.onDone}
                    />
                  </li>
                )}
              </For>
              <Show when={loaded().items.length === 0}>
                <Empty text={h()("noMatch")} />
              </Show>
            </ul>
          )}
        </SourceView>
      </Show>
    </li>
  );
}
