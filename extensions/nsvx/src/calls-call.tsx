/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  ACTION_KIND,
  actionTone,
  callTone,
  duration,
  isLive,
  isPhoneLine,
  isSocial,
  mergeTurns,
  usd,
  type CallDetail,
  type CallRecording,
  type CallTurn,
} from "./calls-data.js";
import { ChannelMark, stamp, type CallsCtx } from "./calls-ui.js";
import { ConfirmButton, createAction, Note, view } from "./device-kit.js";
import { every } from "./messages-ui.js";
import { Panel, Pill } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

/** Live-call taps: mute and take over on app calls, private context on telephone calls, end on every call. */
export function CallControls(props: {
  ctx: CallsCtx;
  id: string;
  channel: string;
  state: string;
  onChange: () => void;
}) {
  const ctx = () => props.ctx;
  const action = createAction(ctx);
  const [muted, setMuted] = createSignal(false);
  const [took, setTook] = createSignal(false);
  const context = createSource(ctx().host, () =>
    isPhoneLine(props.channel)
      ? view<{ authorized: boolean }>(ctx().host, "callContext", { id: props.id })
      : Promise.resolve({ authorized: false }),
  );
  void context.refresh();
  const change = (name: string, done?: string) =>
    action.run(async () => {
      await ctx().host.request("nsvx.calls.change", { action: name, id: props.id });
      props.onChange();
    }, done);
  const canWrite = () => ctx().host.connection.canWrite && !action.busy();
  return (
    <Show when={isLive(props.state)}>
      <span class="nsvx-calls__controls">
        <Show when={isPhoneLine(props.channel)}>
          <Show
            when={!context.state().data?.authorized}
            fallback={<Pill tone="ok">{ctx().ct("shared")}</Pill>}
          >
            <ConfirmButton
              label={ctx().ct("share")}
              confirm={ctx().ct("confirm")}
              cancel={ctx().ct("keep")}
              icon="lock"
              disabled={!canWrite()}
              onConfirm={() => void change("context").then((ok) => ok && void context.refresh())}
            />
          </Show>
        </Show>
        <Show when={isSocial(props.channel)}>
          <IconButton
            icon={muted() ? "mic" : "pause"}
            label={ctx().ct(muted() ? "unmute" : "mute")}
            pressed={muted()}
            disabled={!canWrite()}
            onClick={() =>
              void change(muted() ? "unmute" : "mute").then((ok) => ok && setMuted(!muted()))
            }
          />
          <button
            type="button"
            class="nsvx__button"
            disabled={!canWrite() || took()}
            onClick={() => void change("takeover").then((ok) => ok && setTook(true))}
          >
            <Icon name="hand" />
            <span>{ctx().ct(took() ? "yours" : "takeover")}</span>
          </button>
        </Show>
        <button
          type="button"
          class="nsvx__button nsvx__button--danger"
          disabled={!canWrite()}
          onClick={() => void change("hangup", ctx().ct("ended"))}
        >
          <Icon name="phone" />
          <span>{ctx().ct("end")}</span>
        </button>
      </span>
      <Note note={action.note()} />
    </Show>
  );
}

function Transcript(props: { ctx: CallsCtx; turns: readonly CallTurn[] }) {
  return (
    <Show
      when={props.turns.length > 0}
      fallback={<p class="nsvx__empty">{props.ctx.ct("noTranscript")}</p>}
    >
      <ol class="nsvx-calls__turns" aria-label={props.ctx.ct("transcript")}>
        <For each={props.turns} keyed={(turn) => turn.id}>
          {(turn) => {
            const side = () =>
              turn().role === "assistant" ? "clone" : turn().speaker === "owner" ? "you" : "caller";
            return (
              <li
                class={[
                  "nsvx-calls__turn",
                  `nsvx-calls__turn--${side()}`,
                  { "nsvx-calls__turn--partial": turn().status === "partial" },
                ]}
              >
                <span class="nsvx-calls__speaker">
                  {side() === "clone" ? "clone" : props.ctx.ct(side() === "you" ? "you" : "caller")}
                </span>
                <span>{turn().text || "…"}</span>
                <Show when={turn().status === "interrupted"}>
                  <small> · {props.ctx.ct("cut")}</small>
                </Show>
                <Show when={turn().role === "assistant" && turn().played_ms === 0}>
                  <small> · {props.ctx.ct("unheard")}</small>
                </Show>
              </li>
            );
          }}
        </For>
      </ol>
    </Show>
  );
}

