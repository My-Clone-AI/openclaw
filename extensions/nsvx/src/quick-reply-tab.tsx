/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import {
  detectPasted,
  failedGeneration,
  isPreparing,
  replyText,
  type QuickReplyDraft,
} from "./messages-data.js";
import type { MT } from "./messages-i18n.js";
import { BrandLogo, ownerChange, Speak, waitForDraft } from "./messages-ui.js";
import { age, createSource, Icon, matches, SourceView, type T } from "./ui-kit.js";
import "./messages.css";

type Style = QuickReplyDraft["channel"];
const STYLES: Style[] = ["email", "message", "telegram"];

function StyleIcon(props: { style: Style }) {
  return (
    <Show
      when={props.style === "telegram"}
      fallback={<Icon name={props.style === "email" ? "mail" : "messages"} />}
    >
      <BrandLogo channel="telegram" size={16} />
    </Show>
  );
}

function Result(props: {
  host: ControlUiHost;
  mt: MT;
  draft: QuickReplyDraft;
  busy: boolean;
  onAgain: (change: string) => void;
  onDelete: () => void;
}) {
  const [change, setChange] = createSignal("");
  const [copied, setCopied] = createSignal(false);
  const copy = async () => {
    await navigator.clipboard.writeText(replyText(props.draft));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <section class="nsvx-qr__result" aria-busy={props.busy ? "true" : "false"}>
      <header class="nsvx-qr__result-head">
        <StyleIcon style={props.draft.channel} />
        <span class="nsvx-row__title">
          {props.draft.sender_name || props.draft.subject || props.mt("reply")}
        </span>
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={props.mt("delete")}
          title={props.mt("delete")}
          disabled={props.busy || !props.host.connection.canWrite}
          onClick={() => props.onDelete()}
        >
          <Icon name="trash" />
        </button>
      </header>
      <Show
        when={props.draft.reply}
        fallback={
          <p class="nsvx__notice" role="status">
            {isPreparing(props.draft) ? props.mt("drafting") : props.mt("draftFailed")}
          </p>
        }
      >
        <p class="nsvx-qr__reply">{replyText(props.draft)}</p>
        <div class="nsvx-qr__again">
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            onClick={() => void copy()}
          >
            <Icon name={copied() ? "done" : "copy"} />
            {props.mt(copied() ? "copied" : "copy")}
          </button>
          <input
            class="nsvx__search"
            type="text"
            aria-label={props.mt("again")}
            placeholder={props.mt("change")}
            value={change()}
            onInput={(event) => setChange(event.currentTarget.value)}
          />
          <button
            type="button"
            class="nsvx__button"
            disabled={props.busy || !props.host.connection.canWrite}
            onClick={() => {
              props.onAgain(change().trim());
              setChange("");
            }}
          >
            <Icon name="reply" />
            {props.mt("again")}
          </button>
        </div>
      </Show>
    </section>
  );
}

