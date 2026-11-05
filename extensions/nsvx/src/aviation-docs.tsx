/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  docMatches,
  VALIDITY_TONE,
  type Doc,
  type DocKind,
  type Library,
} from "./aviation-data.js";
import {
  Badge,
  change,
  Chip,
  createAction,
  dayLabel,
  saveNsvxFile,
  type AvCtx,
} from "./aviation-kit.js";
import { Note, view } from "./device-kit.js";
import { createSource, Icon, SourceView, type IconName } from "./ui-kit.js";

const KIND_ICON: Record<DocKind, IconName> = {
  pdf: "doc",
  image: "user",
  sheet: "progress",
  slides: "doc",
  doc: "doc",
  file: "link",
  folder: "folder",
};
const REMINDERS = [90, 30, 7, 0] as const;

type Info = { mime: string; pages?: number | null };

function dated(doc: Doc) {
  return doc.validity !== "unknown" && doc.validity !== "no_expiry";
}

function DocCard(props: { ctx: AvCtx; doc: Doc; onOpen: () => void }) {
  return (
    <button type="button" class="nsvx-av__doc" onClick={() => props.onOpen()}>
      <span class={["nsvx-av__doc-thumb", `nsvx-av__doc-thumb--${props.doc.kind}`]}>
        <Icon name={KIND_ICON[props.doc.kind]} />
        <span>{(props.doc.name.split(".").pop() ?? "").slice(0, 4).toUpperCase()}</span>
      </span>
      <span class="nsvx-av__doc-name">{props.doc.title}</span>
      <span class="nsvx-av__muted">
        {props.doc.category_label}
        {props.doc.pinned || props.doc.favorite ? " · ★" : ""}
      </span>
      <Show when={dated(props.doc)}>
        <Badge
          tone={VALIDITY_TONE[props.doc.validity]}
          label={`${props.ctx.at(`valid_${props.doc.validity}`)}${props.doc.expires_on ? ` · ${dayLabel(props.ctx.locale, props.doc.expires_on)}` : ""}`}
        />
      </Show>
    </button>
  );
}

/** NSVX renders each PDF page to a JPEG, so a phone shows it without a PDF viewer. */
function Pages(props: { ctx: AvCtx; doc: Doc; image: boolean; pages: number }) {
  let current = 0;
  const [page, setPage] = createSignal(0);
  const image = createSource(props.ctx.host, () =>
    props.image
      ? view<{ src: string }>(props.ctx.host, "aviationDocImage", { id: props.doc.id })
      : view<{ src: string }>(props.ctx.host, "aviationDocPage", {
          id: props.doc.id,
          page: String(current),
          w: String(Math.min(2000, Math.round(innerWidth * devicePixelRatio))),
        }),
  );
  void image.refresh();
  const turn = (step: number) => {
    current += step;
    setPage(current);
    void image.refresh();
  };
  return (
    <>
      <Show when={props.pages > 1}>
        <div class="nsvx-av__bar">
          <button
            type="button"
            class="nsvx__button"
            aria-label={props.ctx.at("previous")}
            disabled={page() === 0}
            onClick={() => turn(-1)}
          >
            <Icon name="back" />
          </button>
          <span>
            {page() + 1} / {props.pages}
          </span>
          <button
            type="button"
            class="nsvx__button"
            aria-label={props.ctx.at("next")}
            disabled={page() >= props.pages - 1}
            onClick={() => turn(1)}
          >
            <Icon name="back" class={["nsvx__icon", "nsvx-av__chevron"]} />
          </button>
        </div>
      </Show>
      <SourceView source={image} t={props.ctx.t}>
        {(img) => (
          <img class="nsvx-av__page" alt={`${props.doc.title} ${page() + 1}`} src={img().src} />
        )}
      </SourceView>
    </>
  );
}

