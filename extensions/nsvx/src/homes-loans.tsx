/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  euro,
  lisbonDay,
  mortgageFacts,
  MORTGAGE_PURPOSES,
  num,
  type Lender,
  type LoanDetail,
  type Loans as LoanBook,
  type MortgageCase,
  type MortgageDetail,
  type RateScenarios,
} from "./homes-data.js";
import type { HK } from "./homes-i18n.js";
import {
  Act,
  Chip,
  day,
  Empty,
  Glyph,
  newKey,
  Section,
  Tile,
  Tiles,
  view,
  type Ctx,
} from "./homes-ui.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

const pct = (value: string | null | undefined) =>
  value === null || value === undefined ? "—" : `${value}%`;

/** Loans (Imóveis › Crédito) with their next payment and what a rate move costs, plus the mortgage cases. */
export function Loans(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const [open, setOpen] = createSignal<string>();
  const data = createSource(props.ctx.host, async () => {
    const [loans, cases] = await Promise.allSettled([
      view<LoanBook>(props.ctx.host, "homesLoans"),
      view<{ cases: MortgageCase[] }>(props.ctx.host, "mortgageCases"),
    ]);
    if (loans.status === "rejected" && cases.status === "rejected") {
      throw loans.reason;
    }
    return {
      loans: loans.status === "fulfilled" ? loans.value : undefined,
      cases: cases.status === "fulfilled" ? cases.value.cases : undefined,
    };
  });
  void data.refresh();
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const live = () =>
          (loaded().loans?.items ?? []).filter(
            (loan) => !loan.closed_at && matches(props.ctx.query, loan.name, loan.bank),
          );
        const balance = () =>
          live().reduce((sum, loan) => sum + (num(loan.summary?.balance) ?? 0), 0);
        const monthly = () =>
          live().reduce((sum, loan) => sum + (num(loan.summary?.installment) ?? 0), 0);
        return (
          <div class="nsvx-homes__stack">
            <Show when={loaded().loans}>
              {(book) => (
                <>
                  <Tiles label={h()("loans")}>
                    <Tile
                      icon="loans"
                      label={h()("owed")}
                      value={euro(props.ctx.locale, balance())}
                    />
                    <Tile
                      icon="calendar"
                      label={h()("monthly")}
                      value={euro(props.ctx.locale, monthly())}
                    />
                    <Tile
                      icon="chart"
                      label={h()("interestYear")}
                      value={euro(props.ctx.locale, book().financing.interest_ytd)}
                    />
                    <Tile
                      icon="sync"
                      label={h()("variable")}
                      value={pct(book().financing.variable_share)}
                      tone={(num(book().financing.variable_share) ?? 0) > 50 ? "warn" : "off"}
                    />
                  </Tiles>
                  <Section title={h()("loans")} icon="loans" count={live().length}>
                    <ul class="nsvx-homes__loans">
                      <For each={live()} keyed={(loan) => loan.id}>
                        {(loan) => {
                          const paid = () => {
                            const principal = num(loan().principal) ?? 0;
                            const left = num(loan().summary?.balance) ?? principal;
                            return principal > 0
                              ? Math.min(1, Math.max(0, 1 - left / principal))
                              : 0;
                          };
                          const reset = () =>
                            book().financing.resets.find((r) => r.loan_id === loan().id);
                          return (
                            <li>
                              <button
                                type="button"
                                class="nsvx-homes__loan"
                                aria-expanded={open() === loan().id ? "true" : "false"}
                                onClick={() =>
                                  setOpen(open() === loan().id ? undefined : loan().id)
                                }
                              >
                                <span class="nsvx-homes__card-head">
                                  <Glyph name="bank" class="nsvx-homes__card-icon" />
                                  <span class="nsvx-row__main">
                                    <span class="nsvx-row__title">{loan().name}</span>
                                    <span class="nsvx-row__detail">
                                      {loan().bank} · {pct(loan().summary?.rate)} ·{" "}
                                      {h()(`rate_${loan().rate_type}` as HK)}
                                    </span>
                                  </span>
                                  <strong class="nsvx-homes__amount">
                                    {euro(props.ctx.locale, loan().summary?.balance)}
                                  </strong>
                                </span>
                                <span
                                  class="nsvx-homes__progress"
                                  role="img"
                                  aria-label={`${Math.round(paid() * 100)}%`}
                                >
                                  <span style={{ width: `${paid() * 100}%` }} />
                                </span>
                                <span class="nsvx-homes__chips">
                                  <Chip tone="accent">
                                    <Glyph name="calendar" />
                                    {day(props.ctx.locale, loan().summary?.next_due)} ·{" "}
                                    {euro(props.ctx.locale, loan().summary?.installment, true)}
                                  </Chip>
                                  <Show when={reset()}>
                                    {(r) => (
                                      <Chip tone={r().days <= 60 ? "warn" : "off"}>
                                        <Glyph name="sync" />
                                        {r().days}d
                                      </Chip>
                                    )}
                                  </Show>
                                  <Show when={loan().error}>
                                    <Chip tone="bad">{h()("noRate")}</Chip>
                                  </Show>
                                </span>
                              </button>
                              <Show when={open() === loan().id}>
                                <LoanPlan ctx={props.ctx} id={loan().id} />
                              </Show>
                            </li>
                          );
                        }}
                      </For>
                    </ul>
                    <Show when={live().length === 0}>
                      <Empty text={h()("noLoans")} />
                    </Show>
                  </Section>
                  <Show when={live().length}>
                    <Rates ctx={props.ctx} />
                  </Show>
                </>
              )}
            </Show>
            <Show when={loaded().cases}>
              {(cases) => (
                <Mortgage ctx={props.ctx} cases={cases()} onChange={() => void data.refresh()} />
              )}
            </Show>
          </div>
        );
      }}
    </SourceView>
  );
}

