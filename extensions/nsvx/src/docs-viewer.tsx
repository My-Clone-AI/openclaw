/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { ConfirmButton, createAction, Note, view } from "./device-kit.js";
import { categoryGroups, categoryLabel, pct, type Category, type DocDetail } from "./docs-data.js";
import type { DocsKey } from "./docs-i18n.js";
import {
  DocPill,
  docsChange,
  PageImage,
  saveDocFile,
  signChange,
  SourceMark,
  type DocsCtx,
} from "./docs-ui.js";
import { Field, Panel, Toggle } from "./office-kit.js";
import { age, createSource, Icon, SourceView } from "./ui-kit.js";

type Ask = {
  kind: "triage" | "explain" | "why";
  text: string;
  category?: string | null;
  uncertain?: boolean;
};

/** Page images with a pager; NSVX answers not found past the last page, which ends the pager there. */
function Pages(props: { ctx: DocsCtx; id: string; image: boolean }) {
  const [page, setPage] = createSignal(1);
  const [last, setLast] = createSignal<number>();
  return (
    <div class="nsvx-docs__pages">
      <For each={[page()]} keyed={(n) => n}>
        {(n) => (
          <PageImage
            ctx={props.ctx}
            view="archivePage"
            params={{ id: props.id, n: String(n()), width: "1100" }}
            alt={`${props.ctx.kt("page")} ${n()}`}
            onEnd={() => {
              if (n() > 1) {
                setLast(n() - 1);
                setPage(n() - 1);
              }
            }}
          />
        )}
      </For>
      <Show when={!props.image}>
        <div class="nsvx-docs__pager">
          <button
            type="button"
            class="nsvx__button nsvx__button--icon"
            aria-label={props.ctx.kt("prev")}
            disabled={page() <= 1}
            onClick={() => setPage(page() - 1)}
          >
            <Icon name="back" />
          </button>
          <span aria-live="polite">
            {page()}
            <Show when={last()}>{(end) => ` / ${end()}`}</Show>
          </span>
          <button
            type="button"
            class="nsvx__button nsvx__button--icon"
            aria-label={props.ctx.kt("next")}
            disabled={last() !== undefined && page() >= (last() ?? 0)}
            onClick={() => setPage(page() + 1)}
          >
            <Icon name="forward" />
          </button>
        </div>
      </Show>
    </div>
  );
}