/** Office files and others: the text NSVX extracts. */
function TextPreview(props: { ctx: AvCtx; doc: Doc }) {
  const text = createSource(props.ctx.host, () =>
    view<{ text: string }>(props.ctx.host, "aviationDocText", { id: props.doc.id }),
  );
  void text.refresh();
  return (
    <SourceView source={text} t={props.ctx.t}>
      {(body) => (
        <Show when={body().text} fallback={<p class="nsvx__empty">{props.ctx.at("noPreview")}</p>}>
          <pre class="nsvx-av__text">{body().text}</pre>
        </Show>
      )}
    </SourceView>
  );
}

function Preview(props: { ctx: AvCtx; doc: Doc }) {
  const info = createSource(props.ctx.host, () =>
    view<Info>(props.ctx.host, "aviationDocInfo", { id: props.doc.id }),
  );
  void info.refresh();
  return (
    <SourceView source={info} t={props.ctx.t}>
      {(data) => (
        <Show
          when={data().mime === "application/pdf" || data().mime.startsWith("image/")}
          fallback={<TextPreview ctx={props.ctx} doc={props.doc} />}
        >
          <Pages
            ctx={props.ctx}
            doc={props.doc}
            image={data().mime.startsWith("image/")}
            pages={data().pages ?? 1}
          />
        </Show>
      )}
    </SourceView>
  );
}