function LoanPlan(props: { ctx: Ctx; id: string }) {
  const h = () => props.ctx.h;
  const data = createSource(props.ctx.host, () =>
    view<LoanDetail>(props.ctx.host, "homesLoan", { id: props.id }),
  );
  void data.refresh();
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const today = lisbonDay();
        const next = () => (loaded().schedule ?? []).filter((row) => row.due >= today).slice(0, 6);
        return (
          <table class="nsvx-homes__table">
            <thead>
              <tr>
                <th>{h()("date")}</th>
                <th>{h()("payment")}</th>
                <th>{h()("interest")}</th>
                <th>{h()("owed")}</th>
              </tr>
            </thead>
            <tbody>
              <For each={next()}>
                {(row) => (
                  <tr>
                    <td>{day(props.ctx.locale, row.due)}</td>
                    <td>{euro(props.ctx.locale, row.payment, true)}</td>
                    <td>{euro(props.ctx.locale, row.interest, true)}</td>
                    <td>{euro(props.ctx.locale, row.balance)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        );
      }}
    </SourceView>
  );
}

/** What each loan's payment becomes if rates move; NSVX only calculates (`realestate/simulate.py`). */
function Rates(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const [custom, setCustom] = createSignal("");
  const data = createSource(props.ctx.host, () => {
    const rate = custom().trim() ? Number(custom().replace(",", ".")) : undefined;
    return props.ctx.host.request<RateScenarios>(
      "nsvx.homes.rates",
      rate === undefined || Number.isNaN(rate) ? {} : { customRate: rate },
    );
  });
  void data.refresh();
  return (
    <Section title={h()("ifRates")} icon="chart">
      <form
        class="nsvx-homes__form nsvx-homes__form--row"
        onSubmit={(event) => {
          event.preventDefault();
          void data.refresh();
        }}
      >
        <input
          type="text"
          inputmode="decimal"
          placeholder={h()("myRate")}
          aria-label={h()("myRate")}
          value={custom()}
          onInput={(event) => setCustom(event.currentTarget.value)}
        />
        <button
          type="submit"
          class="nsvx__button nsvx__button--icon"
          aria-label={h()("show")}
          title={h()("show")}
        >
          <Glyph name="play" />
        </button>
      </form>
      <SourceView source={data} t={props.ctx.t}>
        {(loaded) => (
          <div class="nsvx-homes__rates">
            <For each={loaded().loans}>
              {(loan) => (
                <div class="nsvx-homes__rate">
                  <strong>{loan.name}</strong>
                  <ul>
                    <For each={loan.scenarios}>
                      {(row) => {
                        const change = () => num(row.change_monthly) ?? 0;
                        return (
                          <li class={{ "nsvx-homes__rate--custom": row.custom }}>
                            <span>{pct(row.rate)}</span>
                            <span
                              class={
                                change() > 0
                                  ? "nsvx-homes__up"
                                  : change() < 0
                                    ? "nsvx-homes__down"
                                    : ""
                              }
                            >
                              {change() > 0 ? "+" : ""}
                              {euro(props.ctx.locale, row.change_monthly)}
                            </span>
                          </li>
                        );
                      }}
                    </For>
                  </ul>
                </div>
              )}
            </For>
          </div>
        )}
      </SourceView>
    </Section>
  );
}

