/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { CheckinView } from "./aviation-checkin.js";
import {
  DAY_TONE,
  hm,
  trendSeries,
  VALIDITY_TONE,
  type Entry,
  type Overview,
  type Totals,
} from "./aviation-data.js";
import { DocsView } from "./aviation-docs.js";
import { aviationTranslator } from "./aviation-i18n.js";
import {
  Badge,
  Bars,
  Card,
  change,
  createAction,
  dayLabel,
  Kpi,
  monthLabel,
  saveNsvxFile,
  type AvCtx,
} from "./aviation-kit.js";
import { EntryLine, LogbookView } from "./aviation-logbook.js";
import { MoreView } from "./aviation-more.js";
import { RosterView } from "./aviation-roster.js";
import { Note, Segs, view } from "./device-kit.js";
import { createSource, Icon, SourceView, type IconName, type T } from "./ui-kit.js";
import "./aviation.css";

type Section = "home" | "logbook" | "docs" | "checkin" | "roster" | "more";
const SECTIONS: Section[] = ["home", "logbook", "docs", "checkin", "roster", "more"];
const SECTION_ICON: Record<Section, IconName> = {
  home: "today",
  logbook: "plane",
  docs: "folder",
  checkin: "task",
  roster: "agenda",
  more: "progress",
};

/** Opening a section with something already picked: a document, or the flights to confirm. */
export type AvOpen = { doc?: string; confirm?: boolean };

function Trend(props: { ctx: AvCtx; rows: Overview["trend"]; today: string }) {
  const series = createMemo(() => trendSeries(props.rows, props.today.slice(0, 7)));
  const total = createMemo(() => series().reduce((sum, row) => sum + row.flight, 0));
  return (
    <figure class="nsvx-av__trend">
      <div
        class="nsvx-av__trend-bars"
        role="img"
        aria-label={`${props.ctx.at("perMonth")}: ${hm(total())}`}
      >
        <For each={series()} keyed={(row) => row.m}>
          {(row) => (
            <div
              class="nsvx-av__trend-col"
              title={`${monthLabel(props.ctx.locale, row().m)}: ${hm(row().flight)}`}
            >
              <span class="nsvx-av__trend-bar" style={{ height: `${row().pct}%` }}>
                <span
                  class="nsvx-av__trend-flight"
                  style={{ height: `${row().pct ? (row().flightPct / row().pct) * 100 : 0}%` }}
                />
              </span>
              <span class="nsvx-av__trend-m">{monthLabel(props.ctx.locale, row().m, true)}</span>
            </div>
          )}
        </For>
      </div>
      <figcaption class="nsvx-av__muted">
        {hm(total())} · <span class="nsvx-av__key nsvx-av__key--flight" /> {props.ctx.at("flight")}{" "}
        <span class="nsvx-av__key nsvx-av__key--sim" /> {props.ctx.at("sim")}
      </figcaption>
    </figure>
  );
}

function Experience(props: { ctx: AvCtx; totals: Totals; month: Totals; year: Totals }) {
  const at = (key: Parameters<AvCtx["at"]>[0]) => props.ctx.at(key);
  const flights = (t: Totals) => `${t.flights} ${at("flights")}`;
  return (
    <div class="nsvx-av__kpis">
      <Kpi
        icon="plane"
        label={at("total")}
        value={hm(props.totals.total_min)}
        sub={flights(props.totals)}
      />
      <Kpi icon="star" label="PIC" value={hm(props.totals.pic_min)} />
      <Kpi icon="user" label={at("copilot")} value={hm(props.totals.copilot_min)} />
      <Kpi icon="moon" label={at("night")} value={hm(props.totals.night_min)} />
      <Kpi icon="hide" label="IFR" value={hm(props.totals.ifr_min)} />
      <Kpi icon="sim" label={at("sim")} value={hm(props.totals.fstd_min)} />
      <Kpi
        icon="agenda"
        label={at("month")}
        value={hm(props.month.total_min)}
        sub={flights(props.month)}
      />
      <Kpi
        icon="progress"
        label={at("year")}
        value={hm(props.year.total_min)}
        sub={flights(props.year)}
      />
    </div>
  );
}

