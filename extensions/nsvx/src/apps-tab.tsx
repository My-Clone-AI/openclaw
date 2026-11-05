/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { DevicesView, GrantsView, KeysView } from "./apps-access.js";
import {
  appsTranslator,
  capabilityLabel,
  serviceLabel,
  stateLabel,
  type AppsKey,
} from "./apps-i18n.js";
import { ApiPanel, Challenges, LoginPanel, ScreenView } from "./apps-login.js";
import {
  AppLogo,
  channelName,
  createChange,
  Dot,
  Note,
  Row,
  view,
  when,
  type Ctx,
} from "./apps-ui.js";
import {
  isBrowserAccount,
  LIVE,
  sendState,
  tone,
  type Account,
  type AppsPage,
  type Challenge,
  type Schedule,
} from "./apps.js";
import { Switch } from "./people-ui.js";
import { createSource, Icon, matches, SourceView, type IconName, type T } from "./ui-kit.js";
import "./apps.css";

export const APPS_SECTIONS = ["apps", "services", "access", "grants", "keys"] as const;
export type AppsSection = (typeof APPS_SECTIONS)[number];
/** What the tab shows: a section, or one account (`app:<id>`), kept in the address for deep links. */
export type AppsOpen = AppsSection | `app:${string}`;

const SECTION_ICON: Record<AppsSection, IconName> = {
  apps: "apps",
  services: "server",
  access: "lock",
  grants: "shield",
  keys: "key",
};

const ORDER = ["whatsapp", "instagram", "telegram", "gmail", "drive", "standvirtual", "phone", "fixture"];
const MESSAGING = ["whatsapp", "instagram", "telegram"];
const GOOGLE = ["gmail", "drive"];

type Tile = { key: string; channel: string; label: string; account?: Account };

/** One tile per account; Gmail and Drive always show, since their grants live on the Google side. */
export function tilesFor(page: AppsPage): Tile[] {
  const tiles: Tile[] = [];
  for (const channel of GOOGLE) {
    const account = page.accounts.find((a) => a.channel === channel);
    tiles.push({ key: account?.id ?? channel, channel, label: account?.label ?? "", account });
  }
  for (const account of page.accounts) {
    if (tiles.some((tile) => tile.account?.id === account.id)) {
      continue;
    }
    // Every Gmail address lives inside the one Gmail tile.
    if (account.channel === "gmail" && account.mode === "live") {
      continue;
    }
    tiles.push({ key: account.id, channel: account.channel, label: account.label, account });
  }
  const rank = (channel: string) => ORDER.indexOf(channel) + 1 || ORDER.length + 1;
  return tiles.sort((a, b) => rank(a.channel) - rank(b.channel));
}

/** Gmail and Drive state come from the Google grants; other apps from their connection. */
export function tileState(tile: Tile, page: AppsPage): { tone: string; key?: AppsKey; state?: string } {
  if (GOOGLE.includes(tile.channel)) {
    if (page.google_client_missing) {
      return { tone: "warn", key: "googleKey" };
    }
    const google = page.google;
    const granted =
      tile.channel === "gmail"
        ? google?.gmail || (google?.gmail_addresses ?? []).some((a) => a.granted)
        : google?.drive || google?.drive_write;
    if (!granted) {
      return { tone: "off", key: "notGranted" };
    }
    return tile.account
      ? { tone: tone(tile.account.state), state: tile.account.state }
      : { tone: "ok", key: "granted" };
  }
  return tile.account
    ? { tone: tone(tile.account.state), state: tile.account.state }
    : { tone: "off", state: "disconnected" };
}