function Recordings(props: { ctx: CallsCtx; id: string; onDeleted: () => void }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<CallRecording[]>(ctx().host, "callRecordings", { id: props.id }),
  );
  void source.refresh();
  const [audio, setAudio] = createSignal<Record<string, string>>({});
  const action = createAction(ctx);
  return (
    <Show when={(source.state().data ?? []).length > 0}>
      <Panel title={ctx().ct("recording")} icon="mic">
        <ul class="nsvx-of__list">
          <For each={source.state().data ?? []} keyed={(row) => row.id}>
            {(rec) => (
              <li class="nsvx-calls__rec" data-recording={rec().id}>
                <Show
                  when={audio()[rec().id]}
                  fallback={
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={action.busy() || !["complete", "partial"].includes(rec().state)}
                      onClick={() =>
                        void action.run(async () => {
                          const file = await ctx().host.request<{ mime: string; data: string }>(
                            "nsvx.calls.recording",
                            { id: rec().id },
                          );
                          setAudio({
                            ...audio(),
                            [rec().id]: `data:${file.mime};base64,${file.data}`,
                          });
                        })
                      }
                    >
                      <Icon name="resume" />
                      <span>{ctx().ct("play")}</span>
                    </button>
                  }
                >
                  {(src) => (
                    // oxlint-disable-next-line jsx-a11y/media-has-caption -- NSVX keeps the call's transcript beside it.
                    <audio controls autoplay src={src()} aria-label={ctx().ct("recording")} />
                  )}
                </Show>
                <span class="nsvx-of__sub">
                  {duration(rec().duration_ms)}
                  {rec().retention_until
                    ? ` · ${ctx().ct("until")} ${stamp(rec().retention_until, ctx().locale)}`
                    : ""}
                </span>
                <Show when={rec().state !== "complete"}>
                  <Pill tone={rec().state === "failed" ? "bad" : "warn"}>{rec().state}</Pill>
                </Show>
                <ConfirmButton
                  label={ctx().ct("delete")}
                  confirm={ctx().ct("delete")}
                  cancel={ctx().ct("keep")}
                  icon="trash"
                  danger
                  disabled={action.busy() || !ctx().host.connection.canWrite}
                  onConfirm={() =>
                    void action.run(async () => {
                      await ctx().host.request("nsvx.calls.change", {
                        action: "deleteRecording",
                        recordingId: rec().id,
                      });
                      await source.refresh();
                      props.onDeleted();
                    }, ctx().ct("deleted"))
                  }
                />
              </li>
            )}
          </For>
        </ul>
        <Note note={action.note()} />
      </Panel>
    </Show>
  );
}

function Summary(props: { ctx: CallsCtx; id: string }) {
  const ctx = () => props.ctx;
  const [result, setResult] = createSignal<{
    summary: string | null;
    citations: { turn_id: number; speaker: string; quote: string }[];
  }>();
  const action = createAction(ctx);
  return (
    <Show
      when={result()}
      fallback={
        <button
          type="button"
          class="nsvx__button"
          disabled={action.busy()}
          onClick={() =>
            void action.run(async () => {
              setResult(await ctx().host.request("nsvx.calls.summary", { id: props.id }));
            })
          }
        >
          <Icon name="spark" />
          <span>{ctx().ct("summary")}</span>
        </button>
      }
    >
      {(shown) => (
        <div class="nsvx-calls__summary" role="status">
          <Show
            when={shown().summary}
            fallback={<span class="nsvx-of__muted">{ctx().ct("summaryOff")}</span>}
          >
            <p>
              <Icon name="spark" /> {shown().summary}
            </p>
          </Show>
          <Show when={shown().summary && shown().citations.length > 0}>
            <details>
              <summary>
                {ctx().ct("quotes")} · {shown().citations.length}
              </summary>
              <ul>
                <For each={shown().citations} keyed={(quote) => quote.turn_id}>
                  {(quote) => (
                    <li>
                      <span class="nsvx-of__sub">#{quote().turn_id}</span> {quote().quote}
                    </li>
                  )}
                </For>
              </ul>
            </details>
          </Show>
        </div>
      )}
    </Show>
  );
}

