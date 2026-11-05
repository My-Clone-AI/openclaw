/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  AVATARS,
  jobActive,
  jobTone,
  type Avatar,
  type DesktopBot,
  type DesktopJob,
} from "./device-data.js";
import type { DT } from "./device-i18n.js";
import { ConfirmButton, createAction, Note, Segs, view, type Ctx } from "./device-kit.js";
import { Memory, Skills } from "./device-memory.js";
import { SyncView } from "./device-sync.js";
import { every } from "./messages-ui.js";
import { Tiles } from "./owner-tabs.js";
import { age, createSource, Icon, matches, SourceView, type IconName, type T } from "./ui-kit.js";
import "./device.css";

type Section = "jobs" | "bots" | "memory" | "skills" | "sync";
const SECTIONS: Section[] = ["jobs", "bots", "memory", "skills", "sync"];
const SECTION_ICON: Record<Section, IconName> = {
  jobs: "activity",
  bots: "bot",
  memory: "memory",
  skills: "skill",
  sync: "sync",
};

const JOB_ICON: Record<DesktopJob["state"], IconName> = {
  queued: "history",
  running: "activity",
  done: "done",
  failed: "alert",
  stopped: "stop",
};

type JobView = "all" | "running" | "queued" | "finished";

function Jobs(props: { ctx: Ctx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ tasks: DesktopJob[] }>(ctx().host, "desktopTasks", { limit: "100" }),
  );
  void source.refresh();
  const [show, setShow] = createSignal<JobView>("all");
  const action = createAction(ctx);
  const jobs = createMemo(() => source.state().data?.tasks ?? []);
  const active = createMemo(() => jobs().filter(jobActive));
  // NSVX streams snapshots every 2 s; Control reads the same list while something runs.
  every(4000, () => {
    if (active().length > 0) {
      void source.refresh();
    }
  });
  const inView = (job: DesktopJob, which: JobView) =>
    which === "all" || (which === "finished" ? !jobActive(job) : job.state === which);
  const tile = (id: JobView, icon: IconName, label: string, tone?: string) => ({
    id,
    icon,
    label,
    count: jobs().filter((job) => inView(job, id)).length,
    tone,
  });
  const stop = (taskId: string) =>
    void action
      .run(() => ctx().host.request("nsvx.desktop.jobs.stop", { taskId }))
      .then(() => source.refresh());
  return (
    <SourceView source={source} t={ctx().t}>
      {() => (
        <div class="nsvx-dev__stack">
          <Tiles
            items={[
              tile("all", "tasks", ctx().dt("all")),
              tile("running", "activity", ctx().dt("running"), "run"),
              tile("queued", "history", ctx().dt("queued")),
              tile("finished", "done", ctx().dt("finished")),
            ]}
            selected={show()}
            onSelect={setShow}
          />
          <div class="nsvx-dev__bar">
            <Note note={action.note()} />
            <ConfirmButton
              label={ctx().dt("stopAll")}
              confirm={ctx().dt("stopAll")}
              cancel={ctx().dt("cancel")}
              icon="stop"
              danger
              disabled={active().length === 0 || action.busy() || !ctx().host.connection.canWrite}
              onConfirm={() =>
                void action
                  .run(
                    () => ctx().host.request("nsvx.desktop.jobs.stopAll", {}),
                    ctx().dt("stopping"),
                  )
                  .then(() => source.refresh())
              }
            />
          </div>
          <ul class="nsvx-list" aria-label={ctx().dt("jobs")}>
            <For
              each={jobs().filter(
                (job) =>
                  inView(job, show()) && matches(ctx().query, job.label, job.bot_id, job.kind),
              )}
              keyed={(job) => job.id}
            >
              {(job) => (
                <li class="nsvx-row nsvx-dev__job">
                  <Icon
                    name={JOB_ICON[job().state]}
                    class={["nsvx-row__icon", `nsvx-row__icon--${jobTone(job())}`]}
                  />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">{job().label}</span>
                    <span class="nsvx-row__detail">
                      {job().bot_id} · {job().kind}
                    </span>
                    <Show when={jobActive(job())}>
                      <span
                        class="nsvx-dev__progress"
                        role="progressbar"
                        aria-label={job().label}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={String(job().progress)}
                      >
                        <span style={{ width: `${job().progress}%` }} />
                      </span>
                    </Show>
                  </span>
                  <span class={["nsvx__chip", `nsvx-dev__state--${jobTone(job())}`]}>
                    {job().stop_requested && jobActive(job())
                      ? ctx().dt("stopping")
                      : ctx().dt(job().state)}
                  </span>
                  <span class="nsvx-row__age">{age(job().updated_at)}</span>
                  <Show when={jobActive(job()) && !job().stop_requested}>
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--icon"
                      aria-label={`${ctx().dt("stop")}: ${job().label}`}
                      title={ctx().dt("stop")}
                      disabled={action.busy() || !ctx().host.connection.canWrite}
                      onClick={() => stop(job().id)}
                    >
                      <Icon name="stop" />
                    </button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={jobs().filter((job) => inView(job, show())).length === 0}>
            <p class="nsvx__empty">{ctx().dt("noJobs")}</p>
          </Show>
        </div>
      )}
    </SourceView>
  );
}

/** NSVX bot ids: letters, digits, dashes; made from the name and kept unique. */
export function botIdFor(name: string, taken: readonly string[]): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || "bot";
  let id = base;
  for (let n = 2; taken.includes(id); n++) {
    id = `${base}-${n}`;
  }
  return id;
}

