/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import type { Procedure } from "./cases-data.js";
import type { DeskKey } from "./desk-i18n.js";
import {
  BackButton,
  ConfirmButton,
  createAct,
  Empty,
  ErrorLine,
  IconButton,
  Panel,
  ToneChip,
  when,
  type DeskCtx,
  type Tone,
} from "./desk-ui.js";
import { view } from "./group-ui.js";
import { createSource, Icon, matches, SourceView } from "./ui-kit.js";

const STATE_TONE: Record<string, Tone> = {
  enabled: "ok",
  paused: "off",
  queued: "busy",
  running: "busy",
  waiting: "warn",
  completed: "ok",
  failed: "bad",
  cancelled: "off",
  uncertain: "warn",
};
const WORD: Record<string, DeskKey> = {
  enabled: "enabled",
  paused: "paused",
  queued: "queued",
  running: "running",
  waiting: "waiting",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  uncertain: "toConfirm",
};
const LIVE = new Set(["queued", "running", "waiting"]);

/** NSVX's saved procedures: on or paused, run now with the saved example inputs, stop a run. */
export function Routines(props: { ctx: DeskCtx }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const list = createSource(host, () => view<{ items: Procedure[] }>(host, "procedures"));
  void list.refresh();
  const [open, setOpen] = createSignal<string>();
  return (
    <Show
      when={open()}
      fallback={
        <SourceView source={list} t={props.ctx.t}>
          {(data) => (
            <Show
              when={data().items.length > 0}
              fallback={<Empty icon="flow" text={d("noSteps")} />}
            >
              <ul class="nsvx-list">
                <For each={data().items.filter((p) => matches(props.ctx.query, p.title, p.outcome))} keyed={(p) => p.id}>
                  {(p) => (
                    <li>
                      <button type="button" class="nsvx-row nsvx-row--link nsvx-desk__row" data-procedure={p().id} onClick={() => setOpen(p().id)}>
                        <Icon name="flow" class="nsvx-row__icon" />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{p().title}</span>
                          <span class="nsvx-row__detail">
                            v{p().version}
                            {p().outcome ? ` · ${p().outcome}` : ""}
                          </span>
                        </span>
                        <ToneChip tone={STATE_TONE[p().state] ?? "off"} label={d(WORD[p().state] ?? "paused")} />
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          )}
        </SourceView>
      }
    >
      {(id) => (
        <For each={[id()]} keyed={(key) => key}>
          {() => (
            <RoutinePage
              ctx={props.ctx}
              id={id()}
              onBack={() => {
                setOpen(undefined);
                void list.refresh();
              }}
            />
          )}
        </For>
      )}
    </Show>
  );
}

function RoutinePage(props: { ctx: DeskCtx; id: string; onBack: () => void }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const data = createSource(host, () => view<Procedure>(host, "procedure", { pid: props.id }));
  void data.refresh();
  const [values, setValues] = createSignal<Record<string, string>>({});
  // One key per run intent: an uncertain answer repeated with it is replayed by NSVX, not run twice.
  let clientKey = crypto.randomUUID();
  const toggle = async (p: Procedure) => {
    if (await act.run("nsvx.procedures.state", { procedure: p.id, version: p.version, enabled: p.state !== "enabled" })) {
      await data.refresh();
    }
  };
  const run = async (p: Procedure) => {
    const inputs = Object.fromEntries(
      Object.entries(p.definition?.inputs ?? {}).map(([name, field]) => {
        const value = values()[name] ?? String(field.example);
        return [name, field.type === "integer" ? Number(value) : value];
      }),
    );
    const answer = await act.run("nsvx.procedures.run", {
      procedure: p.id,
      version: p.version,
      inputs,
      clientKey,
    });
    if (answer) {
      clientKey = crypto.randomUUID();
      await data.refresh();
    }
  };
  const stop = async (runId: string) => {
    if (await act.run("nsvx.procedures.cancel", { run: runId })) {
      await data.refresh();
    }
  };
  return (
    <div class="nsvx-grp__company">
      <BackButton d={d} onClick={props.onBack} />
      <SourceView source={data} t={props.ctx.t}>
        {(p) => (
          <>
            <header class="nsvx-desk__hero" data-procedure-page={p().id}>
              <Icon name="flow" class="nsvx-desk__hero-icon" />
              <div class="nsvx-desk__hero-main">
                <ToneChip tone={STATE_TONE[p().state] ?? "off"} label={d(WORD[p().state] ?? "paused")} />
                <h2 class="nsvx-desk__h">{p().title}</h2>
                <Show when={p().definition?.outcome}>
                  <p class="nsvx-grp__note">{p().definition?.outcome}</p>
                </Show>
              </div>
              <IconButton
                icon={p().state === "enabled" ? "pause" : "resume"}
                label={d(p().state === "enabled" ? "turnOff" : "turnOn")}
                disabled={act.busy()}
                onClick={() => void toggle(p())}
              />
            </header>
            <Show when={p().readiness_reason}>
              <p class="nsvx__notice" role="status">
                {p().readiness_reason}
              </p>
            </Show>
            <ErrorLine error={act.error()} />
            <div class="nsvx-desk__cols">
              <Panel icon="flow" title={d("steps")}>
                <ol class="nsvx-desk__steps">
                  <For each={p().definition?.plan.steps ?? []} keyed={false}>
                    {(step) => <li>{step().purpose ?? step().type}</li>}
                  </For>
                </ol>
              </Panel>
              <Panel icon="resume" title={d("run")}>
                <div class="nsvx-grp__form">
                  <For each={Object.entries(p().definition?.inputs ?? {})} keyed={(e) => e[0]}>
                    {(entry) => (
                      <label class="nsvx-field">
                        <span>{entry()[0].replaceAll("_", " ")}</span>
                        <input
                          type={entry()[1].type === "date" ? "date" : entry()[1].type === "integer" ? "number" : "text"}
                          value={values()[entry()[0]] ?? String(entry()[1].example)}
                          onInput={(e) => setValues({ ...values(), [entry()[0]]: e.currentTarget.value })}
                        />
                      </label>
                    )}
                  </For>
                </div>
                <ConfirmButton
                  d={d}
                  icon="resume"
                  label={d("run")}
                  question={d("run")}
                  primary
                  disabled={act.busy() || p().state !== "enabled"}
                  onConfirm={() => void run(p())}
                />
              </Panel>
            </div>
            <Panel icon="history" title={d("runs")}>
              <Show when={(p().runs ?? []).length > 0} fallback={<Empty icon="history" text={d("noRuns")} />}>
                <ul class="nsvx-list">
                  <For each={p().runs ?? []} keyed={(r) => r.id}>
                    {(r) => (
                      <li class="nsvx-row" data-run={r().id}>
                        <span class={["nsvx-grp__dot", `nsvx-desk__dot--${STATE_TONE[r().state] ?? "off"}`]} />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{d(WORD[r().state] ?? "waiting")}</span>
                          <span class="nsvx-row__detail">
                            v{r().version} · {when(props.ctx.locale, r().created_at)}
                            {r().reason ? ` · ${r().reason}` : ""}
                          </span>
                        </span>
                        <Show when={LIVE.has(r().state)}>
                          <IconButton icon="stop" label={d("cancel")} danger disabled={act.busy()} onClick={() => void stop(r().id)} />
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Panel>
          </>
        )}
      </SourceView>
    </div>
  );
}
