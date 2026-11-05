/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { saveNsvxFile } from "./aviation-kit.js";
import { ConfirmButton, createAction, Note, Segs, view } from "./device-kit.js";
import { shortStamp, type CaseDetail, type Evidence, type EvidenceDetail } from "./legal-data.js";
import { changeCaseRequest, type LegalCtx } from "./legal-kit.js";
import { Choice, Field, Panel, Pill, Toggle } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, SourceView, type IconName } from "./ui-kit.js";

type Rect = { x: number; y: number; w: number; h: number };

const TYPE_ICON: Record<string, IconName> = {
  contract: "doc",
  receipt: "euro",
  bank: "bank",
  invoice: "euro",
  email: "mail",
  message: "messages",
  letter: "mail",
  photo: "image",
  screenshot: "image",
  id: "user",
  official: "shield",
};

/** Only the first rows ask NSVX for a page image, so a long dossier stays quick on a phone. */
export const THUMBS = 12;

export function Thumb(props: { ctx: LegalCtx; row: Evidence; image: boolean }) {
  const source = createSource(props.ctx.host, () =>
    view<{ src: string }>(props.ctx.host, "caseProofPage", {
      id: props.row.id,
      page: "1",
      w: "240",
    }),
  );
  if (props.image) {
    void source.refresh();
  }
  return (
    <span class="nsvx-of__thumb" aria-hidden="true">
      <Show
        when={source.state().data}
        fallback={<Icon name={TYPE_ICON[props.row.type] ?? "doc"} />}
      >
        {(page) => <img src={page().src} alt="" />}
      </Show>
    </span>
  );
}

/** A page NSVX renders; in drawing mode the owner marks areas for a redacted or cropped copy. The original never changes. */
function Pages(props: {
  ctx: LegalCtx;
  caseRef: string;
  row: EvidenceDetail;
  onDerived: (id: string) => void;
}) {
  const ctx = () => props.ctx;
  const count = createSource(ctx().host, () =>
    view<{ pages: number }>(ctx().host, "caseProofPages", { id: props.row.id }),
  );
  void count.refresh();
  const [page, setPage] = createSignal(1);
  const image = createSource(ctx().host, () =>
    view<{ src: string }>(ctx().host, "caseProofPage", {
      id: props.row.id,
      page: String(page()),
      w: "1400",
    }),
  );
  void image.refresh();
  const [drawing, setDrawing] = createSignal<"redaction" | "crop">();
  const [rects, setRects] = createSignal<Rect[]>([]);
  const [drag, setDrag] = createSignal<Rect>();
  let start: { x: number; y: number } | undefined;
  const action = createAction(ctx);
  const turn = (next: number) => {
    setPage(next);
    setRects([]);
    void image.refresh();
  };
  const at = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  };
  const total = () => count.state().data?.pages ?? 1;
  return (
    <Show
      when={props.row.previewable}
      fallback={<p class="nsvx-of__muted">{ctx().lt("noPreview")}</p>}
    >
      <div class="nsvx-of">
        <div class="nsvx-of__bar">
          <IconButton
            icon="back"
            label={ctx().lt("previous")}
            disabled={page() <= 1}
            onClick={() => turn(page() - 1)}
          />
          <span class="nsvx-of__sub">
            {page()} / {total()}
          </span>
          <button
            type="button"
            class="nsvx__button nsvx__button--icon"
            aria-label={ctx().lt("next")}
            disabled={page() >= total()}
            onClick={() => turn(page() + 1)}
          >
            <Icon name="forward" />
          </button>
          <button
            type="button"
            class={["nsvx__button", { "nsvx__button--primary": drawing() === "redaction" }]}
            aria-pressed={drawing() === "redaction" ? "true" : "false"}
            onClick={() => {
              setDrawing(drawing() === "redaction" ? undefined : "redaction");
              setRects([]);
            }}
          >
            <Icon name="hide" />
            <span>{ctx().lt("redact")}</span>
          </button>
          <button
            type="button"
            class={["nsvx__button", { "nsvx__button--primary": drawing() === "crop" }]}
            aria-pressed={drawing() === "crop" ? "true" : "false"}
            onClick={() => {
              setDrawing(drawing() === "crop" ? undefined : "crop");
              setRects([]);
            }}
          >
            <Icon name="image" />
            <span>{ctx().lt("crop")}</span>
          </button>
        </div>
        <Show when={drawing()}>
          <p class="nsvx-of__muted">{ctx().lt("dragHint")}</p>
        </Show>
        <SourceView source={image} t={ctx().t}>
          {(shown) => (
            <div
              class={["nsvx-of__page", { "nsvx-of__page--draw": Boolean(drawing()) }]}
              onPointerDown={(event) => {
                if (drawing()) {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  start = at(event);
                }
              }}
              onPointerMove={(event) => {
                if (drawing() && start) {
                  const point = at(event);
                  setDrag({
                    x: Math.min(point.x, start.x),
                    y: Math.min(point.y, start.y),
                    w: Math.abs(point.x - start.x),
                    h: Math.abs(point.y - start.y),
                  });
                }
              }}
              onPointerUp={() => {
                const made = drag();
                if (made && made.w > 0.01 && made.h > 0.01) {
                  setRects(drawing() === "crop" ? [made] : [...rects(), made]);
                }
                setDrag(undefined);
                start = undefined;
              }}
              onPointerCancel={() => {
                setDrag(undefined);
                start = undefined;
              }}
            >
              <img src={shown().src} alt={`${props.row.name} ${page()}`} draggable="false" />
              <For each={[...rects(), ...(drag() ? [drag() as Rect] : [])]} keyed={false}>
                {(rect) => (
                  <span
                    class={["nsvx-of__rect", { "nsvx-of__rect--crop": drawing() === "crop" }]}
                    style={{
                      left: `${rect().x * 100}%`,
                      top: `${rect().y * 100}%`,
                      width: `${rect().w * 100}%`,
                      height: `${rect().h * 100}%`,
                    }}
                  />
                )}
              </For>
            </div>
          )}
        </SourceView>
        <Show when={drawing() && rects().length}>
          <div class="nsvx-of__bar">
            <button type="button" class="nsvx__button" onClick={() => setRects([])}>
              {ctx().lt("clear")}
            </button>
            <button
              type="button"
              class="nsvx__button nsvx__button--primary"
              disabled={action.busy() || !ctx().host.connection.canWrite}
              onClick={() =>
                void action.run(async () => {
                  const made = await changeCaseRequest<{ evidence_id: string }>(ctx(), {
                    action: "proofDerive",
                    key: props.caseRef,
                    evidenceId: props.row.id,
                    kind: drawing(),
                    page: page(),
                    rects: rects(),
                  });
                  setDrawing(undefined);
                  setRects([]);
                  props.onDerived(made.evidence_id);
                })
              }
            >
              {ctx().lt("saveAsProof")}
            </button>
          </div>
        </Show>
        <Note note={action.note()} />
      </div>
    </Show>
  );
}

