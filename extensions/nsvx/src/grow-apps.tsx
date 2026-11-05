/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { ConfirmButton, createAction, Note, Segs, view } from "./device-kit.js";
import {
  canRunNow,
  cycleState,
  duration,
  GROW_MODES,
  growRows,
  growStopped,
  safePr,
  shortSha,
  slotLabel,
  type GrowApp,
  type GrowCycle,
  type GrowLog,
  type GrowMode,
  type GrowStatus,
  type Tone,
} from "./grow-data.js";
import type { GrowKey } from "./grow-i18n.js";
import type { GrowCtx } from "./grow-tab.js";
import { BrandLogo, every } from "./messages-ui.js";
import { Tiles } from "./owner-tabs.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

const TONE_ICON: Record<Tone, IconName> = {
  ok: "done",
  run: "activity",
  bad: "alert",
  off: "pause",
};
const WORD_KEY: Record<ReturnType<typeof cycleState>["word"], GrowKey> = {
  merged: "merged",
  dry: "dry",
  none: "none",
  running: "running",
  queued: "queued",
  skipped: "skipped",
  review: "review",
  stopped: "stoppedRun",
  failed: "failed",
};

/**
 * One key per intent: the same request keeps its key until NSVX confirms it, so a retry after an uncertain answer is
 * replayed, never repeated; a different request gets a new key (NSVX refuses a key reused with other data).
 */
export function createIntent() {
  let pending: { signature: string; key: string } | undefined;
  return {
    key(body: unknown) {
      const signature = JSON.stringify(body);
      if (pending?.signature !== signature) {
        pending = { signature, key: crypto.randomUUID() };
      }
      return pending.key;
    },
    done() {
      pending = undefined;
    },
  };
}

function CycleChip(props: { ctx: GrowCtx; cycle: GrowCycle | null }) {
  return (
    <Show when={props.cycle} fallback={<span class="nsvx__chip">{props.ctx.gt("noRuns")}</span>}>
      {(cycle) => (
        <span
          class={["nsvx__chip", `nsvx-grow__tone--${cycleState(cycle().status).tone}`]}
          title={cycle().reason ?? undefined}
        >
          <Icon name={TONE_ICON[cycleState(cycle().status).tone]} />
          {props.ctx.gt(WORD_KEY[cycleState(cycle().status).word])}
        </span>
      )}
    </Show>
  );
}

/** Pull request chip with the GitHub mark; it opens GitHub, where the code lives. */
export function PrChip(props: { url: string | null | undefined; number?: number | null }) {
  return (
    <Show when={safePr(props.url)}>
      {(href) => (
        <a class="nsvx__chip nsvx-grow__pr" href={href()} target="_blank" rel="noreferrer">
          <BrandLogo channel="github" size={14} />#{props.number ?? href().split("/").pop()}
        </a>
      )}
    </Show>
  );
}