function BotEditor(props: {
  ctx: Ctx;
  bot: DesktopBot | undefined;
  bots: DesktopBot[];
  onDone: () => void;
}) {
  const ctx = () => props.ctx;
  const start = props.bot?.definition;
  const [name, setName] = createSignal(start?.name ?? "");
  const [section, setSection] = createSignal(start?.section ?? "");
  const [about, setAbout] = createSignal(start?.description ?? "");
  const [persona, setPersona] = createSignal(start?.persona ?? "");
  const [avatar, setAvatar] = createSignal<Avatar>(start?.avatar ?? "✦");
  const action = createAction(ctx);
  const sections = createMemo(() => [
    ...new Set(props.bots.map((bot) => bot.definition?.section).filter(Boolean)),
  ]);
  const listId = `nsvx-dev-sections-${props.bot?.id ?? "new"}`;
  const save = (definition: unknown) =>
    void action
      .run(() =>
        ctx().host.request("nsvx.desktop.bots.save", {
          botId:
            props.bot?.id ??
            botIdFor(
              name(),
              props.bots.map((bot) => bot.id),
            ),
          baseVersion: props.bot?.version ?? 0,
          definition,
        }),
      )
      .then((ok) => {
        if (ok || action.note()?.code === "conflict") {
          props.onDone();
        }
      });
  const definition = () => ({
    name: name().trim(),
    section: section().trim(),
    description: about(),
    persona: persona(),
    avatar: avatar(),
  });
  return (
    <form
      class="nsvx-dev__editor"
      onSubmit={(event) => {
        event.preventDefault();
        save(definition());
      }}
    >
      <div class="nsvx-dev__avatars" role="radiogroup" aria-label={ctx().dt("icon")}>
        <For each={AVATARS} keyed={false}>
          {(symbol) => (
            <button
              type="button"
              role="radio"
              aria-checked={avatar() === symbol() ? "true" : "false"}
              class={["nsvx-dev__avatar", { "nsvx-dev__avatar--on": avatar() === symbol() }]}
              onClick={() => setAvatar(symbol())}
            >
              {symbol()}
            </button>
          )}
        </For>
      </div>
      <label class="nsvx-field">
        <span>{ctx().dt("name")}</span>
        <input
          required
          maxlength={48}
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <label class="nsvx-field">
        <span>{ctx().dt("group")}</span>
        <input
          required
          maxlength={40}
          list={listId}
          value={section()}
          onInput={(event) => setSection(event.currentTarget.value)}
        />
        <datalist id={listId}>
          <For each={sections()} keyed={false}>
            {(option) => <option value={option() ?? ""} />}
          </For>
        </datalist>
      </label>
      <label class="nsvx-field nsvx-dev__wide">
        <span>{ctx().dt("about")}</span>
        <input
          maxlength={160}
          value={about()}
          onInput={(event) => setAbout(event.currentTarget.value)}
        />
      </label>
      <label class="nsvx-field nsvx-dev__wide">
        <span>{ctx().dt("persona")}</span>
        <textarea
          rows={4}
          maxlength={800}
          value={persona()}
          onInput={(event) => setPersona(event.currentTarget.value)}
        />
      </label>
      <Note note={action.note()} />
      <div class="nsvx-dev__buttons nsvx-dev__wide">
        <Show when={props.bot?.definition}>
          <ConfirmButton
            label={ctx().dt("delete")}
            confirm={ctx().dt("delete")}
            cancel={ctx().dt("cancel")}
            icon="trash"
            danger
            disabled={action.busy() || !ctx().host.connection.canWrite}
            onConfirm={() => save(null)}
          />
        </Show>
        <button type="button" class="nsvx__button" onClick={() => props.onDone()}>
          {ctx().dt("cancel")}
        </button>
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={
            action.busy() || !name().trim() || !section().trim() || !ctx().host.connection.canWrite
          }
        >
          {ctx().dt(props.bot && !props.bot.definition ? "restore" : "save")}
        </button>
      </div>
    </form>
  );
}

