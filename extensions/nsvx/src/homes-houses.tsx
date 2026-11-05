/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  EXPENSE_CATEGORIES,
  euro,
  lisbonDay,
  severityTone,
  unitTone,
  type Hub,
  type HubCard,
  type HubProperty,
  type Tone,
  type Unit,
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
  type GlyphName,
} from "./homes-ui.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

const SERVICE_ICON: Record<string, GlyphName> = {
  electricity: "bolt",
  water: "drop",
  gas: "flame",
  internet: "wifi",
  telecom: "phone",
  tv: "eye",
  insurance: "shield",
  condominium: "homes",
};

function deadlineTone(days: number | null | undefined): Tone {
  return days === null || days === undefined
    ? "off"
    : days < 0
      ? "bad"
      : days <= 30
        ? "warn"
        : "ok";
}

export function HomesList(props: { ctx: Ctx; onOpen: (id: string) => void }) {
  const h = () => props.ctx.h;
  const data = createSource(props.ctx.host, async () => {
    const [hub, units] = await Promise.allSettled([
      view<Hub>(props.ctx.host, "homesHub"),
      view<{ items: Unit[] }>(props.ctx.host, "homesUnits"),
    ]);
    if (hub.status === "rejected" && units.status === "rejected") {
      throw hub.reason;
    }
    return {
      hub: hub.status === "fulfilled" ? hub.value : undefined,
      units: units.status === "fulfilled" ? units.value.items : [],
    };
  });
  void data.refresh();
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const homes = () =>
          (loaded().hub?.properties ?? []).filter((home) =>
            matches(props.ctx.query, home.name, home.city, home.address),
          );
        const units = () =>
          loaded().units.filter((unit) =>
            matches(props.ctx.query, unit.name, unit.property, unit.tenant, unit.city),
          );
        return (
          <div class="nsvx-homes__stack">
            <div class="nsvx-homes__cards">
              <For each={homes()} keyed={(home) => home.id}>
                {(home) => <HomeCard ctx={props.ctx} home={home()} onOpen={props.onOpen} />}
              </For>
            </div>
            <Show when={homes().length === 0}>
              <Empty text={h()("noHomes")} />
            </Show>
            <Show when={loaded().units.length}>
              <Section title={h()("units")} icon="door" count={units().length}>
                <ul class="nsvx-list">
                  <For each={units()} keyed={(unit) => unit.id}>
                    {(unit) => (
                      <li class="nsvx-row">
                        <Glyph
                          name="door"
                          class={`nsvx-row__icon nsvx-row__icon--${unitTone(unit().status)}`}
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{unit().name}</span>
                          <span class="nsvx-row__detail">
                            {[
                              unit().property,
                              unit().tenant,
                              unit().lease_end
                                ? `→ ${day(props.ctx.locale, unit().lease_end)}`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span class="nsvx-homes__amount">
                          {euro(props.ctx.locale, unit().rent ?? unit().asking_rent)}
                        </span>
                        <Chip tone={unitTone(unit().status)}>
                          {h()(`unit_${unit().status}` as HK)}
                        </Chip>
                      </li>
                    )}
                  </For>
                </ul>
              </Section>
            </Show>
          </div>
        );
      }}
    </SourceView>
  );
}

function HomeCard(props: { ctx: Ctx; home: HubCard; onOpen: (id: string) => void }) {
  const h = () => props.ctx.h;
  const tone = (): Tone =>
    props.home.overdue ? "bad" : props.home.unpaid || props.home.missing_essentials ? "warn" : "ok";
  return (
    <button
      type="button"
      class={["nsvx-homes__card", `nsvx-homes__card--${tone()}`]}
      onClick={() => props.onOpen(props.home.id)}
    >
      <span class="nsvx-homes__card-head">
        <Glyph
          name={props.home.kind === "house" ? "homes" : "door"}
          class="nsvx-homes__card-icon"
        />
        <span class="nsvx-row__main">
          <span class="nsvx-row__title">{props.home.name}</span>
          <span class="nsvx-row__detail">{props.home.city ?? props.home.address}</span>
        </span>
        <strong class="nsvx-homes__amount">
          {euro(props.ctx.locale, props.home.monthly_estimate)}
          <small>/{h()("perMonth")}</small>
        </strong>
      </span>
      <span class="nsvx-homes__chips">
        <Show when={props.home.overdue}>
          <Chip tone="bad">
            {props.home.overdue} {h()("late")}
          </Chip>
        </Show>
        <Show when={props.home.unpaid && !props.home.overdue}>
          <Chip tone="warn">
            {props.home.unpaid} {h()("toPay")}
          </Chip>
        </Show>
        <Show when={props.home.missing_essentials}>
          <Chip tone="warn">
            <Glyph name="doc" />
            {props.home.missing_essentials}
          </Chip>
        </Show>
        <Show when={props.home.next_deadline}>
          {(next) => (
            <Chip tone={deadlineTone(next().days)}>
              <Glyph name="calendar" />
              {next().days}d
            </Chip>
          )}
        </Show>
        <Show when={!props.home.overdue && !props.home.unpaid && !props.home.missing_essentials}>
          <Chip tone="ok">
            <Glyph name="check" />
            {h()("allGood")}
          </Chip>
        </Show>
      </span>
    </button>
  );
}