function ProofText(props: { ctx: LegalCtx; row: EvidenceDetail }) {
  const ctx = () => props.ctx;
  const [query, setQuery] = createSignal("");
  const source = createSource(ctx().host, () =>
    view<{ pages?: { ref: string; text: string }[]; hits?: { ref: string; snippet: string }[] }>(
      ctx().host,
      "caseProofText",
      query().trim() ? { id: props.row.id, q: query().trim() } : { id: props.row.id },
    ),
  );
  if (props.row.has_text) {
    void source.refresh();
  }
  return (
    <Show
      when={props.row.has_text}
      fallback={<p class="nsvx-of__warn">{ctx().lt(`ex_${props.row.extraction_state}`)}</p>}
    >
      <form
        class="nsvx-of__form"
        onSubmit={(event) => {
          event.preventDefault();
          void source.refresh();
        }}
      >
        <Field
          label={ctx().lt("find")}
          type="search"
          value={query()}
          max={200}
          onInput={setQuery}
        />
        <div class="nsvx-dev__bar">
          <button type="submit" class="nsvx__button">
            <Icon name="find" />
            <span>{ctx().lt("find")}</span>
          </button>
        </div>
      </form>
      <SourceView source={source} t={ctx().t}>
        {(data) => (
          <ul class="nsvx-of__list">
            <For
              each={
                data().hits?.map((hit) => ({ ref: hit.ref, text: hit.snippet })) ??
                data().pages ??
                []
              }
              keyed={(row) => row.ref}
              fallback={<p class="nsvx-of__muted">{ctx().lt("nothing")}</p>}
            >
              {(row) => (
                <li>
                  <span class="nsvx-of__sub">{row().ref}</span>
                  <p class="nsvx-of__body">{row().text}</p>
                </li>
              )}
            </For>
          </ul>
        )}
      </SourceView>
    </Show>
  );
}