function DocMeta(props: {
  ctx: AvCtx;
  doc: Doc;
  categories: Library["categories"];
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const d = props.doc;
  const [state, setState] = createSignal(d.expiry_state);
  const [expires, setExpires] = createSignal(d.expires_on ?? "");
  const [issued, setIssued] = createSignal(d.issued_on ?? "");
  const [reminders, setReminders] = createSignal<number[]>(d.reminders);
  const [title, setTitle] = createSignal(d.title);
  const [category, setCategory] = createSignal(d.category);
  const [tags, setTags] = createSignal(d.tags.join(", "));
  const [found, setFound] = createSignal<{ date: string; context: string }[]>();
  const action = createAction(() => props.ctx);
  const listId = `nsvx-av-cats-${d.id}`;
  return (
    <div class="nsvx-av__panel">
      <div class="nsvx-av__chips" role="group" aria-label={props.ctx.at("validity")}>
        <For each={["confirmed", "no_expiry", "none"] as const} keyed={false}>
          {(value) => (
            <Chip
              on={state() === value()}
              label={props.ctx.at(`expiry_${value()}`)}
              onClick={() => setState(value())}
            />
          )}
        </For>
      </div>
      <Show when={state() === "confirmed"}>
        <div class="nsvx-av__fields">
          <label class="nsvx-field">
            <span>{props.ctx.at("expires")}</span>
            <input
              type="date"
              value={expires()}
              onInput={(event) => setExpires(event.currentTarget.value)}
            />
          </label>
          <label class="nsvx-field">
            <span>{props.ctx.at("issued")}</span>
            <input
              type="date"
              value={issued()}
              onInput={(event) => setIssued(event.currentTarget.value)}
            />
          </label>
        </div>
        <button
          type="button"
          class="nsvx__button"
          disabled={action.busy()}
          onClick={() =>
            void action.run(async () =>
              setFound(
                (
                  await props.ctx.host.request<{
                    suggestions: { date: string; context: string }[];
                  }>("nsvx.aviation.suggest", { id: d.id })
                ).suggestions,
              ),
            )
          }
        >
          <Icon name="spark" />
          <span>{props.ctx.at("findDate")}</span>
        </button>
        <Show when={found()}>
          {(list) => (
            <div class="nsvx-av__chips">
              <For each={list()} keyed={(s) => s.date}>
                {(s) => (
                  <Chip
                    on={expires() === s().date}
                    label={dayLabel(props.ctx.locale, s().date)}
                    onClick={() => setExpires(s().date)}
                  />
                )}
              </For>
              <Show when={list().length === 0}>
                <span class="nsvx-av__muted">{props.ctx.at("noDateFound")}</span>
              </Show>
            </div>
          )}
        </Show>
        <div class="nsvx-av__chips" role="group" aria-label={props.ctx.at("reminders")}>
          <For each={REMINDERS} keyed={false}>
            {(n) => (
              <Chip
                on={reminders().includes(n())}
                icon="alert"
                label={n() ? `${n()} d` : props.ctx.at("onTheDay")}
                onClick={() =>
                  setReminders(
                    reminders().includes(n())
                      ? reminders().filter((x) => x !== n())
                      : [...reminders(), n()],
                  )
                }
              />
            )}
          </For>
        </div>
      </Show>
      <div class="nsvx-av__fields">
        <label class="nsvx-field">
          <span>{props.ctx.at("name")}</span>
          <input
            value={title()}
            maxlength={120}
            onInput={(event) => setTitle(event.currentTarget.value)}
          />
        </label>
        <label class="nsvx-field">
          <span>{props.ctx.at("category")}</span>
          <input
            value={category()}
            maxlength={60}
            list={listId}
            onInput={(event) => setCategory(event.currentTarget.value)}
          />
        </label>
        <label class="nsvx-field">
          <span>{props.ctx.at("tags")}</span>
          <input
            value={tags()}
            placeholder="A330"
            onInput={(event) => setTags(event.currentTarget.value)}
          />
        </label>
      </div>
      <datalist id={listId}>
        <For each={props.categories} keyed={(c) => c.id}>
          {(c) => <option value={c().id}>{c().label}</option>}
        </For>
      </datalist>
      <Note note={action.note()} />
      <button
        type="button"
        class={["nsvx__button", "nsvx__button--primary"]}
        onClick={() =>
          props.onSave({
            ...(title() !== d.title || d.title_manual ? { display_name: title() } : {}),
            ...(category() !== d.category || d.category_manual ? { category: category() } : {}),
            tags: tags()
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            expiry: {
              state: state(),
              expires_on: state() === "confirmed" ? expires() : null,
              issued_on: issued() || null,
              reminders: reminders(),
            },
          })
        }
      >
        {props.ctx.at("save")}
      </button>
    </div>
  );
}

function Viewer(props: {
  ctx: AvCtx;
  id: string;
  categories: Library["categories"];
  onClose: () => void;
  onChange: () => void;
}) {
  const doc = createSource(props.ctx.host, () =>
    view<Doc>(props.ctx.host, "aviationDoc", { id: props.id }),
  );
  void doc.refresh();
  const [editing, setEditing] = createSignal(false);
  const action = createAction(() => props.ctx);
  const patch = (body: Record<string, unknown>, done?: string) =>
    void action
      .run(() => change(props.ctx.host, { action: "doc", id: props.id, patch: body }), done)
      .then((ok) => {
        if (ok) {
          setEditing(false);
          void doc.refresh();
          props.onChange();
        }
      });
  return (
    <section
      class="nsvx-av__panel nsvx-av__viewer"
      aria-label={doc.state().data?.title ?? props.ctx.at("docs")}
    >
      <SourceView source={doc} t={props.ctx.t}>
        {(d) => (
          <>
            <div class="nsvx-av__bar">
              <strong class="nsvx-av__viewer-title">{d().title}</strong>
              <button type="button" class="nsvx__button" onClick={() => props.onClose()}>
                <Icon name="close" />
                <span>{props.ctx.at("close")}</span>
              </button>
            </div>
            <div class="nsvx-av__bar">
              <Chip
                on={d().pinned}
                icon="pin"
                label={props.ctx.at(d().pinned ? "pinned" : "pin")}
                onClick={() => patch({ pinned: !d().pinned })}
              />
              <Chip
                on={d().favorite}
                icon="star"
                label={props.ctx.at("favorite")}
                onClick={() => patch({ favorite: !d().favorite })}
              />
              <Chip
                on={editing()}
                icon="edit"
                label={props.ctx.at("edit")}
                onClick={() => setEditing(!editing())}
              />
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy()}
                onClick={() =>
                  void action.run(() => saveNsvxFile(props.ctx.host, { kind: "doc", id: props.id }))
                }
              >
                <Icon name="download" />
                <span>{props.ctx.at("download")}</span>
              </button>
            </div>
            <p class="nsvx-av__muted">
              {d().name} · {d().folder} · {d().category_label}
              {dated(d())
                ? ` · ${props.ctx.at(`valid_${d().validity}`)} ${dayLabel(props.ctx.locale, d().expires_on)}`
                : ""}
            </p>
            <Note note={action.note()} />
            <Show when={editing()}>
              <DocMeta
                ctx={props.ctx}
                doc={d()}
                categories={props.categories}
                onSave={(body) => patch(body, props.ctx.at("saved"))}
              />
            </Show>
            <Preview ctx={props.ctx} doc={d()} />
          </>
        )}
      </SourceView>
    </section>
  );
}