/** NSVX's AI help: a category suggestion to accept, a plain summary, or why it was filed. Nothing is saved by asking. */
function Helpers(props: { ctx: DocsCtx; doc: DocDetail; cats: Category[]; onSaved: () => void }) {
  const kt = () => props.ctx.kt;
  const action = createAction(() => props.ctx);
  const [answer, setAnswer] = createSignal<Ask>();
  const ask = (kind: Ask["kind"]) =>
    void action.run(async () => {
      const raw = await props.ctx.host.request<Record<string, unknown>>("nsvx.docs.ask", {
        kind,
        id: props.doc.id,
      });
      const text =
        kind === "triage" ? raw.explanation : kind === "explain" ? raw.text : raw.explanation;
      if (raw.unavailable === true || (typeof text !== "string" && !raw.category)) {
        throw new Error(kt()("noAnswer"));
      }
      setAnswer({
        kind,
        text: typeof text === "string" ? text.slice(0, 1200) : "",
        category: typeof raw.category === "string" ? raw.category : null,
        uncertain: raw.uncertain === true,
      });
    });
  const label = (code: string | null | undefined) => {
    const found = props.cats.find((item) => item.code === code);
    return found ? categoryLabel(found, props.ctx.locale) : (code ?? "");
  };
  return (
    <div class="nsvx-docs__helpers">
      <div class="nsvx-docs__actions">
        <button
          type="button"
          class="nsvx__button"
          disabled={action.busy()}
          onClick={() => ask("triage")}
        >
          <Icon name="spark" />
          <span>{kt()("suggest")}</span>
        </button>
        <Show when={props.doc.text_excerpt}>
          <button
            type="button"
            class="nsvx__button"
            disabled={action.busy()}
            onClick={() => ask("explain")}
          >
            <Icon name="ask" />
            <span>{kt()("explain")}</span>
          </button>
        </Show>
        <button
          type="button"
          class="nsvx__button"
          disabled={action.busy()}
          onClick={() => ask("why")}
        >
          <Icon name="find" />
          <span>{kt()("why")}</span>
        </button>
      </div>
      <Note note={action.note()} />
      <Show when={answer()}>
        {(shown) => (
          <div class="nsvx-docs__answer" role="status">
            <Show when={shown().kind === "triage"}>
              <strong>
                <Icon name="spark" /> {label(shown().category) || kt()("noAnswer")}
              </strong>
            </Show>
            <Show when={shown().uncertain}>
              <span class="nsvx-of__warn">
                <Icon name="alert" /> {kt()("checkDoc")}
              </span>
            </Show>
            <Show when={shown().text}>
              <p>{shown().text}</p>
            </Show>
            <Show when={shown().kind === "triage" && shown().category}>
              <div class="nsvx-docs__actions">
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={action.busy()}
                  onClick={() =>
                    void action.run(async () => {
                      await docsChange(props.ctx.host, {
                        action: "correct",
                        id: props.doc.id,
                        subcategory: shown().category,
                      });
                      setAnswer(undefined);
                      props.onSaved();
                    }, kt()("saved"))
                  }
                >
                  <Icon name="done" />
                  <span>{kt()("accept")}</span>
                </button>
                <button type="button" class="nsvx__button" onClick={() => setAnswer(undefined)}>
                  {kt()("change")}
                </button>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

/** The fields NSVX read from the document; only changed ones are sent, and "always" teaches NSVX the issuer. */
function Editor(props: { ctx: DocsCtx; doc: DocDetail; cats: Category[]; onSaved: () => void }) {
  const kt = () => props.ctx.kt;
  const action = createAction(() => props.ctx);
  const doc = () => props.doc;
  const [name, setName] = createSignal(props.doc.current_name);
  const [sub, setSub] = createSignal(props.doc.subcategory ?? "");
  const [type, setType] = createSignal(props.doc.document_type ?? "");
  const [date, setDate] = createSignal(props.doc.document_date ?? "");
  const [number, setNumber] = createSignal(props.doc.document_number ?? "");
  const [start, setStart] = createSignal(props.doc.period_start ?? "");
  const [end, setEnd] = createSignal(props.doc.period_end ?? "");
  const [issuer, setIssuer] = createSignal(props.doc.issuer ?? "");
  const [remember, setRemember] = createSignal(false);
  const changes = createMemo(() => {
    const out: Record<string, string> = {};
    const pairs = [
      ["subcategory", sub(), doc().subcategory],
      ["documentType", type(), doc().document_type],
      ["documentDate", date(), doc().document_date],
      ["number", number(), doc().document_number],
      ["periodStart", start(), doc().period_start],
      ["periodEnd", end(), doc().period_end],
      ["issuer", issuer(), doc().issuer],
    ] as const;
    for (const [key, value, was] of pairs) {
      if (value !== (was ?? "")) {
        out[key] = value;
      }
    }
    return out;
  });
  const dirty = () => Object.keys(changes()).length > 0;
  const groups = createMemo(() => categoryGroups(props.cats));
  return (
    <form
      class="nsvx-of__form nsvx-docs__editor"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await docsChange(props.ctx.host, {
            action: "correct",
            id: doc().id,
            ...changes(),
            ...(remember() ? { remember: true } : {}),
          });
          props.onSaved();
        }, kt()("saved"));
      }}
    >
      <div class="nsvx-docs__rename nsvx-of__wide">
        <Field label={kt()("name")} value={name()} max={160} onInput={setName} />
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={kt()("rename")}
          title={kt()("rename")}
          disabled={
            action.busy() || name().trim() === doc().current_name || name().trim().length < 2
          }
          onClick={() =>
            void action.run(async () => {
              await docsChange(props.ctx.host, {
                action: "rename",
                id: doc().id,
                name: name().trim(),
              });
              props.onSaved();
            }, kt()("saved"))
          }
        >
          <Icon name="done" />
        </button>
      </div>
      <Show when={doc().original_name !== doc().current_name}>
        <p class="nsvx-of__muted nsvx-of__wide">
          {kt()("original")}: {doc().original_name}
        </p>
      </Show>
      <label class="nsvx-of__field nsvx-of__wide">
        <span>{kt()("category")}</span>
        <select value={sub()} onChange={(event) => setSub(event.currentTarget.value)}>
          <Show when={!sub()}>
            <option value="">—</option>
          </Show>
          <For each={groups()} keyed={(group) => group.top.code}>
            {(group) => (
              <optgroup label={categoryLabel(group().top, props.ctx.locale)}>
                <For each={group().subs} keyed={(item) => item.code}>
                  {(item) => (
                    <option value={item().code} selected={item().code === sub()}>
                      {categoryLabel(item(), props.ctx.locale)}
                    </option>
                  )}
                </For>
              </optgroup>
            )}
          </For>
        </select>
      </label>
      <Field label={kt()("type")} value={type()} max={80} onInput={setType} />
      <Field label={kt()("issuer")} value={issuer()} max={120} onInput={setIssuer} />
      <Field label={kt()("date")} type="date" value={date()} onInput={setDate} />
      <Field label={kt()("number")} value={number()} max={60} onInput={setNumber} />
      <Field label={kt()("from")} type="date" value={start()} onInput={setStart} />
      <Field label={kt()("to")} type="date" value={end()} onInput={setEnd} />
      <Show when={dirty() && issuer().trim()}>
        <div class="nsvx-of__wide">
          <Toggle label={kt()("always")} checked={remember()} onChange={setRemember} />
        </div>
      </Show>
      <div class="nsvx-docs__actions nsvx-of__wide">
        <Show
          when={dirty()}
          fallback={
            <Show when={doc().review_status !== "confirmed"}>
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                disabled={action.busy()}
                onClick={() =>
                  void action.run(async () => {
                    await docsChange(props.ctx.host, { action: "approve", id: doc().id });
                    props.onSaved();
                  }, kt()("confirmed"))
                }
              >
                <Icon name="done" />
                <span>{kt()("looksRight")}</span>
              </button>
            </Show>
          }
        >
          <button type="submit" class="nsvx__button nsvx__button--primary" disabled={action.busy()}>
            <Icon name="done" />
            <span>{kt()("save")}</span>
          </button>
        </Show>
      </div>
      <Note note={action.note()} />
    </form>
  );
}