function ProofDetails(props: {
  ctx: LegalCtx;
  caseId: string;
  caseRef: string;
  row: EvidenceDetail;
  reload: () => void;
  onGone: () => void;
}) {
  const ctx = () => props.ctx;
  const row = () => props.row;
  const [folder, setFolder] = createSignal(row().folder ?? "");
  const [type, setType] = createSignal(row().type);
  const [date, setDate] = createSignal(row().doc_date ?? "");
  const [author, setAuthor] = createSignal(row().author ?? "");
  const [tags, setTags] = createSignal(row().tags.join(", "));
  const [where, setWhere] = createSignal(row().location_ref ?? "");
  const [description, setDescription] = createSignal(row().description ?? "");
  const [note, setNote] = createSignal("");
  const action = createAction(ctx);
  const canWrite = () => ctx().host.connection.canWrite;
  const patch = (body: Record<string, unknown>) =>
    void action.run(async () => {
      await changeCaseRequest(ctx(), {
        action: "proofUpdate",
        key: props.caseRef,
        evidenceId: row().id,
        ...body,
      });
      props.reload();
    }, ctx().lt("saved"));
  return (
    <div class="nsvx-of">
      <dl class="nsvx-of__dl">
        <dt>{ctx().lt("origin")}</dt>
        <dd>{row().source}</dd>
        <Show when={row().source_path}>
          <dt>{ctx().lt("path")}</dt>
          <dd>{row().source_path}</dd>
        </Show>
        <Show when={row().sha256}>
          <dt>SHA-256</dt>
          <dd>{row().sha256}</dd>
        </Show>
        <dt>{ctx().lt("source")}</dt>
        <dd>{ctx().lt(`src_${row().source_state}`)}</dd>
      </dl>
      <form
        class="nsvx-of__form"
        onSubmit={(event) => {
          event.preventDefault();
          patch({
            folder: folder(),
            evidence_type: type(),
            doc_date: date(),
            author: author(),
            tags: tags()
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            location_ref: where(),
            description: description(),
          });
        }}
      >
        <Choice
          label={ctx().lt("folder")}
          value={folder()}
          options={Object.entries(ctx().vocab()?.folders ?? { [folder()]: folder() }).map(
            ([key, value]) => [key, `${key} · ${value}`] as const,
          )}
          onChange={setFolder}
        />
        <Choice
          label={ctx().lt("kind")}
          value={type()}
          options={Object.entries(ctx().vocab()?.evidence_types ?? { [type()]: type() })}
          onChange={setType}
        />
        <Field label={ctx().lt("docDate")} type="date" value={date()} onInput={setDate} />
        <Field label={ctx().lt("author")} value={author()} max={200} onInput={setAuthor} />
        <Field label={ctx().lt("tags")} value={tags()} onInput={setTags} />
        <Field label={ctx().lt("whereInDoc")} value={where()} max={200} onInput={setWhere} />
        <Field
          label={ctx().lt("description")}
          value={description()}
          rows={2}
          max={2000}
          onInput={setDescription}
        />
        <div class="nsvx-dev__bar">
          <button
            type="submit"
            class="nsvx__button nsvx__button--primary"
            disabled={action.busy() || !canWrite()}
          >
            {ctx().lt("save")}
          </button>
        </div>
      </form>
      <Toggle
        label={ctx().lt("privileged")}
        checked={row().privileged}
        disabled={action.busy() || !canWrite()}
        onChange={(privileged) => patch({ privileged })}
      />
      <Toggle
        label={ctx().lt("excludeAi")}
        checked={row().exclude_from_ai}
        disabled={action.busy() || !canWrite()}
        onChange={(exclude_from_ai) => patch({ exclude_from_ai })}
      />
      <Note note={action.note()} />
      <div class="nsvx-of__bar">
        <ConfirmButton
          label={ctx().lt("removeFromCase")}
          confirm={ctx().lt("removeFromCase")}
          cancel={ctx().lt("keep")}
          danger
          disabled={action.busy() || !canWrite()}
          onConfirm={() =>
            void action.run(async () => {
              await changeCaseRequest(ctx(), {
                action: "proofRemove",
                key: props.caseRef,
                evidenceId: row().id,
              });
              props.onGone();
            })
          }
        />
      </div>
      <Panel title={ctx().lt("notes")} icon="edit" count={row().annotations.length}>
        <ul class="nsvx-of__list">
          <For each={row().annotations} keyed={(item) => item.id}>
            {(item) => (
              <li class="nsvx-of__row">
                <span class="nsvx-of__main">
                  <span>{item().text}</span>
                  <span class="nsvx-of__sub">{shortStamp(item().at, ctx().locale)}</span>
                </span>
                <IconButton
                  icon="close"
                  label={ctx().lt("remove")}
                  disabled={action.busy() || !canWrite()}
                  onClick={() =>
                    void action.run(async () => {
                      await changeCaseRequest(ctx(), {
                        action: "noteRemove",
                        evidenceId: row().id,
                        noteId: item().id,
                      });
                      props.reload();
                    })
                  }
                />
              </li>
            )}
          </For>
        </ul>
        <form
          class="nsvx-of__form"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await changeCaseRequest(ctx(), {
                action: "noteAdd",
                evidenceId: row().id,
                caseId: props.caseId,
                text: note(),
              });
              setNote("");
              props.reload();
            });
          }}
        >
          <Field label={ctx().lt("newNote")} value={note()} max={2000} onInput={setNote} />
          <div class="nsvx-dev__bar">
            <button
              type="submit"
              class="nsvx__button"
              disabled={action.busy() || !note().trim() || !canWrite()}
            >
              {ctx().lt("add")}
            </button>
          </div>
        </form>
      </Panel>
      <Panel title={ctx().lt("custody")} icon="history" count={row().custody.length}>
        <ol class="nsvx-of__timeline">
          <For each={row().custody} keyed={false}>
            {(item) => (
              <li>
                <span class="nsvx-of__sub">
                  {shortStamp(item().at, ctx().locale)} · {item().actor}
                </span>
                <span>{item().event}</span>
              </li>
            )}
          </For>
        </ol>
      </Panel>
    </div>
  );
}