function Mortgage(props: { ctx: Ctx; cases: MortgageCase[]; onChange: () => void }) {
  const h = () => props.ctx.h;
  const [open, setOpen] = createSignal<string>();
  const [title, setTitle] = createSignal("");
  const [purpose, setPurpose] = createSignal<(typeof MORTGAGE_PURPOSES)[number]>("acquisition");
  // One key per typed case: a lost answer repeats with the same key and NSVX keeps one case.
  let key = newKey();
  return (
    <Section title={h()("mortgage")} icon="homes" count={props.cases.length}>
      <div class="nsvx-homes__form nsvx-homes__form--row">
        <input
          type="text"
          maxlength={120}
          placeholder={h()("newCase")}
          aria-label={h()("newCase")}
          value={title()}
          onInput={(event) => setTitle(event.currentTarget.value)}
        />
        <select
          aria-label={h()("kind")}
          value={purpose()}
          onChange={(e) => setPurpose(e.currentTarget.value as never)}
        >
          <For each={MORTGAGE_PURPOSES}>
            {(code) => <option value={code}>{h()(`purpose_${code}` as HK)}</option>}
          </For>
        </select>
        <Act
          ctx={props.ctx}
          label={h()("add")}
          icon="plus"
          primary
          iconOnly
          disabled={!title().trim() || !props.ctx.host.connection.canWrite}
          run={() =>
            props.ctx.host.request("nsvx.mortgage.create", {
              title: title().trim(),
              purpose: purpose(),
              idempotencyKey: key,
            })
          }
          onDone={() => {
            key = newKey();
            setTitle("");
            props.onChange();
          }}
        />
      </div>
      <ul class="nsvx-list">
        <For
          each={props.cases.filter((c) => matches(props.ctx.query, c.title))}
          keyed={(c) => c.id}
        >
          {(item) => (
            <li>
              <button
                type="button"
                class="nsvx-row nsvx-row--link"
                aria-expanded={open() === item().id ? "true" : "false"}
                onClick={() => setOpen(open() === item().id ? undefined : item().id)}
              >
                <Glyph name="doc" class="nsvx-row__icon" />
                <span class="nsvx-row__main">
                  <span class="nsvx-row__title">{item().title}</span>
                  <span class="nsvx-row__detail">{h()(`purpose_${item().purpose}` as HK)}</span>
                </span>
                <Chip tone="accent">{item().state.replaceAll("_", " ")}</Chip>
              </button>
              <Show when={open() === item().id}>
                <MortgageCaseView ctx={props.ctx} id={item().id} />
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.cases.length === 0}>
        <Empty text={h()("noneYet")} />
      </Show>
    </Section>
  );
}

function MortgageCaseView(props: { ctx: Ctx; id: string }) {
  const h = () => props.ctx.h;
  const data = createSource(props.ctx.host, async () => {
    const [detail, lenders] = await Promise.all([
      view<MortgageDetail>(props.ctx.host, "mortgageCase", { id: props.id }),
      view<{ lenders: Lender[] }>(props.ctx.host, "mortgageLenders"),
    ]);
    return { detail, lenders: lenders.lenders };
  });
  void data.refresh();
  const [lender, setLender] = createSignal("");
  return (
    <div class="nsvx-homes__case">
      <SourceView source={data} t={props.ctx.t}>
        {(loaded) => {
          const facts = () => mortgageFacts(loaded().detail);
          return (
            <>
              <Tiles label={loaded().detail.case.title}>
                <Tile
                  icon="chart"
                  label={h()("effort")}
                  value={pct(facts().ratio)}
                  tone={(num(facts().ratio) ?? 0) > 50 ? "bad" : "off"}
                />
                <Tile
                  icon="check"
                  label={h()("room")}
                  value={euro(props.ctx.locale, facts().remaining)}
                />
                <Tile
                  icon="doc"
                  label={h()("missing")}
                  value={`${facts().missing.length}`}
                  tone={facts().missing.length ? "warn" : "ok"}
                />
                <Tile icon="bank" label={h()("banks")} value={`${facts().waiting.length}`} />
              </Tiles>
              <Show when={facts().missing.length}>
                <ul class="nsvx-homes__checklist">
                  <For each={facts().missing.slice(0, 12)}>
                    {(label) => (
                      <li class="nsvx-homes__check nsvx-homes__check--warn">
                        <Glyph name="close" />
                        <span>{label}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={facts().offers.length}>
                <ul class="nsvx-list">
                  <For each={facts().offers}>
                    {(offer) => (
                      <li class="nsvx-row">
                        <Glyph
                          name="bank"
                          class={`nsvx-row__icon${offer.selected ? " nsvx-row__icon--ok" : ""}`}
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{offer.lender}</span>
                        </span>
                        <span class="nsvx-homes__amount">
                          {euro(props.ctx.locale, offer.payment, true)}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <div class="nsvx-homes__form nsvx-homes__form--row">
                <select
                  aria-label={h()("bankList")}
                  value={lender()}
                  onChange={(e) => setLender(e.currentTarget.value)}
                >
                  <option value="">{h()("bankList")}</option>
                  <For each={loaded().lenders}>
                    {(item) => <option value={item.code}>{item.brand}</option>}
                  </For>
                </select>
                <Act
                  ctx={props.ctx}
                  label={h()("add")}
                  icon="plus"
                  iconOnly
                  disabled={!lender() || !props.ctx.host.connection.canWrite}
                  run={() =>
                    props.ctx.host.request("nsvx.mortgage.checklist", {
                      caseId: props.id,
                      revision: loaded().detail.case.revision,
                      lender: lender(),
                    })
                  }
                  onDone={() => {
                    setLender("");
                    void data.refresh();
                  }}
                />
              </div>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}