function Yesterday(props: {
  ctx: AvCtx;
  data: Overview["yesterday"];
  onConfirm: () => void;
  onChecked: () => void;
}) {
  const action = createAction(() => props.ctx);
  const open = createMemo(() =>
    props.data.candidates.filter((c) =>
      ["awaiting", "missing_info", "not_finished"].includes(c.state),
    ),
  );
  return (
    <section
      class={["nsvx-av__day", `nsvx-av__day--${DAY_TONE[props.data.state] || "none"}`]}
      aria-label={props.ctx.at("yesterday")}
    >
      <div class="nsvx-av__day-head">
        <Icon name="plane" />
        <strong>{props.ctx.at("yesterday")}</strong>
        <span class="nsvx-av__muted">{dayLabel(props.ctx.locale, props.data.date)}</span>
        <Badge tone={DAY_TONE[props.data.state]} label={props.ctx.at(`day_${props.data.state}`)} />
      </div>
      <ul class="nsvx-list">
        <For each={props.data.recorded} keyed={(entry) => entry.id}>
          {(entry) => (
            <li>
              <EntryLine ctx={props.ctx} entry={entry()} />
            </li>
          )}
        </For>
      </ul>
      <div class="nsvx-av__bar">
        <Show when={props.data.open_total > 0}>
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            onClick={() => props.onConfirm()}
          >
            <Icon name="done" />
            <span>
              {props.ctx.at("confirm")} {Math.max(open().length, props.data.open_total)}
            </span>
          </button>
        </Show>
        <span class="nsvx-av__muted">
          {props.data.actual_source ? props.ctx.at("flightLogSource") : ""}
        </span>
        <button
          type="button"
          class="nsvx__button"
          disabled={action.busy() || !props.ctx.host.connection.canWrite}
          onClick={() =>
            void action
              .run(() => change(props.ctx.host, { action: "syncDay" }), props.ctx.at("checked"))
              .then((ok) => ok && props.onChecked())
          }
        >
          <Icon name="refresh" />
          <span>{props.ctx.at("checkNow")}</span>
        </button>
      </div>
      <Note note={action.note()} />
    </section>
  );
}

