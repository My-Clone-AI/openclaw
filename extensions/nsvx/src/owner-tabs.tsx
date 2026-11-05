/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { MessageKey } from "./i18n.js";
import {
  missionFilter,
  todaySections,
  type Mission,
  type MissionFilter,
  type Row,
  type Section,
  type TodayData,
} from "./owner-data.js";
import { age, createSource, Icon, matches, SourceView, type IconName, type T } from "./ui-kit.js";

const SECTION_ICONS: Record<Section, IconName> = {
  decide: "decide",
  ask: "ask",
  working: "work",
  done: "done",
  alert: "alert",
};

function RowList(props: { rows: Row[]; t: T; onMission: (id: string) => void }) {
  return (
    <ul class="nsvx-list">
      <For each={props.rows} keyed={(row) => row.id}>
        {(row) => {
          const body = () => (
            <>
              <Icon
                name={row().icon}
                class={["nsvx-row__icon", row().tone ? `nsvx-row__icon--${row().tone}` : ""]}
              />
              <span class="nsvx-row__main">
                <span class="nsvx-row__title">{row().title}</span>
                <Show when={row().detail}>
                  <span class="nsvx-row__detail">{row().detail}</span>
                </Show>
              </span>
              <span class="nsvx-row__age">{age(row().at)}</span>
            </>
          );
          return (
            <li>
              <Show when={row().mission} fallback={<div class="nsvx-row">{body()}</div>}>
                {(mission) => (
                  <button
                    type="button"
                    class="nsvx-row nsvx-row--link"
                    onClick={() => props.onMission(mission())}
                  >
                    {body()}
                  </button>
                )}
              </Show>
            </li>
          );
        }}
      </For>
    </ul>
  );
}

export function Tiles<K extends string>(props: {
  items: { id: K; icon: IconName; label: string; count: number; tone?: string | undefined }[];
  selected: K | undefined;
  onSelect: (id: K) => void;
}) {
  return (
    <div class="nsvx-tiles" role="tablist">
      <For each={props.items} keyed={(item) => item.id}>
        {(item) => (
          <button
            type="button"
            role="tab"
            aria-label={`${item().label}: ${item().count}`}
            aria-selected={props.selected === item().id ? "true" : "false"}
            class={[
              "nsvx-tile",
              { "nsvx-tile--active": props.selected === item().id },
              item().tone && item().count > 0 ? `nsvx-tile--${item().tone}` : "",
            ]}
            onClick={() => props.onSelect(item().id)}
          >
            <Icon name={item().icon} />
            <strong class="nsvx-tile__count">{item().count}</strong>
            <span class="nsvx-tile__label">{item().label}</span>
          </button>
        )}
      </For>
    </div>
  );
}

const TODAY_ORDER: Section[] = ["decide", "ask", "working", "alert", "done"];
const SECTION_TONE: Partial<Record<Section, string>> = {
  decide: "warn",
  ask: "warn",
  alert: "bad",
};