export function HomeDetail(props: { ctx: Ctx; id: string; onBack: () => void }) {
  const h = () => props.ctx.h;
  const money = (value: Parameters<typeof euro>[1]) => euro(props.ctx.locale, value);
  const data = createSource(props.ctx.host, () =>
    view<HubProperty>(props.ctx.host, "homesHubProperty", { id: props.id }),
  );
  void data.refresh();
  return (
    <div class="nsvx-homes__stack">
      <button type="button" class="nsvx__button nsvx-homes__back" onClick={() => props.onBack()}>
        <Glyph name="back" />
        <span>{h()("back")}</span>
      </button>
      <SourceView source={data} t={props.ctx.t}>
        {(loaded) => {
          const d = () => loaded();
          const unpaid = () =>
            d().invoices.filter((i) => i.state === "unpaid" || i.state === "overdue");
          const missing = () =>
            d().documents.checklist.filter((doc) => doc.essential && doc.state === "missing");
          return (
            <>
              <header class="nsvx-homes__title">
                <Glyph
                  name={d().property.kind === "house" ? "homes" : "door"}
                  class="nsvx-homes__card-icon"
                />
                <span class="nsvx-row__main">
                  <strong>{d().property.name}</strong>
                  <span class="nsvx-row__detail">
                    {[d().property.address, d().property.postal_code, d().property.city]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </span>
              </header>
              <Tiles label={d().property.name}>
                <Tile
                  icon="chart"
                  label={h()("monthly")}
                  value={money(d().expense_summary?.estimated_monthly)}
                />
                <Tile
                  icon="doc"
                  label={h()("bills")}
                  value={`${unpaid().length}`}
                  tone={
                    unpaid().some((i) => i.state === "overdue")
                      ? "bad"
                      : unpaid().length
                        ? "warn"
                        : "ok"
                  }
                />
                <Tile
                  icon="flag"
                  label={h()("papers")}
                  value={`${d().documents.checklist.length - missing().length}/${d().documents.checklist.length}`}
                  tone={missing().length ? "warn" : "ok"}
                />
                <Tile
                  icon="check"
                  label={h()("paid")}
                  value={money(d().expense_summary?.paid)}
                  tone="ok"
                />
              </Tiles>

              <div class="nsvx-homes__cols">
                <Section title={h()("services")} icon="bolt" count={d().services.length}>
                  <ul class="nsvx-list">
                    <For each={d().services} keyed={(s) => s.id}>
                      {(service) => (
                        <li class="nsvx-row">
                          <Glyph
                            name={SERVICE_ICON[service().category] ?? "doc"}
                            class="nsvx-row__icon"
                          />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">
                              {service().supplier ?? service().category}
                            </span>
                            <span class="nsvx-row__detail">{money(service().monthly_cost)}</span>
                          </span>
                          <Show when={service().contract.days_left !== null}>
                            <Chip
                              tone={
                                service().contract.state === "ending"
                                  ? "warn"
                                  : service().contract.state === "ended"
                                    ? "off"
                                    : "ok"
                              }
                            >
                              <Glyph name="calendar" />
                              {service().contract.days_left}d
                            </Chip>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={d().services.length === 0}>
                    <Empty text={h()("noneYet")} />
                  </Show>
                </Section>

                <Section title={h()("bills")} icon="doc" count={d().invoices.length}>
                  <ul class="nsvx-list">
                    <For each={d().invoices.slice(0, 12)} keyed={(i) => i.id}>
                      {(invoice) => (
                        <li class="nsvx-row">
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{invoice().supplier ?? h()("bill")}</span>
                            <span class="nsvx-row__detail">
                              {day(props.ctx.locale, invoice().due_on ?? invoice().issued_on)}
                            </span>
                          </span>
                          <span class="nsvx-homes__amount">
                            {euro(props.ctx.locale, invoice().amount, true)}
                          </span>
                          <Chip
                            tone={
                              invoice().state === "paid"
                                ? "ok"
                                : invoice().state === "overdue"
                                  ? "bad"
                                  : invoice().state === "unpaid"
                                    ? "warn"
                                    : "off"
                            }
                          >
                            {h()(`bill_${invoice().state}` as HK)}
                          </Chip>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={d().invoices.length === 0}>
                    <Empty text={h()("noneYet")} />
                  </Show>
                </Section>
              </div>

              <div class="nsvx-homes__cols">
                <Section title={h()("papers")} icon="flag">
                  <ul class="nsvx-homes__checklist">
                    <For each={d().documents.checklist}>
                      {(doc) => (
                        <li
                          class={`nsvx-homes__check nsvx-homes__check--${doc.state === "available" ? "ok" : doc.state === "missing" ? (doc.essential ? "bad" : "off") : "warn"}`}
                        >
                          <Glyph
                            name={
                              doc.state === "available"
                                ? "check"
                                : doc.state === "missing"
                                  ? "close"
                                  : "calendar"
                            }
                          />
                          <span>{doc.label}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Section>

                <Section title={h()("contacts")} icon="phone">
                  <ul class="nsvx-list">
                    <For each={[...d().official_contacts, ...d().contacts.filter((c) => c.phone)]}>
                      {(contact) => (
                        <li class="nsvx-row">
                          <Glyph
                            name="phone"
                            class={`nsvx-row__icon${contact.emergency ? " nsvx-row__icon--bad" : ""}`}
                          />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{contact.name}</span>
                            <span class="nsvx-row__detail">{contact.phone}</span>
                          </span>
                          <Show when={contact.phone}>
                            {(phone) => (
                              <a
                                class="nsvx__button nsvx__button--icon"
                                href={`tel:${phone()}`}
                                aria-label={`${h()("call")} ${contact.name}`}
                              >
                                <Glyph name="phone" />
                              </a>
                            )}
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Section>
              </div>

              <Section title={h()("costs")} icon="chart" count={d().expenses.length}>
                <AddCost
                  ctx={props.ctx}
                  propertyId={d().property.id}
                  onDone={() => void data.refresh()}
                />
                <ul class="nsvx-list">
                  <For each={d().expenses.slice(0, 12)} keyed={(e) => e.id}>
                    {(expense) => (
                      <li class="nsvx-row">
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">
                            {expense().description || h()(`cost_${expense().category}` as HK)}
                          </span>
                          <span class="nsvx-row__detail">
                            {day(props.ctx.locale, expense().spent_on)}
                          </span>
                        </span>
                        <span class="nsvx-homes__amount">
                          {euro(props.ctx.locale, expense().amount, true)}
                        </span>
                        <Chip tone={expense().status === "paid" ? "ok" : "warn"}>
                          {h()(expense().status === "paid" ? "bill_paid" : "bill_unpaid")}
                        </Chip>
                      </li>
                    )}
                  </For>
                </ul>
              </Section>

              <Show when={d().alerts.length}>
                <Section title={h()("alerts")} icon="bell" count={d().alerts.length}>
                  <ul class="nsvx-list">
                    <For each={d().alerts} keyed={(a) => a.id}>
                      {(alert) => (
                        <li class="nsvx-row">
                          <Glyph
                            name="bell"
                            class={`nsvx-row__icon nsvx-row__icon--${severityTone(alert().severity)}`}
                          />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{alert().title}</span>
                            <span class="nsvx-row__detail">
                              {day(props.ctx.locale, alert().due_on)}
                            </span>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Section>
              </Show>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}

/** One cost per key: a lost answer repeats with the same key and NSVX keeps one record. */
function AddCost(props: { ctx: Ctx; propertyId: string; onDone: () => void }) {
  const h = () => props.ctx.h;
  const [category, setCategory] = createSignal<(typeof EXPENSE_CATEGORIES)[number]>("maintenance");
  const [amount, setAmount] = createSignal("");
  const [spentOn, setSpentOn] = createSignal(lisbonDay());
  const [description, setDescription] = createSignal("");
  const [paid, setPaid] = createSignal(true);
  let key = newKey();
  const valid = () =>
    /^\d{1,10}([.,]\d{1,2})?$/.test(amount().trim()) && /^\d{4}-\d{2}-\d{2}$/.test(spentOn());
  return (
    <div class="nsvx-homes__form">
      <select
        aria-label={h()("kind")}
        value={category()}
        onChange={(e) => setCategory(e.currentTarget.value as never)}
      >
        <For each={EXPENSE_CATEGORIES}>
          {(code) => <option value={code}>{h()(`cost_${code}` as HK)}</option>}
        </For>
      </select>
      <input
        type="text"
        inputmode="decimal"
        placeholder="0.00 €"
        aria-label={h()("amount")}
        value={amount()}
        onInput={(e) => setAmount(e.currentTarget.value)}
      />
      <input
        type="date"
        aria-label={h()("date")}
        value={spentOn()}
        onInput={(e) => setSpentOn(e.currentTarget.value)}
      />
      <input
        type="text"
        maxlength={200}
        placeholder={h()("note")}
        aria-label={h()("note")}
        value={description()}
        onInput={(e) => setDescription(e.currentTarget.value)}
      />
      <label class="nsvx-homes__toggle">
        <input
          type="checkbox"
          checked={paid()}
          onChange={(e) => setPaid(e.currentTarget.checked)}
        />
        <span>{h()("bill_paid")}</span>
      </label>
      <Act
        ctx={props.ctx}
        label={h()("add")}
        icon="plus"
        primary
        disabled={!valid() || !props.ctx.host.connection.canWrite}
        run={() =>
          props.ctx.host.request("nsvx.homes.expense", {
            propertyId: props.propertyId,
            category: category(),
            amount: amount().trim().replace(",", "."),
            spentOn: spentOn(),
            description: description().trim() || undefined,
            status: paid() ? "paid" : "unpaid",
            idempotencyKey: key,
          })
        }
        onDone={() => {
          key = newKey();
          setAmount("");
          setDescription("");
          props.onDone();
        }}
      />
    </div>
  );
}
