/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import {
  activityKinds,
  dayRange,
  filterActivity,
  FIND_GROUPS,
  FIND_MIN,
  lastWeek,
  type ActivityEvent,
  type ActivityPage,
  type ActivitySummary,
  type FindGroup,
  type FindGroupResult,
  type FindItem,
  type FindResult,
  type Workflow,
} from "./activity-data.js";
import type { MessageKey } from "./i18n.js";
import { Tiles } from "./owner-tabs.js";
import {
  age,
  createSource,
  errorMessage,
  Icon,
  SourceView,
  type IconName,
  type T,
} from "./ui-kit.js";

const PAGE = 80;

function tone(status: string | null | undefined) {
  if (!status) {
    return "";
  }
  if (/fail|cancel|error/.test(status)) {
    return "bad";
  }
  if (/complet|done|verified|succe/.test(status)) {
    return "ok";
  }
  return /wait|owner|block|uncertain|pending/.test(status) ? "warn" : "";
}

function saveFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function EventRow(props: { event: ActivityEvent; t: T; picked: boolean; onPick: () => void }) {
  const [open, setOpen] = createSignal(false);
  return (
    <li class={["nsvx-event", { "nsvx-event--picked": props.picked }]}>
      <div class="nsvx-row">
        <input
          type="checkbox"
          class="nsvx-event__pick"
          checked={props.picked}
          aria-label={`${props.t("pick")}: ${props.event.summary}`}
          onChange={() => props.onPick()}
        />
        <button
          type="button"
          class="nsvx-event__head"
          aria-expanded={open() ? "true" : "false"}
          onClick={() => setOpen(!open())}
        >
          <span
            class={["nsvx__dot", `nsvx__dot--${tone(props.event.to_status) || "run"}`]}
            aria-hidden="true"
          />
          <span class="nsvx-row__main">
            <span class="nsvx-row__title">{props.event.summary}</span>
            <span class="nsvx-row__detail">
              {[props.event.task_title, props.event.actor_name ?? props.event.actor]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <Show when={props.event.to_status}>
            <span class="nsvx__chip">{props.event.to_status}</span>
          </Show>
          <span class="nsvx-row__age">{age(props.event.at)}</span>
        </button>
      </div>
      <Show when={open()}>
        <dl class="nsvx-event__body">
          <dt>{props.t("when")}</dt>
          <dd>
            <time datetime={props.event.at}>{new Date(props.event.at).toLocaleString()}</time>
          </dd>
          <dt>{props.t("kind")}</dt>
          <dd>{props.event.kind}</dd>
          <Show when={props.event.from_status || props.event.to_status}>
            <dt>{props.t("status")}</dt>
            <dd>
              {props.event.from_status ?? "—"} → {props.event.to_status ?? "—"}
            </dd>
          </Show>
          <dt>{props.t("who")}</dt>
          <dd>{props.event.actor_name ?? props.event.actor}</dd>
          <dt>ID</dt>
          <dd>{props.event.id}</dd>
        </dl>
      </Show>
    </li>
  );
}

function SummaryCard(props: { summary: ActivitySummary; t: T; onClose: () => void }) {
  return (
    <section class="nsvx-summary" role="status" aria-label={props.t("summary")}>
      <header class="nsvx-summary__head">
        <Icon name="spark" />
        <strong>{props.t("summary")}</strong>
        <span class="nsvx__chip">{props.summary.count}</span>
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={props.t("close")}
          title={props.t("close")}
          onClick={() => props.onClose()}
        >
          <Icon name="close" />
        </button>
      </header>
      <p class="nsvx-summary__text">
        {props.summary.text ??
          props.t(props.summary.count === 0 ? "nothing" : "summaryUnavailable")}
      </p>
    </section>
  );
}

function Flows(props: { host: ControlUiHost; t: T }) {
  const flows = createSource(props.host, () =>
    props.host.request<{ items: Workflow[] }>("nsvx.view", { view: "activityWorkflows" }),
  );
  const [open, setOpen] = createSignal<string>();
  void flows.refresh();
  return (
    <Show when={(flows.state().data?.items.length ?? 0) > 0 || flows.state().error}>
      <h2 class="nsvx__heading">
        <Icon name="flow" /> {props.t("flows")}
      </h2>
      <SourceView source={flows} t={props.t}>
        {(data) => (
          <ul class="nsvx-list">
            <For each={data().items} keyed={(flow) => flow.id}>
              {(flow) => {
                const done = () => flow().steps.filter((step) => tone(step.status) === "ok").length;
                const isOpen = () => open() === flow().id;
                return (
                  <li>
                    <button
                      type="button"
                      class="nsvx-row nsvx-row--link"
                      aria-expanded={isOpen() ? "true" : "false"}
                      onClick={() => setOpen(isOpen() ? undefined : flow().id)}
                    >
                      <span
                        class={["nsvx__dot", `nsvx__dot--${tone(flow().status) || "run"}`]}
                        aria-hidden="true"
                      />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{flow().name}</span>
                        <span class="nsvx-steps" aria-hidden="true">
                          <For each={flow().steps}>
                            {(step) => (
                              <span
                                class={["nsvx-step", `nsvx-step--${tone(step.status) || "run"}`]}
                              />
                            )}
                          </For>
                        </span>
                      </span>
                      <span class="nsvx__chip">
                        {done()}/{flow().steps.length}
                      </span>
                      <span class="nsvx-row__age">{age(flow().updated_at)}</span>
                    </button>
                    <Show when={isOpen()}>
                      <ol class="nsvx-events nsvx-mission__body">
                        <For each={flow().steps}>
                          {(step) => (
                            <li>
                              <span class="nsvx-row__detail">
                                <span
                                  class={["nsvx__dot", `nsvx__dot--${tone(step.status) || "run"}`]}
                                  aria-hidden="true"
                                />{" "}
                                {step.app} · {step.action}
                              </span>
                              <span class="nsvx__chip">{step.status}</span>
                            </li>
                          )}
                        </For>
                      </ol>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        )}
      </SourceView>
    </Show>
  );
}

/** NSVX AUTO activity: filters, pick, summary, CSV export, and cross-app flows. */
export function ActivityTab(props: { host: ControlUiHost; t: T; query: string }) {
  const [items, setItems] = createSignal<ActivityEvent[]>([]);
  const [next, setNext] = createSignal<number | null>(null);
  const [kind, setKind] = createSignal("");
  const [start, setStart] = createSignal("");
  const [end, setEnd] = createSignal("");
  const [picked, setPicked] = createSignal<number[]>([]);
  const [summary, setSummary] = createSignal<ActivitySummary>();
  const [exportView, setExportView] = createSignal<{
    start: string;
    end: string;
    ids?: number[];
    count?: number;
  }>();
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const load = async (more: boolean) => {
    const answer = await props.host.request<ActivityPage>("nsvx.view", {
      view: "activity",
      params: { limit: String(PAGE), ...(more && next() ? { before: String(next()) } : {}) },
    });
    setItems(more ? [...items(), ...answer.items] : answer.items);
    setNext(answer.next);
    return true;
  };
  const feed = createSource(props.host, () => load(false));
  const older = createSource(props.host, () => load(true));
  void feed.refresh();

  const filters = () => ({ query: props.query, kind: kind(), start: start(), end: end() });
  const shown = createMemo(() => filterActivity(items(), filters()));
  const filtered = () => Boolean(props.query || kind() || start() || end());
  const togglePick = (id: number) =>
    setPicked(picked().includes(id) ? picked().filter((value) => value !== id) : [...picked(), id]);

  /** The rows an action covers: the picked ones, else what is on screen when filtered, else the chosen days. */
  const scope = (): { start: string; end: string; ids?: number[] } | undefined => {
    const rows = picked().length
      ? items().filter((event) => picked().includes(event.id))
      : filtered()
        ? shown()
        : [];
    if (rows.length > 0) {
      const range = dayRange(rows);
      return range ? { ...range, ids: rows.slice(0, 80).map((event) => event.id) } : undefined;
    }
    return start() && end() ? { start: start(), end: end() } : lastWeek();
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await work();
    } catch (cause) {
      setNotice(errorMessage(props.host, cause));
    } finally {
      setBusy(false);
    }
  };
  const summarize = () =>
    run(async () => {
      const range = scope();
      if (range) {
        setSummary(
          await props.host.request<ActivitySummary>("nsvx.activity.summary", { ...range }),
        );
      }
    });
  const prepareExport = () =>
    run(async () => {
      const range = scope();
      if (!range) {
        return;
      }
      setExportView(range);
      const { count } = await props.host.request<{ count: number }>("nsvx.view", {
        view: "activityCount",
        params: {
          start: range.start,
          end: range.end,
          ...(range.ids ? { ids: range.ids.join(",") } : {}),
        },
      });
      setExportView({ ...range, count });
    });
  const download = () =>
    run(async () => {
      const range = exportView();
      if (!range) {
        return;
      }
      const file = await props.host.request<{ fileName: string; csv: string }>(
        "nsvx.activity.export",
        { start: range.start, end: range.end, ...(range.ids ? { ids: range.ids } : {}) },
      );
      saveFile(file.fileName, file.csv, "text/csv;charset=utf-8");
      setExportView(undefined);
      setNotice(props.t("saved"));
    });

  return (
    <SourceView source={feed} t={props.t}>
      {() => (
        <>
          <div class="nsvx-filters" role="group" aria-label={props.t("filters")}>
            <select
              class="nsvx-filters__kind"
              aria-label={props.t("kind")}
              value={kind()}
              onChange={(event) => setKind(event.currentTarget.value)}
            >
              <option value="">{props.t("allKinds")}</option>
              <For each={activityKinds(items())}>
                {(value) => <option value={value}>{value}</option>}
              </For>
            </select>
            <input
              type="date"
              aria-label={props.t("from")}
              title={props.t("from")}
              value={start()}
              max={end() || undefined}
              onInput={(event) => setStart(event.currentTarget.value)}
            />
            <input
              type="date"
              aria-label={props.t("to")}
              title={props.t("to")}
              value={end()}
              min={start() || undefined}
              onInput={(event) => setEnd(event.currentTarget.value)}
            />
            <Show when={filtered() || picked().length > 0}>
              <button
                type="button"
                class="nsvx__button nsvx__button--icon"
                aria-label={props.t("clear")}
                title={props.t("clear")}
                onClick={() => {
                  setKind("");
                  setStart("");
                  setEnd("");
                  setPicked([]);
                }}
              >
                <Icon name="close" />
              </button>
            </Show>
          </div>
          <div class="nsvx-toolbar">
            <span class="nsvx-toolbar__count" role="status">
              <Show
                when={picked().length > 0}
                fallback={`${shown().length}/${items().length}${next() ? "+" : ""}`}
              >
                {picked().length} {props.t("picked")}
              </Show>
            </span>
            <button
              type="button"
              class="nsvx__button"
              disabled={busy() || !props.host.connection.connected}
              onClick={() => void summarize()}
            >
              <Icon name="spark" /> {props.t("summary")}
            </button>
            <button
              type="button"
              class="nsvx__button"
              disabled={busy() || !props.host.connection.connected}
              onClick={() => void prepareExport()}
            >
              <Icon name="download" /> CSV
            </button>
          </div>
          <Show when={exportView()}>
            {(view) => (
              <div class="nsvx-confirm" role="region" aria-label={props.t("export")}>
                <Icon name="download" />
                <span class="nsvx-confirm__text">
                  <strong>
                    {view().count === undefined ? "…" : view().count} {props.t("entries")}
                  </strong>
                  <span class="nsvx-row__detail">
                    {view().start} → {view().end}
                  </span>
                </span>
                <button type="button" class="nsvx__button" onClick={() => setExportView()}>
                  {props.t("cancel")}
                </button>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={busy() || !view().count}
                  onClick={() => void download()}
                >
                  {props.t("download")}
                </button>
              </div>
            )}
          </Show>
          <p class="nsvx__notice" role="status">
            {notice()}
          </p>
          <Show when={summary()}>
            {(shownSummary) => (
              <SummaryCard
                summary={shownSummary()}
                t={props.t}
                onClose={() => setSummary(undefined)}
              />
            )}
          </Show>
          <ol class="nsvx-list nsvx-timeline">
            <For each={shown()} keyed={(event) => event.id}>
              {(event) => (
                <EventRow
                  event={event()}
                  t={props.t}
                  picked={picked().includes(event().id)}
                  onPick={() => togglePick(event().id)}
                />
              )}
            </For>
          </ol>
          <Show when={shown().length === 0}>
            <div class="nsvx-empty-art">
              <Icon name="activity" class="nsvx-empty-art__icon" />
              <p class="nsvx__empty">{props.t(items().length > 0 ? "noResults" : "noActivity")}</p>
            </div>
          </Show>
          <Show when={next()}>
            <button
              type="button"
              class="nsvx__button nsvx-more"
              disabled={older.state().loading}
              onClick={() => void older.refresh()}
            >
              {props.t("more")}
            </button>
          </Show>
          <Show when={older.state().error}>
            <p class="nsvx__error" role="alert">
              {older.state().error}
            </p>
          </Show>
          <Flows host={props.host} t={props.t} />
        </>
      )}
    </SourceView>
  );
}

const GROUP_ICONS: Record<FindGroup, IconName> = {
  people: "team",
  conversations: "ask",
  missions: "tasks",
  auto: "actions",
  documents: "doc",
};

/** NSVX result kinds (`ref.kind`), singular where the groups are plural. */
const KIND_ICONS: Record<string, IconName> = {
  person: "team",
  conversation: "ask",
  mission: "tasks",
  auto: "actions",
  document: "doc",
};

const SEARCH_DELAY_MS = 250;

/** Unified NSVX search over people, chats, tasks, AUTO, and documents; the header box is its input. */
export function FindTab(props: {
  host: ControlUiHost;
  t: T;
  query: string;
  onMission: (id: string) => void;
}) {
  const [groups, setGroups] = createSignal<FindGroupResult[]>([]);
  const [picked, setPicked] = createSignal<FindGroup>();
  const [moreBusy, setMoreBusy] = createSignal(false);
  const [moreError, setMoreError] = createSignal("");
  const needle = () => props.query.replace(/\s+/g, " ").trim();
  let asked = "";
  const search = createSource(props.host, async () => {
    const q = (asked = needle());
    const result = await props.host.request<FindResult>("nsvx.search", { q, limit: 10 });
    // A slower answer to an older query never replaces the newer one.
    if (q === needle()) {
      setGroups(result.groups);
    }
    return q;
  });
  createEffect(
    () => needle(),
    (q) => {
      setMoreError("");
      if (q.length < FIND_MIN) {
        setGroups([]);
        return;
      }
      const timer = setTimeout(() => {
        if (q !== asked || groups().length === 0) {
          void search.refresh();
        }
      }, SEARCH_DELAY_MS);
      return () => clearTimeout(timer);
    },
  );
  const current = () => groups().filter((group) => group.items.length > 0);
  const selected = () =>
    current().find((group) => group.group === picked()) ?? current()[0] ?? undefined;
  const loadMore = async (group: FindGroupResult) => {
    if (!group.next) {
      return;
    }
    setMoreBusy(true);
    setMoreError("");
    try {
      const page = await props.host.request<FindResult>("nsvx.search", {
        q: asked,
        groups: [group.group],
        limit: 20,
        cursor: group.next,
      });
      const fresh = page.groups.find((entry) => entry.group === group.group);
      if (fresh && asked === needle()) {
        setGroups(
          groups().map((entry) =>
            entry.group === group.group
              ? { ...entry, items: [...entry.items, ...fresh.items], next: fresh.next }
              : entry,
          ),
        );
      }
    } catch (cause) {
      setMoreError(errorMessage(props.host, cause));
    } finally {
      setMoreBusy(false);
    }
  };
  const ItemRow = (row: { item: FindItem }) => {
    const body = () => (
      <>
        <Icon name={KIND_ICONS[row.item.ref.kind] ?? "actions"} class="nsvx-row__icon" />
        <span class="nsvx-row__main">
          <span class="nsvx-row__title">{row.item.title}</span>
          <Show when={row.item.excerpt}>
            <span class="nsvx-row__detail">{row.item.excerpt}</span>
          </Show>
        </span>
        <For each={row.item.meta.slice(0, 2)}>
          {(meta) => <span class="nsvx__chip">{meta}</span>}
        </For>
        <span class="nsvx-row__age">{age(row.item.updated_at)}</span>
      </>
    );
    return (
      <li>
        <Show
          when={row.item.ref.kind === "mission"}
          fallback={<div class="nsvx-row">{body()}</div>}
        >
          <button
            type="button"
            class="nsvx-row nsvx-row--link"
            onClick={() => props.onMission(row.item.ref.id)}
          >
            {body()}
          </button>
        </Show>
      </li>
    );
  };
  return (
    <Show
      when={needle().length >= FIND_MIN}
      fallback={
        <div class="nsvx-empty-art">
          <Icon name="find" class="nsvx-empty-art__icon" />
          <p class="nsvx__empty">{props.t("findHint")}</p>
          <ul class="nsvx-find-groups" aria-hidden="true">
            <For each={FIND_GROUPS}>
              {(group) => (
                <li>
                  <Icon name={GROUP_ICONS[group]} />
                  {props.t(`g_${group}` as MessageKey)}
                </li>
              )}
            </For>
          </ul>
        </div>
      }
    >
      <SourceView source={search} t={props.t}>
        {() => (
          <>
            <Show when={current().length > 0}>
              <Tiles
                items={current().map((group) => ({
                  id: group.group,
                  icon: GROUP_ICONS[group.group],
                  label: props.t(`g_${group.group}` as MessageKey),
                  count: group.total ?? group.items.length,
                }))}
                selected={selected()?.group}
                onSelect={setPicked}
              />
            </Show>
            <Show when={selected()}>
              {(group) => (
                <>
                  <ul class="nsvx-list" aria-busy={search.state().loading ? "true" : "false"}>
                    <For each={group().items} keyed={(item) => `${item.ref.kind}:${item.ref.id}`}>
                      {(item) => <ItemRow item={item()} />}
                    </For>
                  </ul>
                  <Show when={group().next}>
                    <button
                      type="button"
                      class="nsvx__button nsvx-more"
                      disabled={moreBusy()}
                      onClick={() => void loadMore(group())}
                    >
                      {props.t("more")}
                    </button>
                  </Show>
                </>
              )}
            </Show>
            <Show when={moreError()}>
              <p class="nsvx__error" role="alert">
                {moreError()}
              </p>
            </Show>
            <Show when={current().length === 0 && !search.state().loading}>
              <div class="nsvx-empty-art">
                <Icon name="find" class="nsvx-empty-art__icon" />
                <p class="nsvx__empty">{props.t("noResults")}</p>
              </div>
            </Show>
          </>
        )}
      </SourceView>
    </Show>
  );
}