/** NSVX Quick Reply: paste a message, get a reply in the owner's style, copy it. Nothing is sent. */
export function QuickReplyTab(props: {
  host: ControlUiHost;
  t: T;
  mt: MT;
  locale: string;
  query: string;
  open: string | undefined;
  onOpen: (id: string | undefined) => void;
}) {
  const [inbound, setInbound] = createSignal("");
  const [style, setStyle] = createSignal<Style>("email");
  const [sender, setSender] = createSignal("");
  const [subject, setSubject] = createSignal("");
  const [guidance, setGuidance] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [current, setCurrent] = createSignal<QuickReplyDraft>();
  // Fields the owner typed are never overwritten by what a paste suggests.
  const touched = new Set<string>();
  const history = createSource(props.host, () =>
    props.host.request<{ drafts: QuickReplyDraft[] }>("nsvx.view", { view: "quickReplyDrafts" }),
  );
  void history.refresh();

  const follow = async (draftId: string) => {
    const result = await ownerChange(props.host, props.mt, async () => {
      const first = await props.host.request<QuickReplyDraft>("nsvx.view", {
        view: "quickReplyDraft",
        params: { id: draftId },
      });
      setCurrent(first);
      return isPreparing(first)
        ? waitForDraft<QuickReplyDraft>(props.host, draftId, isPreparing)
        : first;
    });
    if (result.ok) {
      setCurrent(result.value);
      const failed = failedGeneration(result.value);
      setError(failed ? `${props.mt("draftFailed")} · ${failed}` : "");
    } else {
      setError(result.message);
    }
  };
  if (props.open) {
    void follow(props.open);
  }

  const run = async (start: () => Promise<{ draft: QuickReplyDraft }>) => {
    setBusy(true);
    setError("");
    const started = await ownerChange(props.host, props.mt, start);
    if (started.ok) {
      setCurrent(started.value.draft);
      props.onOpen(started.value.draft.id);
      await follow(started.value.draft.id);
      void history.refresh();
    } else {
      setError(started.message);
    }
    setBusy(false);
  };
  const write = () =>
    run(() =>
      props.host.request("nsvx.quickReply.start", {
        key: crypto.randomUUID(),
        channel: style(),
        inbound: inbound(),
        sender: sender(),
        subject: style() === "email" ? subject() : "",
        guidance: guidance(),
      }),
    );
  const again = (draftId: string, refinement: string) =>
    run(() =>
      props.host.request("nsvx.quickReply.regenerate", {
        key: crypto.randomUUID(),
        draftId,
        refinement,
      }),
    );
  const remove = async (draftId: string) => {
    setBusy(true);
    const result = await ownerChange(props.host, props.mt, () =>
      props.host.request("nsvx.quickReply.delete", { draftId }),
    );
    setBusy(false);
    if (result.ok) {
      setCurrent(undefined);
      props.onOpen(undefined);
      void history.refresh();
    } else {
      setError(result.message);
    }
  };
  const paste = (value: string) => {
    setInbound(value);
    const found = detectPasted(value);
    if (!touched.has("style")) {
      setStyle(found.channel);
    }
    if (!touched.has("sender") && found.sender) {
      setSender(found.sender);
    }
    if (!touched.has("subject") && found.subject) {
      setSubject(found.subject);
    }
  };

  return (
    <div class="nsvx-qr">
      <form
        class="nsvx-qr__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (inbound().trim() && !busy()) {
            void write();
          }
        }}
      >
        <textarea
          class="nsvx-qr__paste"
          aria-label={props.mt("pasteHere")}
          placeholder={props.mt("pasteHere")}
          rows={6}
          value={inbound()}
          onInput={(event) => paste(event.currentTarget.value)}
        />
        <div class="nsvx-qr__fields">
          <div class="nsvx-segment" role="group">
            <For each={STYLES}>
              {(id) => (
                <button
                  type="button"
                  aria-pressed={style() === id ? "true" : "false"}
                  aria-label={props.mt(id)}
                  title={props.mt(id)}
                  onClick={() => {
                    touched.add("style");
                    setStyle(id);
                  }}
                >
                  <StyleIcon style={id} />
                </button>
              )}
            </For>
          </div>
          <input
            class="nsvx__search"
            type="text"
            aria-label={props.mt("from")}
            placeholder={props.mt("from")}
            value={sender()}
            onInput={(event) => {
              touched.add("sender");
              setSender(event.currentTarget.value);
            }}
          />
          <Show when={style() === "email"}>
            <input
              class="nsvx__search"
              type="text"
              aria-label={props.mt("subject")}
              placeholder={props.mt("subject")}
              value={subject()}
              onInput={(event) => {
                touched.add("subject");
                setSubject(event.currentTarget.value);
              }}
            />
          </Show>
        </div>
        <div class="nsvx-qr__fields">
          <input
            class="nsvx__search"
            type="text"
            aria-label={props.mt("guidance")}
            placeholder={props.mt("guidance")}
            value={guidance()}
            onInput={(event) => setGuidance(event.currentTarget.value)}
          />
          <Speak
            locale={props.locale}
            mt={props.mt}
            onText={(said) => setGuidance(guidance() ? `${guidance()} ${said}` : said)}
          />
          <button
            type="submit"
            class="nsvx__button nsvx__button--primary"
            disabled={busy() || !inbound().trim() || !props.host.connection.canWrite}
          >
            <Icon name="reply" />
            {props.mt(busy() ? "drafting" : "write")}
          </button>
        </div>
      </form>
      <Show when={error()}>
        <p class="nsvx__notice nsvx__notice--bad" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={current()}>
        {(draft) => (
          <Result
            host={props.host}
            mt={props.mt}
            draft={draft()}
            busy={busy()}
            onAgain={(change) => void again(draft().id, change)}
            onDelete={() => void remove(draft().id)}
          />
        )}
      </Show>
      <h2 class="nsvx__heading">{props.mt("recent")}</h2>
      <SourceView source={history} t={props.t}>
        {(data) => {
          const shown = () =>
            data().drafts.filter((d) =>
              matches(props.query, d.sender_name, d.subject, d.inbound, d.reply?.body),
            );
          return (
            <>
              <ul class="nsvx-list">
                <For each={shown()} keyed={(d) => d.id}>
                  {(d) => (
                    <li>
                      <button
                        type="button"
                        class={[
                          "nsvx-row",
                          "nsvx-row--link",
                          { "nsvx-conv--current": current()?.id === d().id },
                        ]}
                        onClick={() => {
                          props.onOpen(d().id);
                          void follow(d().id);
                        }}
                      >
                        <StyleIcon style={d().channel} />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">
                            {d().sender_name || d().subject || d().inbound.slice(0, 60)}
                          </span>
                          <span class="nsvx-row__detail">
                            {d().reply?.body ?? d().inbound.slice(0, 120)}
                          </span>
                        </span>
                        <Show when={d().reply}>
                          <Icon name="done" class="nsvx-row__icon nsvx-row__icon--ok" />
                        </Show>
                        <span class="nsvx-row__age">{age(d().updated_at)}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={shown().length === 0}>
                <p class="nsvx__empty">{props.t(props.query ? "noResults" : "nothing")}</p>
              </Show>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}
