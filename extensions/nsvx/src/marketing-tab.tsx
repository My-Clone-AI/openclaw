/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { DT } from "./device-i18n.js";
import { ConfirmButton, createAction, Note, Segs, view } from "./device-kit.js";
import { Accounts, Report, type MarketingCtx } from "./marketing-accounts.js";
import {
  gateMode,
  safeActivations,
  safeBrands,
  safeSlots,
  type GenerateResult,
  type MarketingBrand,
  type MarketingGate,
  type MarketingOverview,
  type MarketingSlot,
  type PreviewResult,
} from "./marketing-data.js";
import type { KT } from "./marketing-i18n.js";
import { every } from "./messages-ui.js";
import { Choice, Field, Panel, Pill, Stats } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, matches, SourceView, type IconName, type T } from "./ui-kit.js";
import "./device.css";
import "./office.css";

type Section = "overview" | "studio" | "calendar" | "accounts" | "report";
const SECTIONS: Section[] = ["overview", "studio", "calendar", "accounts", "report"];
const SECTION_ICON: Record<Section, IconName> = {
  overview: "today",
  studio: "spark",
  calendar: "agenda",
  accounts: "people",
  report: "progress",
};

function Overview(props: { ctx: MarketingCtx; overview: MarketingOverview; reload: () => void }) {
  const ctx = () => props.ctx;
  const gateSource = createSource(ctx().host, () =>
    view<MarketingGate>(ctx().host, "marketingGate"),
  );
  void gateSource.refresh();
  every(30_000, () => void gateSource.refresh());
  const [reason, setReason] = createSignal("");
  const action = createAction(ctx);
  const canChange = () =>
    !action.busy() && reason().trim().length >= 3 && ctx().host.connection.canWrite;
  const change = (body: Record<string, unknown>) =>
    void action.run(async () => {
      await ctx().host.request("nsvx.marketing.gate", { ...body, reason: reason().trim() });
      setReason("");
      await gateSource.refresh();
      props.reload();
    }, ctx().kt("done"));
  const health = () => props.overview.worker.health;
  const worker = (): { word: string; tone: "ok" | "warn" | "off" } =>
    !props.overview.worker.configured
      ? { word: ctx().kt("workerOff"), tone: "off" }
      : health()?.ok
        ? { word: health()?.admission ?? ctx().kt("workerOn"), tone: "ok" }
        : { word: health()?.code ?? ctx().kt("workerDown"), tone: "warn" };
  return (
    <div class="nsvx-of">
      <Show when={gateSource.state().data}>
        {(gate) => {
          const mode = () => gateMode(gate());
          const WORD = { live: "liveWord", test: "testWord", stopped: "stoppedWord" } as const;
          return (
            <>
              <div class={["nsvx-of__mode", `nsvx-of__mode--${mode()}`]}>
                <Icon
                  name={mode() === "live" ? "marketing" : mode() === "stopped" ? "stop" : "shield"}
                />
                <strong role="status">{ctx().kt(WORD[mode()])}</strong>
                <Show when={props.overview.live_block}>
                  <span class="nsvx-of__muted">{props.overview.live_block}</span>
                </Show>
              </div>
              <div class="nsvx-of__form">
                <Field
                  label={ctx().kt("reason")}
                  value={reason()}
                  max={500}
                  placeholder={ctx().kt("reasonHint")}
                  onInput={setReason}
                />
                <div class="nsvx-dev__bar">
                  <ConfirmButton
                    label={ctx().kt(gate().live_allowed ? "blockLive" : "allowLive")}
                    confirm={ctx().kt(gate().live_allowed ? "blockLive" : "allowLive")}
                    cancel={ctx().kt("cancel")}
                    icon="marketing"
                    disabled={!canChange()}
                    onConfirm={() => change({ live_allowed: !gate().live_allowed })}
                  />
                  <ConfirmButton
                    label={ctx().kt(gate().killed ? "restart" : "stop")}
                    confirm={ctx().kt(gate().killed ? "restart" : "stop")}
                    cancel={ctx().kt("cancel")}
                    icon="stop"
                    danger={!gate().killed}
                    disabled={!canChange()}
                    onConfirm={() => change({ killed: !gate().killed })}
                  />
                </div>
                <Note note={action.note()} />
              </div>
              <Panel title={ctx().kt("apps")} icon="group">
                <ul class="nsvx-of__list">
                  <For
                    each={safeActivations(gate().activations)}
                    keyed={(row) => row.app}
                    fallback={<p class="nsvx-of__muted">{ctx().kt("noApps")}</p>}
                  >
                    {(row) => (
                      <li class="nsvx-of__row">
                        <span class="nsvx-of__main">
                          <strong>{row().app}</strong>
                        </span>
                        <Pill tone={row().armed ? "ok" : "off"}>
                          {row().armed ? ctx().kt("armed") : row().mode}
                        </Pill>
                        <ConfirmButton
                          label={ctx().kt(row().armed ? "disarm" : "arm")}
                          confirm={ctx().kt(row().armed ? "disarm" : "arm")}
                          cancel={ctx().kt("cancel")}
                          disabled={!canChange()}
                          onConfirm={() =>
                            change({ action: "activation", app: row().app, activate: !row().armed })
                          }
                        />
                      </li>
                    )}
                  </For>
                </ul>
              </Panel>
            </>
          );
        }}
      </Show>
      <Stats
        items={[
          {
            icon: "history",
            label: ctx().kt("everyHours"),
            value: `${props.overview.cadence_hours ?? "—"} ${ctx().kt("hours")}`,
          },
          { icon: "agenda", label: ctx().kt("slots"), value: String(props.overview.slots) },
          { icon: "activity", label: ctx().kt("jobs"), value: String(props.overview.active_jobs) },
          {
            icon: "pause",
            label: ctx().kt("paused"),
            value: String(props.overview.paused_campaigns),
          },
        ]}
      />
      <div class="nsvx-of__bar">
        <span class="nsvx-of__muted">{ctx().kt("worker")}</span>
        <Pill tone={worker().tone}>{worker().word}</Pill>
        <Show when={health()?.models?.image}>
          <Pill icon="image">{health()?.models?.image}</Pill>
        </Show>
        <Show when={health()?.models?.video}>
          <Pill>{health()?.models?.video}</Pill>
        </Show>
      </div>
    </div>
  );
}

