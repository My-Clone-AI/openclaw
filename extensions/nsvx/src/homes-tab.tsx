/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  euro,
  num,
  severityTone,
  type AskAnswer,
  type Hub,
  type HubAlert,
  type Overview,
  type StayOverview,
} from "./homes-data.js";
import { HomeDetail, HomesList } from "./homes-houses.js";
import { HOMES_QUESTIONS, homesTranslator } from "./homes-i18n.js";
import { Loans } from "./homes-loans.js";
import { Rent } from "./homes-rent.js";
import { Stays } from "./homes-stays.js";
import {
  Act,
  Bars,
  Chip,
  day,
  Empty,
  Glyph,
  Section,
  Segments,
  Tile,
  Tiles,
  view,
  type Ctx,
  type GlyphName,
} from "./homes-ui.js";
import { createSource, matches, SourceView, type T } from "./ui-kit.js";
import "./homes.css";

const SECTIONS = ["summary", "homes", "rent", "loans", "stays"] as const;
type Part = (typeof SECTIONS)[number];
const ICON: Record<Part, GlyphName> = {
  summary: "chart",
  homes: "homes",
  rent: "rent",
  loans: "loans",
  stays: "stays",
};
export type Go = (part: Part, open?: string) => void;

/** Every area reads on its own: an owner without AL houses or loans still sees the rest. */
async function settle<V extends Record<string, Promise<unknown>>>(loads: V) {
  const keys = Object.keys(loads) as (keyof V)[];
  const results = await Promise.allSettled(Object.values(loads));
  if (results.every((result) => result.status === "rejected")) {
    throw (results[0] as PromiseRejectedResult).reason;
  }
  return Object.fromEntries(
    keys.map((key, index) => {
      const result = results[index];
      return [key, result?.status === "fulfilled" ? result.value : undefined];
    }),
  ) as { [K in keyof V]: Awaited<V[K]> | undefined };
}

