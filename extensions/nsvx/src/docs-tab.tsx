/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { DT } from "./device-i18n.js";
import { createAction, Note, Segs, view } from "./device-kit.js";
import {
  DOC_ACCEPT,
  SORTS,
  SOURCES,
  categoryIcon,
  categoryLabel,
  periodWord,
  type Doc,
  type DocList,
  type Overview,
} from "./docs-data.js";
import { DocsDrive } from "./docs-drive.js";
import type { KT } from "./docs-i18n.js";
import { DocsSettings } from "./docs-settings.js";
import { SignDesk } from "./docs-sign.js";
import {
  DocPill,
  docsChange,
  DriveLogo,
  filesIn,
  PickFiles,
  SourceMark,
  type DocsCtx,
} from "./docs-ui.js";
import { DocViewer } from "./docs-viewer.js";
import { every } from "./messages-ui.js";
import { Choice, Field, Reveal, Stats } from "./office-kit.js";
import { age, createSource, Icon, SourceView, type IconName, type T } from "./ui-kit.js";
import "./office.css";
import "./docs.css";

export const DOCS_VIEWS = ["files", "review", "sign", "drive", "settings"] as const;
export type DocsView = (typeof DOCS_VIEWS)[number];
const VIEW_ICON = {
  files: "folder",
  review: "decide",
  sign: "edit",
  drive: "sync",
  settings: "setup",
} as const;
const PAGE = 40;

function Chip(props: { on: boolean; label: string; icon: IconName; onClick: () => void }) {
  return (
    <button
      type="button"
      class={["nsvx-of__pick", "nsvx-docs__chip", { "nsvx-of__pick--on": props.on }]}
      aria-pressed={props.on ? "true" : "false"}
      onClick={() => props.onClick()}
    >
      <Icon name={props.icon} />
      <span>{props.label}</span>
    </button>
  );
}

/** Counts, Drive state, notices, and the upload button above the list. */
function Hero(props: {
  ctx: DocsCtx;
  overview: Overview;
  onReview: () => void;
  onDrive: () => void;
  onUploaded: () => void;
}) {
  const kt = () => props.ctx.kt;
  const action = createAction(() => props.ctx);
  const counts = () => props.overview.counts;
  const drive = () => props.overview.drive;
  const driveOn = () => drive().connected && drive().state === "ready";
  const upload = (files: File[]) =>
    void action.run(async () => {
      const result = await props.ctx.host.request<{ results: { status: string }[] }>(
        "nsvx.docs.upload",
        { files: await filesIn(files.slice(0, 20)) },
      );
      const queued = result.results.filter((row) => row.status === "queued").length;
      const same = result.results.filter((row) => row.status === "duplicate").length;
      props.onUploaded();
      const refused = result.results.length - queued - same;
      if (refused > 0 && queued === 0) {
        throw new Error(`${kt()("refused")}: ${refused}`);
      }
    }, kt()("sent"));
  const dismiss = (body: Record<string, unknown>) =>
    void action.run(async () => {
      await docsChange(props.ctx.host, { action: "notices", ...body });
      props.onUploaded();
    });
  return (
    <>
      <div class="nsvx-docs__hero">
        <button
          type="button"
          class={["nsvx-docs__drive", { "nsvx-docs__drive--off": !driveOn() }]}
          onClick={() => props.onDrive()}
        >
          <DriveLogo size={22} />
          <span class="nsvx-of__main">
            <strong>{driveOn() ? kt()("driveOn") : kt()("driveOff")}</strong>
            <span class="nsvx-of__sub">
              {driveOn()
                ? `${drive().push.active ? kt()("live") : kt()("every5")}${drive().last_delta_at ? ` · ${age(drive().last_delta_at)}` : ""}`
                : kt()("connect")}
            </span>
          </span>
        </button>
        <PickFiles
          label={kt()("add")}
          icon="plus"
          primary
          multiple
          accept={DOC_ACCEPT}
          disabled={action.busy()}
          onFiles={upload}
        />
      </div>
      <Stats
        items={[
          { icon: "doc", label: kt()("filed"), value: String(counts().total) },
          {
            icon: "decide",
            label: kt()("toCheck"),
            value: String(counts().review),
            tone: counts().review ? "warn" : undefined,
            onClick: counts().review ? props.onReview : undefined,
          },
          {
            icon: counts().processing ? "history" : "done",
            label: kt()("reading"),
            value: String(counts().processing),
          },
          ...(counts().failed
            ? [
                {
                  icon: "alert" as const,
                  label: kt()("failed"),
                  value: String(counts().failed),
                  tone: "bad" as const,
                },
              ]
            : []),
        ]}
      />
      <Note note={action.note()} />
      <Show when={props.overview.notices.length > 0}>
        <ul class="nsvx-docs__notices" aria-label={kt()("notices")}>
          <For each={props.overview.notices.slice(0, 4)} keyed={(notice) => notice.id}>
            {(notice) => (
              <li class={["nsvx-docs__notice", `nsvx-docs__notice--${notice().kind}`]}>
                <Icon name={notice().kind === "review" ? "decide" : "alert"} />
                <span class="nsvx-of__main">
                  <strong>{notice().title}</strong>
                  <Show when={notice().body}>
                    <span class="nsvx-of__sub">{notice().body}</span>
                  </Show>
                </span>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--icon"
                  aria-label={kt()("dismiss")}
                  title={kt()("dismiss")}
                  onClick={() => dismiss({ ids: [notice().id] })}
                >
                  <Icon name="close" />
                </button>
              </li>
            )}
          </For>
          <Show when={props.overview.notices.length > 1}>
            <li>
              <button type="button" class="nsvx__button" onClick={() => dismiss({ all: true })}>
                {kt()("dismissAll")}
              </button>
            </li>
          </Show>
        </ul>
      </Show>
    </>
  );
}

