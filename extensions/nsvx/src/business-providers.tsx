/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import {
  accountRows,
  BUSY_RUN,
  currentQuarter,
  PROVIDER_NAMES,
  PROVIDER_OPS,
  providerTone,
  runDone,
  runItems,
  type Provider,
  type ProviderOp,
  type ProviderStatus,
  type Run,
  type SessionView,
} from "./business-data.js";
import type { BusinessKey } from "./business-i18n.js";
import {
  businessView,
  Chip,
  createAction,
  driveUrl,
  Glyph,
  Mark,
  Meter,
  NoteLine,
  QuarterPick,
  type Ctx,
} from "./business-ui.js";
import { createSource, SourceView } from "./ui-kit.js";

/** The tap that checks or opens the saved sign-in, per provider (as each NSVX screen labels it). */
const CONNECT: Partial<Record<Provider, ProviderOp>> = {
  prio: "connect",
  bolt: "connect",
  fidelidade: "connect",
  nos: "accounts",
  endesa: "installations",
  glovo: "login",
  amazon: "login",
};
const SESSION: Partial<Record<Provider, ProviderOp>> = {
  viaverde: "session",
  prio: "view",
  bolt: "view",
  fidelidade: "session",
  nos: "view",
  endesa: "view",
  glovo: "view",
};
/** Polls while NSVX collects; a quarter takes minutes, so this stops after ten minutes. */
const POLL_MS = 5000;
const POLL_MAX = 120;

export function runLabel(b: Ctx["b"], state: string) {
  return b(`run_${state}` as BusinessKey);
}

export function toneOfRun(state: string | undefined) {
  return !state
    ? "off"
    : state === "completed"
      ? "ok"
      : BUSY_RUN.has(state)
        ? "busy"
        : state === "excluded"
          ? "off"
          : "warn";
}

/** Loads one provider's NSVX status, refreshing every few seconds while its collection runs. */
export function createProviderStatus(ctx: () => Ctx, provider: Provider) {
  const source = createSource(ctx().host, () =>
    businessView<ProviderStatus>(ctx().host, provider),
  );
  let disposed = false;
  let polls = 0;
  onCleanup(() => {
    disposed = true;
  });
  const refresh = async (): Promise<void> => {
    await source.refresh();
    const state = source.state().data?.run?.state;
    if (!disposed && state && BUSY_RUN.has(state) && polls++ < POLL_MAX) {
      setTimeout(() => {
        if (!disposed && !ctx().host.signal.aborted) {
          void refresh();
        }
      }, POLL_MS);
    }
  };
  void refresh();
  return { state: source.state, refresh };
}