export function TodayTab(props: {
  host: ControlUiHost;
  t: T;
  query: string;
  onMission: (id: string) => void;
}) {
  const today = createSource(props.host, () =>
    props.host.request<TodayData>("nsvx.view", { view: "today" }),
  );
  const [picked, setPicked] = createSignal<Section>();
  void today.refresh();
  return (
    <SourceView source={today} t={props.t}>
      {(data) => {
        const sections = createMemo(() => todaySections(data(), props.t));
        const selected = () =>
          picked() ?? TODAY_ORDER.find((id) => sections()[id].length > 0) ?? "decide";
        const rows = () =>
          sections()[selected()].filter((row) => matches(props.query, row.title, row.detail));
        return (
          <>
            <Show when={data().paused}>
              <p class="nsvx__notice nsvx__notice--bad" role="status">
                <Icon name="pause" /> {props.t("sendingPaused")}
              </p>
            </Show>
            <Tiles
              items={TODAY_ORDER.map((id) => ({
                id,
                icon: SECTION_ICONS[id],
                label: props.t(id),
                count: sections()[id].length,
                tone: SECTION_TONE[id],
              }))}
              selected={selected()}
              onSelect={setPicked}
            />
            <RowList rows={rows()} t={props.t} onMission={props.onMission} />
            <Show when={rows().length === 0}>
              <p class="nsvx__empty">
                {props.t(
                  props.query ? "noResults" : selected() === "alert" ? "allGood" : "nothing",
                )}
              </p>
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function statusTone(status: string) {
  if (status === "needs_owner" || status === "partial") {
    return "warn";
  }
  if (status === "failed" || status === "cancelled") {
    return "bad";
  }
  return status === "completed" ? "ok" : "run";
}

const MISSION_STATUS_KEYS = new Set<string>([
  "working",
  "waiting_someone",
  "planning",
  "verifying",
  "partial",
  "needs_owner",
  "completed",
  "cancelled",
  "failed",
  "paused",
]);

function statusLabel(t: T, status: string) {
  return MISSION_STATUS_KEYS.has(status) ? t(`m_${status}` as MessageKey) : status;
}

type MissionEvent = { kind: string; summary?: string | null; at: string };

function MissionEvents(props: { host: ControlUiHost; t: T; id: string }) {
  const [items, setItems] = createSignal<MissionEvent[]>([]);
  const [next, setNext] = createSignal<string | null>(null);
  const page = createSource(props.host, async () => {
    const answer = await props.host.request<{ items: MissionEvent[]; next: string | null }>(
      "nsvx.view",
      { view: "missionEvents", params: { id: props.id, ...(next() ? { before: next() } : {}) } },
    );
    setItems([...items(), ...answer.items]);
    setNext(answer.next);
    return true;
  });
  void page.refresh();
  return (
    <SourceView source={page} t={props.t}>
      {() => (
        <>
          <ol class="nsvx-events">
            <For each={items()}>
              {(event) => (
                <li>
                  <span class="nsvx-row__detail">{event.summary ?? event.kind}</span>
                  <span class="nsvx-row__age">{age(event.at)}</span>
                </li>
              )}
            </For>
          </ol>
          <Show when={items().length === 0}>
            <p class="nsvx__empty">{props.t("nothing")}</p>
          </Show>
          <Show when={next()}>
            <button
              type="button"
              class="nsvx__button"
              disabled={page.state().loading}
              onClick={() => void page.refresh()}
            >
              {props.t("more")}
            </button>
          </Show>
        </>
      )}
    </SourceView>
  );
}

const MISSION_FILTERS: MissionFilter[] = ["active", "needs", "done", "all"];

export function TasksTab(props: {
  host: ControlUiHost;
  t: T;
  query: string;
  open?: string | undefined;
  onOpen: (id: string | undefined) => void;
}) {
  const missions = createSource(props.host, () =>
    props.host.request<Mission[]>("nsvx.view", { view: "missions" }),
  );
  const [filter, setFilter] = createSignal<MissionFilter>(props.open ? "all" : "active");
  void missions.refresh();
  return (
    <SourceView source={missions} t={props.t}>
      {(data) => {
        const counts = createMemo(
          () =>
            Object.fromEntries(
              MISSION_FILTERS.map((id) => [id, data().filter((m) => missionFilter(id, m)).length]),
            ) as Record<MissionFilter, number>,
        );
        const shown = () =>
          data().filter(
            (m) =>
              missionFilter(filter(), m) &&
              matches(props.query, m.title, m.next_step, m.waiting_on),
          );
        return (
          <>
            <Tiles
              items={MISSION_FILTERS.map((id) => ({
                id,
                icon: id === "needs" ? "decide" : id === "done" ? "done" : "tasks",
                label: props.t(id === "needs" ? "ask" : id),
                count: counts()[id],
                tone: id === "needs" ? "warn" : undefined,
              }))}
              selected={filter()}
              onSelect={setFilter}
            />
            <ul class="nsvx-list">
              <For each={shown()} keyed={(mission) => mission.id}>
                {(mission) => {
                  const isOpen = () => props.open === mission().id;
                  const waiting = () =>
                    (mission().pending_approvals ?? 0) +
                    (mission().pending_decisions ?? 0) +
                    (mission().pending_requests ?? 0);
                  return (
                    <li class="nsvx-mission">
                      <button
                        type="button"
                        class="nsvx-row nsvx-row--link"
                        aria-expanded={isOpen() ? "true" : "false"}
                        onClick={() => props.onOpen(isOpen() ? undefined : mission().id)}
                      >
                        <span
                          class={["nsvx__dot", `nsvx__dot--${statusTone(mission().status)}`]}
                          aria-hidden="true"
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{mission().title}</span>
                          <Show when={mission().next_step ?? mission().waiting_on}>
                            <span class="nsvx-row__detail">
                              {mission().next_step ?? mission().waiting_on}
                            </span>
                          </Show>
                        </span>
                        <Show when={(mission().progress?.stalled_steps ?? 0) > 0}>
                          <span class="nsvx__chip nsvx__chip--write">{props.t("stuck")}</span>
                        </Show>
                        <Show when={waiting() > 0}>
                          <span class="nsvx__chip nsvx__chip--write">
                            <Icon name="decide" /> {waiting()}
                          </span>
                        </Show>
                        <span class="nsvx__chip">{statusLabel(props.t, mission().status)}</span>
                        <span class="nsvx-row__age">{age(mission().updated_at)}</span>
                      </button>
                      <Show when={isOpen()}>
                        <div class="nsvx-mission__body">
                          <MissionEvents host={props.host} t={props.t} id={mission().id} />
                        </div>
                      </Show>
                    </li>
                  );
                }}
              </For>
            </ul>
            <Show when={shown().length === 0}>
              <p class="nsvx__empty">{props.t(props.query ? "noResults" : "nothing")}</p>
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

type WorkState = "running" | "inbox" | "landing" | "failed" | "done";
const WORK_STATES: WorkState[] = ["running", "inbox", "landing", "failed", "done"];
const WORK_ICONS: Record<WorkState, IconName> = {
  running: "work",
  inbox: "tasks",
  landing: "decide",
  failed: "alert",
  done: "done",
};

type WorkSummary = {
  totals?: Partial<Record<WorkState, number>>;
  stale?: boolean;
  hosts?: Record<string, { totals?: Partial<Record<WorkState, number>> }>;
};

type WorkTask = {
  id: string;
  taskKey?: string;
  app?: string;
  state: string;
  title?: string;
  feature?: string;
  detail?: string;
  modelLabel?: string;
  displayHost?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  featureCount?: number;
};

/** NSVX's own screen polls every 2s; Control refreshes this tab every 30s while it is visible. */
const WORK_REFRESH_MS = 30_000;

export function WorkTab(props: { host: ControlUiHost; t: T; query: string }) {
  const [state, setState] = createSignal<WorkState>("running");
  const [items, setItems] = createSignal<WorkTask[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const summary = createSource(props.host, () =>
    props.host.request<WorkSummary>("nsvx.view", { view: "workSummary" }),
  );
  const loadTasks = async (more: boolean) => {
    const answer = await props.host.request<{ items: WorkTask[]; nextCursor: string | null }>(
      "nsvx.view",
      {
        view: "workTasks",
        params: { state: state(), ...(more && cursor() ? { cursor: cursor() } : {}) },
      },
    );
    setItems(more ? [...items(), ...answer.items] : answer.items);
    setCursor(answer.nextCursor);
    return true;
  };
  const tasks = createSource(props.host, () => loadTasks(false));
  const more = createSource(props.host, () => loadTasks(true));
  const reload = () => {
    void summary.refresh();
    void tasks.refresh();
  };
  reload();
  const timer = setInterval(() => {
    if (!document.hidden) {
      reload();
    }
  }, WORK_REFRESH_MS);
  onCleanup(() => clearInterval(timer));
  const pick = (next: WorkState) => {
    setState(next);
    setItems([]);
    setCursor(null);
    void tasks.refresh();
  };
  return (
    <SourceView source={summary} t={props.t}>
      {(data) => (
        <>
          <Show when={data().stale}>
            <p class="nsvx__notice nsvx__notice--bad" role="status">
              {props.t("stale")}
            </p>
          </Show>
          <Tiles
            items={WORK_STATES.map((id) => ({
              id,
              icon: WORK_ICONS[id],
              label: props.t(`w_${id}` as MessageKey),
              count: data().totals?.[id] ?? 0,
              tone: id === "failed" ? "bad" : undefined,
            }))}
            selected={state()}
            onSelect={pick}
          />
          <Show when={Object.keys(data().hosts ?? {}).length > 0}>
            <ul class="nsvx-hosts" aria-label={props.t("servers")}>
              <For each={Object.entries(data().hosts ?? {})}>
                {(entry) => (
                  <li class="nsvx-host">
                    <span class="nsvx-host__name">{entry[0]}</span>
                    <span class="nsvx-host__count">
                      <Icon name="work" /> {entry[1].totals?.running ?? 0}
                    </span>
                    <Show when={(entry[1].totals?.failed ?? 0) > 0}>
                      <span class="nsvx-host__count nsvx-host__count--bad">
                        <Icon name="alert" /> {entry[1].totals?.failed}
                      </span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <SourceView source={tasks} t={props.t}>
            {() => {
              const shown = () =>
                items().filter((task) =>
                  matches(
                    props.query,
                    task.title,
                    task.feature,
                    task.app,
                    task.detail,
                    task.modelLabel,
                  ),
                );
              return (
                <>
                  <ul class="nsvx-list">
                    <For each={shown()} keyed={(task) => task.id}>
                      {(task) => (
                        <li class="nsvx-row">
                          <span
                            class={[
                              "nsvx__dot",
                              `nsvx__dot--${task().state === "failed" ? "bad" : task().state === "done" ? "ok" : "run"}`,
                            ]}
                            aria-hidden="true"
                          />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">
                              {task().title ?? task().feature ?? task().id}
                            </span>
                            <span class="nsvx-row__detail">
                              {[task().app, task().modelLabel, task().displayHost]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            <Show when={task().state === "failed" && task().detail}>
                              <span class="nsvx-row__detail nsvx-row__detail--bad">
                                {task().detail}
                              </span>
                            </Show>
                          </span>
                          <Show when={(task().featureCount ?? 0) > 1}>
                            <span class="nsvx__chip">{task().featureCount}</span>
                          </Show>
                          <span class="nsvx-row__age">
                            {age(task().finishedAt ?? task().startedAt ?? task().createdAt)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={shown().length === 0}>
                    <p class="nsvx__empty" aria-busy={tasks.state().loading ? "true" : "false"}>
                      {props.t(
                        tasks.state().loading ? "loading" : props.query ? "noResults" : "nothing",
                      )}
                    </p>
                  </Show>
                  <Show when={cursor()}>
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={more.state().loading}
                      onClick={() => void more.refresh()}
                    >
                      {props.t("more")}
                    </button>
                  </Show>
                  <Show when={more.state().error}>
                    <p class="nsvx__error" role="alert">
                      {more.state().error}
                    </p>
                  </Show>
                </>
              );
            }}
          </SourceView>
        </>
      )}
    </SourceView>
  );
}
