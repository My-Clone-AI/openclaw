/** @jsxImportSource @solidjs/web */
import { createSignal, For, onCleanup, onSettled, Show } from "solid-js";
import {
  LIVE,
  QR_CHANNELS,
  type Account,
  type ApiStatus,
  type Challenge,
  type ChallengeView,
  type LoginField,
  type LoginState,
  type LoginView,
} from "./apps.js";
import {
  channelName,
  createChange,
  Dot,
  Note,
  RemotePage,
  Row,
  view,
  when,
  type Ctx,
} from "./apps-ui.js";
import { createSource, errorMessage, Icon, SourceView } from "./ui-kit.js";

const FAILED = ["failed", "interrupted", "blocked_external", "disabled"];
/** A sign-in is followed for this long; after that the owner taps again. */
const LOGIN_TRIES = 100;

type Stage = "opening" | "qr" | "expired" | "page" | "waiting" | "connected" | "failed";

function stageOf(state: LoginState | undefined, left: number | undefined): Stage {
  if (!state) {
    return "opening";
  }
  if (!state.cached && LIVE.includes(state.state)) {
    return "connected";
  }
  if (FAILED.includes(state.state)) {
    return "failed";
  }
  if (state.state === "awaiting_login") {
    if (state.qr_expired || (state.qr_png_base64 && left === 0)) {
      return "expired";
    }
    if (state.qr_png_base64) {
      return "qr";
    }
    return state.login_step || state.view ? "page" : "waiting";
  }
  return state.state === "connecting" || state.state === "disconnected" ? "opening" : "waiting";
}

/**
 * Browser sign-in for WhatsApp, Telegram, Instagram, and Standvirtual: the real QR code, or the provider's page with
 * its own fields. Typed values go straight to the provider page through NSVX and are dropped here after sending.
 */