type Only = "all" | "fav" | "dated";

export function DocsView(props: { ctx: AvCtx; open: string | undefined }) {
  const source = createSource(props.ctx.host, () => view<Library>(props.ctx.host, "aviationDocs"));
  void source.refresh();
  const [only, setOnly] = createSignal<Only>("all");
  const [category, setCategory] = createSignal<string>();
  const [opened, setOpened] = createSignal(props.open);
  const list = createMemo(() => {
    const docs = (source.state().data?.docs ?? []).filter(
      (doc) =>
        docMatches(doc, props.ctx.query) &&
        (!category() || doc.category === category()) &&
        (only() !== "fav" || doc.favorite || doc.pinned) &&
        (only() !== "dated" || dated(doc)),
    );
    return only() === "dated"
      ? docs.toSorted((a, b) => (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999"))
      : docs;
  });
  return (
    <SourceView source={source} t={props.ctx.t}>
      {(lib) => (
        <div class="nsvx-av__stack">
          <Show when={opened()}>
            {(id) => (
              <For each={[id()]} keyed={(key) => key}>
                {(key) => (
                  <Viewer
                    ctx={props.ctx}
                    id={key()}
                    categories={lib().categories}
                    onClose={() => setOpened(undefined)}
                    onChange={() => void source.refresh()}
                  />
                )}
              </For>
            )}
          </Show>
          <Show when={lib().pinned.length > 0}>
            <div class="nsvx-av__tiles" role="group" aria-label={props.ctx.at("essentials")}>
              <For each={lib().pinned} keyed={(doc) => doc.id}>
                {(doc) => (
                  <button type="button" class="nsvx-av__tile" onClick={() => setOpened(doc().id)}>
                    <Icon name={KIND_ICON[doc().kind]} />
                    <span>{doc().title}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div class="nsvx-av__chips" role="group" aria-label={props.ctx.at("filters")}>
            <Chip
              on={only() === "all" && !category()}
              label={`${props.ctx.at("all")} ${lib().docs.length}`}
              onClick={() => {
                setOnly("all");
                setCategory(undefined);
              }}
            />
            <Chip
              on={only() === "fav"}
              icon="star"
              label={props.ctx.at("favorite")}
              onClick={() => setOnly(only() === "fav" ? "all" : "fav")}
            />
            <Chip
              on={only() === "dated"}
              icon="shield"
              label={props.ctx.at("validity")}
              onClick={() => setOnly(only() === "dated" ? "all" : "dated")}
            />
          </div>
          <div class="nsvx-av__chips" role="group" aria-label={props.ctx.at("category")}>
            <For each={lib().categories} keyed={(c) => c.id}>
              {(c) => (
                <Chip
                  on={category() === c().id}
                  label={`${c().label} ${c().count}`}
                  onClick={() => setCategory(category() === c().id ? undefined : c().id)}
                />
              )}
            </For>
          </div>
          <Show
            when={list().length > 0}
            fallback={<p class="nsvx__empty">{props.ctx.at("noDocs")}</p>}
          >
            <ul class="nsvx-av__docs">
              <For each={list()} keyed={(doc) => doc.id}>
                {(doc) => (
                  <li>
                    <DocCard ctx={props.ctx} doc={doc()} onOpen={() => setOpened(doc().id)} />
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <p class="nsvx-av__muted">
            <Icon name="lock" />{" "}
            {lib().sync.account_state === "ready"
              ? props.ctx.at("driveReadOnly")
              : props.ctx.at("driveOff")}
            {lib().hidden_identity
              ? ` · ${lib().hidden_identity} ${props.ctx.at("idsHidden")}`
              : ""}
          </p>
        </div>
      )}
    </SourceView>
  );
}
