/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import {
  shortStamp,
  type Procedure,
  type ProcedureDefinition,
  type ProcedureRun,
  type RunReconcile,
} from "./legal-data.js";
import { changeProcedureRequest } from "./legal-kit.js";
import type { LegalCtx } from "./legal-kit.js";
import { every } from "./messages-ui.js";
import { Choice, Field, Panel, Picks, Pill, type OfficeTone } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, matches, SourceView } from "./ui-kit.js";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const stateTone = (state: string): OfficeTone =>
  state === "enabled" || state === "completed"
    ? "ok"
    : state === "failed"
      ? "bad"
      : state === "uncertain"
        ? "warn"
        : state === "paused" || state === "cancelled"
          ? "off"
          : "run";

function Steps(props: { ctx: LegalCtx; definition: ProcedureDefinition }) {
  const ctx = () => props.ctx;
  return (
    <>
      <ol class="nsvx-of__timeline">
        <For each={props.definition.plan.steps} keyed={false}>
          {(step) => (
            <li>
              <strong>{ctx().lt(`step_${step().type}`)}</strong>
              <Show when={step().purpose}>
                <span class="nsvx-of__sub">{step().purpose}</span>
              </Show>
            </li>
          )}
        </For>
      </ol>
      <ul class="nsvx-of__list">
        <For each={props.definition.plan.completion_criteria} keyed={false}>
          {(criterion) => (
            <li class="nsvx-of__sub">
              <Icon name="done" /> {criterion()}
            </li>
          )}
        </For>
      </ul>
    </>
  );
}

