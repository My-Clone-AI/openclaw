/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { saveNsvxFile } from "./aviation-kit.js";
import { ConfirmButton, createAction, Note, Segs, view, type Ctx } from "./device-kit.js";
import type { DT } from "./device-i18n.js";
import type { KT, MarketingKey } from "./marketing-i18n.js";
import {
  countRows,
  gateMode,
  MAIN_NETWORKS,
  safeActivations,
  safeBrands,
  safeSlots,
  safeSocialApps,
  socialCounts,
  type Counts,
  type GenerateResult,
  type MarketingAnalytics,
  type MarketingBrand,
  type MarketingChannels,
  type MarketingGate,
  type MarketingOverview,
  type MarketingSlot,
  type PreviewResult,
  type SocialCell,
  type SocialNetwork,
} from "./marketing-data.js";
import { BrandLogo, every } from "./messages-ui.js";
import { Choice, Field, Panel, Pill, Stats, Toggle } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, matches, SourceView, type IconName, type T } from "./ui-kit.js";
import "./device.css";
import "./office.css";

type MarketingCtx = Ctx & { kt: KT; locale: string };

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
                <Icon name={mode() === "live" ? "marketing" : mode() === "stopped" ? "stop" : "shield"} />
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
                  <span class="nsvx-of__sub">{new Date(row().slot).toLocaleString(ctx().locale)}</span>
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

const STATUS_WORD: Record<SocialCell["status"], MarketingKey> = {
  connected: "connected",
  pending: "pending",
  unavailable: "unavailable",
  failed: "failed",
};
const STATUS_TONE = { connected: "ok", pending: "warn", unavailable: "off", failed: "bad" } as const;