function History(props: { ctx: GrowCtx; app: GrowApp }) {
  const when = (iso: string) =>
    new Intl.DateTimeFormat(props.ctx.locale, {
      timeZone: "Europe/Lisbon",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  return (
    <Show
      when={props.app.cycles.length > 0}
      fallback={<p class="nsvx__empty">{props.ctx.gt("noRuns")}</p>}
    >
      <ol class="nsvx-list nsvx-grow__history" aria-label={props.ctx.gt("history")}>
        <For each={props.app.cycles} keyed={(c) => String(c.id)}>
          {(c) => (
            <li class="nsvx-row">
              <Icon
                name={TONE_ICON[cycleState(c().status).tone]}
                class={["nsvx-row__icon", `nsvx-grow__tone--${cycleState(c().status).tone}`]}
              />
              <span class="nsvx-row__main">
                <span class="nsvx-row__title">
                  {props.ctx.gt(WORD_KEY[cycleState(c().status).word])}
                </span>
                <span class="nsvx-row__detail">
                  <time datetime={c().createdAt}>{when(c().createdAt)}</time>
                  {c().reason ? ` · ${c().reason}` : ""}
                </span>
              </span>
              <PrChip url={c().prUrl} number={c().prNumber} />
              <Show when={shortSha(c().mergeSha)}>{(sha) => <code>{sha()}</code>}</Show>
              <span class="nsvx-row__age">{duration(c().durationS)}</span>
            </li>
          )}
        </For>
      </ol>
    </Show>
  );
}

/** The app's current log; read again every 5 s only while open. */
function LogPanel(props: { ctx: GrowCtx; app: string }) {
  const source = createSource(props.ctx.host, () =>
    view<GrowLog>(props.ctx.host, "growLog", { app: props.app, tail: "200" }),
  );
  void source.refresh();
  every(5000, () => void source.refresh());
  return (
    <SourceView source={source} t={props.ctx.t}>
      {(log) => (
        <div class="nsvx-grow__log-wrap">
          <span class="nsvx-row__detail">
            <Show when={log().running}>
              <span class="nsvx__dot nsvx__dot--run" aria-hidden="true" />
            </Show>
            <code>{log().file ?? "—"}</code>
          </span>
          <pre class="nsvx-grow__log" tabindex="0" aria-label={props.ctx.gt("log")}>
            {log().lines.length > 0 ? log().lines.join("\n") : "—"}
          </pre>
        </div>
      )}
    </SourceView>
  );
}

function AppCard(props: { ctx: GrowCtx; app: GrowApp; status: GrowStatus; onChanged: () => void }) {
  const ctx = () => props.ctx;
  const action = createAction(ctx);
  const [panel, setPanel] = createSignal<"history" | "log">();
  const last = createMemo(() => props.app.running ?? props.app.last);
  const intent = createIntent();
  const send = (body: Record<string, unknown>) => {
    const request = { ...body, app: props.app.id };
    void action
      .run(
        () =>
          ctx().host.request("nsvx.grow.control", {
            ...request,
            idempotencyKey: intent.key(request),
          }),
        ctx().gt("sent"),
      )
      .then((ok) => {
        if (ok) {
          intent.done();
          props.onChanged();
        }
      });
  };
  const busy = () => action.busy() || !ctx().host.connection.canWrite;
  return (
    <article class="nsvx-dev__card nsvx-grow__app" data-grow-app={props.app.id}>
      <div class="nsvx-grow__head">
        <span class="nsvx-dev__initial" aria-hidden="true">
          {props.app.id.slice(0, 1).toUpperCase()}
        </span>
        <strong class="nsvx-grow__name">{props.app.id}</strong>
        <Show when={props.app.paused}>
          <span class="nsvx__chip">
            <Icon name="pause" />
            {ctx().gt("paused")}
          </span>
        </Show>
        <CycleChip ctx={ctx()} cycle={last()} />
        <PrChip url={last()?.prUrl} number={last()?.prNumber} />
      </div>
      <Segs
        name={`${ctx().gt("mode")} · ${props.app.id}`}
        items={GROW_MODES}
        value={props.app.modeOverride ?? props.app.mode}
        label={(mode) => ctx().gt(mode)}
        onChange={(mode: GrowMode) => !busy() && send({ action: "mode", mode })}
      />
      <div class="nsvx-dev__bar">
        <IconButton
          icon={props.app.paused ? "resume" : "pause"}
          label={`${ctx().gt(props.app.paused ? "resume" : "pause")} · ${props.app.id}`}
          disabled={busy()}
          onClick={() => send({ action: props.app.paused ? "resume" : "pause" })}
        />
        <ConfirmButton
          label={ctx().gt("run")}
          confirm={ctx().gt("run")}
          cancel={ctx().gt("cancel")}
          icon="actions"
          disabled={busy() || !canRunNow(props.status, props.app)}
          onConfirm={() => send({ action: "run" })}
        />
        <span class="nsvx-grow__next" title={ctx().gt("next")}>
          <Icon name="history" />
          {slotLabel(props.app.nextSlot, ctx().locale)}
        </span>
        <span class="nsvx-dev__spacer" />
        <IconButton
          icon="doc"
          label={`${ctx().gt("log")} · ${props.app.id}`}
          pressed={panel() === "log"}
          onClick={() => setPanel(panel() === "log" ? undefined : "log")}
        />
        <IconButton
          icon="history"
          label={`${ctx().gt("history")} · ${props.app.id}`}
          pressed={panel() === "history"}
          onClick={() => setPanel(panel() === "history" ? undefined : "history")}
        />
      </div>
      <Note note={action.note()} />
      <Show when={panel() === "history"}>
        <History ctx={ctx()} app={props.app} />
      </Show>
      <Show when={panel() === "log"}>
        <LogPanel ctx={ctx()} app={props.app.id} />
      </Show>
    </article>
  );
}

type AppView = "all" | "running" | "check" | "paused";

export function GrowApps(props: { ctx: GrowCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () => view<GrowStatus>(ctx().host, "growStatus"));
  void source.refresh();
  // NSVX polls every 15 s; so does Control while this section is open.
  every(15_000, () => void source.refresh());
  const action = createAction(ctx);
  const stopIntent = createIntent();
  const [show, setShow] = createSignal<AppView>("all");
  const inView = (app: GrowApp, which: AppView) => {
    const tone = cycleState((app.running ?? app.last)?.status).tone;
    return which === "all"
      ? true
      : which === "running"
        ? Boolean(app.running)
        : which === "paused"
          ? app.paused || app.effectiveMode === "off"
          : Boolean(app.last) && tone === "bad";
  };
  return (
    <SourceView source={source} t={ctx().t}>
      {(status) => {
        const rows = createMemo(() => growRows(status()));
        const tile = (id: AppView, icon: IconName, tone?: string) => ({
          id,
          icon,
          label: ctx().gt(id),
          count: rows().filter((app) => inView(app, id)).length,
          tone,
        });
        return (
          <div class="nsvx-dev__stack">
            <Show
              when={status().have?.config !== false}
              fallback={
                <div class="nsvx-connect" role="status">
                  <Icon name="work" class="nsvx-connect__icon" />
                  <strong>{ctx().gt("notInstalled")}</strong>
                </div>
              }
            >
              <div class="nsvx-dev__bar">
                <ConfirmButton
                  label={ctx().gt(growStopped(status()) ? "startAll" : "stopAll")}
                  confirm={ctx().gt(growStopped(status()) ? "startAll" : "stopAll")}
                  cancel={ctx().gt("cancel")}
                  icon={growStopped(status()) ? "resume" : "stop"}
                  danger={!growStopped(status())}
                  disabled={
                    !status().provisioned || action.busy() || !ctx().host.connection.canWrite
                  }
                  onConfirm={() => {
                    const request = { action: "kill", on: !growStopped(status()) };
                    void action
                      .run(
                        () =>
                          ctx().host.request("nsvx.grow.control", {
                            ...request,
                            idempotencyKey: stopIntent.key(request),
                          }),
                        ctx().gt("sent"),
                      )
                      .then((ok) => {
                        if (ok) {
                          stopIntent.done();
                          void source.refresh();
                        }
                      });
                  }}
                />
                <Show when={growStopped(status())}>
                  <span class="nsvx__chip nsvx-grow__tone--bad" role="status">
                    <Icon name="stop" />
                    {ctx().gt("stopped")}
                  </span>
                </Show>
                <Show when={status().pendingRequests > 0}>
                  <span class="nsvx__chip" title={ctx().gt("waiting")}>
                    <Icon name="history" />
                    {ctx().gt("waiting")}: {status().pendingRequests}
                  </span>
                </Show>
                <For each={status().awaitingLogin ?? []} keyed={(a) => a}>
                  {(account) => (
                    <span class="nsvx__chip nsvx-grow__tone--bad">
                      <Icon name="lock" />
                      ChatGPT {account()} · {ctx().gt("signIn")}
                    </span>
                  )}
                </For>
                <Note note={action.note()} />
              </div>
              <Tiles
                items={[
                  tile("all", "work"),
                  tile("running", "activity", "run"),
                  tile("check", "alert", "bad"),
                  tile("paused", "pause"),
                ]}
                selected={show()}
                onSelect={setShow}
              />
              <div class="nsvx-grow__grid">
                <For
                  each={rows().filter((app) => inView(app, show()) && matches(ctx().query, app.id))}
                  keyed={(app) => app.id}
                >
                  {(app) => (
                    <AppCard
                      ctx={ctx()}
                      app={app()}
                      status={status()}
                      onChanged={() => void source.refresh()}
                    />
                  )}
                </For>
              </div>
              <Show when={rows().length === 0}>
                <p class="nsvx__empty">{ctx().gt("noApps")}</p>
              </Show>
            </Show>
          </div>
        );
      }}
    </SourceView>
  );
}