function DocRowView(props: { ctx: DocsCtx; doc: Doc; onOpen: () => void }) {
  const sub = () =>
    [
      props.doc.document_type,
      periodWord(props.doc, props.ctx.locale),
      props.doc.account_last4 ? `•••• ${props.doc.account_last4}` : "",
      props.doc.issuer,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <li data-doc={props.doc.id}>
      <button type="button" class="nsvx-of__row nsvx-docs__row" onClick={() => props.onOpen()}>
        <span class={["nsvx-docs__icon", `nsvx-docs__icon--${props.doc.category ?? "other"}`]}>
          <Icon name={categoryIcon(props.doc.category)} />
        </span>
        <span class="nsvx-of__main">
          <strong>{props.doc.current_name}</strong>
          <Show when={sub()}>
            <span class="nsvx-of__sub">{sub()}</span>
          </Show>
        </span>
        <span class="nsvx-docs__meta">
          <DocPill doc={props.doc} kt={props.ctx.kt} />
          <span class="nsvx-docs__when">
            <SourceMark source={props.doc.source} kt={props.ctx.kt} />
            {age(props.doc.imported_at)}
          </span>
        </span>
      </button>
    </li>
  );
}

/** NSVX Documentos (`/documentos`, `/documentos/rever`): the archive, natively, with the page search. */
function Archive(props: {
  ctx: DocsCtx;
  review: boolean;
  onReview: () => void;
  onDrive: () => void;
}) {
  const kt = () => props.ctx.kt;
  const search = new URLSearchParams(location.search);
  const [opened, setOpened] = createSignal(search.get("doc") ?? "");
  const [category, setCategory] = createSignal("");
  const [source, setSource] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [sort, setSort] = createSignal<(typeof SORTS)[number]>("recent");
  const [limit, setLimit] = createSignal(PAGE);
  const [dragging, setDragging] = createSignal(false);
  const overview = createSource(props.ctx.host, () =>
    view<Overview>(props.ctx.host, "archiveOverview"),
  );
  const list = createSource(props.ctx.host, () =>
    view<DocList>(props.ctx.host, "archive", {
      sort: sort(),
      limit: String(limit()),
      ...(props.ctx.query.trim() ? { q: props.ctx.query.trim() } : {}),
      ...(category() ? { category: category() } : {}),
      ...(source() ? { source: source() } : {}),
      ...(from() ? { date_from: from() } : {}),
      ...(to() ? { date_to: to() } : {}),
      ...(props.review ? { review: "open" } : {}),
    }),
  );
  const reload = () => {
    void overview.refresh();
    void list.refresh();
  };
  reload();
  every(15_000, () => !opened() && reload());
  let asked = props.ctx.query.trim();
  createEffect(
    () => props.ctx.query.trim(),
    (q) => {
      // Debounced: typing reloads once, 300 ms after the last key, as NSVX's own search box does.
      const timer = setTimeout(() => {
        if (q !== asked) {
          asked = q;
          setLimit(PAGE);
          void list.refresh();
        }
      }, 300);
      return () => clearTimeout(timer);
    },
  );
  const set = (write: () => void) => {
    write();
    setLimit(PAGE);
    void list.refresh();
  };
  const open = (id: string) => {
    setOpened(id);
    const url = new URL(location.href);
    if (id) {
      url.searchParams.set("doc", id);
    } else {
      url.searchParams.delete("doc");
    }
    history.replaceState(history.state, "", url);
  };
  const cats = createMemo(() => {
    const data = overview.state().data;
    return (data?.categories ?? []).filter(
      (item) => !item.parent && (data?.by_category[item.code] || category() === item.code),
    );
  });
  const filtered = () =>
    Boolean(props.ctx.query.trim() || category() || source() || from() || to());
  const drop = createAction(() => props.ctx);
  return (
    <Show
      when={!opened()}
      fallback={
        <For each={[opened()]} keyed={(id) => id}>
          {(id) => (
            <DocViewer
              ctx={props.ctx}
              id={id()}
              onBack={() => {
                open("");
                reload();
              }}
            />
          )}
        </For>
      }
    >
      <div
        class={["nsvx-docs__archive", { "nsvx-docs__archive--drop": dragging() }]}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const files = [...(event.dataTransfer?.files ?? [])];
          if (files.length) {
            void drop.run(async () => {
              await props.ctx.host.request("nsvx.docs.upload", {
                files: await filesIn(files.slice(0, 20)),
              });
              reload();
            }, kt()("sent"));
          }
        }}
      >
        <SourceView source={overview} t={props.ctx.t}>
          {(loaded) => (
            <Hero
              ctx={props.ctx}
              overview={loaded()}
              onReview={props.onReview}
              onDrive={props.onDrive}
              onUploaded={reload}
            />
          )}
        </SourceView>
        <Note note={drop.note()} />
        <Show when={overview.state().data}>
          <Show when={cats().length > 0}>
            <div class="nsvx-docs__chips" role="group" aria-label={kt()("categories")}>
              <Chip
                on={!category()}
                icon="folder"
                label={kt()("all")}
                onClick={() => set(() => setCategory(""))}
              />
              <For each={cats()} keyed={(item) => item.code}>
                {(item) => (
                  <Chip
                    on={category() === item().code}
                    icon={categoryIcon(item().code)}
                    label={`${categoryLabel(item(), props.ctx.locale)} ${overview.state().data?.by_category[item().code] ?? ""}`.trim()}
                    onClick={() =>
                      set(() => setCategory(category() === item().code ? "" : item().code))
                    }
                  />
                )}
              </For>
            </div>
          </Show>
          <div class="nsvx-docs__bar">
            <Show when={list.state().data}>
              {(data) => (
                <span class="nsvx-of__muted" aria-live="polite">
                  {data().total} {kt()("docsWord")}
                </span>
              )}
            </Show>
            <Reveal label={kt()("filters")} icon="setup">
              {() => (
                <div class="nsvx-of__form">
                  <Choice
                    label={kt()("source")}
                    value={source() as "" | (typeof SOURCES)[number]}
                    options={[
                      ["", kt()("all")],
                      ...SOURCES.map((item) => [item, kt()(`src_${item}`)] as const),
                    ]}
                    onChange={(value) => set(() => setSource(value))}
                  />
                  <Field
                    label={kt()("from")}
                    type="date"
                    value={from()}
                    onInput={(value) => set(() => setFrom(value))}
                  />
                  <Field
                    label={kt()("to")}
                    type="date"
                    value={to()}
                    onInput={(value) => set(() => setTo(value))}
                  />
                  <Choice
                    label={kt()("sort")}
                    value={sort()}
                    options={SORTS.map((item) => [item, kt()(`sort_${item}`)] as const)}
                    onChange={(value) => set(() => setSort(value))}
                  />
                </div>
              )}
            </Reveal>
            <Show when={filtered()}>
              <button
                type="button"
                class="nsvx__button"
                onClick={() =>
                  set(() => {
                    setCategory("");
                    setSource("");
                    setFrom("");
                    setTo("");
                  })
                }
              >
                <Icon name="close" />
                <span>{kt()("clear")}</span>
              </button>
            </Show>
          </div>
          <SourceView source={list} t={props.ctx.t}>
            {(data) => (
              <>
                <ul class="nsvx-of__list" aria-label={kt()("docs")}>
                  <For
                    each={data().items}
                    keyed={(doc) => doc.id}
                    fallback={
                      <li class="nsvx-docs__empty">
                        <Icon name={props.review ? "done" : filtered() ? "find" : "folder"} />
                        <strong>
                          {props.review
                            ? kt()("nothingToCheck")
                            : filtered()
                              ? kt()("none")
                              : kt()("noDocs")}
                        </strong>
                        <Show when={!props.review && !filtered()}>
                          <span class="nsvx-of__sub">{kt()("dropHint")}</span>
                        </Show>
                      </li>
                    }
                  >
                    {(doc) => (
                      <DocRowView ctx={props.ctx} doc={doc()} onOpen={() => open(doc().id)} />
                    )}
                  </For>
                </ul>
                <Show when={data().total > data().items.length}>
                  <button
                    type="button"
                    class="nsvx__button nsvx-docs__more"
                    onClick={() => {
                      setLimit(limit() + PAGE);
                      void list.refresh();
                    }}
                  >
                    {kt()("more")}
                  </button>
                </Show>
              </>
            )}
          </SourceView>
        </Show>
      </div>
    </Show>
  );
}