function Accounts(props: { ctx: MarketingCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<MarketingChannels>(ctx().host, "marketingChannels"),
  );
  void source.refresh();
  const [mainOnly, setMainOnly] = createSignal(true);
  const [picked, setPicked] = createSignal<{
    app: string;
    network: SocialNetwork;
    cell: SocialCell;
  }>();
  const action = createAction(ctx);
  const networks = createMemo(() =>
    (source.state().data?.matrix.networks ?? []).filter(
      (network) => !mainOnly() || MAIN_NETWORKS.has(network.code),
    ),
  );
  const apps = createMemo(() =>
    safeSocialApps(source.state().data?.matrix.apps ?? []).filter((row) =>
      matches(ctx().query, row.app),
    ),
  );
  const stampOf = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(ctx().locale) : "—";
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__bar">
        <Toggle label={ctx().kt("main")} checked={mainOnly()} onChange={setMainOnly} />
        <span class="nsvx-dev__spacer" />
        <For each={["md", "json"] as const} keyed={false}>
          {(format) => (
            <button
              type="button"
              class="nsvx__button"
              disabled={action.busy()}
              onClick={() =>
                void action.run(() =>
                  saveNsvxFile(ctx().host, { format: format() }, "nsvx.marketing.inventory"),
                )
              }
            >
              <Icon name="download" />
              <span>{format().toUpperCase()}</span>
            </button>
          )}
        </For>
      </div>
      <Note note={action.note()} />
      <Show when={picked()}>
        {(shown) => (
          <Panel
            title={`${shown().app} · ${shown().network.label}`}
            action={
              <IconButton icon="close" label={ctx().kt("back")} onClick={() => setPicked(undefined)} />
            }
          >
            <div class="nsvx-of__bar">
              <Pill tone={STATUS_TONE[shown().cell.status]}>
                {ctx().kt(STATUS_WORD[shown().cell.status])}
              </Pill>
              <Show when={shown().cell.publish_mode === "dry_run"}>
                <Pill tone="warn">{ctx().kt("dryRun")}</Pill>
              </Show>
            </div>
            <dl class="nsvx-of__dl">
              <dt>{ctx().kt("account")}</dt>
              <dd>{shown().cell.account_handle || shown().cell.account_url || "—"}</dd>
              <dt>{ctx().kt("lastCheck")}</dt>
              <dd>{stampOf(shown().cell.last_ok_at)}</dd>
              <dt>{ctx().kt("publishing")}</dt>
              <dd>{shown().cell.publish_mode || "—"}</dd>
              <dt>{ctx().kt("expires")}</dt>
              <dd>{shown().cell.token_expires_at?.slice(0, 10) ?? "—"}</dd>
              <Show when={shown().cell.setup_steps_total}>
                <dt>{ctx().kt("setup")}</dt>
                <dd>
                  {shown().cell.setup_steps_done ?? 0}/{shown().cell.setup_steps_total}
                </dd>
              </Show>
            </dl>
            <p class="nsvx-of__muted">{shown().cell.blocked_label || ctx().kt("noError")}</p>
            <p class="nsvx-of__muted">{ctx().kt("connectHint")}</p>
          </Panel>
        )}
      </Show>
      <SourceView source={source} t={ctx().t}>
        {() => (
          <div class="nsvx-of__list">
            <For
              each={apps()}
              keyed={(row) => row.app}
              fallback={<p class="nsvx__empty">{ctx().kt("noApps")}</p>}
            >
              {(row) => {
                const counts = () => socialCounts(row(), networks());
                return (
                  <Panel
                    title={row().app}
                    action={
                      <>
                        <Pill tone="ok" icon="done">
                          {counts().connected}
                        </Pill>
                        <Show when={counts().pending}>
                          <Pill tone="warn">{counts().pending}</Pill>
                        </Show>
                        <Show when={counts().failed}>
                          <Pill tone="bad" icon="alert">
                            {counts().failed}
                          </Pill>
                        </Show>
                      </>
                    }
                  >
                    <div class="nsvx-of__social">
                      <For each={networks()} keyed={(network) => network.code}>
                        {(network) => {
                          const cell = (): SocialCell =>
                            row().cells[network().code] ?? { status: "unavailable" };
                          return (
                            <button
                              type="button"
                              class={["nsvx-of__cell", `nsvx-of__cell--${cell().status}`]}
                              aria-label={`${network().label}: ${ctx().kt(STATUS_WORD[cell().status])}`}
                              title={`${network().label}: ${ctx().kt(STATUS_WORD[cell().status])}`}
                              onClick={() =>
                                setPicked({ app: row().app, network: network(), cell: cell() })
                              }
                            >
                              <BrandLogo channel={network().code} size={18} />
                              <span>{network().label}</span>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </Panel>
                );
              }}
            </For>
          </div>
        )}
      </SourceView>
    </div>
  );
}

function CountBars(props: { title: string; icon: IconName; empty: string; counts: Counts | undefined }) {
  const rows = () => countRows(props.counts);
  const max = () => Math.max(1, ...rows().map((row) => row.value));
  return (
    <Panel title={props.title} icon={props.icon}>
      <ul class="nsvx-of__bars">
        <For
          each={rows()}
          keyed={(row) => row.key}
          fallback={<p class="nsvx-of__muted">{props.empty}</p>}
        >
          {(row) => (
            <li>
              <span>{row().key}</span>
              <span class="nsvx-of__progress">
                <span style={{ width: `${Math.max(3, (row().value / max()) * 100)}%` }} />
              </span>
              <strong>{row().value}</strong>
            </li>
          )}
        </For>
      </ul>
    </Panel>
  );
}

function Report(props: { ctx: MarketingCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<MarketingAnalytics>(ctx().host, "marketingAnalytics"),
  );
  void source.refresh();
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => (
        <div class="nsvx-of">
          <div class="nsvx-of__grid">
            <CountBars
              title={ctx().kt("jobsTitle")}
              icon="activity"
              empty={ctx().kt("noRecords")}
              counts={data().jobs}
            />
            <CountBars
              title={ctx().kt("postsTitle")}
              icon="send"
              empty={ctx().kt("noRecords")}
              counts={data().posts}
            />
            <CountBars
              title={ctx().kt("scheduleTitle")}
              icon="agenda"
              empty={ctx().kt("noRecords")}
              counts={data().schedule}
            />
          </div>
          <p class="nsvx-of__muted">{ctx().kt("countsOnly")}</p>
        </div>
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
