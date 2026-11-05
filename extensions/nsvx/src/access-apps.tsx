/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import {
  accountTone,
  appsSummary,
  isBrowserAccount,
  isConnected,
  liveAccounts,
  type Account,
  type AppsAnswer,
  type LoginField,
  type LoginState,
  type Screen,
} from "./access-data.js";
import { Action, Chip, Empty, RemoteScreen, since, Tiles, view, type Ctx } from "./access-ui.js";
import { BrandLogo } from "./messages-ui.js";
import { createSource, errorMessage, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

const SERVICES = ["browser", "runtime", "memory", "bridge", "tts", "stt"] as const;
const CHANNEL_ICON: Record<string, IconName> = {
  drive: "doc",
  phone: "phone",
  standvirtual: "globe",
};
export const CHANNEL_NAME: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
  gmail: "Gmail",
  drive: "Google Drive",
  standvirtual: "Standvirtual",
  phone: "Phone",
  uber_personal: "Uber",
};
const FAILED = new Set(["failed", "interrupted", "blocked_external", "disabled"]);
/** About three minutes of 3 s polls, as NSVX's own sign-in dialog waits. */
const POLLS = 60;

export function ChannelMark(props: { channel: string; size?: number }) {
  return (
    <span class="nsvx-acc__mark" aria-hidden="true">
      <Show
        when={["whatsapp", "instagram", "telegram", "gmail"].includes(props.channel)}
        fallback={<Icon name={CHANNEL_ICON[props.channel] ?? "plug"} />}
      >
        <BrandLogo channel={props.channel} size={props.size ?? 22} />
      </Show>
    </span>
  );
}

type Stage = "opening" | "qr" | "expired" | "form" | "waiting" | "connected" | "failed";

function stageOf(state: LoginState | undefined): Stage {
  if (!state) {
    return "opening";
  }
  if (!state.cached && isConnected(state)) {
    return "connected";
  }
  if (FAILED.has(state.state)) {
    return "failed";
  }
  if (state.state === "awaiting_login") {
    if (state.qr_expired) {
      return "expired";
    }
    if (state.qr_png_base64) {
      return "qr";
    }
    return state.login_step || state.view ? "form" : "waiting";
  }
  return state.state === "connecting" || state.state === "disconnected" ? "opening" : "waiting";
}