export function AppsTab(props: {
  host: ControlUiHost;
  t: T;
  locale: string;
  query: string;
  open: AppsOpen | undefined;
  onOpen: (open: AppsOpen) => void;
}) {
  const ctx: Ctx = {
    host: props.host,
    t: props.t,
    get at() {
      return appsTranslator(props.locale);
    },
    get locale() {
      return props.locale;
    },
  };
  const open = () => props.open ?? "apps";
  const section = (): AppsSection =>
    open().startsWith("app:") ? "apps" : (open() as AppsSection);
  const accountId = () => (open().startsWith("app:") ? open().slice(4) : undefined);
  return (
    <div class="nsvx-apps">
      <nav class="nsvx-apps-nav" aria-label={ctx.at("apps")}>
        <For each={[...APPS_SECTIONS]}>
          {(id) => (
            <button
              type="button"
              class={["nsvx-apps-nav__item", { "nsvx-apps-nav__item--on": section() === id }]}
              aria-pressed={section() === id ? "true" : "false"}
              onClick={() => props.onOpen(id)}
            >
              <Icon name={SECTION_ICON[id]} />
              <span>{ctx.at(id)}</span>
            </button>
          )}
        </For>
      </nav>
      <Show when={section() === "apps"}>
        <Show
          when={accountId()}
          fallback={
            <AppGrid ctx={ctx} query={props.query} onOpen={(id) => props.onOpen(`app:${id}`)} />
          }
        >
          {(id) => <AccountPage ctx={ctx} id={id()} onBack={() => props.onOpen("apps")} />}
        </Show>
      </Show>
      <Show when={section() === "services"}>
        <ServicesView ctx={ctx} />
      </Show>
      <Show when={section() === "access"}>
        <DevicesView ctx={ctx} />
      </Show>
      <Show when={section() === "grants"}>
        <GrantsView ctx={ctx} query={props.query} />
      </Show>
      <Show when={section() === "keys"}>
        <KeysView ctx={ctx} query={props.query} />
      </Show>
    </div>
  );
}

