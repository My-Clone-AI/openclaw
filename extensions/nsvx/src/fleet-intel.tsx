/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { money, shortDate } from "./finance-data.js";
import {
  maxOf,
  type Analytics,
  type Report,
  type ReportTable,
  type Rule,
  type RuleRun,
} from "./fleet-data.js";
import { QUICK_QUESTIONS } from "./fleet-i18n.js";
import type { Go } from "./fleet-tab.js";
import {
  Block,
  ChangeNote,
  Chip,
  ConfirmButton,
  createFleetChange,
  Empty,
  fleetView,
  Glyph,
  Seg,
  type Ctx,
  type GlyphName,
} from "./fleet-ui.js";
import type { FleetAnswer } from "./fleet.js";
import { age, createSource, errorMessage, matches, SourceView } from "./ui-kit.js";

const PARTS = ["ask", "rules", "reports"] as const;
type Part = (typeof PARTS)[number];
const PART_ICON: Record<Part, GlyphName> = { ask: "ask", rules: "rules", reports: "reports" };

/** NSVX assistant links point at NSVX screens; each opens the same record here instead. */
function openLink(go: Go, link: string) {
  const driver = /^\/tvde\/motoristas\/([\w-]+)$/.exec(link);
  if (driver) {
    return go("drivers", { kind: "driver", id: driver[1]! });
  }
  const car = /^\/tvde\/viaturas\/([\w-]+)$/.exec(link);
  if (car) {
    return go("cars", { kind: "car", id: car[1]! });
  }
  if (link.startsWith("/tvde/faturas") || link.startsWith("/tvde/financas")) {
    return go("money");
  }
  if (link.startsWith("/tvde/documentos")) {
    return go("drivers", undefined, "issues");
  }
  return go("home");
}

