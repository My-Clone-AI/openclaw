/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import {
  fileToBase64,
  proofHasPages,
  proofNeedsLook,
  sheetPickable,
  shortDay,
  type CaseDetail,
  type Evidence,
  type SheetReview,
  type SheetRow,
} from "./legal-data.js";
import { changeCaseRequest, type LegalCtx } from "./legal-kit.js";
import { THUMBS, Thumb, Viewer } from "./legal-viewer.js";
import { every } from "./messages-ui.js";
import { Choice, Field, Pill, Reveal, Toggle, sizeWord } from "./office-kit.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

type EvidenceList = {
  evidence: Evidence[];
  folders: { code: string; label: string; count: number }[];
};

function DrivePicker(props: {
  ctx: LegalCtx;
  caseRef: string;
  folder: string;
  close: () => void;
  onDone: () => void;
}) {
  const ctx = () => props.ctx;
  const [query, setQuery] = createSignal("");
  const [found, setFound] =
    createSignal<{ file_id: string; name: string; path: string; modified: string | null }[]>();
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
          <button
            type="submit"
            class="nsvx__button"
            disabled={action.busy() || query().trim().length < 2}
          >
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
              options={[["", "—"], ...props.row.parties.map((row) => [row.id, row.name] as const)]}
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
              <Pill
                tone={
                  current().state === "ready" ? "ok" : current().state === "failed" ? "bad" : "run"
                }
              >
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
              <Toggle
                label={ctx().lt("confirmedPerson")}
                checked={confirmed()}
                onChange={setConfirmed}
              />
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
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={action.busy()}
                  onClick={() => start(true)}
                >
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
          <label
            class={["nsvx__button", "nsvx__button--primary", { "nsvx-of__muted": !canWrite() }]}
          >
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
                <For
                  each={data().folders.filter((row) => row.count || folder() === row.code)}
                  keyed={(row) => row.code}
                >
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
                      <button
                        type="button"
                        class="nsvx-of__proof"
                        onClick={() => setOpened(row().id)}
                      >
                        <Thumb
                          ctx={ctx()}
                          row={row()}
                          image={proofHasPages(row()) && index() < THUMBS}
                        />
                        <span class="nsvx-of__main">
                          <span class="nsvx-of__bar">
                            <strong class="nsvx-of__ref">{row().code}</strong>
                            <Show when={proofNeedsLook(row())}>
                              <Pill tone="warn" icon="alert">
                                {ctx().lt(
                                  row().partition_required
                                    ? "checkRows"
                                    : `ex_${row().extraction_state}`,
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
                            {row().doc_date
                              ? shortDay(row().doc_date, ctx().locale)
                              : ctx().lt("noDate")}
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