function Summary(props: { ctx: Ctx; go: Go }) {
  const h = () => props.ctx.h;
  const money = (value: Parameters<typeof euro>[1]) => euro(props.ctx.locale, value);
  const data = createSource(props.ctx.host, () =>
    settle({
      overview: view<Overview>(props.ctx.host, "homesOverview"),
      hub: view<Hub>(props.ctx.host, "homesHub"),
      alerts: view<{ alerts: HubAlert[] }>(props.ctx.host, "homesHubAlerts"),
      stays: view<StayOverview>(props.ctx.host, "stayOverview"),
    }),
  );
  void data.refresh();
  const reload = () => void data.refresh();
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const k = () => loaded().overview?.kpis;
        const hub = () => loaded().hub?.summary;
        const stays = () => loaded().stays?.kpi;
        const notices = () =>
          (loaded().overview?.alerts ?? []).filter(
            (n) => !n.read_at && matches(props.ctx.query, n.title, n.body),
          );
        const homeAlerts = () =>
          (loaded().alerts?.alerts ?? []).filter(
            (a) => !a.read_at && matches(props.ctx.query, a.title, a.property_name),
          );
        const rentPct = () => {
          const expected = num(k()?.rent_expected_month) ?? 0;
          return expected > 0 ? (num(k()?.rent_collected_month) ?? 0) / expected : 1;
        };
        return (
          <div class="nsvx-homes__stack">
            <Tiles label={h()("summary")}>
              <Show when={k()}>
                {(kpis) => (
                  <>
                    <Tile
                      icon="homes"
                      label={h()("homes")}
                      value={`${kpis().properties}`}
                      sub={`${kpis().units} ${h()("units").toLowerCase()}`}
                      tone="accent"
                      onClick={() => props.go("homes")}
                    />
                    <Tile
                      icon="door"
                      label={h()("rented")}
                      value={`${kpis().occupancy.rented}/${kpis().occupancy.total}`}
                      tone={kpis().occupancy.vacant ? "warn" : "ok"}
                    />
                    <Tile
                      icon="rent"
                      label={h()("rentMonth")}
                      value={money(kpis().rent_collected_month)}
                      sub={`/ ${money(kpis().rent_expected_month)}`}
                      tone={rentPct() >= 1 ? "ok" : rentPct() >= 0.5 ? "warn" : "bad"}
                      onClick={() => props.go("rent")}
                    />
                    <Tile icon="chart" label={h()("value")} value={money(kpis().market_value)} />
                    <Tile
                      icon="loans"
                      label={h()("debt")}
                      value={money(kpis().debt)}
                      tone={(num(kpis().ltv) ?? 0) > 80 ? "bad" : "off"}
                      onClick={() => props.go("loans")}
                    />
                  </>
                )}
              </Show>
              <Show when={hub()}>
                {(s) => (
                  <Tile
                    icon="doc"
                    label={h()("bills")}
                    value={`${s().unpaid_invoices}`}
                    sub={
                      s().overdue_invoices
                        ? `${s().overdue_invoices} ${h()("late").toLowerCase()}`
                        : undefined
                    }
                    tone={s().overdue_invoices ? "bad" : s().unpaid_invoices ? "warn" : "ok"}
                    onClick={() => props.go("homes")}
                  />
                )}
              </Show>
              <Show when={stays()}>
                {(s) => (
                  <Tile
                    icon="stays"
                    label={h()("today")}
                    value={`↓${s().checkins_today} ↑${s().checkouts_today}`}
                    tone={s().cleaning_pending ? "warn" : "ok"}
                    onClick={() => props.go("stays")}
                  />
                )}
              </Show>
            </Tiles>

            <Show when={loaded().overview?.series.length}>
              <Section title={h()("cashFlow")} icon="chart">
                <Bars
                  label={h()("cashFlow")}
                  rows={(loaded().overview?.series ?? []).map((month) => ({
                    key: month.month,
                    value: num(month.cash_flow),
                    future: month.future,
                    title: `${month.month} · ${money(month.cash_flow)}`,
                  }))}
                />
              </Section>
            </Show>

            <div class="nsvx-homes__cols">
              <Section
                title={h()("alerts")}
                icon="bell"
                count={notices().length + homeAlerts().length}
              >
                <ul class="nsvx-list">
                  <For each={notices()} keyed={(n) => n.id}>
                    {(notice) => (
                      <li class="nsvx-row">
                        <Glyph
                          name="bell"
                          class={`nsvx-row__icon nsvx-row__icon--${severityTone(notice().severity)}`}
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{notice().title}</span>
                          <Show when={notice().body}>
                            <span class="nsvx-row__detail">{notice().body}</span>
                          </Show>
                        </span>
                        <Act
                          ctx={props.ctx}
                          label={h()("seen")}
                          icon="check"
                          iconOnly
                          run={() =>
                            props.ctx.host.request("nsvx.homes.notice", {
                              noticeId: notice().id,
                              action: "read",
                            })
                          }
                          onDone={reload}
                        />
                      </li>
                    )}
                  </For>
                  <For each={homeAlerts()} keyed={(a) => a.id}>
                    {(alert) => (
                      <li class="nsvx-row">
                        <Glyph
                          name="calendar"
                          class={`nsvx-row__icon nsvx-row__icon--${severityTone(alert().severity)}`}
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{alert().title}</span>
                          <span class="nsvx-row__detail">
                            {[
                              alert().property_name,
                              alert().due_on ? day(props.ctx.locale, alert().due_on) : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <Act
                          ctx={props.ctx}
                          label={h()("seen")}
                          icon="check"
                          iconOnly
                          run={() =>
                            props.ctx.host.request("nsvx.homes.alertRead", { alertId: alert().id })
                          }
                          onDone={reload}
                        />
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={notices().length + homeAlerts().length === 0}>
                  <Empty text={h()("allGood")} />
                </Show>
              </Section>
              <Ask ctx={props.ctx} />
            </div>
            <Show when={loaded().overview?.empty && !loaded().hub?.properties.length}>
              <Empty text={h()("noHomes")} />
            </Show>
          </div>
        );
      }}
    </SourceView>
  );
}

/** NSVX answers from stored home data only; nothing is sent anywhere (`properties/assistant.py`). */
function Ask(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const [question, setQuestion] = createSignal("");
  const [answer, setAnswer] = createSignal<AskAnswer>();
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const ask = async (q: string) => {
    if (q.trim().length < 2) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setAnswer(await props.ctx.host.request<AskAnswer>("nsvx.homes.ask", { q: q.trim() }));
    } catch (cause) {
      setError(cause instanceof Error ? props.ctx.host.redact(cause.message) : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={h()("ask")} icon="ask">
      <form
        class="nsvx-homes__form nsvx-homes__form--row"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question());
        }}
      >
        <input
          type="search"
          maxlength={300}
          placeholder={h()("askHint")}
          aria-label={h()("ask")}
          value={question()}
          onInput={(event) => setQuestion(event.currentTarget.value)}
        />
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary nsvx__button--icon"
          aria-label={h()("ask")}
          title={h()("ask")}
          disabled={busy() || question().trim().length < 2}
        >
          <Glyph name="ask" />
        </button>
      </form>
      <div class="nsvx-homes__chips">
        <For each={HOMES_QUESTIONS}>
          {(quick) => (
            <button
              type="button"
              class="nsvx-homes__quick"
              disabled={busy()}
              onClick={() => {
                setQuestion(quick.question);
                void ask(quick.question);
              }}
            >
              {h()(quick.label)}
            </button>
          )}
        </For>
      </div>
      <Show when={error()}>
        <p class="nsvx__error" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={answer()}>
        {(a) => (
          <div class="nsvx-homes__answer" role="status">
            <Chip tone="accent">
              <Glyph name="check" />
              {h()("fromRecords")}
            </Chip>
            <p>{a().answer}</p>
            <ul class="nsvx-list">
              <For each={a().items.slice(0, 12)}>
                {(item) => (
                  <li class="nsvx-row">
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{item.label}</span>
                      <Show when={item.detail}>
                        <span class="nsvx-row__detail">{item.detail}</span>
                      </Show>
                    </span>
                    <Show when={item.tel}>
                      {(tel) => (
                        <a
                          class="nsvx__button nsvx__button--icon"
                          href={`tel:${tel()}`}
                          aria-label={tel()}
                        >
                          <Glyph name="phone" />
                        </a>
                      )}
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </div>
        )}
      </Show>
    </Section>
  );
}

export function HomesTab(props: { host: ControlUiHost; t: T; locale: string; query: string }) {
  const search = new URLSearchParams(location.search);
  const initial = search.get("homes") as Part;
  const [part, setPart] = createSignal<Part>(SECTIONS.includes(initial) ? initial : "summary");
  const [open, setOpen] = createSignal(search.get("home") ?? undefined);
  const h = createMemo(() => homesTranslator(props.locale));
  // Deep links: the address keeps the area and the open home (values passed in, not read back).
  const go: Go = (next, id) => {
    setPart(next);
    setOpen(id);
    const url = new URL(location.href);
    url.searchParams.set("homes", next);
    if (id) {
      url.searchParams.set("home", id);
    } else {
      url.searchParams.delete("home");
    }
    history.replaceState(history.state, "", url);
  };
  const ctx = createMemo<Ctx>(() => ({
    host: props.host,
    t: props.t,
    h: h(),
    locale: props.locale,
    query: props.query,
  }));
  return (
    <div class="nsvx-homes">
      <Segments
        name={h()("homesTab")}
        items={SECTIONS}
        value={part()}
        label={(key) => h()(key)}
        icon={(key) => ICON[key]}
        onChange={(next) => go(next)}
      />
      <For each={[`${part()}:${open() ?? ""}`]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={part() === "summary"}>
              <Summary ctx={ctx()} go={go} />
            </Show>
            <Show when={part() === "homes"}>
              <Show
                when={open()}
                fallback={<HomesList ctx={ctx()} onOpen={(id) => go("homes", id)} />}
              >
                {(id) => <HomeDetail ctx={ctx()} id={id()} onBack={() => go("homes")} />}
              </Show>
            </Show>
            <Show when={part() === "rent"}>
              <Rent ctx={ctx()} />
            </Show>
            <Show when={part() === "loans"}>
              <Loans ctx={ctx()} />
            </Show>
            <Show when={part() === "stays"}>
              <Stays ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
