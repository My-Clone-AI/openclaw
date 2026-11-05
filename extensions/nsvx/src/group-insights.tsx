/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  isAdult,
  levelTone,
  METRICS,
  metricRange,
  metricSeries,
  metricsCsv,
  ticks,
  type ErrorLevel,
  type ErrorsFeed,
  type Metric,
  type Metrics,
} from "./group-data.js";
import type { GroupKey } from "./group-i18n.js";
import { Glyph, view, hue, AppMark, Dot, Segments, type Ctx } from "./group-ui.js";
import { age, createSource, matches, SourceView } from "./ui-kit.js";

const HOURS = [1, 6, 24, 168] as const;
const LEVELS: ErrorLevel[] = ["fatal", "error", "warning"];

export function Errors(props: { ctx: Ctx; app: string; onApp: (id: string) => void }) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  const ask = { hours: 24 };
  const [hours, setHours] = createSignal<number>(24);
  const [level, setLevel] = createSignal<ErrorLevel | "">("");
  const feed = createSource(host, () =>
    view<ErrorsFeed>(host, "groupErrors", { hours: String(ask.hours) }),
  );
  void feed.refresh();
  const nf = () => new Intl.NumberFormat(props.ctx.locale);
  return (
    <>
      <div class="nsvx-grp__bar">
        <Segments
          name={g("errors")}
          items={HOURS.map(String)}
          value={String(hours())}
          label={(h) => (h === "168" ? "7d" : `${h}h`)}
          onChange={(h) => {
            ask.hours = Number(h);
            setHours(ask.hours);
            void feed.refresh();
          }}
        />
      </div>
      <SourceView source={feed} t={props.ctx.t}>
        {(data) => {
          const sources = createMemo(() =>
            data()
              .apps.filter((s) => !isAdult(s))
              .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
          );
          const names = createMemo(() => new Map(sources().map((s) => [s.id, s.name])));
          const items = createMemo(() =>
            data().items.filter(
              (r) =>
                !isAdult(r) &&
                names().has(r.app) &&
                (!props.app || r.app === props.app) &&
                matches(props.ctx.query, r.message, r.route, r.app),
            ),
          );
          const count = (l: ErrorLevel | "") => items().filter((r) => !l || r.level === l).length;
          return (
            <>
              <div class="nsvx-grp__levels" role="group" aria-label={g("errors")}>
                <For each={["", ...LEVELS] as (ErrorLevel | "")[]} keyed={false}>
                  {(l) => (
                    <button
                      type="button"
                      class="nsvx-grp__chip nsvx-grp__chip--button"
                      aria-pressed={level() === l() ? "true" : "false"}
                      onClick={() => setLevel(l())}
                    >
                      <Show when={l()}>
                        <Dot tone={levelTone(l())} />
                      </Show>
                      {l() ? g(l() as GroupKey) : g("all")}
                      <strong>{count(l())}</strong>
                    </button>
                  )}
                </For>
              </div>
              <div class="nsvx-grp__sources" role="group" aria-label={g("apps")}>
                <For
                  each={sources().filter((s) => s.count > 0 || s.status === "error")}
                  keyed={(s) => s.id}
                >
                  {(s) => (
                    <button
                      type="button"
                      class="nsvx-grp__chip nsvx-grp__chip--button"
                      aria-pressed={props.app === s().id ? "true" : "false"}
                      onClick={() => props.onApp(props.app === s().id ? "" : s().id)}
                    >
                      <AppMark id={s().id} name={s().name} size="sm" />
                      {s().name}
                      <strong>{s().status === "error" ? "!" : nf().format(s().count)}</strong>
                    </button>
                  )}
                </For>
              </div>
              <ul class="nsvx-list">
                <For
                  each={items().filter((r) => !level() || r.level === level())}
                  keyed={(r) => `${r.app}:${r.group}`}
                >
                  {(r) => (
                    <li class="nsvx-row" data-error-app={r().app}>
                      <AppMark id={r().app} name={names().get(r().app) ?? r().app} size="sm" />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">
                          <Dot tone={levelTone(r().level)} /> {r().message}
                        </span>
                        <span class="nsvx-row__detail">
                          {names().get(r().app) ?? r().app} · {g(r().level)}
                          {r().route ? ` · ${r().route}` : ""} · {age(r().lastSeen)}
                        </span>
                      </span>
                      <strong class="nsvx-grp__count">×{nf().format(r().count)}</strong>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={items().filter((r) => !level() || r.level === level()).length === 0}>
                <p class="nsvx__empty">✓ {g("noErrors")}</p>
              </Show>
            </>
          );
        }}
      </SourceView>
    </>
  );
}

const RANGES = ["7", "30", "90", "365"] as const;

function Chart(props: {
  ctx: Ctx;
  series: [string, Metrics["apps"][string]["days"]][];
  metric: Metric;
  hidden: Set<string>;
}) {
  const visible = createMemo(() => props.series.filter(([id]) => !props.hidden.has(id)));
  const dates = createMemo(() =>
    [...new Set(visible().flatMap(([, days]) => days.map((d) => d.date)))].toSorted(),
  );
  const steps = createMemo(() =>
    ticks(Math.max(0, ...visible().flatMap(([, days]) => days.map((d) => d[props.metric] ?? 0)))),
  );
  const max = () => steps().at(-1) || 1;
  const x = (date: string) =>
    48 + (dates().length <= 1 ? 302 : (dates().indexOf(date) * 604) / (dates().length - 1));
  const y = (value: number) => 180 - (value / max()) * 150;
  const nf = () => new Intl.NumberFormat(props.ctx.locale);
  return (
    <figure class="nsvx-grp__chart">
      <svg
        viewBox="0 0 700 220"
        role="img"
        aria-label={`${props.ctx.g(props.metric)} · ${nf().format(max())}`}
      >
        <For each={steps()} keyed={false}>
          {(tick) => (
            <g>
              <text x="44" y={y(tick()) + 4} text-anchor="end" fill="currentColor" font-size="14">
                {nf().format(tick())}
              </text>
              <path d={`M48 ${y(tick())} H652`} stroke="currentColor" opacity=".15" />
            </g>
          )}
        </For>
        <For each={visible()} keyed={(entry) => entry[0]}>
          {(entry) => (
            <polyline
              data-metric-app={entry()[0]}
              points={entry()[1]
                .filter((day) => day[props.metric] !== null)
                .map((day) => `${x(day.date)},${y(day[props.metric] ?? 0)}`)
                .join(" ")}
              fill="none"
              stroke={`hsl(${hue(entry()[0])} 65% 50%)`}
              stroke-width="2.5"
            />
          )}
        </For>
        <text x="48" y="210" fill="currentColor" font-size="14">
          {dates()[0] ?? ""}
        </text>
        <text x="652" y="210" text-anchor="end" fill="currentColor" font-size="14">
          {dates().at(-1) ?? ""}
        </text>
      </svg>
    </figure>
  );
}

export function MetricsView(props: { ctx: Ctx }) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  const ask = { days: 30 };
  const [range, setRange] = createSignal<(typeof RANGES)[number]>("30");
  const [metric, setMetric] = createSignal<Metric>("visitors");
  const [hidden, setHidden] = createSignal(new Set<string>());
  const metrics = createSource(host, () =>
    view<Metrics>(host, "groupMetrics", metricRange(ask.days)),
  );
  void metrics.refresh();
  const nf = () => new Intl.NumberFormat(props.ctx.locale);
  const download = (data: Metrics) => {
    const series = metricSeries(data).filter(([id]) => !hidden().has(id));
    const url = URL.createObjectURL(
      new Blob(["﻿", metricsCsv(series)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `group-${data.from}-${data.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div class="nsvx-grp__bar">
        <Segments
          name={g("days")}
          items={RANGES}
          value={range()}
          label={(d) => `${d}d`}
          onChange={(d) => {
            ask.days = Number(d);
            setRange(d);
            void metrics.refresh();
          }}
        />
        <Segments
          name={g("metrics")}
          items={METRICS}
          value={metric()}
          label={(m) => g(m)}
          onChange={setMetric}
        />
      </div>
      <SourceView source={metrics} t={props.ctx.t}>
        {(data) => {
          const series = createMemo(() => metricSeries(data()));
          const totals = createMemo(() =>
            series().map(([id, days]) => ({
              id,
              visitors: days.reduce((n, d) => n + (d.visitors ?? 0), 0),
              newUsers: days.reduce((n, d) => n + (d.newUsers ?? 0), 0),
              totalUsers: days.findLast((d) => d.totalUsers !== null)?.totalUsers ?? null,
            })),
          );
          return (
            <>
              <Chart ctx={props.ctx} series={series()} metric={metric()} hidden={hidden()} />
              <div class="nsvx-grp__legend" role="group" aria-label={g("apps")}>
                <For each={totals()} keyed={(row) => row.id}>
                  {(row) => (
                    <button
                      type="button"
                      class="nsvx-grp__chip nsvx-grp__chip--button"
                      aria-pressed={hidden().has(row().id) ? "false" : "true"}
                      onClick={() => {
                        const next = new Set(hidden());
                        if (next.has(row().id)) {
                          next.delete(row().id);
                        } else {
                          next.add(row().id);
                        }
                        setHidden(next);
                      }}
                    >
                      <i
                        class="nsvx-grp__swatch"
                        style={{ background: `hsl(${hue(row().id)} 65% 50%)` }}
                      />
                      {row().id}
                      <strong>
                        {metric() === "totalUsers"
                          ? row().totalUsers === null
                            ? "—"
                            : nf().format(row().totalUsers ?? 0)
                          : nf().format(row()[metric() as "visitors" | "newUsers"])}
                      </strong>
                    </button>
                  )}
                </For>
                <button type="button" class="nsvx__button" onClick={() => download(data())}>
                  <Glyph name="download" />
                  {g("csv")}
                </button>
              </div>
              <Show when={series().length === 0}>
                <p class="nsvx__empty">{g("noMetrics")}</p>
              </Show>
            </>
          );
        }}
      </SourceView>
    </>
  );
}