function ContentActions(props: {
  ctx: MarketingCtx;
  app: string;
  contentId: string | null;
  jobId: string | null;
  dev: boolean;
  onDone: () => void;
}) {
  const ctx = () => props.ctx;
  const action = createAction(ctx);
  const closed = () => !props.dev || action.busy() || !ctx().host.connection.canWrite;
  const act = (name: string, body: Record<string, unknown>) =>
    void action.run(async () => {
      await ctx().host.request("nsvx.marketing.change", { action: name, ...body });
      props.onDone();
    }, ctx().kt("done"));
  return (
    <>
      <div class="nsvx-dev__bar">
        <button
          type="button"
          class="nsvx__button"
          disabled={closed() || !props.contentId}
          onClick={() => act("schedule", { contentId: props.contentId })}
        >
          <Icon name="agenda" />
          <span>{ctx().kt("schedule")}</span>
        </button>
        <ConfirmButton
          label={ctx().kt("publish")}
          confirm={ctx().kt("confirmPublish")}
          cancel={ctx().kt("cancel")}
          icon="send"
          disabled={closed() || !props.contentId}
          onConfirm={() => act("publish", { contentId: props.contentId })}
        />
        <IconButton
          icon="refresh"
          label={ctx().kt("retry")}
          disabled={closed() || !props.jobId}
          onClick={() => act("retry", { jobId: props.jobId })}
        />
        <IconButton
          icon="stop"
          label={ctx().kt("cancelJob")}
          disabled={closed() || !props.jobId}
          onClick={() => act("cancel", { jobId: props.jobId })}
        />
        <IconButton
          icon="pause"
          label={ctx().kt("pause")}
          disabled={closed()}
          onClick={() => act("pause", { app: props.app })}
        />
      </div>
      <Note note={action.note()} />
    </>
  );
}