function History(props: { ctx: DocsCtx; doc: DocDetail }) {
  const kt = () => props.ctx.kt;
  return (
    <ol class="nsvx-of__timeline nsvx-docs__history">
      <For each={props.doc.names} keyed={false}>
        {(item) => (
          <li>
            <Icon name={item().scope === "drive" ? "sync" : "edit"} />
            <span class="nsvx-of__main">
              <strong>{item().new_name}</strong>
              <span class="nsvx-of__sub">
                {item().old_name ?? "—"} ·{" "}
                {item().result === "done"
                  ? age(item().created_at)
                  : (item().detail ?? item().result)}
              </span>
            </span>
          </li>
        )}
      </For>
      <For each={props.doc.events.toReversed()} keyed={false}>
        {(item) => (
          <li>
            <Icon name={item().actor === "owner" ? "user" : "bot"} />
            <span class="nsvx-of__main">
              <strong>{kt()(`ev_${item().kind}` as DocsKey) ?? item().kind}</strong>
              <span class="nsvx-of__sub">{age(item().created_at)}</span>
            </span>
          </li>
        )}
      </For>
    </ol>
  );
}

/** One NSVX document: pages, what NSVX read, AI help, fixes, and the owner's actions. */
export function DocViewer(props: { ctx: DocsCtx; id: string; onBack: () => void }) {
  const kt = () => props.ctx.kt;
  const doc = createSource(props.ctx.host, () =>
    view<DocDetail>(props.ctx.host, "archiveDoc", { id: props.id }),
  );
  const taxonomy = createSource(props.ctx.host, () =>
    view<{ categories: Category[] }>(props.ctx.host, "archiveTaxonomy"),
  );
  void doc.refresh();
  void taxonomy.refresh();
  const action = createAction(() => props.ctx);
  const [tab, setTab] = createSignal<"info" | "history">("info");
  return (
    <section class="nsvx-docs__viewer" aria-label={kt()("doc")}>
      <div class="nsvx-docs__top">
        <button type="button" class="nsvx__button" onClick={() => props.onBack()}>
          <Icon name="back" />
          <span>{kt()("back")}</span>
        </button>
      </div>
      <SourceView source={doc} t={props.ctx.t}>
        {(loaded) => {
          const d = () => loaded();
          const isPdf = () => d().mime.includes("pdf");
          return (
            <>
              <header class="nsvx-docs__head">
                <h3>{d().current_name}</h3>
                <span class="nsvx-docs__meta">
                  <DocPill doc={d()} kt={kt()} />
                  <SourceMark source={d().source} kt={kt()} />
                  <span class="nsvx-of__muted">
                    {age(d().imported_at)}
                    <Show when={pct(d().confidence)}>{(value) => ` · ${value()}`}</Show>
                  </span>
                </span>
              </header>
              <div class="nsvx-docs__split">
                <Pages ctx={props.ctx} id={d().id} image={d().mime.startsWith("image/")} />
                <div class="nsvx-docs__side">
                  <Show when={d().review_reasons.length > 0}>
                    <ul class="nsvx-docs__reasons">
                      <For each={d().review_reasons} keyed={false}>
                        {(reason) => (
                          <li>
                            <Icon name="alert" />
                            <span>
                              {kt()(`why_${reason().replace(/[:]/g, "_")}` as DocsKey) ??
                                reason().replace(/[_:]/g, " ")}
                            </span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                  <div class="nsvx-docs__links">
                    <Show when={d().account}>
                      {(account) => (
                        <span>
                          <Icon name="bank" />{" "}
                          {[account().bank, account().label, account().masked]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                      )}
                    </Show>
                    <Show when={d().entity}>
                      {(entity) => (
                        <span>
                          <Icon name="user" /> {entity().label}
                        </span>
                      )}
                    </Show>
                    <Show when={d().property}>
                      {(home) => (
                        <span>
                          <Icon name="homes" /> {home().name}
                        </span>
                      )}
                    </Show>
                    <Show
                      when={d().filing?.receipt?.verified ? d().filing?.receipt?.path : undefined}
                    >
                      {(path) => (
                        <span>
                          <Icon name="folder" /> {path()}
                        </span>
                      )}
                    </Show>
                  </div>
                  <Helpers
                    ctx={props.ctx}
                    doc={d()}
                    cats={taxonomy.state().data?.categories ?? []}
                    onSaved={() => void doc.refresh()}
                  />
                  <div class="nsvx-seg" role="radiogroup" aria-label={kt()("doc")}>
                    <For each={["info", "history"] as const} keyed={false}>
                      {(item) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={tab() === item() ? "true" : "false"}
                          class={["nsvx-seg__item", { "nsvx-seg__item--on": tab() === item() }]}
                          onClick={() => setTab(item())}
                        >
                          <Icon name={item() === "info" ? "doc" : "history"} />
                          <span>{kt()(item())}</span>
                        </button>
                      )}
                    </For>
                  </div>
                  <Show when={tab() === "info"} fallback={<History ctx={props.ctx} doc={d()} />}>
                    <For
                      each={[
                        `${d().id}:${d().subcategory}:${d().current_name}:${d().review_status}`,
                      ]}
                      keyed={(key) => key}
                    >
                      {() => (
                        <Editor
                          ctx={props.ctx}
                          doc={d()}
                          cats={taxonomy.state().data?.categories ?? []}
                          onSaved={() => void doc.refresh()}
                        />
                      )}
                    </For>
                  </Show>
                </div>
              </div>
              <Panel title={kt()("do")} icon="actions">
                <div class="nsvx-docs__actions">
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={action.busy()}
                    onClick={() =>
                      void action.run(() =>
                        saveDocFile(props.ctx.host, { kind: "content", id: d().id }),
                      )
                    }
                  >
                    <Icon name="download" />
                    <span>{kt()("download")}</span>
                  </button>
                  <Show when={isPdf()}>
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={action.busy()}
                      onClick={() =>
                        void action.run(async () => {
                          const source = await view<{ document_id: string | null }>(
                            props.ctx.host,
                            "signatureSource",
                            {
                              id: d().id,
                            },
                          );
                          const signId =
                            source.document_id ??
                            (
                              await signChange<{ id: string }>(props.ctx.host, {
                                action: "fromDoc",
                                id: d().id,
                              })
                            ).id;
                          props.ctx.onSign(signId);
                        })
                      }
                    >
                      <Icon name="edit" />
                      <span>{kt()("signIt")}</span>
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={action.busy()}
                    onClick={() =>
                      void action.run(async () => {
                        await docsChange(props.ctx.host, { action: "reprocess", id: d().id });
                        void doc.refresh();
                      }, kt()("readingAgain"))
                    }
                  >
                    <Icon name="refresh" />
                    <span>{kt()("readAgain")}</span>
                  </button>
                  <ConfirmButton
                    label={kt()("forget")}
                    confirm={d().source === "drive" ? kt()("forgetDrive") : kt()("forgetNow")}
                    cancel={props.ctx.dt("cancel")}
                    icon="trash"
                    danger
                    disabled={action.busy()}
                    onConfirm={() =>
                      void action.run(async () => {
                        await docsChange(props.ctx.host, { action: "forget", id: d().id });
                        props.onBack();
                      })
                    }
                  />
                </div>
                <Note note={action.note()} />
              </Panel>
            </>
          );
        }}
      </SourceView>
    </section>
  );
}