/** Signing in an app through NSVX's own browser: its QR code or the provider's page, used right here. */
function SignIn(props: { ctx: Ctx; account: Account; onClose: () => void }) {
  const a = props.ctx.a;
  const host = props.ctx.host;
  const aid = props.account.id;
  const ask = { refresh: true };
  const login = createSource(host, () =>
    view<LoginState>(host, "appLogin", { aid, ...(ask.refresh ? { refresh: "true" } : {}) }),
  );
  const screen = createSource(host, () => view<Screen>(host, "appLoginView", { aid }));
  const fields = createSource(host, () =>
    view<{ fields: LoginField[] }>(host, "appLoginFields", { aid }),
  );
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [fillError, setFillError] = createSignal<string>();
  const stage = createMemo(() => stageOf(login.state().data));
  const loadPage = () => {
    void screen.refresh();
    void fields.refresh();
  };
  const poll = async () => {
    await login.refresh();
    ask.refresh = false;
    if (stageOf(login.state().data) === "form") {
      loadPage();
    }
  };
  // NSVX records the owner's choice to connect once per account, then opens its browser on the provider.
  void (
    isConnected(props.account)
      ? Promise.resolve()
      : host.request("nsvx.access.login", { accountId: aid }).catch(() => undefined)
  ).then(poll);
  let polls = 0;
  const timer = setInterval(() => {
    const now = stageOf(login.state().data);
    if (now === "connected" || now === "failed" || ++polls > POLLS || login.state().loading) {
      return;
    }
    void poll();
  }, 3000);
  onCleanup(() => clearInterval(timer));
  const step = () => (stage() === "opening" ? 0 : stage() === "connected" ? 2 : 1);
  const send = (input: Record<string, unknown>) =>
    host.request("nsvx.access.loginInput", { accountId: aid, ...input });
  const fill = async () => {
    try {
      await host.request("nsvx.access.loginFill", { accountId: aid, values: values() });
      setValues({});
      setFillError(undefined);
      void poll();
    } catch (cause) {
      setFillError(errorMessage(host, cause));
    }
  };
  return (
    <div class="nsvx-acc__signin" role="group" aria-label={a("connect")}>
      <ol class="nsvx-acc__steps">
        <For each={[a("stepOpen"), a("stepSignIn"), a("stepDone")]} keyed={false}>
          {(label, index) => (
            <li
              class={{
                "nsvx-acc__step--done": index < step(),
                "nsvx-acc__step--now": index === step(),
              }}
              aria-current={index === step() ? "step" : undefined}
            >
              <span class="nsvx-acc__step-dot">
                {index < step() ? <Icon name="done" /> : index + 1}
              </span>
              <span>{label()}</span>
            </li>
          )}
        </For>
      </ol>
      <SourceView source={login} t={props.ctx.t}>
        {(state) => (
          <>
            <Show when={stage() === "qr" && state().qr_png_base64}>
              <figure class="nsvx-acc__qr">
                <img src={`data:image/png;base64,${state().qr_png_base64}`} alt="QR" />
                <figcaption>
                  <Icon name="qr" />
                  {a("scanQr")}
                </figcaption>
              </figure>
            </Show>
            <Show when={stage() === "expired"}>
              <Empty icon="qr" text={a("qrExpired")} />
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                onClick={() => {
                  ask.refresh = true;
                  polls = 0;
                  void poll();
                }}
              >
                <Icon name="refresh" />
                {a("newCode")}
              </button>
            </Show>
            <Show when={stage() === "form"}>
              <Show when={screen.state().data}>
                {(shot) => (
                  <RemoteScreen
                    ctx={props.ctx}
                    screen={shot()}
                    alt={CHANNEL_NAME[props.account.channel] ?? props.account.label}
                    send={send}
                    onInput={() => setTimeout(loadPage, 500)}
                    typing
                    scroll
                  />
                )}
              </Show>
              <Show when={(fields.state().data?.fields ?? []).length > 0}>
                <form
                  class="nsvx-acc__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void fill();
                  }}
                >
                  <For each={fields.state().data?.fields ?? []} keyed={(f) => f.index}>
                    {(f) => (
                      <label class="nsvx-acc__field">
                        <span>{f().label}</span>
                        <input
                          class="nsvx-acc__input"
                          type={f().kind === "password" ? "password" : "text"}
                          autocomplete={f().kind === "code" ? "one-time-code" : "off"}
                          inputmode={f().kind === "code" ? "numeric" : undefined}
                          value={values()[String(f().index)] ?? ""}
                          onInput={(event) =>
                            setValues({
                              ...values(),
                              [String(f().index)]: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                    )}
                  </For>
                  <button
                    type="submit"
                    class="nsvx__button nsvx__button--primary"
                    disabled={Object.values(values()).every((v) => !v)}
                  >
                    {a("fill")}
                  </button>
                  <Show when={fillError()}>
                    <p class="nsvx__error" role="alert">
                      {fillError()}
                    </p>
                  </Show>
                </form>
              </Show>
            </Show>
            <Show when={stage() === "opening" || stage() === "waiting"}>
              <p class="nsvx-acc__muted" aria-busy="true">
                {a("waiting")}
              </p>
            </Show>
            <Show when={stage() === "connected"}>
              <Empty icon="ok" text={a("stepDone")} />
            </Show>
            <Show when={stage() === "failed"}>
              <p class="nsvx__error" role="alert">
                {state().detail ?? a("bad")}
              </p>
            </Show>
          </>
        )}
      </SourceView>
      <button type="button" class="nsvx__button" onClick={() => props.onClose()}>
        <Icon name="close" />
        {a("close")}
      </button>
    </div>
  );
}

function AppCard(props: { ctx: Ctx; account: Account; onChange: () => void }) {
  const a = props.ctx.a;
  const [open, setOpen] = createSignal(false);
  const tone = createMemo(() => accountTone(props.account));
  const coverage = createMemo(() => {
    const c = props.account.coverage;
    return c ? Object.values(c).reduce((n, v) => n + v, 0) : 0;
  });
  return (
    <article
      class={["nsvx-acc__card", `nsvx-acc__card--${tone()}`, { "nsvx-acc__card--wide": open() }]}
      data-account={props.account.id}
    >
      <header class="nsvx-acc__card-head">
        <ChannelMark channel={props.account.channel} />
        <span class="nsvx-acc__id">
          <strong>{props.account.label}</strong>
          <Show
            when={
              (CHANNEL_NAME[props.account.channel] ?? props.account.channel) !== props.account.label
            }
          >
            <span>{CHANNEL_NAME[props.account.channel] ?? props.account.channel}</span>
          </Show>
        </span>
        <Chip a={a} tone={tone()} label={props.account.paused ? a("paused") : undefined} />
      </header>
      <Show when={props.account.state_detail && tone() !== "ok"}>
        <p class="nsvx-acc__detail">{props.account.state_detail}</p>
      </Show>
      <p class="nsvx-acc__muted">
        <Icon name="done" /> {since(props.ctx.locale, props.account.last_verified_at, a("never"))}
        <Show when={coverage() > 0}>
          {" · "}
          <Icon name="messages" /> {coverage()}
        </Show>
      </p>
      <div class="nsvx-acc__acts">
        <Show when={isBrowserAccount(props.account)}>
          <button
            type="button"
            class={["nsvx__button", { "nsvx__button--primary": !isConnected(props.account) }]}
            aria-expanded={open() ? "true" : "false"}
            onClick={() => setOpen(!open())}
          >
            <Icon name={isConnected(props.account) ? "device" : "link"} />
            {isConnected(props.account) ? a("show") : a("connect")}
          </button>
        </Show>
        <Action
          ctx={props.ctx}
          label={a("check")}
          icon="refresh"
          method="nsvx.access.check"
          params={() => ({ accountId: props.account.id })}
          onDone={props.onChange}
        />
        <Action
          ctx={props.ctx}
          label={props.account.paused ? a("resume") : a("pause")}
          icon={props.account.paused ? "resume" : "pause"}
          method="nsvx.access.pause"
          params={() => ({ accountId: props.account.id, paused: !props.account.paused })}
          onDone={props.onChange}
        />
      </div>
      <Show when={open()}>
        <SignIn
          ctx={props.ctx}
          account={props.account}
          onClose={() => {
            setOpen(false);
            props.onChange();
          }}
        />
      </Show>
    </article>
  );
}

function GoogleCard(props: { ctx: Ctx; data: AppsAnswer }) {
  const a = props.ctx.a;
  const grants = createMemo(() => [
    ...(props.data.google?.gmail_addresses ?? []).map((g) => ({
      key: g.address,
      label: g.address,
      on: g.granted,
      icon: "gmail" as const,
    })),
    {
      key: "drive",
      label: a("driveRead"),
      on: Boolean(props.data.google?.drive),
      icon: "drive" as const,
    },
    {
      key: "drive_write",
      label: a("driveWrite"),
      on: Boolean(props.data.google?.drive_write),
      icon: "drive" as const,
    },
  ]);
  return (
    <article class="nsvx-acc__card nsvx-acc__card--google">
      <header class="nsvx-acc__card-head">
        <ChannelMark channel="gmail" />
        <span class="nsvx-acc__id">
          <strong>{a("google")}</strong>
          <span>{props.data.google_client_missing ? a("googleKey") : a("googleConsent")}</span>
        </span>
      </header>
      <ul class="nsvx-acc__grants">
        <For each={grants()} keyed={(g) => g.key}>
          {(g) => (
            <li>
              <ChannelMark channel={g().icon} size={16} />
              <span>{g().label}</span>
              <Chip a={a} tone={g().on ? "ok" : "off"} />
            </li>
          )}
        </For>
      </ul>
    </article>
  );
}

export function Apps(props: { ctx: Ctx }) {
  const a = props.ctx.a;
  const host = props.ctx.host;
  const apps = createSource(host, () => view<AppsAnswer>(host, "apps"));
  void apps.refresh();
  return (
    <SourceView source={apps} t={props.ctx.t}>
      {(data) => {
        const summary = createMemo(() => appsSummary(data().accounts));
        const shown = createMemo(() =>
          liveAccounts(data().accounts).filter((x) =>
            matches(props.ctx.query, x.label, x.channel, x.state),
          ),
        );
        return (
          <div class="nsvx-acc__section">
            <Tiles
              items={[
                { label: a("connected"), value: summary().connected, tone: "ok", icon: "plug" },
                { label: a("attention"), value: summary().attention, tone: "warn", icon: "alert" },
                { label: a("paused"), value: summary().paused, tone: "off", icon: "pause" },
              ]}
            />
            <ul class="nsvx-acc__services" aria-label={a("services")}>
              <For each={SERVICES.filter((name) => data().services[name])} keyed={(name) => name}>
                {(name) => (
                  <li
                    class={[
                      "nsvx-acc__service",
                      data().services[name()]?.ok
                        ? "nsvx-acc__service--ok"
                        : "nsvx-acc__service--bad",
                    ]}
                    data-service={name()}
                  >
                    <span class="nsvx-acc__dot" aria-hidden="true" />
                    {a(name())}
                  </li>
                )}
              </For>
            </ul>
            <Show when={shown().length > 0} fallback={<Empty icon="plug" text={a("off")} />}>
              <div class="nsvx-acc__grid">
                <For each={shown()} keyed={(x) => x.id}>
                  {(x) => (
                    <AppCard ctx={props.ctx} account={x()} onChange={() => void apps.refresh()} />
                  )}
                </For>
                <GoogleCard ctx={props.ctx} data={data()} />
              </div>
            </Show>
          </div>
        );
      }}
    </SourceView>
  );
}