function Studio(props: { ctx: MarketingCtx; dev: boolean; onDone: () => void }) {
  const ctx = () => props.ctx;
  const brands = createSource(ctx().host, () =>
    view<{ brands: MarketingBrand[] }>(ctx().host, "marketingBrands"),
  );
  void brands.refresh();
  const [app, setApp] = createSignal("");
  const [kind, setKind] = createSignal<"image" | "video">("image");
  const [brief, setBrief] = createSignal("");
  const [preview, setPreview] = createSignal<PreviewResult>();
  const [made, setMade] = createSignal<GenerateResult>();
  const action = createAction(ctx);
  const rows = createMemo(() => safeBrands(brands.state().data?.brands ?? []));
  const chosen = createMemo(() => rows().find((row) => row.app === app()) ?? rows()[0]);
  const closed = () => !props.dev || action.busy() || !ctx().host.connection.canWrite || !chosen();
  return (
    <div class="nsvx-of">
      <Show when={!props.dev}>
        <p class="nsvx-of__warn" role="status">
          {ctx().kt("devOnly")}
        </p>
      </Show>
      <SourceView source={brands} t={ctx().t}>
        {() => (
          <form class="nsvx-of__form" onSubmit={(event) => event.preventDefault()}>
            <Choice
              label={ctx().kt("app")}
              value={chosen()?.app ?? ""}
              options={rows().map((row) => [row.app, row.name] as const)}
              onChange={setApp}
            />
            <Choice
              label={ctx().kt("kind")}
              value={kind()}
              options={[
                ["image", ctx().kt("image")],
                ["video", ctx().kt("video")],
              ]}
              onChange={setKind}
            />
            <Field
              label={ctx().kt("brief")}
              value={brief()}
              rows={3}
              max={1000}
              onInput={setBrief}
            />
            <Show when={chosen()}>
              {(brand) => (
                <p class="nsvx-of__muted nsvx-of__wide">
                  {ctx().kt(brand().logo ? "logoSaved" : "noLogo")}
                  {brand().domain ? ` · ${brand().domain}` : ""}
                </p>
              )}
            </Show>
            <div class="nsvx-dev__bar">
              <button
                type="button"
                class="nsvx__button"
                disabled={closed()}
                onClick={() =>
                  void action.run(async () => {
                    setPreview(
                      await ctx().host.request<PreviewResult>("nsvx.marketing.change", {
                        action: "preview",
                        app: chosen()?.app,
                        text: brief().trim() || chosen()?.name,
                        hashtags: [],
                      }),
                    );
                  })
                }
              >
                <Icon name="find" />
                <span>{ctx().kt("preview")}</span>
              </button>
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                disabled={closed()}
                onClick={() =>
                  void action.run(async () => {
                    setMade(
                      await ctx().host.request<GenerateResult>("nsvx.marketing.change", {
                        action: "generate",
                        app: chosen()?.app,
                        kind: kind(),
                        brief: brief().trim(),
                      }),
                    );
                    props.onDone();
                  })
                }
              >
                <Icon name="spark" />
                <span>{ctx().kt("generate")}</span>
              </button>
            </div>
            <Note note={action.note()} />
          </form>
        )}
      </SourceView>
      <Show when={preview()}>
        {(shown) => (
          <p class={shown().ok ? "nsvx-of__mono" : "nsvx-of__warn"} role="status">
            {shown().ok ? shown().body : `${ctx().kt("refused")}: ${shown().codes.join(", ")}`}
          </p>
        )}
      </Show>
      <Show when={made()}>
        {(content) => (
          <Panel title={content().state} icon="done">
            <ContentActions
              ctx={ctx()}
              app={content().app_id}
              contentId={content().content_id}
              jobId={content().id}
              dev={props.dev}
              onDone={props.onDone}
            />
          </Panel>
        )}
      </Show>
    </div>
  );
}

