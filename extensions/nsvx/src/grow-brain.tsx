/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import {
  BRAIN_ENGINES,
  BRAIN_ROLES,
  brainLayers,
  engineBrand,
  type BrainRole,
  type BrainStatus,
} from "./grow-data.js";
import { growWord, type GrowKey } from "./grow-i18n.js";
import type { GrowCtx } from "./grow-tab.js";
import { messagesTranslator } from "./messages-i18n.js";
import { BrandLogo, every, Speak } from "./messages-ui.js";
import { createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

const ROLE_KEY: Record<BrainRole, GrowKey> = {
  code: "code",
  alt: "alt",
  debug: "debug",
  review: "reviewer",
};
const ROLE_ICON: Record<BrainRole, IconName> = {
  code: "work",
  alt: "flow",
  debug: "alert",
  review: "decide",
};
const STEP_KEY: Record<string, GrowKey> = {
  plan: "plan",
  build: "build",
  review: "review",
  fix: "fix",
  ops: "operate",
  verify: "verify",
};

const stepWord = (ctx: GrowCtx, step: string) => {
  const key = STEP_KEY[step];
  return key ? ctx.gt(key) : step;
};

function Dot(props: { on: boolean | undefined }) {
  return (
    <span
      class={[
        "nsvx__dot",
        props.on === true ? "nsvx__dot--ok" : props.on === false ? "nsvx__dot--bad" : "",
      ]}
      aria-hidden="true"
    />
  );
}

function Lamp(props: { ctx: GrowCtx; label: string; on: boolean | undefined; brand?: string }) {
  const word = () =>
    props.ctx.gt(props.on === true ? "online" : props.on === false ? "offline" : "unknown");
  return (
    <span class="nsvx__chip" title={word()} aria-label={`${props.label}: ${word()}`}>
      <Dot on={props.on} />
      <Show when={props.brand}>{(brand) => <BrandLogo channel={brand()} size={14} />}</Show>
      {props.label}
    </span>
  );
}

function Pipeline(props: { ctx: GrowCtx; steps: string[]; current?: string | undefined }) {
  return (
    <ol class="nsvx-grow__pipe">
      <For each={props.steps} keyed={false}>
        {(step) => (
          <li
            class={[
              "nsvx-grow__pipe-step",
              { "nsvx-grow__pipe-step--on": step() === props.current },
            ]}
            aria-current={step() === props.current ? "step" : undefined}
          >
            {stepWord(props.ctx, step())}
          </li>
        )}
      </For>
    </ol>
  );
}

/** Architecture as layers from the brain outward; each node shows whether it is live when the status says so. */
function BrainMap(props: { ctx: GrowCtx; status: BrainStatus }) {
  const layers = createMemo(() => brainLayers(props.status.architecture));
  const live = (node: string) =>
    props.status.stale
      ? undefined
      : node.startsWith("OpenClaw")
        ? props.status.openclaw?.online
        : node.startsWith("clone-ai")
          ? props.status.clone_ai?.health?.upstream?.mac_online
          : undefined;
  return (
    <Show when={layers().length > 0}>
      <section class="nsvx-dev__card" aria-label={props.ctx.gt("map")}>
        <strong class="nsvx-dev__card-title">{props.ctx.gt("map")}</strong>
        <div class="nsvx-grow__map" role="img" aria-label={layers().flat().join(", ")}>
          <For each={layers()} keyed={false}>
            {(layer) => (
              <div class="nsvx-grow__layer">
                <For each={layer()} keyed={false}>
                  {(node) => (
                    <span class="nsvx-grow__node">
                      <Dot on={live(node())} />
                      <Show when={engineBrand(node().toLowerCase())}>
                        {(brand) => <BrandLogo channel={brand()} size={14} />}
                      </Show>
                      {node()}
                    </span>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}

function TaskForm(props: { ctx: GrowCtx }) {
  const ctx = () => props.ctx;
  const action = createAction(ctx);
  const [goal, setGoal] = createSignal("");
  const [folder, setFolder] = createSignal("");
  const [check, setCheck] = createSignal("");
  const [ops, setOps] = createSignal("");
  return (
    <form
      class="nsvx-dev__card nsvx-grow__composer"
      onSubmit={(event) => {
        event.preventDefault();
        void action
          .run(
            () =>
              ctx().host.request("nsvx.brain.task", {
                goal: goal(),
                cwd: folder(),
                acceptance: check(),
                ops: ops(),
              }),
            ctx().gt("inQueue"),
          )
          .then((ok) => {
            if (ok) {
              setGoal("");
              setFolder("");
              setCheck("");
              setOps("");
            }
          });
      }}
    >
      <label class="nsvx-field">
        <span>{ctx().gt("newTask")}</span>
        <textarea
          rows="2"
          maxlength="8000"
          required
          placeholder={ctx().gt("goal")}
          value={goal()}
          onInput={(event) => setGoal(event.currentTarget.value)}
        />
      </label>
      <details>
        <summary>{ctx().gt("more")}</summary>
        <div class="nsvx-grow__fields">
          <label class="nsvx-field">
            <span>{ctx().gt("folder")}</span>
            <input value={folder()} onInput={(event) => setFolder(event.currentTarget.value)} />
          </label>
          <label class="nsvx-field">
            <span>{ctx().gt("doneWhen")}</span>
            <input value={check()} onInput={(event) => setCheck(event.currentTarget.value)} />
          </label>
          <label class="nsvx-field">
            <span>{ctx().gt("ops")}</span>
            <input value={ops()} onInput={(event) => setOps(event.currentTarget.value)} />
          </label>
        </div>
      </details>
      <div class="nsvx-dev__bar">
        <Speak
          locale={ctx().locale}
          mt={messagesTranslator(ctx().locale)}
          onText={(said) => setGoal(goal() ? `${goal()} ${said}` : said)}
        />
        <span class="nsvx-dev__spacer" />
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={!goal().trim() || action.busy() || !ctx().host.connection.canWrite}
        >
          <Icon name="send" />
          <span>{ctx().gt("send")}</span>
        </button>
      </div>
      <Note note={action.note()} />
    </form>
  );
}

function Roles(props: { ctx: GrowCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ roles: Record<BrainRole, string> }>(ctx().host, "brainRoles"),
  );
  void source.refresh();
  const action = createAction(ctx);
  return (
    <section class="nsvx-dev__card" aria-label={ctx().gt("workers")}>
      <strong class="nsvx-dev__card-title">{ctx().gt("workers")}</strong>
      <SourceView source={source} t={ctx().t}>
        {(data) => (
          <div class="nsvx-grow__roles">
            <span class="nsvx-grow__role nsvx-grow__role--locked">
              <Icon name="lock" />
              <span class="nsvx-row__main">
                <span class="nsvx-row__title">{ctx().gt("brain")}</span>
                <span class="nsvx-row__detail">Terra 6.1 · {ctx().gt("locked")}</span>
              </span>
            </span>
            <For each={BRAIN_ROLES} keyed={false}>
              {(role) => (
                <label class="nsvx-grow__role">
                  <Icon name={ROLE_ICON[role()]} />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">{ctx().gt(ROLE_KEY[role()])}</span>
                  </span>
                  <Show when={engineBrand(data().roles[role()] ?? "")}>
                    {(brand) => <BrandLogo channel={brand()} size={16} />}
                  </Show>
                  <select
                    aria-label={ctx().gt(ROLE_KEY[role()])}
                    value={data().roles[role()] ?? ""}
                    disabled={action.busy() || !ctx().host.connection.canWrite}
                    onChange={(event) => {
                      const select = event.currentTarget;
                      const roles = { ...data().roles, [role()]: select.value };
                      void action
                        .run(
                          () => ctx().host.request("nsvx.brain.roles", { roles }),
                          ctx().gt("sent"),
                        )
                        .then((ok) => {
                          // A refused change leaves the same data, so the select would keep the refused pick.
                          if (!ok) {
                            select.value = data().roles[role()] ?? "";
                          }
                          void source.refresh();
                        });
                    }}
                  >
                    <For each={BRAIN_ENGINES} keyed={false}>
                      {(engine) => <option value={engine()}>{engine()}</option>}
                    </For>
                  </select>
                </label>
              )}
            </For>
          </div>
        )}
      </SourceView>
      <Note note={action.note()} />
    </section>
  );
}

export function GrowBrain(props: { ctx: GrowCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () => view<BrainStatus>(ctx().host, "brainStatus"));
  void source.refresh();
  // NSVX reads the status file every 15 s while its panel is visible.
  every(15_000, () => void source.refresh());
  return (
    <div class="nsvx-dev__stack">
      <TaskForm ctx={ctx()} />
      <SourceView source={source} t={ctx().t}>
        {(status) => {
          const live = (value: boolean | undefined) => (status().stale ? undefined : value);
          const pipeline = createMemo(
            () => status().agents?.pipeline ?? status().architecture?.pipeline ?? [],
          );
          const jobs = createMemo(() => status().workers?.jobs ?? {});
          return (
            <div class="nsvx-dev__stack">
              <div class="nsvx-dev__bar" role="status">
                <Lamp ctx={ctx()} label="OpenClaw" on={live(status().openclaw?.online)} />
                <Lamp
                  ctx={ctx()}
                  label="clone-ai"
                  on={live(status().clone_ai?.health?.upstream?.mac_online)}
                />
                <Show when={status().stale}>
                  <span class="nsvx__chip nsvx-grow__tone--bad">
                    <Icon name="history" />
                    {ctx().gt("stale")}
                  </span>
                </Show>
                <Lamp ctx={ctx()} label={ctx().gt("tick")} on={status().automations?.brain_tick} />
                <Lamp
                  ctx={ctx()}
                  label={ctx().gt("guard")}
                  on={status().automations?.brain_lock_timer}
                />
                <Show when={status().automations?.paused}>
                  <span class="nsvx__chip">
                    <Icon name="pause" />
                    {ctx().gt("paused")}
                  </span>
                </Show>
              </div>
              <For each={status().blocked_actions ?? []} keyed={false}>
                {(blocked) => (
                  <p class="nsvx__notice nsvx__notice--bad" role="alert">
                    <Icon name="lock" />
                    {ctx().gt("approval")}: {blocked().action ?? "—"}
                    {blocked().needs_scope ? ` · ${blocked().needs_scope}` : ""}
                  </p>
                )}
              </For>
              <Roles ctx={ctx()} />
              <BrainMap ctx={ctx()} status={status()} />
              <Show when={(status().agents?.agents ?? []).length > 0}>
                <section class="nsvx-dev__card" aria-label={ctx().gt("agents")}>
                  <strong class="nsvx-dev__card-title">{ctx().gt("agents")}</strong>
                  <div class="nsvx-grow__agents">
                    <For
                      each={(status().agents?.agents ?? []).filter((a) =>
                        matches(ctx().query, a.title, a.engine, a.role),
                      )}
                      keyed={(a) => a.id}
                    >
                      {(agent) => (
                        <div class="nsvx-grow__agent">
                          <Icon name={agent().locked ? "lock" : "bot"} />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{agent().title ?? agent().id}</span>
                            <span class="nsvx-row__detail">
                              <Show when={engineBrand(agent().engine ?? "")}>
                                {(brand) => <BrandLogo channel={brand()} size={12} />}
                              </Show>
                              {agent().engine ?? agent().role ?? ""}
                            </span>
                          </span>
                          <Pipeline ctx={ctx()} steps={agent().owns ?? []} />
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
              <Show when={pipeline().length > 0}>
                <section class="nsvx-dev__card" aria-label={ctx().gt("flow")}>
                  <strong class="nsvx-dev__card-title">{ctx().gt("flow")}</strong>
                  <Pipeline ctx={ctx()} steps={pipeline()} />
                  <ul class="nsvx-list">
                    <For each={status().flows?.recent ?? []} keyed={(f) => f.id}>
                      {(flow) => (
                        <li class="nsvx-row">
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{flow().title || flow().id}</span>
                            <Pipeline ctx={ctx()} steps={pipeline()} current={flow().stage} />
                          </span>
                          <span class="nsvx__chip">{growWord(ctx().gt, flow().status ?? "")}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </Show>
              <section class="nsvx-dev__card" aria-label={ctx().gt("jobs")}>
                <strong class="nsvx-dev__card-title">{ctx().gt("jobs")}</strong>
                <div class="nsvx-dev__bar">
                  <For each={Object.entries(jobs().by_status ?? {})} keyed={false}>
                    {(entry) => (
                      <span class="nsvx__chip">
                        {growWord(ctx().gt, entry()[0])}: {entry()[1]}
                      </span>
                    )}
                  </For>
                  <span class="nsvx__chip">
                    Codex {status().workers?.codex_slot_running ?? 0} /{" "}
                    {status().workers?.codex_slot_waiting ?? 0}
                  </span>
                </div>
                <ul class="nsvx-list">
                  <For each={jobs().recent ?? []} keyed={(j) => j.id}>
                    {(job) => (
                      <li class="nsvx-row">
                        <Icon
                          name={
                            job().status === "failed"
                              ? "alert"
                              : job().status === "done"
                                ? "done"
                                : "activity"
                          }
                          class={[
                            "nsvx-row__icon",
                            job().status === "failed"
                              ? "nsvx-row__icon--bad"
                              : job().status === "done"
                                ? "nsvx-row__icon--ok"
                                : "",
                          ]}
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">
                            {job().role ?? "—"} · {growWord(ctx().gt, job().status ?? "")}
                          </span>
                          <span class="nsvx-row__detail">
                            {job().model ?? ""} · {job().attempts ?? 0}×
                          </span>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
              <Show when={(status().recovery_actions ?? []).length > 0}>
                <details class="nsvx-dev__card">
                  <summary>{ctx().gt("recovery")}</summary>
                  <ul class="nsvx-list">
                    <For each={status().recovery_actions ?? []} keyed={false}>
                      {(item) => (
                        <li class="nsvx-row">
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{item().component ?? "—"}</span>
                            <span class="nsvx-row__detail">{item().msg ?? item().event ?? ""}</span>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </details>
              </Show>
            </div>
          );
        }}
      </SourceView>
    </div>
  );
}
