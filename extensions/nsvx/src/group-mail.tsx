/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  bytes,
  emails,
  isAdult,
  mailActionsFor,
  mailText,
  type Mailbox,
  type MailMessage,
  type MailPage,
} from "./group-data.js";
import { Glyph, view, AppMark, newKey, stamp, isUncertain, type Ctx } from "./group-ui.js";
import { createSource, errorMessage, SourceView } from "./ui-kit.js";

type Compose = {
  mode: "reply" | "replyAll" | "forward" | "new";
  message?: MailMessage;
  box: Mailbox;
};

function Composer(props: { ctx: Ctx; compose: Compose; onClose: () => void }) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  const m = props.compose.message;
  const mode = props.compose.mode;
  const box = props.compose.box;
  const [to, setTo] = createSignal(
    mode === "reply" || mode === "replyAll" ? emails(m?.from ?? []) : "",
  );
  const [cc, setCc] = createSignal(
    mode === "replyAll"
      ? emails(
          [...(m?.to ?? []), ...(m?.cc ?? [])].filter(
            (a) => a.email.toLowerCase() !== box.address.toLowerCase(),
          ),
        )
      : "",
  );
  const [subject, setSubject] = createSignal(
    m ? `${mode === "forward" ? "Fwd:" : "Re:"} ${m.subject}` : "",
  );
  const [text, setText] = createSignal(mode === "forward" ? mailText(m?.html) : "");
  const [draft, setDraft] = createSignal<string>();
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const [sent, setSent] = createSignal(false);
  // One key per draft: an uncertain send repeated with it returns NSVX's first receipt.
  let key = newKey();
  const split = (value: string) =>
    value
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
  const changed = () => {
    setDraft(undefined);
    setConfirming(false);
    key = newKey();
  };
  const save = async (thenConfirm: boolean) => {
    setBusy(true);
    setNote(undefined);
    try {
      if (!draft()) {
        const answer = await host.request<{ draftId: string }>("nsvx.group.mailDraft", {
          cid: box.app,
          box: box.box,
          mode,
          inReplyTo: m?.id ?? null,
          to: split(to()),
          cc: split(cc()),
          subject: subject(),
          text: text(),
        });
        setDraft(answer.draftId);
      }
      if (thenConfirm) {
        setConfirming(true);
      } else {
        setNote({ text: g("saved"), bad: false });
      }
    } catch (cause) {
      setNote({ text: errorMessage(host, cause), bad: true });
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setBusy(true);
    setNote(undefined);
    try {
      const answer = await host.request<{ status: string }>("nsvx.group.mailSend", {
        cid: box.app,
        box: box.box,
        draftId: draft(),
        idempotencyKey: key,
      });
      setSent(true);
      setConfirming(false);
      setNote({
        text: answer.status === "sent" ? g("sent") : g("uncertain"),
        bad: answer.status !== "sent",
      });
    } catch (cause) {
      setNote({ text: isUncertain(cause) ? g("uncertain") : errorMessage(host, cause), bad: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="nsvx-grp__panel" aria-label={g(mode === "new" ? "new" : mode)}>
      <header class="nsvx-grp__panel-head">
        <strong>{g(mode === "new" ? "new" : mode)}</strong>
        <span class="nsvx__chip">{box.address}</span>
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={g("cancel")}
          disabled={busy()}
          onClick={() => props.onClose()}
        >
          <Glyph name="close" />
        </button>
      </header>
      <fieldset class="nsvx-grp__form" disabled={busy() || sent() || confirming()}>
        <label class="nsvx-field">
          <span>{g("to")}</span>
          <input
            type="email"
            multiple
            required
            value={to()}
            onInput={(event) => {
              setTo(event.currentTarget.value);
              changed();
            }}
          />
        </label>
        <label class="nsvx-field">
          <span>{g("cc")}</span>
          <input
            type="email"
            multiple
            value={cc()}
            onInput={(event) => {
              setCc(event.currentTarget.value);
              changed();
            }}
          />
        </label>
        <label class="nsvx-field">
          <span>{g("subject")}</span>
          <input
            value={subject()}
            onInput={(event) => {
              setSubject(event.currentTarget.value);
              changed();
            }}
          />
        </label>
        <label class="nsvx-field">
          <span>{g("message")}</span>
          <textarea
            rows={7}
            value={text()}
            onInput={(event) => {
              setText(event.currentTarget.value);
              changed();
            }}
          />
        </label>
        <div class="nsvx-grp__acts">
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            disabled={!to().trim()}
            onClick={() => void save(true)}
          >
            <Glyph name="send" />
            {g("send")}
          </button>
          <button
            type="button"
            class="nsvx__button"
            disabled={!to().trim()}
            onClick={() => void save(false)}
          >
            {g("save")}
          </button>
        </div>
      </fieldset>
      <Show when={confirming()}>
        <div class="nsvx-grp__preview" role="group" aria-label={g("confirm")}>
          <dl class="nsvx-grp__fields">
            <div>
              <dt>{g("from")}</dt>
              <dd>{box.address}</dd>
            </div>
            <div>
              <dt>{g("to")}</dt>
              <dd>{to()}</dd>
            </div>
            <div>
              <dt>{g("subject")}</dt>
              <dd>{subject() || "—"}</dd>
            </div>
          </dl>
          <div class="nsvx-grp__acts">
            <button
              type="button"
              class="nsvx__button nsvx__button--primary"
              disabled={busy()}
              onClick={() => void send()}
            >
              {g("sendNow")}
            </button>
            <button
              type="button"
              class="nsvx__button"
              disabled={busy()}
              onClick={() => setConfirming(false)}
            >
              {g("cancel")}
            </button>
          </div>
        </div>
      </Show>
      <Show when={note()}>
        {(n) => (
          <p class={["nsvx-grp__note", { "nsvx-grp__note--bad": n().bad }]} role="status">
            {n().text}
          </p>
        )}
      </Show>
    </section>
  );
}

export function Mail(props: { ctx: Ctx }) {
  const host = props.ctx.host;
  const overview = createSource(host, () =>
    view<{ configured: boolean; mailboxes: Mailbox[] }>(host, "groupMail"),
  );
  void overview.refresh();
  return (
    <SourceView source={overview} t={props.ctx.t}>
      {(data) => (
        <Show
          when={data().configured}
          fallback={<p class="nsvx__empty">{props.ctx.g("mailOff")}</p>}
        >
          <Inbox ctx={props.ctx} boxes={data().mailboxes.filter((b) => !isAdult({ id: b.app }))} />
        </Show>
      )}
    </SourceView>
  );
}

function Inbox(props: { ctx: Ctx; boxes: Mailbox[] }) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  // Request inputs live in plain fields: a signal read right after its write still returns the old value.
  const ask = {
    selection: "",
    unread: false,
    files: false,
    cursor: "",
    search: "",
    open: undefined as MailMessage | undefined,
  };
  const [selection, setSelection] = createSignal("");
  const [unread, setUnread] = createSignal(false);
  const [files, setFiles] = createSignal(false);
  const [cursor, setCursor] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [opened, setOpened] = createSignal<MailMessage>();
  const [compose, setCompose] = createSignal<Compose>();
  const [note, setNote] = createSignal<string>();
  const boxes = () => props.boxes;
  const selected = createMemo(() => boxes().find((b) => `${b.app}:${b.box}` === selection()));
  const list = createSource(host, () => {
    const box = boxes().find((b) => `${b.app}:${b.box}` === ask.selection);
    const filters = {
      ...(ask.search ? { q: ask.search } : {}),
      ...(ask.unread ? { unread: "true" } : {}),
      ...(ask.files ? { hasAttachment: "true" } : {}),
      ...(ask.cursor ? { cursor: ask.cursor } : {}),
    };
    return box
      ? view<MailPage>(host, "groupMailboxThreads", { cid: box.app, box: box.box, ...filters })
      : view<MailPage>(host, "groupMailThreads", filters);
  });
  const thread = createSource(host, () => {
    const m = ask.open;
    return view<{ messages: MailMessage[] }>(host, "groupMailThread", {
      cid: m?.app ?? "",
      tid: m?.threadId ?? "",
      box: m?.box ?? "hi",
    });
  });
  const reload = () => {
    ask.cursor = "";
    setCursor("");
    void list.refresh();
  };
  const openMessage = (m: MailMessage | undefined) => {
    ask.open = m;
    setOpened(m);
    if (m) {
      void thread.refresh();
    }
  };
  void list.refresh();
  const boxOf = (m: MailMessage) => boxes().find((b) => b.app === m.app && b.box === m.box);
  const act = async (action: string, m: MailMessage) => {
    setNote(undefined);
    try {
      await host.request("nsvx.group.mailAction", {
        cid: m.app,
        box: m.box,
        messageIds: [m.id],
        action,
      });
      if (["archive", "unarchive", "trash", "spam", "notSpam"].includes(action)) {
        openMessage(undefined);
      } else {
        void thread.refresh();
      }
      void list.refresh();
    } catch (cause) {
      setNote(isUncertain(cause) ? g("uncertain") : errorMessage(host, cause));
    }
  };
  return (
    <>
      <div class="nsvx-grp__bar">
        <label class="nsvx-field">
          <span class="nsvx-visually-hidden">{g("inbox")}</span>
          <select
            aria-label={g("inbox")}
            onChange={(event) => {
              ask.selection = event.currentTarget.value;
              setSelection(ask.selection);
              openMessage(undefined);
              reload();
            }}
          >
            <option value="">{g("all")}</option>
            <For each={boxes()} keyed={(b) => `${b.app}:${b.box}`}>
              {(b) => (
                <option
                  value={`${b().app}:${b().box}`}
                  selected={selection() === `${b().app}:${b().box}`}
                >
                  {b().address}
                  {b().unread ? ` (${b().unread})` : ""}
                </option>
              )}
            </For>
          </select>
        </label>
        <button
          type="button"
          class="nsvx-grp__chip nsvx-grp__chip--button"
          aria-pressed={unread() ? "true" : "false"}
          onClick={() => {
            ask.unread = !ask.unread;
            setUnread(ask.unread);
            reload();
          }}
        >
          ● {g("unread")}
        </button>
        <button
          type="button"
          class="nsvx-grp__chip nsvx-grp__chip--button"
          aria-pressed={files() ? "true" : "false"}
          onClick={() => {
            ask.files = !ask.files;
            setFiles(ask.files);
            reload();
          }}
        >
          <Glyph name="clip" class="nsvx-grp__stat-icon" />
          {g("files")}
        </button>
        <Show when={props.ctx.query.trim() !== search()}>
          <button
            type="button"
            class="nsvx__button"
            onClick={() => {
              ask.search = props.ctx.query.trim();
              setSearch(ask.search);
              reload();
            }}
          >
            ⌕ {props.ctx.query.trim() || g("all")}
          </button>
        </Show>
        <Show when={selected()?.sendEnabled}>
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            onClick={() => setCompose({ mode: "new", box: selected()! })}
          >
            + {g("new")}
          </button>
        </Show>
      </div>
      <Show when={compose()}>
        {(c) => (
          <Composer
            ctx={props.ctx}
            compose={c()}
            onClose={() => {
              setCompose(undefined);
              void list.refresh();
            }}
          />
        )}
      </Show>
      <Show when={note()}>
        <p class="nsvx-grp__note nsvx-grp__note--bad" role="alert">
          {note()}
        </p>
      </Show>
      <div class={["nsvx-grp__mail", { "nsvx-grp__mail--open": Boolean(opened()) }]}>
        <div class="nsvx-grp__mail-list">
          <SourceView source={list} t={props.ctx.t}>
            {(page) => (
              <>
                <ul class="nsvx-list">
                  <For
                    each={page().items.filter((m) => !isAdult(m))}
                    keyed={(m) => `${m.app}:${m.box}:${m.id}`}
                  >
                    {(m) => (
                      <li>
                        <button
                          type="button"
                          class={[
                            "nsvx-row",
                            "nsvx-row--link",
                            { "nsvx-grp__unread": m().unread === true },
                          ]}
                          aria-pressed={opened()?.id === m().id ? "true" : "false"}
                          onClick={() => openMessage(m())}
                        >
                          <AppMark id={m().app} name={m().app} size="sm" />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{m().subject || "—"}</span>
                            <span class="nsvx-row__detail">{emails(m().from)}</span>
                          </span>
                          <span class="nsvx-grp__when">
                            <Show when={m().hasAttachment}>
                              <Glyph name="clip" class="nsvx-grp__stat-icon" />
                            </Show>
                            <Show when={m().flagged}>
                              <Glyph name="star" class="nsvx-grp__stat-icon" />
                            </Show>
                            {stamp(props.ctx.locale, m().date)}
                          </span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={page().items.length === 0}>
                  <p class="nsvx__empty">{g("noMail")}</p>
                </Show>
                <For each={page().errors} keyed={(e) => e.app}>
                  {(e) => (
                    <p class="nsvx-grp__note nsvx-grp__note--bad">
                      {e().app} · {g("error")}
                    </p>
                  )}
                </For>
                <div class="nsvx-grp__acts">
                  <Show when={cursor()}>
                    <button type="button" class="nsvx__button" onClick={reload}>
                      {g("first")}
                    </button>
                  </Show>
                  <Show when={page().nextCursor}>
                    {(next) => (
                      <button
                        type="button"
                        class="nsvx__button"
                        onClick={() => {
                          ask.cursor = next();
                          setCursor(ask.cursor);
                          void list.refresh();
                        }}
                      >
                        {g("more")}
                      </button>
                    )}
                  </Show>
                </div>
              </>
            )}
          </SourceView>
        </div>
        <div class="nsvx-grp__reader">
          <Show when={opened()} fallback={<p class="nsvx__empty">{g("pickMail")}</p>}>
            <button
              type="button"
              class="nsvx__button nsvx-grp__back"
              onClick={() => openMessage(undefined)}
            >
              <Glyph name="back" />
              {g("back")}
            </button>
            <SourceView source={thread} t={props.ctx.t}>
              {(t) => (
                <For each={t().messages} keyed={(m) => m.id}>
                  {(m) => {
                    const box = () => boxOf(m());
                    return (
                      <article class="nsvx-grp__message">
                        <h3>{m().subject}</h3>
                        <p class="nsvx-grp__muted">
                          {emails(m().from)} → {emails(m().to)} ·{" "}
                          {stamp(props.ctx.locale, m().date)}
                        </p>
                        <Show when={box() && !box()!.actions.length && !box()!.sendEnabled}>
                          <span class="nsvx__chip">{g("readOnly")}</span>
                        </Show>
                        <div class="nsvx-grp__acts">
                          <For each={mailActionsFor(box(), m())} keyed={false}>
                            {(action) => (
                              <button
                                type="button"
                                class="nsvx__button"
                                onClick={() => void act(action(), m())}
                              >
                                {g(action())}
                              </button>
                            )}
                          </For>
                        </div>
                        <div class="nsvx-grp__body">{mailText(m().html)}</div>
                        <For each={m().attachments ?? []} keyed={(a) => a.blobId}>
                          {(a) => (
                            <span class="nsvx-grp__chip">
                              <Glyph name="clip" class="nsvx-grp__stat-icon" />
                              {a().name} · {bytes(a().size)}
                            </span>
                          )}
                        </For>
                        <Show when={box()?.sendEnabled}>
                          <div class="nsvx-grp__acts">
                            <For each={["reply", "replyAll", "forward"] as const} keyed={false}>
                              {(mode) => (
                                <button
                                  type="button"
                                  class="nsvx__button"
                                  onClick={() =>
                                    setCompose({ mode: mode(), message: m(), box: box()! })
                                  }
                                >
                                  {g(mode())}
                                </button>
                              )}
                            </For>
                          </div>
                        </Show>
                      </article>
                    );
                  }}
                </For>
              )}
            </SourceView>
          </Show>
        </div>
      </div>
    </>
  );
}