function Calendar(props: { ctx: MarketingCtx; dev: boolean }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ items: MarketingSlot[] }>(ctx().host, "marketingCalendar"),
  );
  void source.refresh();
  every(30_000, () => void source.refresh());
  const rows = createMemo(() =>
    safeSlots(source.state().data?.items ?? []).filter((row) =>
      matches(ctx().query, row.app_id, row.caption, row.state),
    ),
  );
  return (
    <SourceView source={source} t={ctx().t}>
      {() => (
        <ul class="nsvx-of__list">
          <For
            each={rows()}
            keyed={(row) => row.id}
            fallback={<p class="nsvx__empty">{ctx().kt("noSlots")}</p>}
          >
            {(row) => (
              <li class="nsvx-of__row">
                <Icon name={row().kind === "video" ? "resume" : "image"} />
                <span class="nsvx-of__main">
                  <strong>{row().app_id}</strong>
                  <span class="nsvx-of__sub">
                    {new Date(row().slot).toLocaleString(ctx().locale)}
                  </span>
                  <Show when={row().caption}>
                    <span class="nsvx-of__sub">{row().caption}</span>
                  </Show>
                </span>
                <Pill tone={row().state === "published" ? "ok" : "run"}>{row().state}</Pill>
                <Show when={row().job_state}>
                  <Pill>{row().job_state}</Pill>
                </Show>
                <ContentActions
                  ctx={ctx()}
                  app={row().app_id}
                  contentId={row().content_id}
                  jobId={row().job_id}
                  dev={props.dev}
                  onDone={() => void source.refresh()}
                />
              </li>
            )}
          </For>
        </ul>
      )}
    </SourceView>
  );
}

/** NSVX marketing admin (`/empresas-do-grupo`), natively: gates, studio, calendar, social accounts, and counts. */
export function MarketingTab(props: {
  host: ControlUiHost;
  t: T;
  dt: DT;
  kt: KT;
  locale: string;
  query: string;
}) {
  const pick = new URLSearchParams(location.search).get("marketing");
  const [section, setSection] = createSignal<Section>(
    SECTIONS.includes(pick as Section) ? (pick as Section) : "overview",
  );
  const ctx = createMemo<MarketingCtx>(() => ({
    host: props.host,
    t: props.t,
    dt: props.dt,
    kt: props.kt,
    locale: props.locale,
    query: props.query,
  }));
  const overview = createSource(props.host, () =>
    view<MarketingOverview>(props.host, "marketingOverview"),
  );
  void overview.refresh();
  every(30_000, () => void overview.refresh());
  const dev = () => overview.state().data?.development === true;
  return (
    <div class="nsvx-dev nsvx-of">
      <Segs
        name={props.kt("marketing")}
        items={SECTIONS}
        value={section()}
        label={(key) => props.kt(key)}
        icon={(key) => SECTION_ICON[key]}
        onChange={(next) => {
          setSection(next);
          const url = new URL(location.href);
          url.searchParams.set("marketing", next);
          history.replaceState(history.state, "", url);
        }}
      />
      <For each={[section()]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={section() === "overview"}>
              <SourceView source={overview} t={props.t}>
                {(data) => (
                  <Overview ctx={ctx()} overview={data()} reload={() => void overview.refresh()} />
                )}
              </SourceView>
            </Show>
            <Show when={section() === "studio"}>
              <Studio ctx={ctx()} dev={dev()} onDone={() => void overview.refresh()} />
            </Show>
            <Show when={section() === "calendar"}>
              <Calendar ctx={ctx()} dev={dev()} />
            </Show>
            <Show when={section() === "accounts"}>
              <Accounts ctx={ctx()} />
            </Show>
            <Show when={section() === "report"}>
              <Report ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
