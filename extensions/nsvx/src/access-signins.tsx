/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import type { AppleIdentities, Credential, Devices } from "./access-data.js";
import { Action, Chip, Empty, since, view, type Ctx } from "./access-ui.js";
import { createSource, errorMessage, Icon, matches, SourceView } from "./ui-kit.js";

/** NSVX sign-ins: open sessions, passkeys, and linked Apple IDs. The session Control uses cannot be ended here. */
export function SignIns(props: { ctx: Ctx }) {
  const a = props.ctx.a;
  const host = props.ctx.host;
  const devices = createSource(host, () => view<Devices>(host, "authDevices"));
  const apple = createSource(host, () => view<AppleIdentities>(host, "appleIdentities"));
  void devices.refresh();
  void apple.refresh();
  const reload = () => {
    void devices.refresh();
    void apple.refresh();
  };
  return (
    <div class="nsvx-acc__section">
      <SourceView source={devices} t={props.ctx.t}>
        {(data) => (
          <>
            <h3 class="nsvx__heading">
              <Icon name="device" />
              {a("sessions")}
            </h3>
            <Show
              when={data().sessions.length > 0}
              fallback={<Empty icon="device" text={a("noSessions")} />}
            >
              <ul class="nsvx-list">
                <For
                  each={data().sessions.filter((s) =>
                    matches(props.ctx.query, s.device_label, s.method),
                  )}
                  keyed={(s) => s.id}
                >
                  {(s) => (
                    <li class="nsvx-row" data-session={s().id}>
                      <span class="nsvx-row__icon">
                        <Icon name={s().method === "passkey" ? "key" : "lock"} />
                      </span>
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{s().device_label ?? s().method}</span>
                        <span class="nsvx-row__detail">
                          {s().method} · {a("lastSeen")}{" "}
                          {since(props.ctx.locale, s().last_seen_at, a("never"))}
                        </span>
                      </span>
                      <Show
                        when={s().id !== data().current_session}
                        fallback={<Chip a={a} tone="ok" label={a("thisControl")} />}
                      >
                        <Action
                          ctx={props.ctx}
                          label={a("end")}
                          method="nsvx.access.revokeSession"
                          params={() => ({ sessionId: s().id })}
                          confirm
                          danger
                          onDone={reload}
                        />
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <h3 class="nsvx__heading">
              <Icon name="key" />
              {a("passkeys")}
            </h3>
            <Show
              when={data().passkeys.some((p) => !p.revoked_at)}
              fallback={<Empty icon="key" text={a("noPasskeys")} />}
            >
              <ul class="nsvx-list">
                <For each={data().passkeys.filter((p) => !p.revoked_at)} keyed={(p) => p.id}>
                  {(p) => (
                    <li class="nsvx-row" data-passkey={p().id}>
                      <span class="nsvx-row__icon nsvx-row__icon--ok">
                        <Icon name="key" />
                      </span>
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{p().device_name}</span>
                        <span class="nsvx-row__detail">
                          {since(props.ctx.locale, p().last_used_at, a("never"))}
                        </span>
                      </span>
                      <Action
                        ctx={props.ctx}
                        label={a("remove")}
                        method="nsvx.access.revokePasskey"
                        params={() => ({ passkeyId: p().id })}
                        confirm
                        danger
                        onDone={reload}
                      />
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <p class="nsvx-acc__muted">
              <Icon name="plus" /> {a("addPasskey")}
            </p>
          </>
        )}
      </SourceView>
      <Show when={(apple.state().data?.identities ?? []).length > 0}>
        <h3 class="nsvx__heading">{a("apple")}</h3>
        <ul class="nsvx-list">
          <For each={apple.state().data?.identities ?? []} keyed={(i) => i.id}>
            {(i) => (
              <li class="nsvx-row">
                <span class="nsvx-row__icon">
                  <Icon name="user" />
                </span>
                <span class="nsvx-row__main">
                  <span class="nsvx-row__title">{i().full_name ?? i().email ?? a("apple")}</span>
                  <span class="nsvx-row__detail">
                    {since(props.ctx.locale, i().last_login_at, a("never"))}
                  </span>
                </span>
                <Action
                  ctx={props.ctx}
                  label={a("remove")}
                  method="nsvx.access.revokeApple"
                  params={() => ({ identityId: i().id })}
                  confirm
                  danger
                  onDone={reload}
                />
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

/** Website login form: new (site, name, user, password) or change (user, password). Secrets never come back. */
function LoginForm(props: { ctx: Ctx; credential?: Credential; onDone: () => void }) {
  const a = props.ctx.a;
  const [site, setSite] = createSignal("");
  const [user, setUser] = createSignal("");
  const [secret, setSecret] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const save = async () => {
    setBusy(true);
    try {
      await props.ctx.host.request("nsvx.access.saveLogin", {
        ...(props.credential
          ? { credentialId: props.credential.id }
          : { origin: site(), label: new URL(withScheme(site())).hostname }),
        username: user(),
        secret: secret(),
      });
      setSecret("");
      setError(undefined);
      props.onDone();
    } catch (cause) {
      setError(errorMessage(props.ctx.host, cause));
    } finally {
      setBusy(false);
    }
  };
  const validSite = () => {
    try {
      return Boolean(new URL(withScheme(site())).hostname);
    } catch {
      return false;
    }
  };
  return (
    <form
      class="nsvx-acc__form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Show when={!props.credential}>
        <label class="nsvx-acc__field">
          <span>{a("site")}</span>
          <input
            class="nsvx-acc__input"
            type="url"
            inputmode="url"
            placeholder="https://"
            value={site()}
            onInput={(event) => setSite(event.currentTarget.value)}
          />
        </label>
      </Show>
      <label class="nsvx-acc__field">
        <span>{a("user")}</span>
        <input
          class="nsvx-acc__input"
          autocomplete="off"
          value={user()}
          onInput={(event) => setUser(event.currentTarget.value)}
        />
      </label>
      <label class="nsvx-acc__field">
        <span>{a("secret")}</span>
        <input
          class="nsvx-acc__input"
          type="password"
          autocomplete="new-password"
          value={secret()}
          onInput={(event) => setSecret(event.currentTarget.value)}
        />
      </label>
      <button
        type="submit"
        class="nsvx__button nsvx__button--primary"
        disabled={busy() || !user() || !secret() || (!props.credential && !validSite())}
      >
        <Icon name="lock" />
        {a("save")}
      </button>
      <Show when={error()}>
        <p class="nsvx__error" role="alert">
          {error()}
        </p>
      </Show>
    </form>
  );
}

/** NSVX job states before an answer. */
const PENDING = new Set(["queued", "waiting_limit", "running"]);

const withScheme = (value: string) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);

function siteName(credential: Credential) {
  try {
    return new URL(credential.origins[0] ?? "").hostname;
  } catch {
    return credential.label;
  }
}

/** Stored website logins (names and state only), new, change, remove, and import from the owner's documents. */
export function Logins(props: { ctx: Ctx }) {
  const a = props.ctx.a;
  const host = props.ctx.host;
  const logins = createSource(host, () => view<{ entries: Credential[] }>(host, "credentials"));
  void logins.refresh();
  const [editing, setEditing] = createSignal<string>();
  const [job, setJob] = createSignal<{ id: number; status: string }>();
  const follow = async (id: number) => {
    for (let i = 0; i < 40 && !host.signal.aborted; i++) {
      const answer = await view<{ status: string }>(host, "credentialImport", { job: String(id) });
      setJob({ id, status: answer.status });
      if (!PENDING.has(answer.status)) {
        void logins.refresh();
        return;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 3000);
      });
    }
  };
  return (
    <div class="nsvx-acc__section">
      <div class="nsvx-acc__acts">
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          aria-expanded={editing() === "new" ? "true" : "false"}
          onClick={() => setEditing(editing() === "new" ? undefined : "new")}
        >
          <Icon name="plus" />
          {a("newLogin")}
        </button>
        <Action
          ctx={props.ctx}
          label={a("importLogins")}
          icon="download"
          method="nsvx.access.importLogins"
          params={() => ({})}
          disabled={PENDING.has(job()?.status ?? "")}
          quiet
          onDone={(result) => void follow((result as { job_id: number }).job_id)}
        />
        <Show when={job()}>
          {(j) => (
            <Chip
              a={a}
              tone={j().status === "done" ? "ok" : j().status === "failed" ? "bad" : "busy"}
              label={
                j().status === "done"
                  ? a("imported")
                  : j().status === "failed"
                    ? a("bad")
                    : a("importing")
              }
            />
          )}
        </Show>
      </div>
      <Show when={editing() === "new"}>
        <LoginForm
          ctx={props.ctx}
          onDone={() => {
            setEditing(undefined);
            void logins.refresh();
          }}
        />
      </Show>
      <SourceView source={logins} t={props.ctx.t}>
        {(data) => (
          <Show
            when={data().entries.length > 0}
            fallback={<Empty icon="key" text={a("noLogins")} />}
          >
            <ul class="nsvx-list">
              <For
                each={data().entries.filter((e) =>
                  matches(props.ctx.query, e.label, e.service, ...e.origins),
                )}
                keyed={(e) => e.id}
              >
                {(e) => (
                  <li class="nsvx-acc__login" data-login={e().id}>
                    <div class="nsvx-row">
                      <span class="nsvx-row__icon">
                        <Icon name="globe" />
                      </span>
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{siteName(e())}</span>
                        <span class="nsvx-row__detail">
                          <Show when={e().service}>
                            {a("usedBy")} {e().service} ·{" "}
                          </Show>
                          {since(props.ctx.locale, e().updated_at, a("never"))}
                        </span>
                      </span>
                      <Chip
                        a={a}
                        tone={
                          e().state === "stored" ? "ok" : e().state === "revoked" ? "off" : "warn"
                        }
                        label={
                          e().state === "stored"
                            ? a("stored")
                            : e().state === "revoked"
                              ? a("revoked")
                              : (e().detail ?? e().state)
                        }
                      />
                      <Show when={e().state !== "revoked"}>
                        <button
                          type="button"
                          class="nsvx__button"
                          aria-expanded={editing() === e().id ? "true" : "false"}
                          onClick={() => setEditing(editing() === e().id ? undefined : e().id)}
                        >
                          <Icon name="edit" />
                          {a("change")}
                        </button>
                        <Action
                          ctx={props.ctx}
                          label={a("remove")}
                          method="nsvx.access.revokeLogin"
                          params={() => ({ credentialId: e().id })}
                          confirm
                          danger
                          onDone={() => void logins.refresh()}
                        />
                      </Show>
                    </div>
                    <Show when={editing() === e().id}>
                      <LoginForm
                        ctx={props.ctx}
                        credential={e()}
                        onDone={() => {
                          setEditing(undefined);
                          void logins.refresh();
                        }}
                      />
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        )}
      </SourceView>
    </div>
  );
}