/** NSVX Documentos and Assinaturas, natively: archive, review, signatures, Google Drive, and settings. */
export function DocsTab(props: {
  host: ControlUiHost;
  t: T;
  dt: DT;
  kt: KT;
  locale: string;
  query: string;
  view: DocsView;
  onView: (view: DocsView) => void;
  onAccess: () => void;
}) {
  const [signOpen, setSignOpen] = createSignal(
    new URLSearchParams(location.search).get("sig") ?? "",
  );
  const ctx = createMemo<DocsCtx>(() => ({
    host: props.host,
    t: props.t,
    dt: props.dt,
    kt: props.kt,
    locale: props.locale,
    query: props.query,
    onSign: (id) => {
      setSignOpen(id);
      props.onView("sign");
      const url = new URL(location.href);
      url.searchParams.set("sig", id);
      history.replaceState(history.state, "", url);
    },
  }));
  return (
    <div class="nsvx-dev nsvx-of nsvx-docs">
      <Segs
        name={props.kt("docs")}
        items={DOCS_VIEWS}
        value={props.view}
        label={(key) => props.kt(key)}
        icon={(key) => VIEW_ICON[key]}
        onChange={(next) => props.onView(next)}
      />
      <For each={[props.view]} keyed={(key) => key}>
        {(current) => (
          <>
            <Show when={current() === "files" || current() === "review"}>
              <Archive
                ctx={ctx()}
                review={current() === "review"}
                onReview={() => props.onView("review")}
                onDrive={() => props.onView("drive")}
              />
            </Show>
            <Show when={current() === "sign"}>
              <SignDesk ctx={ctx()} open={signOpen()} onOpen={setSignOpen} />
            </Show>
            <Show when={current() === "drive"}>
              <DocsDrive ctx={ctx()} onAccess={props.onAccess} />
            </Show>
            <Show when={current() === "settings"}>
              <DocsSettings ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
