/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import { createIntent, PrChip } from "./grow-apps.js";
import {
  IDEA_STEPS,
  ideaActions,
  ideaCounts,
  ideaProgress,
  ideaTone,
  type Idea,
  type IdeaAction,
  type IdeaList,
  type Tone,
} from "./grow-data.js";
import { growWord } from "./grow-i18n.js";
import type { GrowCtx } from "./grow-tab.js";
import { messagesTranslator } from "./messages-i18n.js";
import { Speak } from "./messages-ui.js";
import { Tiles } from "./owner-tabs.js";
import { IconButton } from "./people-ui.js";
import { age, createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

const ACTION_ICON: Record<IdeaAction, IconName> = {
  approve: "done",
  reject: "close",
  retry: "refresh",
  priority: "star",
  "merge-to-develop": "merge",
  "block-submitter": "lock",
};

type IdeaView = "all" | "open" | "done" | "needsYou";
const VIEW_TONE: Record<Exclude<IdeaView, "all">, Tone[]> = {
  open: ["run", "off"],
  done: ["ok"],
  needsYou: ["bad"],
};

const stateWord = (ctx: GrowCtx, idea: Pick<Idea, "state" | "held">) =>
  growWord(ctx.gt, idea.held ? "held" : idea.state);

function Ring(props: { value: number; label: string }) {
  return (
    <span
      class="nsvx-grow__ring"
      role="progressbar"
      aria-label={props.label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={String(props.value)}
      style={{ "--nsvx-grow-ring": `${props.value}%` }}
    >
      <span>{props.value}</span>
    </span>
  );
}

function Composer(props: { ctx: GrowCtx; onSent: () => void }) {
  const ctx = () => props.ctx;
  const action = createAction(ctx);
  const [text, setText] = createSignal("");
  const intent = createIntent();
  return (
    <form
      class="nsvx-dev__card nsvx-grow__composer"
      onSubmit={(event) => {
        event.preventDefault();
        void action
          .run(
            () =>
              ctx().host.request("nsvx.ideas.submit", {
                text: text(),
                idempotencyKey: intent.key(text()),
              }),
            ctx().gt("received"),
          )
          .then((ok) => {
            if (ok) {
              intent.done();
              setText("");
              props.onSent();
            }
          });
      }}
    >
      <label class="nsvx-field">
        <span>{ctx().gt("newIdea")}</span>
        <textarea
          rows="2"
          maxlength="4000"
          required
          placeholder={ctx().gt("ideaHint")}
          value={text()}
          onInput={(event) => setText(event.currentTarget.value)}
        />
      </label>
      <div class="nsvx-dev__bar">
        <Speak
          locale={ctx().locale}
          mt={messagesTranslator(ctx().locale)}
          onText={(said) => setText(text() ? `${text()} ${said}` : said)}
        />
        <span class="nsvx-row__detail">{text().length}/4000</span>
        <span class="nsvx-dev__spacer" />
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={!text().trim() || action.busy() || !ctx().host.connection.canWrite}
        >
          <Icon name="send" />
          <span>{ctx().gt("send")}</span>
        </button>
      </div>
      <Note note={action.note()} />
    </form>
  );
}

function Thumb(props: { ctx: GrowCtx; idea: Idea; attachment: string; index: number }) {
  const source = createSource(props.ctx.host, () =>
    props.idea.source === "replica"
      ? view<{ src: string }>(props.ctx.host, "buildMeReplicaImage", {
          app: props.idea.app_id,
          id: props.idea.id,
          attachment: props.attachment,
        })
      : view<{ src: string }>(props.ctx.host, "buildMeImage", {
          id: props.idea.id,
          attachment: props.attachment,
        }),
  );
  void source.refresh();
  const [big, setBig] = createSignal(false);
  return (
    <Show when={source.state().data}>
      {(image) => (
        <button
          type="button"
          class={["nsvx-grow__thumb", { "nsvx-grow__thumb--big": big() }]}
          aria-pressed={big() ? "true" : "false"}
          onClick={() => setBig(!big())}
        >
          <img src={image().src} alt={`${props.ctx.gt("images")} ${props.index + 1}`} />
        </button>
      )}
    </Show>
  );
}

function Steps(props: { ctx: GrowCtx; idea: Idea }) {
  const index = createMemo(() => IDEA_STEPS.indexOf(props.idea.state as never));
  return (
    <ol class="nsvx-grow__steps" aria-label={props.ctx.gt("progress")}>
      <For each={IDEA_STEPS} keyed={false}>
        {(step) => (
          <li
            class={[
              "nsvx-grow__step",
              { "nsvx-grow__step--on": index() >= 0 && IDEA_STEPS.indexOf(step()) <= index() },
            ]}
            aria-current={props.idea.state === step() ? "step" : undefined}
            title={growWord(props.ctx.gt, step())}
          >
            <span class="nsvx-grow__step-dot" aria-hidden="true" />
            <span class="nsvx-grow__step-label">{growWord(props.ctx.gt, step())}</span>
          </li>
        )}
      </For>
    </ol>
  );
}

function Decide(props: { ctx: GrowCtx; idea: Idea; onDone: () => void }) {
  const ctx = () => props.ctx;
  const action = createAction(ctx);
  const [chosen, setChosen] = createSignal<IdeaAction>();
  const [reason, setReason] = createSignal("");
  const [priority, setPriority] = createSignal(props.idea.priority ?? 50);
  const intent = createIntent();
  const submit = () => {
    const decision = chosen();
    if (!decision) {
      return;
    }
    const body = {
      ideaId: props.idea.id,
      decision,
      reason: reason().trim(),
      revision: props.idea.revision,
      version: props.idea.version,
      ...(decision === "priority" ? { priority: priority() } : {}),
    };
    void action.run(async () => {
      await ctx().host.request("nsvx.ideas.decide", { ...body, idempotencyKey: intent.key(body) });
      intent.done();
      setChosen(undefined);
      setReason("");
      props.onDone();
    }, ctx().gt("sent"));
  };
  return (
    <div class="nsvx-dev__stack">
      <div class="nsvx-dev__bar" role="group" aria-label={ctx().gt("confirm")}>
        <For each={ideaActions(props.idea)} keyed={false}>
          {(name) => (
            <button
              type="button"
              class={[
                "nsvx__button",
                {
                  "nsvx__button--primary": chosen() === name(),
                  "nsvx__button--danger": name() === "reject" || name() === "block-submitter",
                },
              ]}
              aria-pressed={chosen() === name() ? "true" : "false"}
              disabled={!ctx().host.connection.canWrite}
              onClick={() => setChosen(chosen() === name() ? undefined : name())}
            >
              <Icon name={ACTION_ICON[name()]} />
              <span>{growWord(ctx().gt, name())}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={chosen()}>
        {(decision) => (
          <form
            class="nsvx-dev__card"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Show when={decision() === "priority"}>
              <label class="nsvx-field">
                <span>
                  {ctx().gt("priority")}: {priority()}
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={priority()}
                  onInput={(event) => setPriority(Number(event.currentTarget.value))}
                />
              </label>
            </Show>
            <label class="nsvx-field">
              <span>{ctx().gt("reason")}</span>
              <input
                required
                maxlength="500"
                value={reason()}
                onInput={(event) => setReason(event.currentTarget.value)}
              />
            </label>
            <div class="nsvx-dev__bar">
              <button type="button" class="nsvx__button" onClick={() => setChosen(undefined)}>
                {ctx().gt("cancel")}
              </button>
              <button
                type="submit"
                class={[
                  "nsvx__button",
                  decision() === "reject" || decision() === "block-submitter"
                    ? "nsvx__button--danger"
                    : "nsvx__button--primary",
                ]}
                disabled={!reason().trim() || action.busy()}
              >
                {growWord(ctx().gt, decision())}
              </button>
            </div>
          </form>
        )}
      </Show>
      <Note note={action.note()} />
    </div>
  );
}

function IdeaDetail(props: { ctx: GrowCtx; id: string; onBack: () => void }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<Idea>(ctx().host, "buildMeRequest", { id: props.id }),
  );
  void source.refresh();
  return (
    <div class="nsvx-dev__stack">
      <div class="nsvx-dev__bar">
        <IconButton icon="back" label={ctx().gt("back")} onClick={() => props.onBack()} />
      </div>
      <SourceView source={source} t={ctx().t}>
        {(loaded) => {
          const idea = loaded;
          return (
            <article class="nsvx-dev__stack nsvx-grow__idea">
              <header class="nsvx-grow__idea-head">
                <Ring value={ideaProgress(idea())} label={ctx().gt("progress")} />
                <span class="nsvx-row__main">
                  <strong class="nsvx-grow__title">{idea().title}</strong>
                  <span class="nsvx-row__detail">
                    {idea().app_id} · v{idea().revision} · {age(idea().updated_at)}
                    {idea().submitter_kind === "guest" ? ` · ${ctx().gt("guest")}` : ""}
                  </span>
                </span>
                <span class={["nsvx__chip", `nsvx-grow__tone--${ideaTone(idea())}`]}>
                  {stateWord(ctx(), idea())}
                </span>
                <PrChip url={idea().pr_url} />
              </header>
              <Steps ctx={ctx()} idea={idea()} />
              <p class="nsvx-grow__text">{idea().description}</p>
              <Show when={idea().specification}>
                {(spec) => (
                  <section class="nsvx-dev__card">
                    <strong>{spec().title}</strong>
                    <span class="nsvx-row__detail">{spec().problem}</span>
                    <ul class="nsvx-grow__criteria" aria-label={ctx().gt("doneWhen")}>
                      <For each={spec().acceptance_criteria} keyed={false}>
                        {(item) => (
                          <li>
                            <Icon name="done" class="nsvx-row__icon nsvx-row__icon--ok" />
                            {item()}
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                )}
              </Show>
              <Show when={idea().reasons.length > 0}>
                <section class="nsvx-dev__card" aria-label={ctx().gt("notes")}>
                  <For each={idea().reasons} keyed={false}>
                    {(reason) => <span class="nsvx-row__detail">{reason()}</span>}
                  </For>
                </section>
              </Show>
              <Show when={idea().attachments.length > 0}>
                <div class="nsvx-grow__thumbs" aria-label={ctx().gt("images")}>
                  <For each={idea().attachments} keyed={(a) => a.id}>
                    {(a, i) => <Thumb ctx={ctx()} idea={idea()} attachment={a().id} index={i()} />}
                  </For>
                </div>
              </Show>
              <Decide ctx={ctx()} idea={idea()} onDone={() => void source.refresh()} />
              <Show when={(idea().audit ?? []).length > 0}>
                <details class="nsvx-dev__card">
                  <summary>{ctx().gt("changes")}</summary>
                  <ul class="nsvx-list">
                    <For each={idea().audit ?? []} keyed={false}>
                      {(entry) => (
                        <li class="nsvx-row">
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">
                              {growWord(ctx().gt, entry().action)}
                            </span>
                            <span class="nsvx-row__detail">{entry().reason}</span>
                          </span>
                          <span class="nsvx-row__age">{age(entry().created_at)}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </details>
              </Show>
              <Show when={(idea().build_log ?? []).length > 0}>
                <details class="nsvx-dev__card">
                  <summary>{ctx().gt("buildLog")}</summary>
                  <pre class="nsvx-grow__log">{(idea().build_log ?? []).join("\n")}</pre>
                </details>
              </Show>
            </article>
          );
        }}
      </SourceView>
    </div>
  );
}

export function GrowIdeas(props: { ctx: GrowCtx }) {
  const ctx = () => props.ctx;
  const filter = { app: "" };
  const [app, setApp] = createSignal("");
  const [show, setShow] = createSignal<IdeaView>("all");
  const [open, setOpen] = createSignal(new URLSearchParams(location.search).get("idea") ?? "");
  const source = createSource(ctx().host, () =>
    view<IdeaList>(ctx().host, "buildMeRequests", filter.app ? { app: filter.app } : {}),
  );
  void source.refresh();
  const pick = (id: string) => {
    setOpen(id);
    const url = new URL(location.href);
    if (id) {
      url.searchParams.set("idea", id);
    } else {
      url.searchParams.delete("idea");
    }
    history.replaceState(history.state, "", url);
  };
  return (
    <Show
      when={!open()}
      fallback={
        <IdeaDetail
          ctx={ctx()}
          id={open()}
          onBack={() => {
            pick("");
            void source.refresh();
          }}
        />
      }
    >
      <div class="nsvx-dev__stack">
        <Composer ctx={ctx()} onSent={() => void source.refresh()} />
        <Show
          when={source.state().code !== "not-found"}
          fallback={
            <div class="nsvx-connect" role="status">
              <Icon name="spark" class="nsvx-connect__icon" />
              <strong>{ctx().gt("ideasOff")}</strong>
            </div>
          }
        >
          <SourceView source={source} t={ctx().t}>
            {(list) => {
              const counts = createMemo(() => ideaCounts(list()));
              const inView = (idea: Idea) =>
                show() === "all" ||
                VIEW_TONE[show() as Exclude<IdeaView, "all">].includes(ideaTone(idea));
              return (
                <>
                  <Tiles
                    items={[
                      { id: "all", icon: "spark", label: ctx().gt("all"), count: counts().all },
                      {
                        id: "open",
                        icon: "activity",
                        label: ctx().gt("open"),
                        count: counts().open,
                        tone: "run",
                      },
                      { id: "done", icon: "done", label: ctx().gt("done"), count: counts().done },
                      {
                        id: "needsYou",
                        icon: "alert",
                        label: ctx().gt("needsYou"),
                        count: counts().bad,
                        tone: "bad",
                      },
                    ]}
                    selected={show()}
                    onSelect={setShow}
                  />
                  <div class="nsvx-dev__bar">
                    <label class="nsvx-field">
                      <span class="nsvx-visually-hidden">{ctx().gt("allApps")}</span>
                      <select
                        aria-label={ctx().gt("allApps")}
                        value={app()}
                        onChange={(event) => {
                          filter.app = event.currentTarget.value;
                          setApp(filter.app);
                          void source.refresh();
                        }}
                      >
                        <option value="">{ctx().gt("allApps")}</option>
                        <For each={list().apps} keyed={(a) => a}>
                          {(name) => <option value={name()}>{name()}</option>}
                        </For>
                      </select>
                    </label>
                  </div>
                  <ul class="nsvx-list" aria-label={ctx().gt("ideas")}>
                    <For
                      each={list().items.filter(
                        (idea) =>
                          inView(idea) &&
                          matches(ctx().query, idea.title, idea.description, idea.app_id),
                      )}
                      keyed={(idea) => `${idea.app_id}:${idea.id}`}
                    >
                      {(idea) => (
                        <li>
                          <button
                            type="button"
                            class="nsvx-row nsvx-row--link"
                            aria-label={idea().title}
                            disabled={idea().source === "replica"}
                            onClick={() => pick(idea().id)}
                          >
                            <Ring value={ideaProgress(idea())} label={idea().title} />
                            <span class="nsvx-row__main">
                              <span class="nsvx-row__title">{idea().title}</span>
                              <span class="nsvx-row__detail">
                                {idea().app_id}
                                {idea().priority != null ? ` · ★ ${idea().priority}` : ""}
                              </span>
                            </span>
                            <span class={["nsvx__chip", `nsvx-grow__tone--${ideaTone(idea())}`]}>
                              {stateWord(ctx(), idea())}
                            </span>
                            <span class="nsvx-row__age">{age(idea().updated_at)}</span>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={list().items.length === 0}>
                    <p class="nsvx__empty">{ctx().gt("noIdeas")}</p>
                  </Show>
                </>
              );
            }}
          </SourceView>
        </Show>
      </div>
    </Show>
  );
}