export function RunView(props: { ctx: Ctx; run: Run; expected?: number }) {
  const b = props.ctx.b;
  const items = createMemo(() => runItems(props.run));
  const total = () => props.expected ?? props.run.expected_items ?? 0;
  return (
    <div class="nsvx-biz__run" aria-live="polite">
      <div class="nsvx-biz__run-head">
        <strong>
          {props.run.year ?? ""} · Q{props.run.quarter ?? "?"}
        </strong>
        <Chip tone={toneOfRun(props.run.state)}>{runLabel(b, props.run.state)}</Chip>
        <span class="nsvx-biz__count">
          {runDone(props.run)}
          {total() > 0 ? ` / ${total()}` : ""} <Glyph name="file" />
        </span>
      </div>
      <Show when={total() > 0}>
        <Meter done={runDone(props.run)} total={total()} label={b("progress")} />
      </Show>
      <Show when={props.run.confirmation ?? props.run.detail}>
        {(detail) => <p class="nsvx-biz__detail">{detail()}</p>}
      </Show>
      <Show when={items().length > 0}>
        <ul class="nsvx-biz__items">
          <For each={items().slice(0, 40)} keyed={(entry) => entry[0]}>
            {(entry) => {
              const item = () => entry()[1];
              return (
                <li class="nsvx-biz__item">
                  <span class="nsvx-biz__item-text">
                    {item().number ?? item().filename ?? entry()[0]}
                    <span class="nsvx-biz__muted">
                      {[item().issued_on, item().account ?? item().association, item().month ? String(item().month).padStart(2, "0") : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Show when={item().state && item().state !== "completed"}>
                    <Chip tone={toneOfRun(item().state)}>{runLabel(b, item().state ?? "")}</Chip>
                  </Show>
                  <Show when={item().drive_file_id}>
                    {(id) => (
                      <a
                        class="nsvx__button nsvx__button--icon"
                        href={driveUrl(id())}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`PDF ${item().number ?? entry()[0]}`}
                        title="PDF"
                      >
                        <Glyph name="external" />
                      </a>
                    )}
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </div>
  );
}

/** The provider's sign-in page as NSVX's browser sees it; taps and keys go back only to that sign-in step. */
function SessionPanel(props: {
  ctx: Ctx;
  provider: Provider;
  view: SessionView;
  onClose: () => void;
  onView: (view: SessionView) => void;
}) {
  const b = props.ctx.b;
  const act = createAction(() => props.ctx);
  const interactive = () => PROVIDER_OPS[props.provider].includes("input");
  const send = (input: Record<string, unknown>) =>
    void act.run(async () => {
      const next = await props.ctx.host.request<SessionView>("nsvx.business.provider", {
        provider: props.provider,
        op: "input",
        ...input,
      });
      props.onView(next);
    });
  return (
    <div class="nsvx-biz__session">
      <div class="nsvx-biz__row">
        <Chip tone={props.view.ready ? "ok" : "warn"}>
          {props.view.ready ? b("signedIn") : b("finishSignIn")}
        </Chip>
        <Show when={interactive()}>
          <button type="button" class="nsvx__button" disabled={act.busy()} onClick={() => send({ kind: "key", key: "Enter" })}>
            ⏎ Enter
          </button>
          <button type="button" class="nsvx__button" disabled={act.busy()} onClick={() => send({ kind: "key", key: "Tab" })}>
            ⇥ Tab
          </button>
        </Show>
        <button type="button" class="nsvx__button nsvx__button--icon" aria-label={b("close")} onClick={() => props.onClose()}>
          <Glyph name="close" />
        </button>
      </div>
      <Show when={props.view.image}>
        {(image) => (
          <button
            type="button"
            class="nsvx-biz__shot"
            disabled={!interactive() || act.busy()}
            aria-label={`${PROVIDER_NAMES[props.provider]} · ${b("tapToSignIn")}`}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              send({
                kind: "click",
                x: Math.round(((event.clientX - box.left) * 1280) / box.width),
                y: Math.round(((event.clientY - box.top) * 900) / box.height),
              });
            }}
          >
            <img src={image()} alt={`${PROVIDER_NAMES[props.provider]} · ${b("session")}`} />
          </button>
        )}
      </Show>
      <NoteLine note={act.note()} />
    </div>
  );
}

function AccessForm(props: { ctx: Ctx; provider: Provider; onSaved: () => void }) {
  const b = props.ctx.b;
  const act = createAction(() => props.ctx);
  const [user, setUser] = createSignal("");
  const [pass, setPass] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const save = () =>
    void act.run(async () => {
      await props.ctx.host.request("nsvx.business.access", {
        provider: props.provider,
        username: user().trim(),
        password: pass(),
        ...(props.provider === "glovo" && phone().trim() ? { phone: phone().trim() } : {}),
      });
      // The details leave this screen as soon as NSVX has them.
      setUser("");
      setPass("");
      setPhone("");
      props.onSaved();
    }, "saved");
  return (
    <form
      class="nsvx-biz__form"
      aria-label={b("access")}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <input
        class="nsvx-biz__input"
        aria-label={b("user")}
        placeholder={b("user")}
        autocomplete="username"
        value={user()}
        onInput={(event) => setUser(event.currentTarget.value)}
      />
      <input
        class="nsvx-biz__input"
        type="password"
        aria-label={b("password")}
        placeholder={b("password")}
        autocomplete="new-password"
        value={pass()}
        onInput={(event) => setPass(event.currentTarget.value)}
      />
      <Show when={props.provider === "glovo"}>
        <input
          class="nsvx-biz__input"
          type="tel"
          aria-label={b("phone")}
          placeholder="+351…"
          autocomplete="tel"
          value={phone()}
          onInput={(event) => setPhone(event.currentTarget.value)}
        />
      </Show>
      <button
        type="submit"
        class="nsvx__button nsvx__button--primary"
        disabled={act.busy() || !user().trim() || !pass()}
      >
        <Glyph name="key" />
        {b("save")}
      </button>
      <NoteLine note={act.note()} />
    </form>
  );
}

/**
 * One supplier, home service, or shop, as its NSVX card: status, sign-in, the quarter's invoices, and the last run.
 */
export function ProviderCard(props: { ctx: Ctx; provider: Provider }) {
  const b = props.ctx.b;
  const host = props.ctx.host;
  const status = createProviderStatus(() => props.ctx, props.provider);
  const act = createAction(() => props.ctx);
  const ops = PROVIDER_OPS[props.provider];
  const [access, setAccess] = createSignal(false);
  const [session, setSession] = createSignal<SessionView>();
  const [code, setCode] = createSignal("");
  const [codeOpen, setCodeOpen] = createSignal(false);
  const [recipient, setRecipient] = createSignal<string>();
  const [pick, setPick] = createSignal(currentQuarter());
  const [target, setTarget] = createSignal("all");
  const request = <V,>(op: ProviderOp, extra: Record<string, unknown> = {}) =>
    host.request<V>("nsvx.business.provider", { provider: props.provider, op, ...extra });
  const tap = (op: ProviderOp, done: BusinessKey, extra: Record<string, unknown> = {}) =>
    void act.run(async () => {
      const answer = await request<SessionView & { state?: string; detail?: string }>(op, extra);
      if (answer && typeof answer === "object" && "image" in answer && answer.image) {
        setSession(answer);
      }
      if (props.provider === "bolt" && answer?.state && answer.state !== "ready") {
        setCodeOpen(true);
      }
      await status.refresh();
      return answer;
    }, done);
  const collect = () => {
    const extra =
      props.provider === "nos"
        ? { association: target() }
        : props.provider === "endesa"
          ? { installation: target() }
          : {};
    tap("quarter", "started", { ...pick(), ...extra });
  };
  return (
    <SourceView source={status} t={props.ctx.t}>
      {(data) => {
        const tone = () => providerTone(props.provider, data());
        const run = () => data().run ?? data().runs?.[0] ?? null;
        const accounts = () =>
          props.provider === "nos"
            ? accountRows(data()).map((a) => ({ id: a.association, label: a.label }))
            : (data().installations ?? []);
        const needsCode = () =>
          codeOpen() ||
          ["needs_otp", "needs_primary_device"].includes(data().login_state ?? "");
        const blocked = () =>
          act.busy() ||
          !data().configured ||
          BUSY_RUN.has(run()?.state ?? "") ||
          (props.provider === "glovo" && !data().recipient) ||
          (data().gmail?.required === true && !data().gmail?.ready);
        return (
          <article class={["nsvx-biz__card", `nsvx-biz__card--${tone()}`]} data-provider={props.provider}>
            <header class="nsvx-biz__head">
              <Mark provider={props.provider} />
              <strong class="nsvx-biz__name">{PROVIDER_NAMES[props.provider]}</strong>
              <Chip tone={tone()}>
                {tone() === "busy"
                  ? runLabel(b, run()?.state ?? "running")
                  : tone() === "ok"
                    ? b("on")
                    : tone() === "bad"
                      ? b("blocked")
                      : data().configured
                        ? b("check")
                        : b("connect")}
              </Chip>
            </header>
            <Show when={data().login_detail ?? (data().gmail?.required && !data().gmail?.ready ? b("needGmail") : "")}>
              {(detail) => <p class="nsvx-biz__detail">{detail()}</p>}
            </Show>
            <div class="nsvx-biz__row">
              <Show when={CONNECT[props.provider]}>
                {(op) => (
                  <button
                    type="button"
                    class={["nsvx__button", { "nsvx__button--primary": !data().configured }]}
                    disabled={act.busy() || (op() !== "connect" && !data().configured)}
                    onClick={() => tap(op(), op() === "accounts" || op() === "installations" ? "updated" : "checked")}
                  >
                    <Glyph name={op() === "accounts" || op() === "installations" ? "refresh" : "plug"} />
                    {b(op() === "accounts" || op() === "installations" ? "update" : "signIn")}
                  </button>
                )}
              </Show>
              <Show when={SESSION[props.provider]}>
                {(op) => (
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={act.busy()}
                    onClick={() =>
                      void act.run(async () => {
                        if (props.provider === "prio") {
                          await request("login").catch(() => undefined);
                        }
                        if (props.provider === "endesa" && data().configured && !session()) {
                          setSession(await request<SessionView>("prepare-login"));
                          return;
                        }
                        setSession(await request<SessionView>(op()));
                      })
                    }
                  >
                    <Glyph name="eye" />
                    {b("session")}
                  </button>
                )}
              </Show>
              <Show when={ops.includes("code")}>
                <button type="button" class="nsvx__button" onClick={() => setCodeOpen(!codeOpen())}>
                  # {b("code")}
                </button>
              </Show>
              <button
                type="button"
                class="nsvx__button"
                aria-expanded={access() ? "true" : "false"}
                onClick={() => setAccess(!access())}
              >
                <Glyph name="key" />
                {b("access")}
              </button>
            </div>
            <Show when={access()}>
              <AccessForm ctx={props.ctx} provider={props.provider} onSaved={() => { setAccess(false); void status.refresh(); }} />
            </Show>
            <Show when={needsCode()}>
              <div class="nsvx-biz__row">
                <input
                  class="nsvx-biz__input nsvx-biz__input--code"
                  type="password"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength={8}
                  aria-label={b("code")}
                  placeholder="••••"
                  value={code()}
                  onInput={(event) => setCode(event.currentTarget.value.replace(/\D/g, ""))}
                />
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={act.busy() || code().length < 4}
                  onClick={() => {
                    const value = code();
                    setCode("");
                    tap("code", "checked", { code: value });
                  }}
                >
                  {b("confirm")}
                </button>
              </div>
            </Show>
            <Show when={session()}>
              {(view) => (
                <SessionPanel
                  ctx={props.ctx}
                  provider={props.provider}
                  view={view()}
                  onView={setSession}
                  onClose={() => setSession(undefined)}
                />
              )}
            </Show>
            <Show when={props.provider === "glovo"}>
              <div class="nsvx-biz__row">
                <input
                  class="nsvx-biz__input nsvx-biz__grow"
                  aria-label={b("recipient")}
                  placeholder={b("recipient")}
                  value={recipient() ?? data().recipient ?? ""}
                  onInput={(event) => setRecipient(event.currentTarget.value)}
                />
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={act.busy() || (recipient() ?? "").trim().length < 3}
                  onClick={() => {
                    tap("recipient", "saved", { name: recipient() });
                    setRecipient(undefined);
                  }}
                >
                  {b("save")}
                </button>
              </div>
            </Show>
            <Show when={ops.includes("quarter")}>
              <div class="nsvx-biz__row nsvx-biz__collect">
                <Show when={accounts().length > 0}>
                  <select
                    class="nsvx-biz__input nsvx-biz__grow"
                    aria-label={props.provider === "nos" ? b("account") : b("place")}
                    value={target()}
                    onChange={(event) => setTarget(event.currentTarget.value)}
                  >
                    <option value="all">{b("all")}</option>
                    <For each={accounts()} keyed={(a) => a.id}>
                      {(a) => <option value={a().id}>{a().label} · {a().id}</option>}
                    </For>
                  </select>
                </Show>
                <QuarterPick
                  b={b}
                  year={pick().year}
                  quarter={pick().quarter}
                  from={props.provider === "viaverde" ? 2014 : 2000}
                  onChange={setPick}
                />
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={blocked()}
                  onClick={collect}
                >
                  <Glyph name="download" />
                  {b("collect")}
                </button>
              </div>
            </Show>
            <NoteLine note={act.note()} />
            <Show when={run()} fallback={<p class="nsvx-biz__muted">{b("noRun")}</p>}>
              {(r) => <RunView ctx={props.ctx} run={r()} />}
            </Show>
          </article>
        );
      }}
    </SourceView>
  );
}