function AppGrid(props: { ctx: Ctx; query: string; onOpen: (key: string) => void }) {
  const ctx = props.ctx;
  const page = createSource(ctx.host, () => view<AppsPage>(ctx.host, "apps"));
  // Visual checks are optional: when the browser service is down the grid still shows.
  const challenges = createSource(ctx.host, () =>
    view<{ accounts: Challenge[] }>(ctx.host, "challenges").catch(() => ({ accounts: [] })),
  );
  const [picked, setPicked] = createSignal<string[]>([]);
  const change = createChange(ctx, () => page.refresh());
  onSettled(() => {
    void page.refresh();
    void challenges.refresh();
  });
  const checkPicked = async (tiles: Tile[]) => {
    for (const tile of tiles) {
      if (tile.account && picked().includes(tile.account.id)) {
        await change.run(`check:${tile.account.id}`, "nsvx.apps.change", {
          op: "check",
          id: tile.account.id,
        }, "checked");
      }
    }
    setPicked([]);
  };
  return (
    <>
      <Show when={(challenges.state().data?.accounts ?? []).length > 0}>
        <Challenges
          ctx={ctx}
          list={challenges.state().data?.accounts ?? []}
          onDone={() => void challenges.refresh()}
        />
      </Show>
      <SourceView source={page} t={ctx.t}>
        {(data) => {
          const tiles = createMemo(() =>
            tilesFor(data()).filter((tile) =>
              matches(props.query, channelName(tile.channel), tile.label),
            ),
          );
          return (
            <>
              <div class="nsvx-apps-bar">
                <span class="nsvx-apps-bar__count">
                  <Show when={picked().length > 0} fallback={ctx.at("pick")}>
                    {picked().length} {ctx.at("picked")}
                  </Show>
                </span>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={
                    picked().length === 0 ||
                    change.busy() !== undefined ||
                    !ctx.host.connection.canWrite
                  }
                  onClick={() => void checkPicked(tiles())}
                >
                  <Icon name="refresh" /> {ctx.at("checkPicked")}
                </button>
              </div>
              <Note change={change} />
              <Show
                when={tiles().length > 0}
                fallback={<p class="nsvx__empty">{ctx.t("noResults")}</p>}
              >
                <ul class="nsvx-apps-grid">
                  <For each={tiles()} keyed={(tile) => tile.key}>
                    {(tile) => {
                      const state = () => tileState(tile(), data());
                      const send = () => (tile().account ? sendState(tile().account!) : undefined);
                      const id = () => tile().account?.id;
                      return (
                        <li class="nsvx-apps-tile">
                          <button
                            type="button"
                            class="nsvx-apps-tile__main"
                            onClick={() => props.onOpen(tile().key)}
                          >
                            <AppLogo channel={tile().channel} size={44} />
                            <span class="nsvx-apps-tile__name">{channelName(tile().channel)}</span>
                            <Show when={tile().label && tile().label !== channelName(tile().channel)}>
                              <span class="nsvx-apps-tile__sub">{tile().label}</span>
                            </Show>
                            <Dot
                              tone={state().tone}
                              label={
                                state().key
                                  ? ctx.at(state().key!)
                                  : stateLabel(ctx.locale, state().state ?? "")
                              }
                            />
                            <Show when={send() && tile().channel !== "drive"}>
                              <span class={["nsvx-apps-send", `nsvx-apps-send--${send()}`]}>
                                <Icon name={send() === "on" ? "send" : send() === "paused" ? "pause" : "lock"} />
                                {ctx.at(`send_${send()!}` as AppsKey)}
                              </span>
                            </Show>
                            <Show when={tile().account?.mode === "fixture"}>
                              <span class="nsvx__chip">{ctx.at("test")}</span>
                            </Show>
                          </button>
                          <Show when={id()}>
                            {(accountId) => (
                              <label class="nsvx-apps-tile__pick">
                                <input
                                  type="checkbox"
                                  aria-label={`${ctx.at("pick")} ${channelName(tile().channel)} ${tile().label}`}
                                  checked={picked().includes(accountId())}
                                  onChange={(event) =>
                                    setPicked(
                                      event.currentTarget.checked
                                        ? [...picked(), accountId()]
                                        : picked().filter((x) => x !== accountId()),
                                    )
                                  }
                                />
                              </label>
                            )}
                          </Show>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              </Show>
              <ScheduleCard ctx={ctx} picked={picked()} accounts={data().accounts} />
            </>
          );
        }}
      </SourceView>
    </>
  );
}

/** NSVX's opt-in freshness check: on or off, daily or weekly, all apps or the picked ones. */
function ScheduleCard(props: { ctx: Ctx; picked: string[]; accounts: Account[] }) {
  const ctx = props.ctx;
  const schedule = createSource(ctx.host, () => view<Schedule>(ctx.host, "appsSchedule"));
  const change = createChange(ctx, () => schedule.refresh());
  onSettled(() => void schedule.refresh());
  const save = (current: Schedule, patch: Partial<Schedule>) =>
    void change.run("schedule", "nsvx.apps.change", {
      op: "schedule",
      enabled: patch.enabled ?? current.enabled,
      interval: patch.interval ?? current.interval,
      accountIds: patch.account_ids === undefined ? current.account_ids : patch.account_ids,
    }, "saved");
  const name = (id: string) => {
    const account = props.accounts.find((a) => a.id === id);
    return account ? `${channelName(account.channel)} ${account.label}`.trim() : id.slice(0, 8);
  };
  return (
    <section class="nsvx-apps-card" aria-label={ctx.at("auto")}>
      <SourceView source={schedule} t={ctx.t}>
        {(data) => (
          <>
            <div class="nsvx-apps-actions">
              <Switch
                label={ctx.at("auto")}
                icon="history"
                on={data().enabled}
                disabled={change.busy() !== undefined || !ctx.host.connection.canWrite}
                onChange={(on) => save(data(), { enabled: on })}
              />
              <div class="nsvx-seg" role="radiogroup" aria-label={ctx.at("auto")}>
                <For each={["daily", "weekly"] as ("daily" | "weekly")[]}>
                  {(interval) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={data().interval === interval ? "true" : "false"}
                      class={["nsvx-seg__item", { "nsvx-seg__item--on": data().interval === interval }]}
                      disabled={!ctx.host.connection.canWrite}
                      onClick={() => save(data(), { interval })}
                    >
                      {ctx.at(interval)}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="nsvx-apps-actions">
              <span class="nsvx__chip">
                {data().account_ids === null
                  ? ctx.at("allApps")
                  : `${data().account_ids!.length} ${ctx.at("picked")}`}
              </span>
              <button
                type="button"
                class="nsvx__button"
                disabled={props.picked.length === 0 || !ctx.host.connection.canWrite}
                onClick={() => save(data(), { account_ids: props.picked })}
              >
                {ctx.at("usePicked")}
              </button>
              <button
                type="button"
                class="nsvx__button"
                disabled={data().account_ids === null || !ctx.host.connection.canWrite}
                onClick={() => save(data(), { account_ids: null })}
              >
                {ctx.at("useAll")}
              </button>
            </div>
            <Show when={data().history.length > 0}>
              <h4 class="nsvx__heading">{ctx.at("lastRuns")}</h4>
              <ul class="nsvx-apps-runs">
                <For each={data().history.slice(0, 5)}>
                  {(run) => (
                    <li>
                      <time>{run.date}</time>
                      <span>
                        {run.queued.length
                          ? `${run.queued.map(name).join(", ")} · ${ctx.at("queued")}`
                          : ctx.at("nothingDue")}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Note change={change} />
          </>
        )}
      </SourceView>
    </section>
  );
}

function coverageOf(account: Account): { tone: string; text: string } {
  const c = account.coverage;
  const total = c ? Object.values(c).reduce((sum, n) => sum + n, 0) : 0;
  if (!c || !total) {
    return { tone: "off", text: "0" };
  }
  return { tone: c.full === total ? "ok" : c.none === total ? "off" : "warn", text: String(total) };
}

function AccountPage(props: { ctx: Ctx; id: string; onBack: () => void }) {
  const ctx = props.ctx;
  const page = createSource(ctx.host, () => view<AppsPage>(ctx.host, "apps"));
  const change = createChange(ctx, () => page.refresh());
  const [connecting, setConnecting] = createSignal(false);
  onSettled(() => void page.refresh());
  return (
    <div class="nsvx-apps-account">
      <button type="button" class="nsvx__button" onClick={() => props.onBack()}>
        <Icon name="back" /> {ctx.at("apps")}
      </button>
      <SourceView source={page} t={ctx.t}>
        {(data) => {
          const tile = createMemo(() =>
            tilesFor(data()).find((x) => x.key === props.id || x.account?.id === props.id),
          );
          return (
            <Show when={tile()} fallback={<p class="nsvx__empty">{ctx.at("noApps")}</p>}>
              {(found) => {
                const account = () => found().account;
                const state = () => tileState(found(), data());
                const google = () => GOOGLE.includes(found().channel);
                const messaging = () => MESSAGING.includes(found().channel);
                return (
                  <>
                    <header class="nsvx-apps-head">
                      <AppLogo channel={found().channel} size={56} />
                      <div>
                        <h2>{channelName(found().channel)}</h2>
                        <Show when={found().label && found().label !== channelName(found().channel)}>
                          <span class="nsvx-apps-tile__sub">{found().label}</span>
                        </Show>
                        <span class="nsvx-apps-actions">
                          <Show when={account()}>
                            <span class="nsvx__chip">
                              {ctx.at(account()!.mode === "fixture" ? "test" : "live")}
                            </span>
                          </Show>
                          <Show when={found().channel === "whatsapp" && account()?.mode === "live"}>
                            <span class="nsvx__chip">
                              {account()!.transport === "cloud" ? "Cloud API" : "WhatsApp Web"}
                            </span>
                          </Show>
                        </span>
                      </div>
                    </header>
                    <ul class="nsvx-apps-rows nsvx-apps-card">
                      <Row icon="link" label={ctx.at("connection")}>
                        <Dot
                          tone={state().tone}
                          label={state().key ? ctx.at(state().key!) : stateLabel(ctx.locale, state().state ?? "")}
                        />
                        <Show when={account()?.last_verified_at}>
                          <span class="nsvx-apps-muted">{when(ctx.locale, account()!.last_verified_at)}</span>
                        </Show>
                      </Row>
                      <Show when={account() && found().channel !== "drive"}>
                        <Row icon="send" label={ctx.at("sending")}>
                          <span class={["nsvx-apps-send", `nsvx-apps-send--${sendState(account()!)}`]}>
                            {ctx.at(`send_${sendState(account()!)}` as AppsKey)}
                          </span>
                        </Row>
                      </Show>
                      <Show when={account() && messaging()}>
                        <Row icon="history" label={ctx.at("history")}>
                          <Dot tone={coverageOf(account()!).tone} label={coverageOf(account()!).text} />
                        </Row>
                        <Row icon="eye" label={ctx.at("read")}>
                          <CapDot ctx={ctx} account={account()!} name="deltas" />
                        </Row>
                        <Row icon="edit" label={ctx.at("reply")}>
                          <CapDot ctx={ctx} account={account()!} name="send" />
                        </Row>
                      </Show>
                    </ul>
                    <Show when={account()?.freshness?.warning ?? account()?.state_detail}>
                      {(detail) => <p class="nsvx-apps-muted">{detail()}</p>}
                    </Show>
                    <Show when={google()}>
                      <GoogleGrants ctx={ctx} channel={found().channel} page={data()} />
                    </Show>
                    <Show when={found().channel === "drive" ? data().drive_stats : undefined}>
                      {(stats) => (
                        <ul class="nsvx-apps-stats">
                          <li>
                            <Icon name="doc" />
                            <strong>{stats().files.toLocaleString(ctx.locale)}</strong>
                            <span>{ctx.at("files")}</span>
                          </li>
                          <li>
                            <Icon name="done" />
                            <strong>{stats().indexed.toLocaleString(ctx.locale)}</strong>
                            <span>{ctx.at("inMemory")}</span>
                          </li>
                          <li>
                            <Icon name="people" />
                            <strong>{stats().people_files.toLocaleString(ctx.locale)}</strong>
                            <span>{ctx.at("peopleFiles")}</span>
                          </li>
                        </ul>
                      )}
                    </Show>
                    <Show when={account() && found().channel !== "drive" ? account() : undefined}>
                      {(acct) => (
                        <div class="nsvx-apps-card">
                          <div class="nsvx-apps-actions">
                            <Switch
                              label={ctx.at("pause")}
                              icon="pause"
                              on={acct().paused}
                              disabled={change.busy() !== undefined || !ctx.host.connection.canWrite}
                              onChange={(paused) =>
                                void change.run("pause", "nsvx.apps.change", {
                                  op: "pause",
                                  id: acct().id,
                                  paused,
                                })
                              }
                            />
                            <button
                              type="button"
                              class="nsvx__button"
                              disabled={change.busy() !== undefined || !ctx.host.connection.canWrite}
                              onClick={() =>
                                void change.run("check", "nsvx.apps.change", {
                                  op: "check",
                                  id: acct().id,
                                }, "checked")
                              }
                            >
                              <Icon name="refresh" /> {ctx.at("check")}
                            </button>
                            <Show when={isBrowserAccount(acct())}>
                              <button
                                type="button"
                                class={[
                                  "nsvx__button",
                                  { "nsvx__button--primary": !LIVE.includes(acct().state) },
                                ]}
                                aria-expanded={connecting() ? "true" : "false"}
                                disabled={!ctx.host.connection.canWrite}
                                onClick={() => setConnecting(!connecting())}
                              >
                                <Icon name={LIVE.includes(acct().state) ? "eye" : "qr"} />{" "}
                                {ctx.at(LIVE.includes(acct().state) ? "reconnect" : "connect")}
                              </button>
                            </Show>
                            <Show when={isBrowserAccount(acct()) && LIVE.includes(acct().state)}>
                              <ScreenView ctx={ctx} account={acct()} />
                            </Show>
                          </div>
                          <Note change={change} />
                          <Show when={connecting()}>
                            <LoginPanel
                              ctx={ctx}
                              account={acct()}
                              onDone={() => void page.refresh()}
                            />
                          </Show>
                        </div>
                      )}
                    </Show>
                    <Show
                      when={
                        account()?.mode === "live" &&
                        ["whatsapp", "instagram"].includes(found().channel)
                          ? account()
                          : undefined
                      }
                    >
                      {(acct) => <ApiPanel ctx={ctx} account={acct()} />}
                    </Show>
                    <Show
                      when={
                        account() && found().channel !== "drive"
                          ? Object.entries(account()!.capabilities ?? {})
                          : undefined
                      }
                    >
                      {(caps) => (
                        <Show when={caps().length > 0}>
                          <section class="nsvx-apps-card" aria-label={ctx.at("can")}>
                            <h3 class="nsvx__heading">{ctx.at("can")}</h3>
                            <ul class="nsvx-apps-caps">
                              <For each={caps()}>
                                {([name, cap]) => (
                                  <li>
                                    <span>{capabilityLabel(ctx.locale, name)}</span>
                                    <Dot
                                      tone={capTone(cap.status)}
                                      label={ctx.at(cap.status === "verified" ? "verifiedOk" : "pending")}
                                    />
                                  </li>
                                )}
                              </For>
                            </ul>
                          </section>
                        </Show>
                      )}
                    </Show>
                  </>
                );
              }}
            </Show>
          );
        }}
      </SourceView>
    </div>
  );
}

function capTone(status: string | undefined) {
  return status === "verified" ? "ok" : status === "gated" ? "bad" : status === "unsupported" ? "off" : "warn";
}

function CapDot(props: { ctx: Ctx; account: Account; name: string }) {
  const status = () => props.account.capabilities?.[props.name]?.status;
  return (
    <Dot
      tone={capTone(status())}
      label={props.ctx.at(status() === "verified" ? "verifiedOk" : "pending")}
    />
  );
}

/**
 * Google grants as NSVX holds them. Granting opens Google's own consent page, which returns only to NSVX, so it is
 * shown here and started in NSVX (a stated limit, not a link).
 */
function GoogleGrants(props: { ctx: Ctx; channel: string; page: AppsPage }) {
  const ctx = props.ctx;
  const google = () => props.page.google;
  const rows = (): { key: AppsKey; icon: IconName; granted: boolean | undefined; who?: string }[] =>
    props.channel === "gmail"
      ? (google()?.gmail_addresses?.length
          ? google()!.gmail_addresses!.map((a) => ({
              key: "gmailRead" as AppsKey,
              icon: "mail" as IconName,
              granted: a.granted,
              who: a.address,
            }))
          : [{ key: "gmailRead", icon: "mail", granted: google()?.gmail }])
      : [
          { key: "driveRead", icon: "eye", granted: google()?.drive },
          { key: "driveWrite", icon: "edit", granted: google()?.drive_write },
        ];
  return (
    <section class="nsvx-apps-card" aria-label={ctx.at("google")}>
      <ul class="nsvx-apps-rows">
        <For each={rows()}>
          {(row) => (
            <Row icon={row.icon} label={row.who ?? ctx.at(row.key)}>
              <Dot
                tone={props.page.google_client_missing ? "warn" : row.granted ? "ok" : "off"}
                label={ctx.at(
                  props.page.google_client_missing ? "googleKey" : row.granted ? "granted" : "notGranted",
                )}
              />
            </Row>
          )}
        </For>
      </ul>
      <p class="nsvx-apps-muted">
        <Icon name="lock" /> {ctx.at("googleOnly")}
      </p>
    </section>
  );
}

function ServicesView(props: { ctx: Ctx }) {
  const ctx = props.ctx;
  const page = createSource(ctx.host, () => view<AppsPage>(ctx.host, "apps"));
  onSettled(() => void page.refresh());
  const ICON: Record<string, IconName> = {
    runtime: "bot",
    memory: "star",
    stt: "mic",
    tts: "phone",
    browser: "apps",
    bridge: "link",
  };
  const order = ["runtime", "memory", "stt", "tts", "browser", "bridge"];
  return (
    <SourceView source={page} t={ctx.t}>
      {(data) => {
        const names = () => [
          ...order.filter((name) => name in data().services),
          ...Object.keys(data().services).filter((name) => !order.includes(name)),
        ];
        return (
          <ul class="nsvx-apps-grid">
            <For each={names()}>
              {(name) => {
                const service = () => data().services[name]!;
                return (
                  <li class="nsvx-apps-tile nsvx-apps-tile--static">
                    <span class="nsvx-apps-logo">
                      <Icon name={ICON[name] ?? "server"} />
                    </span>
                    <span class="nsvx-apps-tile__name">{serviceLabel(ctx.locale, name)}</span>
                    <Dot tone={service().ok ? "ok" : "bad"} label={ctx.at(service().ok ? "ok" : "down")} />
                    <Show when={name === "runtime" && service().model}>
                      <span class="nsvx-apps-tile__sub">
                        {service().model} · {service().effort}
                      </span>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        );
      }}
    </SourceView>
  );
}
