/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Apps, CHANNEL_NAME, ChannelMark } from "./access-apps.js";
import {
  HOOK_CHANNELS,
  hookCounts,
  hookTone,
  liveAccounts,
  type Account,
  type AppsAnswer,
  type Challenge,
  type Hooks as HookState,
  type Screen,
} from "./access-data.js";
import { accessTranslator } from "./access-i18n.js";
import { People } from "./access-people.js";
import { Logins, SignIns } from "./access-signins.js";
import { Action, Chip, Empty, RemoteScreen, since, view, type Ctx } from "./access-ui.js";
import { createSource, Icon, matches, SourceView, type IconName, type T } from "./ui-kit.js";
import "./access.css";

type Section = "apps" | "signins" | "logins" | "checks" | "people" | "hooks";
const SECTIONS: Section[] = ["apps", "signins", "logins", "checks", "people", "hooks"];
const ICON: Record<Section, IconName> = {
  apps: "plug",
  signins: "lock",
  logins: "key",
  checks: "hand",
  people: "people",
  hooks: "link",
};

/** Visual checks (CAPTCHA) NSVX's browser is waiting on, solved by tapping NSVX's own page here. */
function Checks(props: { ctx: Ctx }) {
  const a = props.ctx.a;
  const host = props.ctx.host;
  const list = createSource(host, () => view<{ accounts: Challenge[] }>(host, "challenges"));
  void list.refresh();
  const ask = { account: "" };
  const [open, setOpen] = createSignal<string>();
  const screen = createSource(host, () =>
    view<Screen>(host, "challengeView", { account: ask.account }),
  );
  const show = (account: string) => {
    ask.account = account;
    setOpen(account);
    void screen.refresh();
  };
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => (
        <Show when={data().accounts.length > 0} fallback={<Empty icon="ok" text={a("noChecks")} />}>
          <ul class="nsvx-list">
            <For each={data().accounts} keyed={(c) => c.id}>
              {(c) => (
                <li class="nsvx-acc__login" data-challenge={c().id}>
                  <div class="nsvx-row">
                    <ChannelMark channel={c().channel} />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">
                        {CHANNEL_NAME[c().channel] ?? c().channel.replace(/_/g, " ")}
                      </span>
                      <span class="nsvx-row__detail">
                        {c().failures}/2 {a("attempts")}
                      </span>
                    </span>
                    <Chip a={a} tone={c().visual_required ? "warn" : "busy"} />
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--primary"
                      onClick={() => show(c().id)}
                    >
                      <Icon name="hand" />
                      {a("solve")}
                    </button>
                  </div>
                  <Show when={open() === c().id}>
                    <SourceView source={screen} t={props.ctx.t}>
                      {(shot) => (
                        <div class="nsvx-acc__signin">
                          <RemoteScreen
                            ctx={props.ctx}
                            screen={shot()}
                            alt="CAPTCHA"
                            send={(input) =>
                              host.request("nsvx.access.challengeInput", {
                                account: c().id,
                                ...input,
                              })
                            }
                            onInput={() => void screen.refresh()}
                            scroll
                          />
                          <div class="nsvx-acc__acts">
                            <button
                              type="button"
                              class="nsvx__button"
                              onClick={() => void screen.refresh()}
                            >
                              <Icon name="refresh" />
                              {a("refresh")}
                            </button>
                            <Action
                              ctx={props.ctx}
                              label={a("resume")}
                              icon="resume"
                              primary
                              method="nsvx.access.challengeResume"
                              params={() => ({ account: c().id })}
                              onDone={() => {
                                setOpen(undefined);
                                void list.refresh();
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </SourceView>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      )}
    </SourceView>
  );
}

function HookCard(props: { ctx: Ctx; account: Account }) {
  const a = props.ctx.a;
  const host = props.ctx.host;
  const state = createSource(host, () =>
    view<HookState>(host, "providerHooks", { aid: props.account.id }),
  );
  void state.refresh();
  return (
    <article class="nsvx-acc__card" data-hooks={props.account.id}>
      <header class="nsvx-acc__card-head">
        <ChannelMark channel={props.account.channel} />
        <span class="nsvx-acc__id">
          <strong>{props.account.label}</strong>
          <span>Meta</span>
        </span>
        <Show when={state.state().data}>{(h) => <Chip a={a} tone={hookTone(h())} />}</Show>
      </header>
      <SourceView source={state} t={props.ctx.t}>
        {(h) => {
          const counts = createMemo(() => hookCounts(h()));
          return (
            <Show when={h().binding} fallback={<Empty icon="plug" text={a("hookOff")} />}>
              {(binding) => (
                <>
                  <ol class="nsvx-acc__flow" aria-label={a("hooks")}>
                    <li class="nsvx-acc__flow-node">
                      <ChannelMark channel={props.account.channel} size={18} />
                    </li>
                    <li
                      class={[
                        "nsvx-acc__flow-link",
                        { "nsvx-acc__flow-link--ok": Boolean(binding().webhook_challenged_at) },
                      ]}
                    >
                      {a("challenged")}
                    </li>
                    <li
                      class={[
                        "nsvx-acc__flow-link",
                        {
                          "nsvx-acc__flow-link--ok":
                            h().milestones.webhook_subscribed === "verified",
                        },
                      ]}
                    >
                      {a("subscribed")}
                    </li>
                    <li class="nsvx-acc__flow-node">
                      <Icon name="shield" />
                    </li>
                  </ol>
                  <dl class="nsvx-acc__stats">
                    <div>
                      <dt>{a("received")}</dt>
                      <dd>{counts().received}</dd>
                    </div>
                    <div>
                      <dt>{a("held")}</dt>
                      <dd>{counts().held}</dd>
                    </div>
                    <div>
                      <dt>{a("rejected")}</dt>
                      <dd>{counts().rejected}</dd>
                    </div>
                    <div>
                      <dt>{a("lastEvent")}</dt>
                      <dd>{since(props.ctx.locale, binding().last_event_at, a("never"))}</dd>
                    </div>
                  </dl>
                  <Show when={binding().health_code}>
                    <p class="nsvx-acc__muted">{binding().health_code?.replace(/_/g, " ")}</p>
                  </Show>
                  <Action
                    ctx={props.ctx}
                    label={a("check")}
                    icon="refresh"
                    method="nsvx.access.hookCheck"
                    params={() => ({ accountId: props.account.id })}
                    onDone={() => void state.refresh()}
                  />
                </>
              )}
            </Show>
          );
        }}
      </SourceView>
    </article>
  );
}

/** Provider hooks NSVX shows its owner: the Meta webhooks behind WhatsApp and Instagram. */
function Hooks(props: { ctx: Ctx }) {
  const host = props.ctx.host;
  const apps = createSource(host, () => view<AppsAnswer>(host, "apps"));
  void apps.refresh();
  return (
    <SourceView source={apps} t={props.ctx.t}>
      {(data) => {
        const hooked = createMemo(() =>
          liveAccounts(data().accounts).filter(
            (x) =>
              HOOK_CHANNELS.includes(x.channel) && matches(props.ctx.query, x.label, x.channel),
          ),
        );
        return (
          <Show
            when={hooked().length > 0}
            fallback={<Empty icon="link" text={props.ctx.a("noHooks")} />}
          >
            <div class="nsvx-acc__grid">
              <For each={hooked()} keyed={(x) => x.id}>
                {(x) => <HookCard ctx={props.ctx} account={x()} />}
              </For>
            </div>
          </Show>
        );
      }}
    </SourceView>
  );
}

export function AccessTab(props: { host: ControlUiHost; t: T; query: string; locale: string }) {
  const search = new URLSearchParams(location.search);
  const initial = search.get("acc") as Section | null;
  const [section, setSection] = createSignal<Section>(
    initial && SECTIONS.includes(initial) ? initial : "apps",
  );
  const ctx = createMemo<Ctx>(() => ({
    host: props.host,
    t: props.t,
    a: accessTranslator(props.locale),
    query: props.query,
    locale: props.locale,
  }));
  // Deep links: the address keeps the section.
  const go = (next: Section) => {
    setSection(next);
    const url = new URL(location.href);
    url.searchParams.set("acc", next);
    history.replaceState(history.state, "", url);
  };
  return (
    <div class="nsvx-acc">
      <div class="nsvx-seg nsvx-acc__nav" role="radiogroup" aria-label={ctx().a("access")}>
        <For each={SECTIONS} keyed={false}>
          {(item) => (
            <button
              type="button"
              role="radio"
              aria-checked={section() === item() ? "true" : "false"}
              class={["nsvx-seg__item", { "nsvx-seg__item--on": section() === item() }]}
              onClick={() => go(item())}
            >
              <Icon name={ICON[item()]} />
              <span>{ctx().a(item())}</span>
            </button>
          )}
        </For>
      </div>
      <For each={[section()]} keyed={(key) => key}>
        {(current) => (
          <>
            <Show when={current() === "apps"}>
              <Apps ctx={ctx()} />
            </Show>
            <Show when={current() === "signins"}>
              <SignIns ctx={ctx()} />
            </Show>
            <Show when={current() === "logins"}>
              <Logins ctx={ctx()} />
            </Show>
            <Show when={current() === "checks"}>
              <Checks ctx={ctx()} />
            </Show>
            <Show when={current() === "people"}>
              <People ctx={ctx()} />
            </Show>
            <Show when={current() === "hooks"}>
              <Hooks ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
