/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { saveNsvxFile } from "./aviation-kit.js";
import { ConfirmButton, createAction, Note, Segs, view } from "./device-kit.js";
import {
  fileToBase64,
  proofHasPages,
  proofNeedsLook,
  sheetPickable,
  shortDay,
  shortStamp,
  type CaseDetail,
  type Evidence,
  type EvidenceDetail,
  type SheetReview,
  type SheetRow,
} from "./legal-data.js";
import { changeCaseRequest, type LegalCtx } from "./legal-tab.js";
import { every } from "./messages-ui.js";
import { Choice, Field, Panel, Pill, Reveal, Toggle, sizeWord } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, SourceView, type IconName } from "./ui-kit.js";

type EvidenceList = {
  evidence: Evidence[];
  folders: { code: string; label: string; count: number }[];
};

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
const THUMBS = 12;

function Thumb(props: { ctx: LegalCtx; row: Evidence; image: boolean }) {
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
function Pages(props: { ctx: LegalCtx; caseRef: string; row: EvidenceDetail; onDerived: (id: string) => void }) {
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
        <Field label={ctx().lt("find")} type="search" value={query()} max={200} onInput={setQuery} />
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
                data().hits?.map((hit) => ({ ref: hit.ref, text: hit.snippet })) ?? data().pages ?? []
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

function ProofDetails(props: { ctx: LegalCtx; caseId: string; caseRef: string; row: EvidenceDetail; reload: () => void; onGone: () => void }) {
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
        <Field label={ctx().lt("description")} value={description()} rows={2} max={2000} onInput={setDescription} />
        <div class="nsvx-dev__bar">
          <button type="submit" class="nsvx__button nsvx__button--primary" disabled={action.busy() || !canWrite()}>
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
            <button type="submit" class="nsvx__button" disabled={action.busy() || !note().trim() || !canWrite()}>
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

function Viewer(props: { ctx: LegalCtx; row: CaseDetail; id: string; onBack: () => void; onOpen: (id: string) => void }) {
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
                      await changeCaseRequest(ctx(), { action: "proofCheck", evidenceId: proof().id });
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

function DrivePicker(props: {
  ctx: LegalCtx;
  caseRef: string;
  folder: string;
  close: () => void;
  onDone: () => void;
}) {
  const ctx = () => props.ctx;
  const [query, setQuery] = createSignal("");
  const [found, setFound] = createSignal<{ file_id: string; name: string; path: string; modified: string | null }[]>();
  const [chosen, setChosen] = createSignal<string[]>([]);
  const action = createAction(ctx);
  return (
    <div class="nsvx-of">
      <form
        class="nsvx-of__form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const result = await view<{ files: NonNullable<ReturnType<typeof found>> }>(
              ctx().host,
              "caseDrive",
              { q: query().trim() },
            );
            setFound(result.files);
          });
        }}
      >
        <Field label={ctx().lt("nameOrFolder")} type="search" value={query()} onInput={setQuery} />
        <div class="nsvx-dev__bar">
          <button type="submit" class="nsvx__button" disabled={action.busy() || query().trim().length < 2}>
            <Icon name="find" />
            <span>{ctx().lt("find")}</span>
          </button>
        </div>
      </form>
      <Show when={found()}>
        {(files) => (
          <ul class="nsvx-of__list">
            <For
              each={files()}
              keyed={(file) => file.file_id}
              fallback={<p class="nsvx-of__muted">{ctx().lt("nothing")}</p>}
            >
              {(file) => (
                <li>
                  <Toggle
                    label={`${file().name} · ${shortDay(file().modified, ctx().locale)}`}
                    checked={chosen().includes(file().file_id)}
                    onChange={(on) =>
                      setChosen(
                        on
                          ? [...chosen(), file().file_id]
                          : chosen().filter((id) => id !== file().file_id),
                      )
                    }
                  />
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
      <p class="nsvx-of__muted">{ctx().lt("driveKeeps")}</p>
      <Note note={action.note()} />
      <div class="nsvx-of__bar">
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || chosen().length === 0}
          onClick={() =>
            void action.run(async () => {
              await changeCaseRequest(ctx(), {
                action: "proofDrive",
                key: props.caseRef,
                file_ids: chosen(),
                folder: props.folder,
              });
              props.onDone();
              props.close();
            })
          }
        >
          {ctx().lt("add")} {chosen().length || ""}
        </button>
      </div>
    </div>
  );
}

const rowKey = (row: SheetRow) => JSON.stringify([row.sheet, row.row]);

/** Copies only the confirmed person's rows from a shared sheet into a new proof, with the source's hash on record. */
function SheetSplitter(props: {
  ctx: LegalCtx;
  row: CaseDetail;
  sources: Evidence[];
  onOpen: (id: string) => void;
}) {
  const ctx = () => props.ctx;
  const sheets = createMemo(() =>
    props.sources.filter((row) => row.partition_required || row.type === "spreadsheet"),
  );
  const [proof, setProof] = createSignal(sheets()[0]?.id ?? "");
  const firstParty =
    props.row.parties.find((party) => party.role === "respondent") ?? props.row.parties[0];
  const [party, setParty] = createSignal(firstParty?.id ?? "");
  const [review, setReview] = createSignal<SheetReview>();
  const [chosen, setChosen] = createSignal<Record<string, string[]>>({});
  const [confirmed, setConfirmed] = createSignal(false);
  const [shared, setShared] = createSignal(false);
  const action = createAction(ctx);
  const rows = () => review()?.proposal?.rows ?? [];
  const picked = () => rows().filter((row) => chosen()[rowKey(row)]?.length);
  const running = () => ["queued", "scanning"].includes(review()?.state ?? "");
  every(1_500, () => {
    const current = review();
    if (current && running()) {
      void view<SheetReview>(ctx().host, "caseSheet", {
        id: props.row.ref,
        sheet: current.id,
      }).then(setReview);
    }
  });
  const start = (again = false) =>
    void action.run(async () => {
      setChosen({});
      setConfirmed(false);
      setReview(
        await changeCaseRequest<SheetReview>(ctx(), {
          action: "sheetStart",
          key: props.row.ref,
          evidenceId: proof(),
          partyId: party(),
          new_revision: again,
        }),
      );
    });
  return (
    <div class="nsvx-of">
      <Show
        when={review()}
        fallback={
          <div class="nsvx-of__form">
            <Choice
              label={ctx().lt("source")}
              value={proof()}
              options={[
                ["", "—"],
                ...sheets().map((row) => [row.id, `${row.code} · ${row.name}`] as const),
              ]}
              onChange={setProof}
            />
            <Choice
              label={ctx().lt("person")}
              value={party()}
              options={[
                ["", "—"],
                ...props.row.parties.map((row) => [row.id, row.name] as const),
              ]}
              onChange={setParty}
            />
            <Show when={sheets().length === 0}>
              <p class="nsvx-of__muted nsvx-of__wide">{ctx().lt("addSheetFirst")}</p>
            </Show>
            <div class="nsvx-dev__bar">
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                disabled={action.busy() || !proof() || !party()}
                onClick={() => start()}
              >
                {ctx().lt("review")}
              </button>
            </div>
          </div>
        }
      >
        {(current) => (
          <>
            <div class="nsvx-of__bar" role="status">
              <Pill tone={current().state === "ready" ? "ok" : current().state === "failed" ? "bad" : "run"}>
                {ctx().lt(`sheet_${current().state}`)}
              </Pill>
              <Show when={running()}>
                <span class="nsvx-of__sub">{current().progress_cells}</span>
              </Show>
              <Show when={current().proposal}>
                <Pill icon="done">{picked().length}</Pill>
                <Pill>{rows().length - picked().length}</Pill>
                <Pill icon="close">{current().proposal?.excluded}</Pill>
              </Show>
            </div>
            <Show when={current().error}>
              <p class="nsvx-of__warn" role="alert">
                {current().error}
              </p>
            </Show>
            <Show when={current().state === "review"}>
              <div class="nsvx-of__bar">
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={sheetPickable(rows()).length === 0}
                  onClick={() => {
                    setConfirmed(false);
                    setChosen(
                      Object.fromEntries(
                        sheetPickable(rows()).map((row) => [rowKey(row), Object.keys(row.cells)]),
                      ),
                    );
                  }}
                >
                  {ctx().lt("pickProposed")}
                </button>
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={picked().length === 0}
                  onClick={() => {
                    setConfirmed(false);
                    setChosen({});
                  }}
                >
                  {ctx().lt("clear")}
                </button>
              </div>
              <ul class="nsvx-of__list">
                <For
                  each={rows().slice(0, 200)}
                  keyed={rowKey}
                  fallback={<p class="nsvx-of__muted">{ctx().lt("noSafeMatch")}</p>}
                >
                  {(row) => (
                    <li class="nsvx-of__panel">
                      <Toggle
                        label={`${row().sheet} · ${row().row}`}
                        checked={Boolean(chosen()[rowKey(row())]?.length)}
                        disabled={row().blocked}
                        onChange={(on) => {
                          setConfirmed(false);
                          setChosen({
                            ...chosen(),
                            [rowKey(row())]: on ? Object.keys(row().cells) : [],
                          });
                        }}
                      />
                      <div class="nsvx-of__bar">
                        <For each={row().reasons} keyed={false}>
                          {(why) => <Pill>{why()}</Pill>}
                        </For>
                      </div>
                      <p class="nsvx-of__sub">
                        {Object.entries(row().cells)
                          .map(([cell, value]) => `${cell}: ${value || "—"}`)
                          .join(" · ")}
                      </p>
                    </li>
                  )}
                </For>
              </ul>
              <Toggle label={ctx().lt("confirmedPerson")} checked={confirmed()} onChange={setConfirmed} />
              <Toggle label={ctx().lt("sharedRows")} checked={shared()} onChange={setShared} />
              <div class="nsvx-of__bar">
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={action.busy() || !confirmed() || picked().length === 0}
                  onClick={() =>
                    void action.run(async () => {
                      setReview(
                        await changeCaseRequest<SheetReview>(ctx(), {
                          action: "sheetConfirm",
                          key: props.row.ref,
                          sheetId: current().id,
                          revision: current().revision,
                          rows: picked().map((row) => ({
                            sheet: row.sheet,
                            row: row.row,
                            cells: chosen()[rowKey(row)],
                          })),
                          shared: shared(),
                          identity_confirmed: true,
                        }),
                      );
                    })
                  }
                >
                  <Icon name="done" />
                  <span>{ctx().lt("makeExtract")}</span>
                </button>
              </div>
            </Show>
            <div class="nsvx-of__bar">
              <Show when={current().state === "ready" && current().derived_id}>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  onClick={() => props.onOpen(current().derived_id as string)}
                >
                  <Icon name="doc" />
                  <span>{ctx().lt("openExtract")}</span>
                </button>
              </Show>
              <Show when={current().state === "ready"}>
                <button type="button" class="nsvx__button" disabled={action.busy()} onClick={() => start(true)}>
                  {ctx().lt("review")}
                </button>
              </Show>
              <Show when={current().state !== "ready"}>
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={action.busy()}
                  onClick={() =>
                    void action.run(async () => {
                      const next = await changeCaseRequest<SheetReview>(ctx(), {
                        action: "sheetCancel",
                        key: props.row.ref,
                        sheetId: current().id,
                      });
                      setReview(running() ? next : undefined);
                    })
                  }
                >
                  {ctx().lt(running() ? "cancel" : "restart")}
                </button>
              </Show>
            </div>
          </>
        )}
      </Show>
      <Note note={action.note()} />
    </div>
  );
}

/** The dossier's evidence: folders, upload, Drive, sheets, and the viewer. Files reach NSVX through the Gateway. */
export function LegalProofs(props: { ctx: LegalCtx; row: CaseDetail }) {
  const ctx = () => props.ctx;
  const [folder, setFolder] = createSignal("");
  const source = createSource(ctx().host, () =>
    view<EvidenceList>(
      ctx().host,
      "caseEvidence",
      folder() ? { id: props.row.ref, folder: folder() } : { id: props.row.ref },
    ),
  );
  void source.refresh();
  every(30_000, () => void source.refresh());
  const [opened, setOpened] = createSignal("");
  const [filter, setFilter] = createSignal("");
  const action = createAction(ctx);
  const canWrite = () => ctx().host.connection.canWrite;
  const pickFolder = (code: string) => {
    setFolder(folder() === code ? "" : code);
    void source.refresh();
  };
  const upload = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }
    const list = [...files];
    void action.run(async () => {
      const result = await ctx().host.request<{
        results: { name: string; error?: string }[];
      }>("nsvx.cases.upload", {
        key: props.row.ref,
        folder: folder(),
        files: await Promise.all(
          list.map(async (file) => ({
            name: file.name,
            mime: file.type,
            data: await fileToBase64(file),
          })),
        ),
      });
      await source.refresh();
      const failed = result.results.find((row) => row.error);
      if (failed) {
        throw new Error(`${failed.name}: ${failed.error}`);
      }
    }, ctx().lt("added"));
  };
  const rows = createMemo(() => {
    const needle = filter().trim().toLowerCase();
    return (source.state().data?.evidence ?? []).filter(
      (row) =>
        !needle ||
        `${row.code} ${row.name} ${row.tags.join(" ")} ${row.description ?? ""}`
          .toLowerCase()
          .includes(needle),
    );
  });
  return (
    <div class="nsvx-of">
      <Show
        when={!opened()}
        fallback={
          <For each={[opened()]} keyed={(id) => id}>
            {(id) => (
              <Viewer
                ctx={ctx()}
                row={props.row}
                id={id()}
                onBack={() => {
                  setOpened("");
                  void source.refresh();
                }}
                onOpen={setOpened}
              />
            )}
          </For>
        }
      >
        <div class="nsvx-of__bar">
          <label class={["nsvx__button", "nsvx__button--primary", { "nsvx-of__muted": !canWrite() }]}>
            <Icon name="upload" />
            <span>{ctx().lt("upload")}</span>
            <input
              type="file"
              multiple
              hidden
              disabled={action.busy() || !canWrite()}
              accept="application/pdf,image/*,.docx,.xlsx,.pptx,.txt,.csv,.eml,audio/*,video/*"
              aria-label={ctx().lt("upload")}
              onChange={(event) => {
                upload(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <Reveal label={ctx().lt("fromDrive")} icon="folder" disabled={!canWrite()}>
            {(close) => (
              <DrivePicker
                ctx={ctx()}
                caseRef={props.row.ref}
                folder={folder()}
                close={close}
                onDone={() => void source.refresh()}
              />
            )}
          </Reveal>
          <Reveal label={ctx().lt("splitSheet")} icon="split" disabled={!canWrite()}>
            {() => (
              <SheetSplitter
                ctx={ctx()}
                row={props.row}
                sources={source.state().data?.evidence ?? []}
                onOpen={setOpened}
              />
            )}
          </Reveal>
        </div>
        <Note note={action.note()} />
        <Field label={ctx().lt("filter")} type="search" value={filter()} onInput={setFilter} />
        <SourceView source={source} t={ctx().t}>
          {(data) => (
            <>
              <div class="nsvx-of__picks" role="group" aria-label={ctx().lt("folder")}>
                <For each={data().folders.filter((row) => row.count || folder() === row.code)} keyed={(row) => row.code}>
                  {(row) => (
                    <button
                      type="button"
                      class={["nsvx-of__pick", { "nsvx-of__pick--on": folder() === row().code }]}
                      aria-pressed={folder() === row().code ? "true" : "false"}
                      title={row().label}
                      onClick={() => pickFolder(row().code)}
                    >
                      {row().code} {row().label} · {row().count}
                    </button>
                  )}
                </For>
              </div>
              <ul class="nsvx-of__grid" style={{ margin: 0, padding: 0, "list-style": "none" }}>
                <For
                  each={rows()}
                  keyed={(row) => row.id}
                  fallback={<p class="nsvx__empty">{ctx().lt("noProofs")}</p>}
                >
                  {(row, index) => (
                    <li>
                      <button type="button" class="nsvx-of__proof" onClick={() => setOpened(row().id)}>
                        <Thumb ctx={ctx()} row={row()} image={proofHasPages(row()) && index() < THUMBS} />
                        <span class="nsvx-of__main">
                          <span class="nsvx-of__bar">
                            <strong class="nsvx-of__ref">{row().code}</strong>
                            <Show when={proofNeedsLook(row())}>
                              <Pill tone="warn" icon="alert">
                                {ctx().lt(
                                  row().partition_required ? "checkRows" : `ex_${row().extraction_state}`,
                                )}
                              </Pill>
                            </Show>
                            <Show when={row().privileged}>
                              <Pill tone="warn" icon="lock">
                                {ctx().lt("private")}
                              </Pill>
                            </Show>
                            <Show when={row().derivative_kind}>
                              <Pill>{ctx().lt(`derived_${row().derivative_kind}`)}</Pill>
                            </Show>
                          </span>
                          <span>{row().name}</span>
                          <span class="nsvx-of__sub">
                            {row().doc_date ? shortDay(row().doc_date, ctx().locale) : ctx().lt("noDate")}
                            {row().size ? ` · ${sizeWord(row().size)}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </>
          )}
        </SourceView>
      </Show>
    </div>
  );
}