function Editor(props: {
  ctx: LegalCtx;
  procedure?: Procedure;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const ctx = () => props.ctx;
  const [title, setTitle] = createSignal(props.procedure?.title ?? "");
  const [text, setText] = createSignal("");
  const [mission, setMission] = createSignal("");
  const [definition, setDefinition] = createSignal(props.procedure?.definition);
  const action = createAction(ctx);
  const missions = createSource(ctx().host, () =>
    view<{ id: string; title: string; status: string }[]>(ctx().host, "missions"),
  );
  void missions.refresh();
  const done = () => (missions.state().data ?? []).filter((row) => row.status === "completed");
  const patch = (next: Partial<ProcedureDefinition>) => {
    const current = definition();
    if (current) {
      setDefinition({ ...current, ...next });
    }
  };
  const trigger = (next: Partial<ProcedureDefinition["trigger"]>) => {
    const current = definition();
    if (current) {
      patch({ trigger: { ...current.trigger, ...next } });
    }
  };
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__form">
        <Field label={ctx().lt("name")} value={title()} max={120} onInput={setTitle} />
        <Field label={ctx().lt("goal")} value={text()} rows={3} max={4000} onInput={setText} />
        <Choice
          label={ctx().lt("fromTask")}
          value={mission()}
          options={[["", "—"], ...done().map((row) => [row.id, row.title] as const)]}
          onChange={setMission}
        />
        <div class="nsvx-dev__bar">
          <button
            type="button"
            class="nsvx__button"
            disabled={action.busy() || (!mission() && text().trim().length < 3)}
            onClick={() =>
              void action.run(async () => {
                setDefinition(
                  await changeProcedureRequest<ProcedureDefinition>(
                    ctx(),
                    mission()
                      ? { action: "propose", missionId: mission() }
                      : { action: "propose", text: text() },
                  ),
                );
              })
            }
          >
            <Icon name="spark" />
            <span>{ctx().lt("propose")}</span>
          </button>
        </div>
      </div>
      <Show when={definition()}>
        {(shown) => (
          <>
            <Field
              label={ctx().lt("outcome")}
              value={shown().outcome}
              rows={2}
              onInput={(outcome) => patch({ outcome })}
            />
            <Steps ctx={ctx()} definition={shown()} />
            <div class="nsvx-of__form">
              <Choice
                label={ctx().lt("when")}
                value={shown().trigger.type}
                options={[
                  ["manual", ctx().lt("onRequest")],
                  ["schedule", ctx().lt("onSchedule")],
                  ["document_processed", ctx().lt("onDocument")],
                ]}
                onChange={(type) => trigger({ type })}
              />
              <Show when={shown().trigger.type === "schedule"}>
                <Field
                  label={ctx().lt("time")}
                  type="time"
                  value={shown().trigger.time ?? "09:00"}
                  onInput={(time) => trigger({ time })}
                />
                <Field
                  label={ctx().lt("timezone")}
                  value={shown().trigger.timezone ?? "Europe/Lisbon"}
                  onInput={(timezone) => trigger({ timezone })}
                />
                <Picks
                  options={WEEKDAYS.map((day, index) => ({
                    id: String(index),
                    label: ctx().lt(day),
                  }))}
                  value={(shown().trigger.weekdays ?? [0, 1, 2, 3, 4, 5, 6]).map(String)}
                  onChange={(days) => trigger({ weekdays: days.map(Number).toSorted() })}
                />
              </Show>
              <Show when={shown().trigger.type === "document_processed"}>
                <Field
                  label={ctx().lt("documentType")}
                  value={shown().trigger.document_type ?? ""}
                  onInput={(document_type) => trigger({ document_type })}
                />
              </Show>
              <For each={Object.entries(shown().inputs)} keyed={(entry) => entry[0]}>
                {(entry) => (
                  <Field
                    label={entry()[0].replaceAll("_", " ")}
                    type={
                      entry()[1].type === "date"
                        ? "date"
                        : entry()[1].type === "integer"
                          ? "number"
                          : "text"
                    }
                    value={String(entry()[1].example)}
                    onInput={(value) =>
                      patch({
                        inputs: {
                          ...shown().inputs,
                          [entry()[0]]: {
                            ...entry()[1],
                            example: entry()[1].type === "integer" ? Number(value) : value,
                          },
                        },
                      })
                    }
                  />
                )}
              </For>
              <Field
                label={ctx().lt("attempts")}
                type="number"
                min="1"
                value={String(shown().limits.max_attempts ?? 3)}
                onInput={(value) =>
                  patch({ limits: { ...shown().limits, max_attempts: Number(value) } })
                }
              />
            </div>
            <p class="nsvx-of__muted">{ctx().lt("savedPaused")}</p>
          </>
        )}
      </Show>
      <Note note={action.note()} />
      <div class="nsvx-of__bar">
        <button type="button" class="nsvx__button" onClick={() => props.onCancel()}>
          {ctx().lt("cancel")}
        </button>
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !title().trim() || !definition()}
          onClick={() =>
            void action.run(async () => {
              const current = definition() as ProcedureDefinition;
              // NSVX stores each non-bound input's reviewed value as the schedule's input, as its own editor does.
              const reviewed = {
                ...current,
                trigger: {
                  ...current.trigger,
                  inputs: Object.fromEntries(
                    Object.entries(current.inputs)
                      .filter(([name]) => !current.trigger.bindings?.[name])
                      .map(([name, field]) => [name, field.example]),
                  ),
                },
              };
              const saved = await changeProcedureRequest<Procedure>(
                ctx(),
                props.procedure
                  ? {
                      action: "edit",
                      id: props.procedure.id,
                      version: props.procedure.version,
                      title: title(),
                      definition: reviewed,
                    }
                  : { action: "create", title: title(), definition: reviewed },
              );
              props.onSaved(saved.id);
            })
          }
        >
          {ctx().lt("save")}
        </button>
      </div>
    </div>
  );
}

function RunDetail(props: { ctx: LegalCtx; id: string; onChange: () => void }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<ProcedureRun>(ctx().host, "procedureRun", { id: props.id }),
  );
  const reconcile = createSource(ctx().host, () =>
    view<RunReconcile>(ctx().host, "procedureReconcile", { id: props.id }),
  );
  void source.refresh();
  void reconcile.refresh();
  const action = createAction(ctx);
  const act = (name: "resume" | "cancel") =>
    void action.run(async () => {
      await changeProcedureRequest(ctx(), { action: name, runId: props.id });
      await source.refresh();
      await reconcile.refresh();
      props.onChange();
    });
  return (
    <SourceView source={source} t={ctx().t}>
      {(run) => (
        <div class="nsvx-of">
          <Show when={reconcile.state().data}>
            {(check) => (
              <>
                <p class="nsvx-of__sub">
                  {check().steps_done}/{check().steps_total} {ctx().lt("stepsDone")}
                </p>
                <Show when={check().uncertain}>
                  <p class="nsvx-of__warn" role="status">
                    {ctx().lt("uncertainEffect")}
                  </p>
                </Show>
                <Show when={!check().can_resume && check().resume_blocker}>
                  <p class="nsvx-of__warn">{check().resume_blocker}</p>
                </Show>
              </>
            )}
          </Show>
          <ol class="nsvx-of__timeline">
            <For each={run().steps ?? []} keyed={(step) => step.id}>
              {(step) => (
                <li>
                  <span>
                    {ctx().lt(`step_${step().type}`)} ·{" "}
                    <Pill tone={stateTone(step().state)}>{step().state}</Pill>
                  </span>
                  <Show when={step().blocked_reason}>
                    <span class="nsvx-of__sub">{step().blocked_reason}</span>
                  </Show>
                </li>
              )}
            </For>
          </ol>
          <Note note={action.note()} />
          <div class="nsvx-of__bar">
            <Show
              when={
                ["queued", "running", "waiting", "uncertain", "failed"].includes(run().state) &&
                reconcile.state().data?.can_resume !== false
              }
            >
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy() || !ctx().host.connection.canWrite}
                onClick={() => act("resume")}
              >
                <Icon name="resume" />
                <span>{ctx().lt("resume")}</span>
              </button>
            </Show>
            <Show when={["queued", "running", "waiting"].includes(run().state)}>
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy() || !ctx().host.connection.canWrite}
                onClick={() => act("cancel")}
              >
                <Icon name="stop" />
                <span>{ctx().lt("cancel")}</span>
              </button>
            </Show>
          </div>
        </div>
      )}
    </SourceView>
  );
}