export function LoginPanel(props: { ctx: Ctx; account: Account; onDone: () => void }) {
  const ctx = props.ctx;
  const [state, setState] = createSignal<LoginState>();
  const [page, setPage] = createSignal<LoginView>();
  const [fields, setFields] = createSignal<LoginField[]>([]);
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [error, setError] = createSignal<string>();
  const [deadline, setDeadline] = createSignal<number>();
  const [now, setNow] = createSignal(Date.now());
  const [stopped, setStopped] = createSignal(false);
  const change = createChange(ctx, () => undefined);
  const id = props.account.id;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tries = 0;
  // Plain flag: the loop reads it at once, while the signal renders the same state after the next flush.
  let finished = false;
  const left = () => {
    const end = deadline();
    return end === undefined ? undefined : Math.max(0, Math.round((end - now()) / 1000));
  };
  const stage = () => stageOf(state(), left());

  const load = async (refresh: boolean) => {
    try {
      const next = await view<LoginState>(ctx.host, "appLogin", {
        id,
        ...(refresh ? { refresh: "true" } : {}),
      });
      setState(next);
      setError(undefined);
      setDeadline(
        next.qr_png_base64 && !next.qr_expired && typeof next.qr_expires_in_s === "number"
          ? Date.now() + next.qr_expires_in_s * 1000
          : undefined,
      );
      if (!next.cached && LIVE.includes(next.state)) {
        finished = true;
        setStopped(true);
        props.onDone();
        return;
      }
      if (!next.qr_png_base64 && (next.login_step || next.view)) {
        const [shot, form] = await Promise.all([
          view<LoginView>(ctx.host, "appLoginView", { id }),
          view<{ fields: LoginField[] }>(ctx.host, "appLoginFields", { id }).catch(() => ({
            fields: [],
          })),
        ]);
        setPage(shot);
        // The provider's form changed: typed values may now point at other inputs, so drop them.
        const signature = (list: LoginField[]) => list.map((f) => `${f.index}:${f.kind}`).join("|");
        if (signature(form.fields) !== signature(fields())) {
          setFields(form.fields);
          setValues({});
        }
      } else {
        setPage(undefined);
      }
    } catch (cause) {
      setError(errorMessage(ctx.host, cause));
    }
  };
  const loop = async (refresh: boolean) => {
    clearTimeout(timer);
    await load(refresh);
    tries += 1;
    if (!finished && !ctx.host.signal.aborted && tries < LOGIN_TRIES) {
      timer = setTimeout(() => void loop(false), 3000);
    } else if (tries >= LOGIN_TRIES) {
      finished = true;
      setStopped(true);
    }
  };
  const clock = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => {
    clearTimeout(timer);
    clearInterval(clock);
  });
  onSettled(() => {
    // NSVX records the owner's choice before a first sign-in, as its own screen does.
    if (!(props.account.policy_review ?? "").startsWith("risk_acknowledged")) {
      void ctx.host.request("nsvx.apps.change", { op: "connect", id }).catch(() => undefined);
    }
    void loop(true);
  });
  const restart = () => {
    tries = 0;
    finished = false;
    setStopped(false);
    void loop(true);
  };
  const tap = (point: { x: number; y: number }) =>
    void change
      .run("tap", "nsvx.apps.change", { op: "input", id, kind: "click", ...point })
      .then(() => setTimeout(() => void load(false), 500));
  const submit = async () => {
    const filled = Object.fromEntries(Object.entries(values()).filter(([, v]) => v !== ""));
    if (Object.keys(filled).length === 0) {
      return;
    }
    const ok = await change.run("fill", "nsvx.apps.change", { op: "fill", id, values: filled });
    setValues({});
    if (ok !== undefined) {
      setTimeout(() => void load(false), 800);
    }
  };
  const telegram = props.account.channel === "telegram";
  const steps = ["opening", "scan", "connected"] as const;
  const at = () => (stage() === "opening" ? 0 : stage() === "connected" ? 2 : 1);
  return (
    <div class="nsvx-apps-login" aria-label={`${ctx.at("connect")} ${channelName(props.account.channel)}`}>
      <ol class="nsvx-apps-steps">
        <For each={[...steps]}>
          {(step, index) => (
            <li
              class={{
                "nsvx-apps-steps--done": index() < at(),
                "nsvx-apps-steps--now": index() === at(),
              }}
              aria-current={index() === at() ? "step" : undefined}
            >
              <span class="nsvx-apps-steps__dot">
                <Show when={index() < at()} fallback={index() + 1}>
                  <Icon name="done" />
                </Show>
              </span>
              <span>
                {ctx.at(step === "scan" ? (QR_CHANNELS.includes(props.account.channel) ? "scan" : "onPage") : step)}
              </span>
            </li>
          )}
        </For>
      </ol>
      <Show when={error()}>
        <p class="nsvx__notice nsvx__notice--bad" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={stage() === "connected"}>
        <p class="nsvx-apps-ok" role="status">
          <Icon name="done" /> {ctx.at("connected")}
        </p>
      </Show>
      <Show when={stage() === "failed"}>
        <p class="nsvx__notice nsvx__notice--bad" role="status">
          {state()?.detail ?? ctx.at("failed")}
        </p>
      </Show>
      <Show when={stage() === "waiting" || stage() === "opening"}>
        <p class="nsvx__empty" aria-busy="true">
          {ctx.at(stage() === "opening" ? "opening" : "waiting")}
        </p>
      </Show>
      <Show when={stage() === "qr" ? state()?.qr_png_base64 : undefined}>
        {(qr) => (
          <figure class="nsvx-apps-qr">
            <span class="nsvx-apps-qr__frame">
              <img
                src={`data:image/png;base64,${qr()}`}
                alt={`QR ${channelName(props.account.channel)}`}
              />
            </span>
            <figcaption>
              <Show when={left() !== undefined}>
                <span class="nsvx-apps-qr__left">
                  {ctx.at("expiresIn")} {left()} s
                </span>
              </Show>
              <span class="nsvx-apps-qr__steps">
                {ctx.at(telegram ? "scanTelegram" : "scanSteps")}
              </span>
            </figcaption>
          </figure>
        )}
      </Show>
      <Show when={stage() === "expired" || (stopped() && stage() !== "connected")}>
        <button type="button" class="nsvx__button nsvx__button--primary" onClick={restart}>
          <Icon name="refresh" /> {ctx.at("newCode")}
        </button>
      </Show>
      <Show when={stage() === "page" ? page() : undefined}>
        {(shot) => (
          <div class="nsvx-apps-pageform">
            <Show when={fields().length > 0}>
              <form
                class="nsvx-apps-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <For each={fields()} keyed={(field) => field.index}>
                  {(field) => (
                    <label class="nsvx-field">
                      <span>{field().label || field().kind}</span>
                      <input
                        type={field().kind === "password" ? "password" : "text"}
                        autocomplete={field().kind === "password" ? "current-password" : "off"}
                        inputmode={field().kind === "code" ? "numeric" : undefined}
                        value={values()[String(field().index)] ?? ""}
                        onInput={(event) =>
                          setValues({
                            ...values(),
                            [String(field().index)]: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                  )}
                </For>
                <button
                  type="submit"
                  class="nsvx__button nsvx__button--primary"
                  disabled={change.busy() !== undefined || !ctx.host.connection.canWrite}
                >
                  <Icon name="send" /> {ctx.at("send")}
                </button>
              </form>
            </Show>
            <RemotePage
              src={`data:image/png;base64,${shot().png_base64}`}
              alt={ctx.at("tapPage")}
              width={shot().width}
              height={shot().height}
              disabled={change.busy() !== undefined || !ctx.host.connection.canWrite}
              onTap={tap}
            />
          </div>
        )}
      </Show>
      <Note change={change} />
    </div>
  );
}

/** The signed-in app as NSVX's browser sees it: an audited look, never an input. */
export function ScreenView(props: { ctx: Ctx; account: Account }) {
  const ctx = props.ctx;
  const [open, setOpen] = createSignal(false);
  const shot = createSource(ctx.host, () =>
    ctx.host.request<{ image: string; at: string }>("nsvx.apps.change", {
      op: "screen",
      id: props.account.id,
    }),
  );
  return (
    <>
      <button
        type="button"
        class="nsvx__button"
        disabled={!ctx.host.connection.canWrite}
        onClick={() => {
          const next = !open();
          setOpen(next);
          if (next) {
            void shot.refresh();
          }
        }}
        aria-expanded={open() ? "true" : "false"}
      >
        <Icon name="eye" /> {ctx.at("screen")}
      </button>
      <Show when={open()}>
        <div class="nsvx-apps-screen">
          <SourceView source={shot} t={ctx.t}>
            {(data) => (
              <figure>
                <img src={data().image} alt={channelName(props.account.channel)} />
                <figcaption>
                  {ctx.at("screenAt")} {when(ctx.locale, data().at)}
                </figcaption>
              </figure>
            )}
          </SourceView>
        </div>
      </Show>
    </>
  );
}

const MILESTONE_TONE: Record<string, string> = { verified: "ok", observed: "ok", pending: "warn" };

/**
 * WhatsApp Cloud and Instagram API: the provider webhook and its checks, as NSVX records them (provider-signed events
 * arrive at NSVX directly; this shows whether they do).
 */
export function ApiPanel(props: { ctx: Ctx; account: Account }) {
  const ctx = props.ctx;
  const status = createSource(ctx.host, () =>
    view<ApiStatus>(ctx.host, "appApi", { id: props.account.id }),
  );
  const change = createChange(ctx, () => status.refresh());
  onSettled(() => void status.refresh());
  const milestone = (s: ApiStatus, key: string, at: string | null | undefined) => {
    const value = s.milestones[key];
    const tone = at ? "ok" : (MILESTONE_TONE[value ?? ""] ?? "off");
    return (
      <Dot
        tone={tone}
        label={
          at ? when(ctx.locale, at) : value === "verified" ? ctx.at("verifiedOk") : ctx.at("pending")
        }
      />
    );
  };
  return (
    <section class="nsvx-apps-card" aria-label={ctx.at("api")}>
      <header class="nsvx-apps-card__head">
        <Icon name="link" />
        <h3>{ctx.at("api")}</h3>
      </header>
      <SourceView source={status} t={ctx.t}>
        {(data) => (
          <Show
            when={data().binding}
            fallback={<p class="nsvx__empty">{ctx.at("notSet")}</p>}
          >
            {(binding) => (
              <>
                <ul class="nsvx-apps-rows">
                  <Row icon="plug" label={ctx.at("hook")}>
                    {milestone(data(), "webhook_subscribed", binding().webhook_challenged_at)}
                  </Row>
                  <Row icon="done" label={ctx.at("subscribed")}>
                    {milestone(data(), "webhook_subscribed", binding().subscribed_at)}
                  </Row>
                  <Row icon="messages" label={ctx.at("receiving")}>
                    {milestone(data(), "receiving", binding().receiving_verified_at)}
                  </Row>
                  <Row icon="send" label={ctx.at("replying")}>
                    {milestone(data(), "reply", binding().reply_verified_at)}
                  </Row>
                  <Row icon="activity" label={ctx.at("lastEvent")}>
                    <span>{when(ctx.locale, binding().last_event_at) || "—"}</span>
                  </Row>
                  <Show when={(data().signature_rejections ?? 0) > 0}>
                    <Row icon="alert" label={ctx.at("rejected")}>
                      <Dot tone="bad" label={String(data().signature_rejections)} />
                    </Row>
                  </Show>
                </ul>
                <Show when={data().events.length > 0}>
                  <p class="nsvx-apps-events">
                    <For each={data().events}>
                      {(event) => (
                        <span class="nsvx__chip">
                          {event.kind} · {event.state} · {event.n}
                        </span>
                      )}
                    </For>
                  </p>
                </Show>
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={change.busy() !== undefined || !ctx.host.connection.canWrite}
                  onClick={() =>
                    void change.run("api", "nsvx.apps.change", {
                      op: "apiCheck",
                      id: props.account.id,
                    }, "checked")
                  }
                >
                  <Icon name="refresh" /> {ctx.at("check")}
                </button>
                <Note change={change} />
              </>
            )}
          </Show>
        )}
      </SourceView>
    </section>
  );
}

/** Visual checks (CAPTCHA) a browser task stopped on; the owner solves them on the real page. */
export function Challenges(props: { ctx: Ctx; list: Challenge[]; onDone: () => void }) {
  const ctx = props.ctx;
  const [open, setOpen] = createSignal<string>();
  const [shot, setShot] = createSignal<ChallengeView>();
  const change = createChange(ctx, () => undefined);
  const load = async (id: string) => {
    setOpen(id);
    try {
      setShot(await view<ChallengeView>(ctx.host, "challengeView", { id }));
    } catch {
      setShot(undefined);
    }
  };
  const input = async (action: Record<string, unknown>) => {
    const id = open();
    if (!id) {
      return;
    }
    const next = await change.run<ChallengeView>("input", "nsvx.apps.change", {
      op: "challengeInput",
      id,
      ...action,
    });
    if (next?.image) {
      setShot(next);
    }
  };
  return (
    <section class="nsvx-apps-card nsvx-apps-card--warn" aria-label={ctx.at("challenge")}>
      <header class="nsvx-apps-card__head">
        <Icon name="alert" />
        <h3>{ctx.at("challenge")}</h3>
      </header>
      <ul class="nsvx-apps-rows">
        <For each={props.list} keyed={(item) => item.id}>
          {(item) => (
            <li class="nsvx-apps-row">
              <Icon name="hand" />
              <span class="nsvx-apps-row__what">
                {item().channel === "uber_personal" ? "Uber" : channelName(item().channel)}
              </span>
              <span class="nsvx-apps-row__value">
                <span class="nsvx__chip">
                  {item().failures}/2 {ctx.at("tries")}
                </span>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  onClick={() => void load(item().id)}
                >
                  {ctx.at("solve")}
                </button>
              </span>
            </li>
          )}
        </For>
      </ul>
      <Show when={open() ? shot() : undefined}>
        {(picture) => (
          <>
            <RemotePage
              src={picture().image}
              alt={ctx.at("challenge")}
              width={picture().width}
              height={picture().height}
              disabled={change.busy() !== undefined || !ctx.host.connection.canWrite}
              onTap={(point) => void input({ kind: "click", ...point })}
            />
            <div class="nsvx-apps-actions">
              <button type="button" class="nsvx__button" onClick={() => void load(open()!)}>
                <Icon name="refresh" /> {ctx.at("refreshImage")}
              </button>
              <button
                type="button"
                class="nsvx__button"
                onClick={() => void input({ kind: "key", key: "Tab" })}
              >
                {ctx.at("nextField")}
              </button>
              <button
                type="button"
                class="nsvx__button"
                onClick={() => void input({ kind: "key", key: "Space" })}
              >
                {ctx.at("select")}
              </button>
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                disabled={change.busy() !== undefined || !ctx.host.connection.canWrite}
                onClick={async () => {
                  const done = await change.run("resume", "nsvx.apps.change", {
                    op: "challengeResume",
                    id: open(),
                  });
                  if (done !== undefined) {
                    setOpen(undefined);
                    setShot(undefined);
                    props.onDone();
                  }
                }}
              >
                <Icon name="resume" /> {ctx.at("resume")}
              </button>
            </div>
          </>
        )}
      </Show>
      <Note change={change} />
    </section>
  );
}