/** One call: who, cost, goal, messages left, results, AI summary, transcript, sources, recordings, forget. */
export function CallDetailView(props: { ctx: CallsCtx; id: string; onBack: () => void }) {
  const ctx = () => props.ctx;
  const [turns, setTurns] = createSignal<CallTurn[]>([]);
  // NSVX's revision cursor: after the first read only changed turns come back, merged by id.
  let rev = 0;
  const source = createSource(ctx().host, async () => {
    const from = rev;
    const call = await view<CallDetail>(ctx().host, "call", { id: props.id, rev: String(from) });
    rev = Math.max(from, call.rev ?? 0);
    setTurns(mergeTurns(from === 0 ? [] : turns(), call.turns));
    return call;
  });
  void source.refresh();
  every(3_000, () => {
    const call = source.state().data;
    if (call && isLive(call.state)) {
      void source.refresh();
    }
  });
  const action = createAction(ctx);
  return (
    <div class="nsvx-of nsvx-calls__detail">
      <div class="nsvx-of__bar">
        <IconButton icon="back" label={ctx().ct("back")} onClick={() => props.onBack()} />
      </div>
      <SourceView source={source} t={ctx().t}>
        {(call) => {
          const sources = () => [
            ...new Set(call().tools.flatMap((tool) => tool.result_summary?.sources ?? [])),
          ];
          return (
            <>
              <header class="nsvx-of__head">
                <ChannelMark channel={call().channel} size={26} ct={ctx().ct} />
                <h2>
                  {call().channel === "browser" ? ctx().ct("app") : (call().who ?? call().channel)}
                </h2>
                <Pill tone={callTone(call().state)}>{call().label}</Pill>
              </header>
              <ul class="nsvx-calls__facts">
                <li>
                  <Icon name="history" /> {stamp(call().started_at, ctx().locale)}
                </li>
                <li>
                  <Icon name="euro" /> {call().cost_estimated ? "≈ " : ""}
                  {usd(call().cost_usd)}
                </li>
                <Show when={call().model}>
                  <li>
                    <Icon name="bot" /> {call().model}
                  </li>
                </Show>
                <Show when={call().media_state === "lost"}>
                  <li>
                    <Pill tone="bad">{ctx().ct("audioLost")}</Pill>
                  </li>
                </Show>
              </ul>
              <CallControls
                ctx={ctx()}
                id={call().id}
                channel={call().channel}
                state={call().state}
                onChange={() => void source.refresh()}
              />
              <Show when={call().purpose}>
                <p class="nsvx-calls__purpose">
                  <Icon name="task" /> {call().purpose}
                </p>
              </Show>
              <For each={call().messages} keyed={false}>
                {(message) => (
                  <p class="nsvx-calls__message">
                    <Icon name="messages" /> <strong>{message().who || ctx().ct("message")}</strong>
                    : {message().text}
                  </p>
                )}
              </For>
              <Show when={(call().actions ?? []).length > 0}>
                <Panel title={ctx().ct("results")} icon="tasks">
                  <ul class="nsvx-of__list">
                    <For each={call().actions ?? []} keyed={false}>
                      {(result) => (
                        <li class="nsvx-calls__result">
                          <span>{ctx().ct(`act_${ACTION_KIND[result().kind] ?? "other"}`)}</span>
                          <Pill tone={actionTone(result().status)}>
                            {ctx().ct(`st_${actionTone(result().status)}`)}
                          </Pill>
                          <Show when={result().mission_id && ctx().onMission}>
                            <button
                              type="button"
                              class="nsvx__button"
                              onClick={() => ctx().onMission?.(result().mission_id ?? "")}
                            >
                              <Icon name="tasks" />
                              <span>{ctx().ct("openTask")}</span>
                            </button>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Panel>
              </Show>
              <Summary ctx={ctx()} id={call().id} />
              <Panel title={ctx().ct("transcript")} icon="messages" count={turns().length}>
                <Transcript ctx={ctx()} turns={turns()} />
              </Panel>
              <Show when={call().tools.length > 0}>
                <details class="nsvx-calls__sources">
                  <summary>
                    {ctx().ct("sources")} · {call().tools.length}
                  </summary>
                  <Show when={call().tools.some((tool) => tool.status === "denied")}>
                    <p class="nsvx-of__muted">
                      <Icon name="lock" /> {ctx().ct("denied")}
                    </p>
                  </Show>
                  <ul>
                    <For each={sources()} keyed={false}>
                      {(name) => (
                        <li>
                          <Icon name="doc" /> {name()}
                        </li>
                      )}
                    </For>
                  </ul>
                </details>
              </Show>
              <Recordings ctx={ctx()} id={call().id} onDeleted={() => void source.refresh()} />
              <Show when={!isLive(call().state)}>
                <div class="nsvx-of__bar">
                  <ConfirmButton
                    label={ctx().ct("forget")}
                    confirm={ctx().ct("forgetAsk")}
                    cancel={ctx().ct("keep")}
                    icon="trash"
                    danger
                    disabled={action.busy() || !ctx().host.connection.canWrite}
                    onConfirm={() =>
                      void action.run(async () => {
                        await ctx().host.request("nsvx.calls.change", {
                          action: "forget",
                          id: call().id,
                        });
                        rev = 0;
                        await source.refresh();
                      }, ctx().ct("forgotten"))
                    }
                  />
                </div>
              </Show>
              <Note note={action.note()} />
            </>
          );
        }}
      </SourceView>
    </div>
  );
}
