/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { saveNsvxFile } from "./aviation-kit.js";
import { createAction, Note, view, type Ctx } from "./device-kit.js";
import {
  countRows,
  MAIN_NETWORKS,
  safeSocialApps,
  socialCounts,
  type Counts,
  type MarketingAnalytics,
  type MarketingChannels,
  type SocialCell,
  type SocialNetwork,
} from "./marketing-data.js";
import type { KT, MarketingKey } from "./marketing-i18n.js";
import { BrandLogo } from "./messages-ui.js";
import { Panel, Pill, Toggle } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import { createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";
import "./device.css";
import "./office.css";

export type MarketingCtx = Ctx & { kt: KT; locale: string };

const STATUS_WORD: Record<SocialCell["status"], MarketingKey> = {
  connected: "connected",
  pending: "pending",
  unavailable: "unavailable",
  failed: "failed",
};
const STATUS_TONE = {
  connected: "ok",
  pending: "warn",
  unavailable: "off",
  failed: "bad",
} as const;

export function Accounts(props: { ctx: MarketingCtx }) {
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
              <IconButton
                icon="close"
                label={ctx().kt("back")}
                onClick={() => setPicked(undefined)}
              />
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

function CountBars(props: {
  title: string;
  icon: IconName;
  empty: string;
  counts: Counts | undefined;
}) {
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

export function Report(props: { ctx: MarketingCtx }) {
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
