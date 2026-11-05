/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { ConfirmButton, createAction, Note, view } from "./device-kit.js";
import {
  eur,
  isZero,
  OBLIGATION_TONE,
  shortDay,
  type BankMatch,
  type BankCoverage,
  type Ledger,
} from "./legal-data.js";
import { changeCaseRequest, type LegalCtx } from "./legal-tab.js";
import { Choice, Field, Panel, Pill, Reveal, Stats, Toggle } from "./office-kit.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

const KINDS = ["rent", "vehicle_rental", "invoice", "deposit", "commission", "damage", "utility", "loan", "other"];
const BASES = ["contract", "document", "owner", "estimate"] as const;

function ObligationForm(props: {
  ctx: LegalCtx;
  caseRef: string;
  plan: boolean;
  close: () => void;
  onSaved: () => void;
}) {
  const ctx = () => props.ctx;
  const [kind, setKind] = createSignal(props.plan ? "rent" : "other");
  const [basis, setBasis] = createSignal<(typeof BASES)[number]>("contract");
  const [description, setDescription] = createSignal(props.plan ? ctx().lt("rent") : "");
  const [amount, setAmount] = createSignal("");
  const [date, setDate] = createSignal("");
  const [months, setMonths] = createSignal("6");
  const [payDay, setPayDay] = createSignal("8");
  const [disputed, setDisputed] = createSignal(false);
  const action = createAction(ctx);
  const blocked = () => !amount().trim() || !description().trim() || (props.plan && !date());
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await changeCaseRequest(
            ctx(),
            props.plan
              ? {
                  action: "planObligations",
                  key: props.caseRef,
                  kind: kind(),
                  label: description(),
                  start: date(),
                  months: Number(months()),
                  amount: amount(),
                  due_day: Number(payDay()),
                  due_basis: basis(),
                }
              : {
                  action: "addObligation",
                  key: props.caseRef,
                  kind: kind(),
                  description: description(),
                  amount: amount(),
                  due_date: date(),
                  due_basis: basis(),
                  disputed: disputed(),
                },
          );
          props.onSaved();
          props.close();
        });
      }}
    >
      <Choice
        label={ctx().lt("kind")}
        value={kind()}
        options={KINDS.map((value) => [value, ctx().lt(value)] as const)}
        onChange={setKind}
      />
      <Choice
        label={ctx().lt("basis")}
        value={basis()}
        options={BASES.map((value) => [value, ctx().lt(`basis_${value}`)] as const)}
        onChange={setBasis}
      />
      <Field label={ctx().lt("description")} value={description()} max={300} required onInput={setDescription} />
      <Field label={ctx().lt("amount")} value={amount()} mode="decimal" required onInput={setAmount} />
      <Field
        label={ctx().lt(props.plan ? "firstMonth" : "dueDate")}
        type="date"
        value={date()}
        onInput={setDate}
      />
      <Show
        when={props.plan}
        fallback={<Toggle label={ctx().lt("disputed")} checked={disputed()} onChange={setDisputed} />}
      >
        <Field label={ctx().lt("months")} type="number" min="1" value={months()} onInput={setMonths} />
        <Field label={ctx().lt("payDay")} type="number" min="1" value={payDay()} onInput={setPayDay} />
      </Show>
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || blocked()}
        >
          {ctx().lt("save")}
        </button>
      </div>
    </form>
  );
}

function PaymentForm(props: {
  ctx: LegalCtx;
  caseRef: string;
  ledger: Ledger;
  close: () => void;
  onSaved: () => void;
}) {
  const ctx = () => props.ctx;
  const [amount, setAmount] = createSignal("");
  const [date, setDate] = createSignal("");
  const [kind, setKind] = createSignal<"payment" | "credit" | "deduction" | "offset">("payment");
  const [method, setMethod] = createSignal("");
  const [obligation, setObligation] = createSignal("");
  const [verified, setVerified] = createSignal(false);
  const action = createAction(ctx);
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await changeCaseRequest(ctx(), {
            action: "addPayment",
            key: props.caseRef,
            amount: amount(),
            paid_on: date(),
            kind: kind(),
            method: method(),
            obligation_id: obligation(),
            verified: verified(),
          });
          props.onSaved();
          props.close();
        });
      }}
    >
      <Field label={ctx().lt("amount")} value={amount()} mode="decimal" required onInput={setAmount} />
      <Field label={ctx().lt("date")} type="date" value={date()} onInput={setDate} />
      <Choice
        label={ctx().lt("kind")}
        value={kind()}
        options={[
          ["payment", ctx().lt("payment")],
          ["credit", ctx().lt("credit")],
          ["deduction", ctx().lt("deduction")],
          ["offset", ctx().lt("offset")],
        ]}
        onChange={setKind}
      />
      <Field label={ctx().lt("method")} value={method()} max={60} onInput={setMethod} />
      <Choice
        label={ctx().lt("applyTo")}
        value={obligation()}
        options={[
          ["", ctx().lt("oldestFirst")],
          ...props.ledger.obligations.map(
            (row) => [row.id, `${row.description} · ${eur(row.outstanding, ctx().locale)}`] as const,
          ),
        ]}
        onChange={setObligation}
      />
      <Toggle label={ctx().lt("haveProof")} checked={verified()} onChange={setVerified} />
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !amount().trim()}
        >
          {ctx().lt("save")}
        </button>
      </div>
    </form>
  );
}