function Home(props: { ctx: AvCtx; go: (section: Section, open?: AvOpen) => void }) {
  const source = createSource(props.ctx.host, () =>
    view<Overview>(props.ctx.host, "aviationOverview"),
  );
  void source.refresh();
  const action = createAction(() => props.ctx);
  return (
    <SourceView source={source} t={props.ctx.t}>
      {(data) => (
        <div class="nsvx-av__stack">
          <Show when={!data().imported}>
            <button type="button" class="nsvx-av__cta" onClick={() => props.go("more")}>
              <Icon name="folder" />
              <strong>{props.ctx.at("importLogbook")}</strong>
              <Icon name="back" class={["nsvx__icon", "nsvx-av__chevron"]} />
            </button>
          </Show>
          <Yesterday
            ctx={props.ctx}
            data={data().yesterday}
            onConfirm={() => props.go("logbook", { confirm: true })}
            onChecked={() => void source.refresh()}
          />
          <Experience
            ctx={props.ctx}
            totals={data().stats.totals}
            month={data().stats.month}
            year={data().stats.year}
          />
          <Show when={data().sheet.pending_write > 0}>
            <div class="nsvx-av__banner" role="status">
              <Icon name="folder" />
              <span>
                {data().sheet.pending_write} {props.ctx.at("notInFile")}
              </span>
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy()}
                onClick={() =>
                  void action.run(() => saveNsvxFile(props.ctx.host, { kind: "xlsx" }))
                }
              >
                <Icon name="download" />
                <span>Excel</span>
              </button>
            </div>
          </Show>
          <Note note={action.note()} />
          <div class="nsvx-av__grid">
            <Card title={props.ctx.at("perMonth")} icon="progress">
              <Trend ctx={props.ctx} rows={data().trend} today={data().today} />
            </Card>
            <Card title={props.ctx.at("validity")} icon="shield">
              <ul class="nsvx-list">
                <For each={data().alerts} keyed={(alert) => alert.id}>
                  {(alert) => (
                    <li class="nsvx-row">
                      <Icon name="alert" class={["nsvx-row__icon", "nsvx-row__icon--warn"]} />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{alert().name}</span>
                        <span class="nsvx-row__detail">
                          {dayLabel(props.ctx.locale, alert().expires_on)}
                        </span>
                      </span>
                      <button
                        type="button"
                        class="nsvx__button"
                        aria-label={`OK: ${alert().name}`}
                        onClick={() =>
                          void action
                            .run(() =>
                              change(props.ctx.host, { action: "alertRead", id: alert().id }),
                            )
                            .then(() => source.refresh())
                        }
                      >
                        OK
                      </button>
                    </li>
                  )}
                </For>
                <For
                  each={data().validity.filter(
                    (doc) => !data().alerts.some((a) => a.file_id === doc.id),
                  )}
                  keyed={(doc) => doc.id}
                >
                  {(doc) => (
                    <li>
                      <button
                        type="button"
                        class={["nsvx-row", "nsvx-row--link"]}
                        onClick={() => props.go("docs", { doc: doc().id })}
                      >
                        <Icon name="doc" class="nsvx-row__icon" />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{doc().title}</span>
                          <span class="nsvx-row__detail">
                            {dayLabel(props.ctx.locale, doc().expires_on)}
                          </span>
                        </span>
                        <Badge
                          tone={VALIDITY_TONE[doc().validity]}
                          label={props.ctx.at(`valid_${doc().validity}`)}
                        />
                      </button>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={data().validity.length === 0 && data().alerts.length === 0}>
                <p class="nsvx__empty">{props.ctx.at("noDates")}</p>
              </Show>
            </Card>
            <Card title={props.ctx.at("essentials")} icon="star">
              <div class="nsvx-av__tiles">
                <For each={data().essential} keyed={(doc) => doc.id}>
                  {(doc) => (
                    <button
                      type="button"
                      class="nsvx-av__tile"
                      onClick={() => props.go("docs", { doc: doc().id })}
                    >
                      <Icon name={doc().kind === "image" ? "user" : "doc"} />
                      <span>{doc().title}</span>
                    </button>
                  )}
                </For>
              </div>
              <Show when={data().essential.length === 0}>
                <p class="nsvx__empty">{props.ctx.at("pinHint")}</p>
              </Show>
            </Card>
            <Card title={props.ctx.at("recent")} icon="plane">
              <ul class="nsvx-list">
                <For each={data().recent} keyed={(entry: Entry) => entry.id}>
                  {(entry) => (
                    <li>
                      <EntryLine ctx={props.ctx} entry={entry()} />
                    </li>
                  )}
                </For>
              </ul>
              <Show when={data().recent.length === 0}>
                <p class="nsvx__empty">{props.ctx.at("noEntries")}</p>
              </Show>
            </Card>
            <Card title={props.ctx.at("aircraft")} icon="plane">
              <Bars
                rows={data().aircraft.map((a) => ({
                  label: a.model,
                  value: a.minutes,
                  sub: `${a.flights} ${props.ctx.at("flights")}`,
                }))}
              />
            </Card>
          </div>
        </div>
      )}
    </SourceView>
  );
}

export function AviationTab(props: {
  host: ControlUiHost;
  t: T;
  locale: string;
  query: string;
  onMission: (id: string) => void;
}) {
  const pick = new URLSearchParams(location.search).get("av");
  const [section, setSection] = createSignal<Section>(
    SECTIONS.includes(pick as Section) ? (pick as Section) : "home",
  );
  const [open, setOpen] = createSignal<AvOpen>({});
  const ctx = createMemo<AvCtx>(() => ({
    host: props.host,
    t: props.t,
    at: aviationTranslator(props.locale),
    query: props.query,
    locale: props.locale,
    onMission: props.onMission,
  }));
  const go = (next: Section, opened: AvOpen = {}) => {
    setOpen(opened);
    setSection(next);
    const url = new URL(location.href);
    url.searchParams.set("av", next);
    history.replaceState(history.state, "", url);
  };
  return (
    <div class="nsvx-av">
      <Segs
        name={ctx().at("aviation")}
        items={SECTIONS}
        value={section()}
        label={(key) => ctx().at(key)}
        icon={(key) => SECTION_ICON[key]}
        onChange={(next) => go(next)}
      />
      <For each={[section()]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={section() === "home"}>
              <Home ctx={ctx()} go={go} />
            </Show>
            <Show when={section() === "logbook"}>
              <LogbookView ctx={ctx()} confirm={open().confirm === true} />
            </Show>
            <Show when={section() === "docs"}>
              <DocsView ctx={ctx()} open={open().doc} />
            </Show>
            <Show when={section() === "checkin"}>
              <CheckinView ctx={ctx()} onDoc={(doc) => go("docs", { doc })} />
            </Show>
            <Show when={section() === "roster"}>
              <RosterView ctx={ctx()} />
            </Show>
            <Show when={section() === "more"}>
              <MoreView ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