function Detail(props: { ctx: LegalCtx; id: string; onBack: () => void }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<Procedure>(ctx().host, "procedure", { id: props.id }),
  );
  void source.refresh();
  every(20_000, () => void source.refresh());
  const [editing, setEditing] = createSignal(false);
  const [openRun, setOpenRun] = createSignal("");
  const [values, setValues] = createSignal<Record<string, string>>({});
  // One key per intent, so a retry after an uncertain answer never starts a second run.
  const [clientKey, setClientKey] = createSignal(crypto.randomUUID());
  const action = createAction(ctx);
  const canWrite = () => ctx().host.connection.canWrite;
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__bar">
        <IconButton icon="back" label={ctx().lt("back")} onClick={() => props.onBack()} />
      </div>
      <SourceView source={source} t={ctx().t}>
        {(row) => (
          <Show
            when={!editing()}
            fallback={
              <Editor
                ctx={ctx()}
                procedure={row()}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  void source.refresh();
                }}
              />
            }
          >
            <header class="nsvx-of__head">
              <h2>{row().title}</h2>
              <Pill tone={stateTone(row().state)}>{ctx().lt(`p_${row().state}`)}</Pill>
              <Pill>v{row().version}</Pill>
              <Pill>{ctx().lt(`trigger_${row().definition.trigger.type}`)}</Pill>
            </header>
            <p class="nsvx-of__body">{row().definition.outcome}</p>
            <Show when={row().trigger_error}>
              <p class="nsvx-of__warn" role="alert">
                {row().trigger_error}
              </p>
            </Show>
            <Show when={row().readiness_reason}>
              <p class="nsvx-of__warn" role="status">
                {row().readiness_reason}
              </p>
            </Show>
            <Show when={row().next_at}>
              <p class="nsvx-of__muted">
                {ctx().lt("nextCheck")} · {shortStamp(row().next_at, ctx().locale)}
              </p>
            </Show>
            <div class="nsvx-of__bar">
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy() || !canWrite()}
                onClick={() =>
                  void action.run(async () => {
                    await changeProcedureRequest(ctx(), {
                      action: "state",
                      id: row().id,
                      version: row().version,
                      enabled: row().state !== "enabled",
                    });
                    await source.refresh();
                  })
                }
              >
                <Icon name={row().state === "enabled" ? "pause" : "resume"} />
                <span>{ctx().lt(row().state === "enabled" ? "pause" : "turnOn")}</span>
              </button>
              <button
                type="button"
                class="nsvx__button"
                disabled={!canWrite()}
                onClick={() => setEditing(true)}
              >
                <Icon name="edit" />
                <span>{ctx().lt("edit")}</span>
              </button>
            </div>
            <Steps ctx={ctx()} definition={row().definition} />
            <Panel title={ctx().lt("runNow")} icon="resume">
              <div class="nsvx-of__form">
                <For each={Object.entries(row().definition.inputs)} keyed={(entry) => entry[0]}>
                  {(entry) => (
                    <Field
                      label={entry()[0].replaceAll("_", " ")}
                      type={
                        entry()[1].type === "date"
                          ? "date"
                          : entry()[1].type === "integer"
                            ? "number"
                            : "text"
                      }
                      value={values()[entry()[0]] ?? String(entry()[1].example)}
                      onInput={(value) => setValues({ ...values(), [entry()[0]]: value })}
                    />
                  )}
                </For>
                <Note note={action.note()} />
                <div class="nsvx-dev__bar">
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--primary"
                    disabled={action.busy() || row().state !== "enabled" || !canWrite()}
                    onClick={() =>
                      void action.run(async () => {
                        const made = await changeProcedureRequest<ProcedureRun>(ctx(), {
                          action: "run",
                          id: row().id,
                          version: row().version,
                          clientKey: clientKey(),
                          inputs: Object.fromEntries(
                            Object.entries(row().definition.inputs).map(([name, field]) => {
                              const value = values()[name] ?? field.example;
                              return [name, field.type === "integer" ? Number(value) : value];
                            }),
                          ),
                        });
                        setOpenRun(made.id);
                        setClientKey(crypto.randomUUID());
                        await source.refresh();
                      })
                    }
                  >
                    {ctx().lt("runIt")}
                  </button>
                </div>
              </div>
            </Panel>
            <Panel title={ctx().lt("runs")} icon="history" count={row().runs.length}>
              <ul class="nsvx-of__list">
                <For
                  each={row().runs}
                  keyed={(run) => run.id}
                  fallback={<p class="nsvx-of__muted">{ctx().lt("noRuns")}</p>}
                >
                  {(run) => (
                    <li>
                      <button
                        type="button"
                        class="nsvx-of__row"
                        aria-expanded={openRun() === run().id ? "true" : "false"}
                        onClick={() => setOpenRun(openRun() === run().id ? "" : run().id)}
                      >
                        <span class="nsvx-of__main">
                          <strong>{shortStamp(run().created_at, ctx().locale)}</strong>
                          <Show when={run().reason || run().progress?.reason}>
                            <span class="nsvx-of__sub">
                              {run().reason || run().progress?.reason}
                            </span>
                          </Show>
                        </span>
                        <Pill tone={stateTone(run().state)}>{ctx().lt(`p_${run().state}`)}</Pill>
                      </button>
                      <Show when={openRun() === run().id}>
                        <RunDetail
                          ctx={ctx()}
                          id={run().id}
                          onChange={() => void source.refresh()}
                        />
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Panel>
          </Show>
        )}
      </SourceView>
    </div>
  );
}