function BankPicker(props: { ctx: LegalCtx; caseRef: string; onSaved: () => void }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ candidates: BankMatch[]; coverage: BankCoverage }>(ctx().host, "caseBank", {
      id: props.caseRef,
    }),
  );
  void source.refresh();
  const action = createAction(ctx);
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => (
        <div class="nsvx-of">
          <Note note={action.note()} />
          <ul class="nsvx-of__list">
            <For
              each={data().candidates}
              keyed={(row) => row.id}
              fallback={<p class="nsvx-of__muted">{data().coverage.note}</p>}
            >
              {(row) => (
                <li class="nsvx-of__row">
                  <Icon name="bank" />
                  <span class="nsvx-of__main">
                    <strong>
                      {eur(row().amount, ctx().locale)} · {shortDay(row().date, ctx().locale)} · {row().account}
                    </strong>
                    <span class="nsvx-of__sub">{row().counterparty ?? row().description}</span>
                    <Show when={row().used_in}>
                      <span class="nsvx-of__sub">
                        {ctx().lt("usedIn")} {row().used_in}
                      </span>
                    </Show>
                  </span>
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={action.busy()}
                    onClick={() =>
                      void action.run(async () => {
                        await changeCaseRequest(ctx(), {
                          action: "addPayment",
                          key: props.caseRef,
                          amount: row().amount,
                          kind: "payment",
                          finance_tx_id: row().id,
                          verified: true,
                        });
                        props.onSaved();
                        await source.refresh();
                      }, ctx().lt("linked"))
                    }
                  >
                    <Icon name="link" />
                    <span>{ctx().lt("link")}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      )}
    </SourceView>
  );
}