function Bots(props: { ctx: Ctx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ bots: DesktopBot[] }>(ctx().host, "desktopBots"),
  );
  void source.refresh();
  // "new", a bot id, or nothing open.
  const [open, setOpen] = createSignal<string>();
  const done = () => {
    setOpen(undefined);
    void source.refresh();
  };
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => (
        <div class="nsvx-dev__stack">
          <Show when={open() === "new"}>
            <BotEditor ctx={ctx()} bot={undefined} bots={data().bots} onDone={done} />
          </Show>
          <ul class="nsvx-dev__bots" aria-label={ctx().dt("bots")}>
            <li>
              <button
                type="button"
                class="nsvx-dev__bot nsvx-dev__bot--add"
                disabled={!ctx().host.connection.canWrite}
                onClick={() => setOpen("new")}
              >
                <Icon name="add" />
                <span>{ctx().dt("add")}</span>
              </button>
            </li>
            <For
              each={data().bots.filter((bot) =>
                matches(
                  ctx().query,
                  bot.id,
                  bot.definition?.name,
                  bot.definition?.section,
                  bot.definition?.description,
                ),
              )}
              keyed={(bot) => bot.id}
            >
              {(bot) => (
                <li class={{ "nsvx-dev__wide-item": open() === bot().id }}>
                  <Show
                    when={open() === bot().id}
                    fallback={
                      <button
                        type="button"
                        class={["nsvx-dev__bot", { "nsvx-dev__bot--deleted": !bot().definition }]}
                        aria-label={`${ctx().dt("edit")}: ${bot().definition?.name ?? bot().id}`}
                        onClick={() => setOpen(bot().id)}
                      >
                        <span class="nsvx-dev__bot-avatar" aria-hidden="true">
                          {bot().definition?.avatar ?? "·"}
                        </span>
                        <strong>{bot().definition?.name ?? bot().id}</strong>
                        <span class="nsvx-row__detail">
                          {bot().definition?.description ||
                            bot().definition?.section ||
                            ctx().dt("deleted")}
                        </span>
                        <Show when={bot().definition}>
                          {(definition) => <span class="nsvx__chip">{definition().section}</span>}
                        </Show>
                      </button>
                    }
                  >
                    <BotEditor ctx={ctx()} bot={bot()} bots={data().bots} onDone={done} />
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={data().bots.length === 0}>
            <p class="nsvx__empty">{ctx().dt("noBots")}</p>
          </Show>
        </div>
      )}
    </SourceView>
  );
}

export function DeviceTab(props: { host: ControlUiHost; t: T; dt: DT; query: string }) {
  const pick = new URLSearchParams(location.search).get("dev");
  const [section, setSection] = createSignal<Section>(
    SECTIONS.includes(pick as Section) ? (pick as Section) : "jobs",
  );
  const ctx = createMemo<Ctx>(() => ({
    host: props.host,
    t: props.t,
    dt: props.dt,
    query: props.query,
  }));
  return (
    <div class="nsvx-dev">
      <Segs
        name={props.dt("device")}
        items={SECTIONS}
        value={section()}
        label={(key) => props.dt(key)}
        icon={(key) => SECTION_ICON[key]}
        onChange={(next) => {
          setSection(next);
          const url = new URL(location.href);
          url.searchParams.set("dev", next);
          history.replaceState(history.state, "", url);
        }}
      />
      <For each={[section()]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={section() === "jobs"}>
              <Jobs ctx={ctx()} />
            </Show>
            <Show when={section() === "bots"}>
              <Bots ctx={ctx()} />
            </Show>
            <Show when={section() === "memory"}>
              <Memory ctx={ctx()} />
            </Show>
            <Show when={section() === "skills"}>
              <Skills ctx={ctx()} />
            </Show>
            <Show when={section() === "sync"}>
              <SyncView ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