/** NSVX's saved routines (`Procedures.tsx`): each step keeps its own approvals, and a new one starts paused. */
export function LegalProcedures(props: { ctx: LegalCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ items: Procedure[] }>(ctx().host, "procedures"),
  );
  void source.refresh();
  const [opened, setOpened] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  return (
    <div class="nsvx-of">
      <Show
        when={!opened() && !creating()}
        fallback={
          <Show
            when={creating()}
            fallback={
              <For each={[opened()]} keyed={(id) => id}>
                {(id) => (
                  <Detail
                    ctx={ctx()}
                    id={id()}
                    onBack={() => {
                      setOpened("");
                      void source.refresh();
                    }}
                  />
                )}
              </For>
            }
          >
            <Editor
              ctx={ctx()}
              onCancel={() => setCreating(false)}
              onSaved={(id) => {
                setCreating(false);
                setOpened(id);
              }}
            />
          </Show>
        }
      >
        <div class="nsvx-of__bar">
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            disabled={!ctx().host.connection.canWrite}
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" />
            <span>{ctx().lt("create")}</span>
          </button>
        </div>
        <SourceView source={source} t={ctx().t}>
          {(data) => (
            <ul class="nsvx-of__list">
              <For
                each={data().items.filter((row) => matches(ctx().query, row.title, row.outcome))}
                keyed={(row) => row.id}
                fallback={<p class="nsvx__empty">{ctx().lt("noProcedures")}</p>}
              >
                {(row) => (
                  <li>
                    <button type="button" class="nsvx-of__row" onClick={() => setOpened(row().id)}>
                      <Icon name="flow" />
                      <span class="nsvx-of__main">
                        <strong>{row().title}</strong>
                        <Show when={row().outcome}>
                          <span class="nsvx-of__sub">{row().outcome}</span>
                        </Show>
                      </span>
                      <Pill>v{row().version}</Pill>
                      <Pill tone={stateTone(row().state)}>{ctx().lt(`p_${row().state}`)}</Pill>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          )}
        </SourceView>
      </Show>
    </div>
  );
}