/** Amounts owed and paid. These are the dossier's records: nothing here moves money. */
export function LegalMoney(props: { ctx: LegalCtx; caseRef: string }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<Ledger>(ctx().host, "casePayments", { id: props.caseRef }),
  );
  void source.refresh();
  const refresh = () => void source.refresh();
  const action = createAction(ctx);
  const canWrite = () => ctx().host.connection.canWrite;
  const money = (value: string | null | undefined) => eur(value, ctx().locale);
  const remove = (name: "removeObligation" | "removePayment", id: Record<string, string>) =>
    void action.run(async () => {
      await changeCaseRequest(ctx(), { action: name, key: props.caseRef, ...id });
      await source.refresh();
    });
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => (
        <div class="nsvx-of">
          <Stats
            items={[
              { icon: "euro", label: ctx().lt("due"), value: money(data().totals.expected) },
              {
                icon: "done",
                label: ctx().lt("received"),
                value: money(data().totals.received),
                sub:
                  data().totals.received !== data().totals.received_verified
                    ? `${money(data().totals.received_verified)} ${ctx().lt("verified")}`
                    : undefined,
                tone: "ok",
              },
              {
                icon: "alert",
                label: ctx().lt("missingMoney"),
                value: money(data().totals.verified_outstanding),
                sub: isZero(data().totals.estimated_outstanding)
                  ? undefined
                  : `+ ${money(data().totals.estimated_outstanding)} ${ctx().lt("estimate")}`,
                tone: isZero(data().totals.verified_outstanding) ? undefined : "bad",
              },
              ...(isZero(data().totals.disputed)
                ? []
                : [
                    {
                      icon: "legal" as const,
                      label: ctx().lt("disputed"),
                      value: money(data().totals.disputed),
                      tone: "warn" as const,
                    },
                  ]),
            ]}
          />
          <p class="nsvx-of__muted">
            {data().bank_coverage.note} ({data().bank_coverage.accounts_read}/
            {data().bank_coverage.accounts_total})
          </p>
          <div class="nsvx-of__bar">
            <Reveal label={ctx().lt("planMonthly")} icon="agenda" disabled={!canWrite()}>
              {(close) => (
                <ObligationForm ctx={ctx()} caseRef={props.caseRef} plan close={close} onSaved={refresh} />
              )}
            </Reveal>
            <Reveal label={ctx().lt("addDue")} icon="plus" disabled={!canWrite()}>
              {(close) => (
                <ObligationForm
                  ctx={ctx()}
                  caseRef={props.caseRef}
                  plan={false}
                  close={close}
                  onSaved={refresh}
                />
              )}
            </Reveal>
            <Reveal label={ctx().lt("addPayment")} icon="euro" disabled={!canWrite()}>
              {(close) => (
                <PaymentForm
                  ctx={ctx()}
                  caseRef={props.caseRef}
                  ledger={data()}
                  close={close}
                  onSaved={refresh}
                />
              )}
            </Reveal>
            <Reveal label={ctx().lt("fromBank")} icon="bank" disabled={!canWrite()}>
              {() => <BankPicker ctx={ctx()} caseRef={props.caseRef} onSaved={refresh} />}
            </Reveal>
          </div>
          <Note note={action.note()} />
          <Panel title={ctx().lt("obligations")} icon="doc" count={data().obligations.length}>
            <ul class="nsvx-of__list">
              <For
                each={data().obligations}
                keyed={(row) => row.id}
                fallback={<p class="nsvx-of__muted">{ctx().lt("noAmounts")}</p>}
              >
                {(row) => (
                  <li class="nsvx-of__row">
                    <span class="nsvx-of__main">
                      <strong>{row().description}</strong>
                      <span class="nsvx-of__sub">
                        {shortDay(row().due_date, ctx().locale)} · {ctx().lt(`basis_${row().due_basis}`)}
                        {row().days_overdue === null ? "" : ` · ${row().days_overdue}d`}
                      </span>
                    </span>
                    <span class="nsvx-of__main" style={{ flex: "0 0 auto", "text-align": "right" }}>
                      <span class="nsvx-of__amount">{money(row().outstanding)}</span>
                      <span class="nsvx-of__sub">
                        {money(row().paid)} / {money(row().amount)}
                      </span>
                    </span>
                    <Pill tone={OBLIGATION_TONE[row().status]}>{ctx().lt(`ob_${row().status}`)}</Pill>
                    <ConfirmButton
                      label={ctx().lt("cancelRecord")}
                      confirm={ctx().lt("cancelRecord")}
                      cancel={ctx().lt("keep")}
                      danger
                      disabled={action.busy() || !canWrite()}
                      onConfirm={() => remove("removeObligation", { obligationId: row().id })}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Panel>
          <Show when={data().payments.length}>
            <Panel title={ctx().lt("payments")} icon="done" count={data().payments.length}>
              <ul class="nsvx-of__list">
                <For each={data().payments} keyed={(row) => row.id}>
                  {(row) => (
                    <li class="nsvx-of__row">
                      <Icon name={row().source === "bank_tx" ? "bank" : row().source === "evidence" ? "doc" : "user"} />
                      <span class="nsvx-of__main">
                        <strong>
                          {money(row().amount)} · {shortDay(row().paid_on, ctx().locale)}
                        </strong>
                        <span class="nsvx-of__sub">
                          {ctx().lt(row().kind === "payment" ? "payment" : "credit")}
                          {row().method ? ` · ${row().method}` : ""}
                        </span>
                      </span>
                      <Pill tone={row().verified ? "ok" : "warn"}>
                        {ctx().lt(row().verified ? "verified" : "unverified")}
                      </Pill>
                      <ConfirmButton
                        label={ctx().lt("cancelRecord")}
                        confirm={ctx().lt("cancelRecord")}
                        cancel={ctx().lt("keep")}
                        danger
                        disabled={action.busy() || !canWrite()}
                        onConfirm={() => remove("removePayment", { paymentId: row().id })}
                      />
                    </li>
                  )}
                </For>
              </ul>
            </Panel>
          </Show>
          <p class="nsvx-of__muted">
            {data().interest.note} · {data().allocation_rule}
          </p>
        </div>
      )}
    </SourceView>
  );
}