function Ask(props: { ctx: Ctx; go: Go }) {
  const ft = props.ctx.ft;
  const [question, setQuestion] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [answer, setAnswer] = createSignal<FleetAnswer>();
  const [error, setError] = createSignal<string>();
  const ask = async (text: string) => {
    if (text.trim().length < 2) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setAnswer(
        await props.ctx.host.request<FleetAnswer>("nsvx.fleet.ask", { question: text.trim() }),
      );
    } catch (cause) {
      setError(errorMessage(props.ctx.host, cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="nsvx-fleet-ask">
      <form
        class="nsvx-fleet-ask__box"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question());
        }}
      >
        <Glyph name="ask" />
        <input
          type="text"
          maxlength={600}
          placeholder={ft("askHint")}
          aria-label={ft("askHint")}
          value={question()}
          onInput={(event) => setQuestion(event.currentTarget.value)}
        />
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={busy() || question().trim().length < 2}
        >
          {ft("send")}
        </button>
      </form>
      <div class="nsvx-fleet-chips">
        <For each={QUICK_QUESTIONS} keyed={(q) => q.label}>
          {(quick) => (
            <button
              type="button"
              class="nsvx-fleet-quick"
              disabled={busy()}
              onClick={() => {
                setQuestion(ft(quick().label));
                void ask(quick().question);
              }}
            >
              {ft(quick().label)}
            </button>
          )}
        </For>
      </div>
      <Show when={busy()}>
        <p class="nsvx__empty" aria-busy="true">
          {props.ctx.t("loading")}
        </p>
      </Show>
      <Show when={error()}>
        <p class="nsvx__error" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={!busy() && answer()}>
        {(shown) => (
          <article class="nsvx-fleet-answer" role="status">
            <header>
              <Chip
                tone={
                  shown().source === "ia" ? "run" : shown().source === "registos" ? "ok" : "warn"
                }
              >
                {shown().source === "ia"
                  ? ft("fromAi")
                  : shown().source === "registos"
                    ? ft("fromRecords")
                    : ft("unavailable")}
              </Chip>
              <span class="nsvx-row__detail">
                {shortDate(shown().as_of, props.ctx.host.locale)}
              </span>
            </header>
            <p class="nsvx-fleet-answer__text">{props.ctx.host.redact(shown().answer)}</p>
            <ul class="nsvx-list">
              <For each={shown().items} keyed={false}>
                {(item) => (
                  <li>
                    <button
                      type="button"
                      class="nsvx-row nsvx-row--link"
                      onClick={() => openLink(props.go, item().link)}
                    >
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{item().label}</span>
                        <Show when={item().detail}>
                          <span class="nsvx-row__detail">{item().detail}</span>
                        </Show>
                      </span>
                      <Glyph name="next" />
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </article>
        )}
      </Show>
    </div>
  );
}

function Rules(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const rules = createSource(props.ctx.host, () =>
    fleetView<{ rules: Rule[]; runs: RuleRun[] }>(props.ctx.host, "fleetAutomation"),
  );
  void rules.refresh();
  const change = createFleetChange(props.ctx, rules.refresh);
  const [preview, setPreview] = createSignal<{ code: string; text: string }>();
  const showPreview = async (code: string) => {
    try {
      const answer = await fleetView<{ preview: Record<string, unknown> }>(
        props.ctx.host,
        "fleetRulePreview",
        { code },
      );
      const count = (answer.preview.count ??
        answer.preview.drafts ??
        answer.preview.deleted ??
        (Array.isArray(answer.preview.alerts) ? answer.preview.alerts.length : undefined)) as
        | number
        | undefined;
      setPreview({ code, text: count === undefined ? ft("noneYet") : String(count) });
    } catch (cause) {
      setPreview({ code, text: errorMessage(props.ctx.host, cause) });
    }
  };
  return (
    <SourceView source={rules} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().rules.filter((r) => matches(props.ctx.query, r.name, r.description, r.code));
        return (
          <>
            <div class="nsvx-fleet-bar-end">
              <ConfirmButton
                ft={ft}
                label={ft("runNow")}
                hint={ft("runHint")}
                icon="play"
                primary
                busy={change.busy() === "run"}
                disabled={!props.ctx.host.connection.canWrite}
                onConfirm={() => void change.run("run", { action: "runRules" })}
              />
            </div>
            <ChangeNote change={change} />
            <ul class="nsvx-fleet-rules">
              <For each={rows()} keyed={(r) => r.code}>
                {(rule) => (
                  <li class={["nsvx-fleet-rule", { "nsvx-fleet-seen": !rule().enabled }]}>
                    <span class="nsvx-fleet-rule__code">{rule().code.split("_")[0]}</span>
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{rule().name}</span>
                      <span class="nsvx-row__detail">{rule().description}</span>
                      <span class="nsvx-fleet-card__meta">
                        <Show when={rule().last_run_at}>
                          <span>
                            {ft("lastRun")} {age(rule().last_run_at)}
                          </span>
                        </Show>
                        <Show
                          when={rule().enabled && rule().next_run_at && !rule().schedule_paused}
                        >
                          <span>
                            {ft("nextRun")} {shortDate(rule().next_run_at, props.ctx.host.locale)}
                          </span>
                        </Show>
                        <Show when={preview()?.code === rule().code}>
                          <Chip tone="run">
                            {ft("preview")}: {preview()!.text}
                          </Chip>
                        </Show>
                      </span>
                    </span>
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--icon"
                      aria-label={ft("preview")}
                      title={ft("preview")}
                      onClick={() => void showPreview(rule().code)}
                    >
                      <Glyph name="docs" />
                    </button>
                    <Show when={rule().enabled}>
                      <button
                        type="button"
                        class="nsvx__button nsvx__button--icon"
                        aria-label={ft("paused")}
                        title={ft("paused")}
                        aria-pressed={rule().schedule_paused ? "true" : "false"}
                        disabled={Boolean(change.busy()) || !props.ctx.host.connection.canWrite}
                        onClick={() =>
                          void change.run(`pause:${rule().code}`, {
                            action: "rule",
                            code: rule().code,
                            paused: !rule().schedule_paused,
                          })
                        }
                      >
                        <Glyph name={rule().schedule_paused ? "play" : "plan"} />
                      </button>
                    </Show>
                    <button
                      type="button"
                      role="switch"
                      class="nsvx-ppl-switch"
                      aria-label={rule().name}
                      aria-checked={rule().enabled ? "true" : "false"}
                      disabled={Boolean(change.busy()) || !props.ctx.host.connection.canWrite}
                      onClick={() =>
                        void change.run(`rule:${rule().code}`, {
                          action: "rule",
                          code: rule().code,
                          enabled: !rule().enabled,
                        })
                      }
                    >
                      <span class="nsvx-ppl-switch__track" aria-hidden="true" />
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <Show when={data().runs.length > 0}>
              <details class="nsvx-fleet-more">
                <summary>
                  <Glyph name="history" />
                  <span>{ft("history")}</span>
                </summary>
                <ul class="nsvx-timeline">
                  <For each={data().runs.slice(0, 20)} keyed={(r) => r.id}>
                    {(run) => (
                      <li class="nsvx-row">
                        <span class="nsvx-fleet-rule__code">{run().rule_code.split("_")[0]}</span>
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{run().actions}</span>
                        </span>
                        <Show when={run().error}>
                          <Chip tone="bad">{ft("failed")}</Chip>
                        </Show>
                        <span class="nsvx-row__age">{age(run().at)}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </details>
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function Trend(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const analytics = createSource(props.ctx.host, () =>
    fleetView<Analytics>(props.ctx.host, "fleetAnalytics"),
  );
  void analytics.refresh();
  return (
    <SourceView source={analytics} t={props.ctx.t}>
      {(a) => {
        const top = () => maxOf([...a().weekly_net.map((w) => w.net), a().next_week_forecast]);
        return (
          <Block
            icon="reports"
            title={ft("weeklyNet")}
            action={
              <Show when={a().next_week_forecast}>
                <Chip tone="run">
                  {ft("nextWeek")} {money(a().next_week_forecast, "EUR", props.ctx.host.locale)}
                </Chip>
              </Show>
            }
          >
            <div class="nsvx-fleet-bars" role="list">
              <For each={a().weekly_net} keyed={(w) => w.week}>
                {(w) => (
                  <div
                    class="nsvx-fleet-bars__col"
                    role="listitem"
                    aria-label={`${w().week} ${w().net}`}
                  >
                    <span class="nsvx-fleet-bars__pair">
                      <span
                        class="nsvx-fleet-bars__bar nsvx-fleet-bars__bar--in"
                        style={{ height: `${(Math.abs(Number(w().net)) / top()) * 100}%` }}
                      />
                    </span>
                    <span class="nsvx-fleet-bars__label">{w().week.slice(5)}</span>
                  </div>
                )}
              </For>
            </div>
          </Block>
        );
      }}
    </SourceView>
  );
}

function ReportView(props: { ctx: Ctx; name: string; onClose: () => void }) {
  const table = createSource(props.ctx.host, () =>
    fleetView<ReportTable>(props.ctx.host, "fleetReport", { name: props.name }),
  );
  void table.refresh();
  return (
    <SourceView source={table} t={props.ctx.t}>
      {(r) => (
        <Block
          icon="reports"
          title={r().title}
          count={r().rows.length}
          action={
            <button
              type="button"
              class="nsvx__button nsvx__button--icon"
              aria-label={props.ctx.ft("back")}
              title={props.ctx.ft("back")}
              onClick={() => props.onClose()}
            >
              <Glyph name="close" />
            </button>
          }
        >
          <div class="nsvx-fleet-table-wrap">
            <table class="nsvx-fleet-table">
              <thead>
                <tr>
                  <For each={r().columns} keyed={false}>
                    {(column) => <th scope="col">{column()}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For
                  each={r().rows.filter((row) =>
                    matches(props.ctx.query, ...row.map((cell) => String(cell ?? ""))),
                  )}
                  keyed={false}
                >
                  {(row) => (
                    <tr>
                      <For each={row()} keyed={false}>
                        {(cell) => <td>{cell() ?? ""}</td>}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <Show when={r().rows.length === 0}>
            <Empty icon="reports" text={props.ctx.ft("noneYet")} />
          </Show>
        </Block>
      )}
    </SourceView>
  );
}

function Reports(props: { ctx: Ctx }) {
  const [open, setOpen] = createSignal<string>();
  const list = createSource(props.ctx.host, () =>
    fleetView<{ reports: Report[] }>(props.ctx.host, "fleetReports"),
  );
  void list.refresh();
  const GROUP_ICON: Record<string, GlyphName> = {
    operacional: "cars",
    conformidade: "docs",
    financeiro: "money",
  };
  return (
    <>
      <Show when={open()} fallback={<Trend ctx={props.ctx} />}>
        {(name) => (
          <For each={[name()]} keyed={(key) => key}>
            {(key) => (
              <ReportView ctx={props.ctx} name={key()} onClose={() => setOpen(undefined)} />
            )}
          </For>
        )}
      </Show>
      <SourceView source={list} t={props.ctx.t}>
        {(data) => (
          <div class="nsvx-fleet-grid">
            <For
              each={data().reports.filter((r) => matches(props.ctx.query, r.title))}
              keyed={(r) => r.name}
            >
              {(report) => (
                <button
                  type="button"
                  class={[
                    "nsvx-fleet-report",
                    { "nsvx-fleet-report--on": open() === report().name },
                  ]}
                  aria-pressed={open() === report().name ? "true" : "false"}
                  onClick={() => setOpen(report().name)}
                >
                  <Glyph name={GROUP_ICON[report().group] ?? "reports"} />
                  <span>{report().title}</span>
                </button>
              )}
            </For>
          </div>
        )}
      </SourceView>
    </>
  );
}

export function FleetAsk(props: { ctx: Ctx; go: Go }) {
  const ft = props.ctx.ft;
  const [part, setPart] = createSignal<Part>("ask");
  return (
    <div class="nsvx-fleet-roster">
      <Seg
        compact
        name={ft("ask")}
        items={PARTS}
        value={part()}
        label={(key) => ft(key)}
        icon={(key) => PART_ICON[key]}
        onChange={setPart}
      />
      <For each={[part()]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={part() === "ask"}>
              <Ask ctx={props.ctx} go={props.go} />
            </Show>
            <Show when={part() === "rules"}>
              <Rules ctx={props.ctx} />
            </Show>
            <Show when={part() === "reports"}>
              <Reports ctx={props.ctx} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