type ViewerSection = "see" | "text" | "details";

export function Viewer(props: {
  ctx: LegalCtx;
  row: CaseDetail;
  id: string;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<EvidenceDetail>(ctx().host, "caseProof", { id: props.id, case: props.row.ref }),
  );
  void source.refresh();
  const [section, setSection] = createSignal<ViewerSection>("see");
  const action = createAction(ctx);
  const canWrite = () => ctx().host.connection.canWrite;
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__bar">
        <IconButton icon="back" label={ctx().lt("back")} onClick={() => props.onBack()} />
      </div>
      <SourceView source={source} t={ctx().t}>
        {(proof) => (
          <>
            <header class="nsvx-of__head">
              <h2>
                {proof().code} · {proof().name}
              </h2>
              <Show when={proof().privileged}>
                <Pill tone="warn" icon="lock">
                  {ctx().lt("private")}
                </Pill>
              </Show>
            </header>
            <div class="nsvx-of__bar">
              <Show when={!proof().partition_required}>
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={action.busy()}
                  onClick={() =>
                    void action.run(() =>
                      saveNsvxFile(
                        ctx().host,
                        { kind: "proof", key: props.row.ref, evidenceId: proof().id },
                        "nsvx.cases.file",
                      ),
                    )
                  }
                >
                  <Icon name="download" />
                  <span>{ctx().lt("original")}</span>
                </button>
              </Show>
              <Show when={proof().source === "drive"}>
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={action.busy() || !canWrite()}
                  onClick={() =>
                    void action.run(async () => {
                      await changeCaseRequest(ctx(), {
                        action: "proofCheck",
                        evidenceId: proof().id,
                      });
                      await source.refresh();
                    })
                  }
                >
                  <Icon name="refresh" />
                  <span>{ctx().lt("check")}</span>
                </button>
              </Show>
              <Show when={proof().source_state === "changed"}>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={action.busy() || !canWrite()}
                  onClick={() =>
                    void action.run(async () => {
                      const made = await changeCaseRequest<{ evidence_id: string }>(ctx(), {
                        action: "proofVersion",
                        key: props.row.ref,
                        evidenceId: proof().id,
                      });
                      props.onOpen(made.evidence_id);
                    })
                  }
                >
                  {ctx().lt("importVersion")}
                </button>
              </Show>
            </div>
            <Note note={action.note()} />
            <Segs
              name={ctx().lt("evidence")}
              items={["see", "text", "details"] as const}
              value={section()}
              label={(key) => ctx().lt(key)}
              icon={(key) => (key === "see" ? "image" : key === "text" ? "doc" : "edit")}
              onChange={setSection}
            />
            <Show when={section() === "see"}>
              <Pages ctx={ctx()} caseRef={props.row.ref} row={proof()} onDerived={props.onOpen} />
            </Show>
            <Show when={section() === "text"}>
              <ProofText ctx={ctx()} row={proof()} />
            </Show>
            <Show when={section() === "details"}>
              <ProofDetails
                ctx={ctx()}
                caseId={props.row.id}
                caseRef={props.row.ref}
                row={proof()}
                reload={() => void source.refresh()}
                onGone={() => props.onBack()}
              />
            </Show>
          </>
        )}
      </SourceView>
    </div>
  );
}
