/** @jsxImportSource @solidjs/web */
import { createSignal, For, onSettled, Show } from "solid-js";
import type { AppsKey } from "./apps-i18n.js";
import { AppLogo, createChange, Dot, Note, when, view, type Change, type Ctx } from "./apps-ui.js";
import type {
  AppleIds,
  Credential,
  Devices,
  Grant,
  GrantCandidate,
  Grants,
} from "./apps.js";
import { BrandLogo } from "./messages-ui.js";
import { createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

const METHOD_ICON: Record<string, IconName> = {
  apple: "user",
  password: "lock",
  passkey: "key",
  recovery_code: "doc",
  setup_token: "key",
};

/** A second tap confirms; ends, revokes, and unlinks cannot be undone here. */
function Confirmable(props: {
  ctx: Ctx;
  change: Change;
  busyKey: string;
  label: AppsKey;
  question: AppsKey;
  name: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = createSignal(false);
  return (
    <Show
      when={asking()}
      fallback={
        <button
          type="button"
          class="nsvx__button nsvx__button--danger"
          aria-label={`${props.ctx.at(props.label)} ${props.name}`}
          disabled={props.disabled || props.change.busy() !== undefined}
          onClick={() => setAsking(true)}
        >
          {props.ctx.at(props.label)}
        </button>
      }
    >
      <span class="nsvx-confirm" role="group" aria-label={props.ctx.at(props.question)}>
        <span class="nsvx-confirm__text">{props.ctx.at(props.question)}</span>
        <button type="button" class="nsvx__button" onClick={() => setAsking(false)}>
          {props.ctx.at("cancel")}
        </button>
        <button
          type="button"
          class="nsvx__button nsvx__button--danger"
          disabled={props.change.busy() !== undefined}
          onClick={() => {
            setAsking(false);
            props.onConfirm();
          }}
        >
          {props.ctx.at(props.label)}
        </button>
      </span>
    </Show>
  );
}

/** Sign-in: the Gateway's own NSVX session, passkeys, Apple accounts, and every other open session. */
export function DevicesView(props: { ctx: Ctx }) {
  const ctx = props.ctx;
  const devices = createSource(ctx.host, () => view<Devices>(ctx.host, "devices"));
  // Apple sign-in is optional in NSVX; an error here only hides its section.
  const apple = createSource(ctx.host, () =>
    view<AppleIds>(ctx.host, "appleIds").catch(() => undefined),
  );
  const change = createChange(ctx, async () => {
    await Promise.all([devices.refresh(), apple.refresh()]);
  });
  onSettled(() => {
    void devices.refresh();
    void apple.refresh();
  });
  const admin = () => ctx.host.connection.canAdmin;
  return (
    <SourceView source={devices} t={ctx.t}>
      {(data) => {
        const me = () => data().sessions.find((s) => s.id === data().current_session);
        const others = () => data().sessions.filter((s) => s.id !== data().current_session);
        return (
          <>
            <Show when={!admin()}>
              <p class="nsvx-apps-muted">
                <Icon name="lock" /> {ctx.at("needsAdmin")}
              </p>
            </Show>
            <section class="nsvx-apps-card nsvx-apps-me" aria-label={ctx.at("thisDevice")}>
              <Icon name={METHOD_ICON[me()?.method ?? ""] ?? "lock"} />
              <span class="nsvx-apps-item__main">
                <strong>{ctx.at("thisDevice")}</strong>
                <span class="nsvx-apps-muted">
                  {me()?.device_label ?? ""} · {ctx.at("expires")} {when(ctx.locale, me()?.expires_at)}
                </span>
              </span>
              <Dot tone="ok" label={ctx.at("active")} />
            </section>
            <h3 class="nsvx__heading">
              <Icon name="key" /> {ctx.at("passkeys")}
            </h3>
            <Show
              when={data().passkeys.length > 0}
              fallback={<p class="nsvx__empty">{ctx.at("noPasskeys")}</p>}
            >
              <ul class="nsvx-apps-list">
                <For each={data().passkeys} keyed={(p) => p.id}>
                  {(passkey) => (
                    <li class={["nsvx-apps-item", { "nsvx-apps-item--off": !!passkey().revoked_at }]}>
                      <Icon name="key" />
                      <span class="nsvx-apps-item__main">
                        <strong>{passkey().device_name}</strong>
                        <span class="nsvx-apps-muted">
                          {ctx.at("created")} {when(ctx.locale, passkey().created_at)}
                          {passkey().last_used_at
                            ? ` · ${ctx.at("used")} ${when(ctx.locale, passkey().last_used_at)}`
                            : ""}
                        </span>
                      </span>
                      <Show
                        when={!passkey().revoked_at}
                        fallback={<span class="nsvx__chip">{ctx.at("revoked")}</span>}
                      >
                        <Confirmable
                          ctx={ctx}
                          change={change}
                          busyKey="passkey"
                          label="revoke"
                          question="confirmRevoke"
                          name={passkey().device_name}
                          disabled={!admin()}
                          onConfirm={() =>
                            void change.run("passkey", "nsvx.access.change", {
                              op: "revokePasskey",
                              id: passkey().id,
                            })
                          }
                        />
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <p class="nsvx-apps-muted">
              <Icon name="plus" /> {ctx.at("addPasskey")}
            </p>
            <Show
              when={
                apple.state().data &&
                (apple.state().data!.status === "configured" ||
                  apple.state().data!.identities.length > 0)
                  ? apple.state().data
                  : undefined
              }
            >
              {(ids) => (
                <>
                  <h3 class="nsvx__heading">
                    <BrandLogo channel="apple" size={14} /> {ctx.at("apple")}
                  </h3>
                  <ul class="nsvx-apps-list">
                    <For each={ids().identities} keyed={(a) => a.id}>
                      {(identity) => {
                        const name = () =>
                          identity().full_name || identity().email || ctx.at("apple");
                        return (
                          <li class="nsvx-apps-item">
                            <BrandLogo channel="apple" size={20} />
                            <span class="nsvx-apps-item__main">
                              <strong>{name()}</strong>
                              <span class="nsvx-apps-muted">
                                {ctx.at("created")} {when(ctx.locale, identity().created_at)}
                              </span>
                            </span>
                            <Confirmable
                              ctx={ctx}
                              change={change}
                              busyKey="apple"
                              label="unlink"
                              question="confirmUnlink"
                              name={name()}
                              disabled={!admin()}
                              onConfirm={() =>
                                void change.run("apple", "nsvx.access.change", {
                                  op: "unlinkApple",
                                  id: identity().id,
                                })
                              }
                            />
                          </li>
                        );
                      }}
                    </For>
                  </ul>
                </>
              )}
            </Show>
            <h3 class="nsvx__heading">
              <Icon name="lock" /> {ctx.at("sessions")}
            </h3>
            <Show
              when={others().length > 0}
              fallback={<p class="nsvx__empty">{ctx.at("noSessions")}</p>}
            >
              <ul class="nsvx-apps-list">
                <For each={others()} keyed={(s) => s.id}>
                  {(session) => (
                    <li class="nsvx-apps-item">
                      <Icon name={METHOD_ICON[session().method] ?? "lock"} />
                      <span class="nsvx-apps-item__main">
                        <strong>{session().device_label}</strong>
                        <span class="nsvx-apps-muted">
                          {ctx.at("used")} {when(ctx.locale, session().last_seen_at)} ·{" "}
                          {ctx.at("expires")} {when(ctx.locale, session().expires_at)}
                        </span>
                      </span>
                      <Confirmable
                        ctx={ctx}
                        change={change}
                        busyKey="session"
                        label="end"
                        question="confirmEnd"
                        name={session().device_label}
                        disabled={!admin()}
                        onConfirm={() =>
                          void change.run("session", "nsvx.access.change", {
                            op: "endSession",
                            id: session().id,
                          })
                        }
                      />
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Note change={change} />
          </>
        );
      }}
    </SourceView>
  );
}

const GRANT_STATES = ["active", "pending", "disabled"] as const;
const STATE_KEY: Record<string, AppsKey> = {
  active: "active",
  pending: "pending_link",
  disabled: "disabled",
};
const STATE_TONE: Record<string, string> = { active: "ok", pending: "warn", disabled: "bad" };

/** Who else may use clone, which areas they see, and their own app login (NSVX Permissões). */
export function GrantsView(props: { ctx: Ctx; query: string }) {
  const ctx = props.ctx;
  const grants = createSource(ctx.host, () => view<Grants>(ctx.host, "grants"));
  const change = createChange(ctx, () => grants.refresh());
  const [name, setName] = createSignal("");
  onSettled(() => void grants.refresh());
  const admin = () => ctx.host.connection.canAdmin;
  const count = (people: Grant[], state: string) =>
    people.filter((p) => (p.effective_state ?? p.state) === state).length;
  return (
    <SourceView source={grants} t={ctx.t}>
      {(data) => (
        <>
          <ul class="nsvx-apps-stats">
            <For each={[...GRANT_STATES]}>
              {(state) => (
                <li class={`nsvx-apps-stats--${STATE_TONE[state]}`}>
                  <Icon name={state === "active" ? "done" : state === "pending" ? "history" : "close"} />
                  <strong>{count(data().people, state)}</strong>
                  <span>{ctx.at(STATE_KEY[state]!)}</span>
                </li>
              )}
            </For>
          </ul>
          <section class="nsvx-apps-card nsvx-apps-me" aria-label={ctx.at("admin")}>
            <Icon name="shield" />
            <span class="nsvx-apps-item__main">
              <strong>{ctx.at("admin")}</strong>
              <span class="nsvx-apps-muted">{ctx.at("adminHelp")}</span>
            </span>
          </section>
          <Show when={!admin()}>
            <p class="nsvx-apps-muted">
              <Icon name="lock" /> {ctx.at("needsAdmin")}
            </p>
          </Show>
          <Show
            when={data().people.length > 0}
            fallback={<p class="nsvx__empty">{ctx.at("noGrants")}</p>}
          >
            <div class="nsvx-apps-grants">
              <For
                each={data().people.filter((p) => matches(props.query, p.label, p.username))}
                keyed={(p) => `${p.id}:${p.revision}`}
              >
                {(person) => (
                  <GrantCard ctx={ctx} grant={person()} scopes={data().scopes} change={change} />
                )}
              </For>
            </div>
          </Show>
          <form
            class="nsvx-apps-card nsvx-apps-actions"
            onSubmit={(event) => {
              event.preventDefault();
              const label = name().trim();
              if (!label) {
                return;
              }
              void change
                .run("add", "nsvx.access.change", { op: "grantAdd", label })
                .then((done) => done !== undefined && setName(""));
            }}
          >
            <label class="nsvx-field nsvx-apps-grow">
              <span>{ctx.at("addPerson")}</span>
              <input
                value={name()}
                maxlength={160}
                onInput={(event) => setName(event.currentTarget.value)}
              />
            </label>
            <button
              type="submit"
              class="nsvx__button nsvx__button--primary"
              disabled={!name().trim() || !admin() || change.busy() !== undefined}
            >
              <Icon name="plus" /> {ctx.at("add")}
            </button>
          </form>
          <Note change={change} />
        </>
      )}
    </SourceView>
  );
}

function GrantCard(props: {
  ctx: Ctx;
  grant: Grant;
  scopes: { code: string; label: string }[];
  change: Change;
}) {
  const ctx = props.ctx;
  // The card remounts on each new revision, so these start from what NSVX holds now.
  const [scopes, setScopes] = createSignal<string[]>(props.grant.scopes);
  const [state, setState] = createSignal(props.grant.state);
  const [person, setPerson] = createSignal(props.grant.person_id ?? "");
  const [query, setQuery] = createSignal(props.grant.label);
  const [candidates, setCandidates] = createSignal<GrantCandidate[]>();
  const [username, setUsername] = createSignal(props.grant.username ?? "");
  const [password, setPassword] = createSignal("");
  const admin = () => ctx.host.connection.canAdmin;
  const effective = () => props.grant.effective_state ?? props.grant.state;
  const find = async () => {
    try {
      const found = await view<{ items: GrantCandidate[] }>(ctx.host, "grantPeople", {
        q: query().trim(),
      });
      setCandidates(found.items);
    } catch {
      setCandidates([]);
    }
  };
  return (
    <section class="nsvx-apps-card nsvx-apps-grant" aria-label={props.grant.label}>
      <header class="nsvx-apps-grant__head">
        <span class="nsvx-avatar" aria-hidden="true">
          <span class="nsvx-avatar__initial">{props.grant.label.charAt(0).toUpperCase() || "?"}</span>
        </span>
        <h3>{props.grant.label}</h3>
        <Dot tone={STATE_TONE[effective()] ?? "off"} label={ctx.at(STATE_KEY[effective()] ?? "pending")} />
      </header>
      <p class="nsvx-apps-muted">
        <Icon name="user" /> {props.grant.username ?? props.grant.legacy_al ?? ctx.at("noLogin")} ·{" "}
        <Icon name="phone" /> {ctx.at(props.grant.phone_verified ? "phoneOk" : "phoneNo")}
      </p>
      <fieldset class="nsvx-apps-scopes">
        <legend>{ctx.at("areas")}</legend>
        <For each={props.scopes} keyed={(s) => s.code}>
          {(scope) => (
            <button
              type="button"
              class={["nsvx-apps-scope", { "nsvx-apps-scope--on": scopes().includes(scope().code) }]}
              aria-pressed={scopes().includes(scope().code) ? "true" : "false"}
              disabled={!admin()}
              onClick={() =>
                setScopes(
                  scopes().includes(scope().code)
                    ? scopes().filter((code) => code !== scope().code)
                    : [...scopes(), scope().code],
                )
              }
            >
              <Show when={scopes().includes(scope().code)}>
                <Icon name="done" />
              </Show>
              {scope().label}
            </button>
          )}
        </For>
      </fieldset>
      <div class="nsvx-seg" role="radiogroup" aria-label={ctx.at("state")}>
        <For each={[...GRANT_STATES]}>
          {(value) => (
            <button
              type="button"
              role="radio"
              aria-checked={state() === value ? "true" : "false"}
              class={["nsvx-seg__item", { "nsvx-seg__item--on": state() === value }]}
              disabled={!admin()}
              onClick={() => setState(value)}
            >
              {ctx.at(STATE_KEY[value]!)}
            </button>
          )}
        </For>
      </div>
      <details class="nsvx-apps-more">
        <summary>
          <Icon name="user" /> {ctx.at("person")}
          <Show when={person()}>
            <Icon name="done" />
          </Show>
        </summary>
        <form
          class="nsvx-apps-actions"
          onSubmit={(event) => {
            event.preventDefault();
            void find();
          }}
        >
          <input
            class="nsvx__search"
            type="search"
            aria-label={ctx.at("findPerson")}
            placeholder={ctx.at("findPerson")}
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <button type="submit" class="nsvx__button">
            <Icon name="find" /> {ctx.at("find")}
          </button>
        </form>
        <Show when={candidates()}>
          {(list) => (
            <ul class="nsvx-apps-list">
              <For each={list()} keyed={(c) => c.id}>
                {(candidate) => (
                  <li>
                    <button
                      type="button"
                      class={["nsvx-apps-pick", { "nsvx-apps-pick--on": person() === candidate().id }]}
                      aria-pressed={person() === candidate().id ? "true" : "false"}
                      disabled={!candidate().verified_association || !admin()}
                      onClick={() => setPerson(candidate().id)}
                    >
                      <span>{candidate().display_name}</span>
                      <Show
                        when={candidate().verified_association}
                        fallback={<span class="nsvx-apps-muted">{ctx.at("unverified")}</span>}
                      >
                        <Icon name="done" />
                      </Show>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          )}
        </Show>
      </details>
      <button
        type="button"
        class="nsvx__button nsvx__button--primary"
        disabled={!admin() || props.change.busy() !== undefined}
        onClick={() =>
          void props.change.run("save", "nsvx.access.change", {
            op: "grantSave",
            id: props.grant.id,
            revision: props.grant.revision,
            personId: person() || null,
            state: state(),
            scopes: scopes(),
          })
        }
      >
        <Icon name="done" /> {ctx.at("save")}
      </button>
      <details class="nsvx-apps-more">
        <summary>
          <Icon name="key" /> {ctx.at("login")}
        </summary>
        <form
          class="nsvx-apps-form"
          onSubmit={(event) => {
            event.preventDefault();
            void props.change
              .run("login", "nsvx.access.change", {
                op: "grantLogin",
                id: props.grant.id,
                username: username().trim().toLowerCase(),
                password: password(),
              })
              .finally(() => setPassword(""));
          }}
        >
          <label class="nsvx-field">
            <span>{ctx.at("username")}</span>
            <input
              autocomplete="off"
              value={username()}
              onInput={(event) => setUsername(event.currentTarget.value)}
            />
          </label>
          <label class="nsvx-field">
            <span>
              {ctx.at("password")} · {ctx.at("min12")}
            </span>
            <input
              type="password"
              autocomplete="new-password"
              minlength={12}
              value={password()}
              onInput={(event) => setPassword(event.currentTarget.value)}
            />
          </label>
          <button
            type="submit"
            class="nsvx__button"
            disabled={
              !admin() || password().length < 12 || username().trim().length < 3 || props.change.busy() !== undefined
            }
          >
            {ctx.at("saveLogin")}
          </button>
        </form>
      </details>
      <p class="nsvx-apps-muted">
        {ctx.at("changedBy")} {when(ctx.locale, props.grant.changed_at)}
      </p>
    </section>
  );
}

const CREDENTIAL_TONE: Record<string, string> = { stored: "ok", revoked: "off", failed: "bad" };

/** Site logins NSVX keeps for its browser tasks. Secrets go in and never come back out. */
export function KeysView(props: { ctx: Ctx; query: string }) {
  const ctx = props.ctx;
  const list = createSource(ctx.host, () => view<{ entries: Credential[] }>(ctx.host, "credentials"));
  const change = createChange(ctx, () => list.refresh());
  const [adding, setAdding] = createSignal(false);
  const [replacing, setReplacing] = createSignal<string>();
  const [form, setForm] = createSignal({ origin: "", username: "", secret: "" });
  const [importState, setImportState] = createSignal<string>();
  onSettled(() => void list.refresh());
  const admin = () => ctx.host.connection.canAdmin;
  const clear = () => setForm({ origin: "", username: "", secret: "" });
  const follow = async (job: number) => {
    for (let tries = 0; tries < 40 && !ctx.host.signal.aborted; tries += 1) {
      const status = await view<{ status: string }>(ctx.host, "credentialImport", {
        id: String(job),
      }).catch(() => undefined);
      if (status && ["done", "failed", "dead"].includes(status.status)) {
        setImportState(status.status === "done" ? "imported" : "failed");
        await list.refresh();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };
  const fields = (withOrigin: boolean) => (
    <>
      <Show when={withOrigin}>
        <label class="nsvx-field">
          <span>{ctx.at("site")}</span>
          <input
            type="url"
            placeholder="https://"
            value={form().origin}
            onInput={(event) => setForm({ ...form(), origin: event.currentTarget.value })}
          />
        </label>
      </Show>
      <label class="nsvx-field">
        <span>{ctx.at("username")}</span>
        <input
          autocomplete="off"
          value={form().username}
          onInput={(event) => setForm({ ...form(), username: event.currentTarget.value })}
        />
      </label>
      <label class="nsvx-field">
        <span>{ctx.at("secret")}</span>
        <input
          type="password"
          autocomplete="new-password"
          value={form().secret}
          onInput={(event) => setForm({ ...form(), secret: event.currentTarget.value })}
        />
      </label>
    </>
  );
  return (
    <SourceView source={list} t={ctx.t}>
      {(data) => (
        <>
          <div class="nsvx-apps-actions">
            <button
              type="button"
              class="nsvx__button nsvx__button--primary"
              disabled={!admin()}
              aria-expanded={adding() ? "true" : "false"}
              onClick={() => {
                clear();
                setAdding(!adding());
              }}
            >
              <Icon name="plus" /> {ctx.at("newLogin")}
            </button>
            <button
              type="button"
              class="nsvx__button"
              disabled={!admin() || importState() === "importing"}
              onClick={async () => {
                setImportState("importing");
                const job = await change.run<{ job_id: number }>("import", "nsvx.access.change", {
                  op: "credentialImport",
                });
                if (job?.job_id !== undefined) {
                  await follow(job.job_id);
                } else {
                  setImportState(undefined);
                }
              }}
            >
              <Icon name="download" /> {ctx.at("import")}
            </button>
            <Show when={importState()}>
              {(state) => <Dot tone={state() === "imported" ? "ok" : state() === "failed" ? "bad" : "run"} label={ctx.at(state() as AppsKey)} />}
            </Show>
          </div>
          <Show when={!admin()}>
            <p class="nsvx-apps-muted">
              <Icon name="lock" /> {ctx.at("needsAdmin")}
            </p>
          </Show>
          <Show when={adding()}>
            <form
              class="nsvx-apps-card nsvx-apps-form"
              onSubmit={(event) => {
                event.preventDefault();
                const origin = form().origin.trim();
                void change
                  .run("add", "nsvx.access.change", {
                    op: "credentialAdd",
                    label: hostOf(origin),
                    origin,
                    username: form().username,
                    secret: form().secret,
                  })
                  .then((done) => {
                    clear();
                    if (done !== undefined) {
                      setAdding(false);
                    }
                  });
              }}
            >
              {fields(true)}
              <button
                type="submit"
                class="nsvx__button nsvx__button--primary"
                disabled={!form().origin || !form().username || !form().secret || change.busy() !== undefined}
              >
                {ctx.at("save")}
              </button>
            </form>
          </Show>
          <Note change={change} />
          <Show
            when={data().entries.length > 0}
            fallback={<p class="nsvx__empty">{ctx.at("noLogins")}</p>}
          >
            <ul class="nsvx-apps-list">
              <For
                each={data().entries.filter((e) =>
                  matches(props.query, e.label, e.service, ...(e.origins ?? [])),
                )}
                keyed={(e) => e.id}
              >
                {(entry) => (
                  <li class={["nsvx-apps-item", { "nsvx-apps-item--off": entry().state === "revoked" }]}>
                    <AppLogo channel="key" size={36} />
                    <span class="nsvx-apps-item__main">
                      <strong>{entry().label}</strong>
                      <span class="nsvx-apps-muted">
                        {entry().service ? `${ctx.at("usedBy")} ${entry().service}` : (entry().origins ?? [])[0] ?? ""}
                        {entry().from_document ? ` · ${ctx.at("fromDoc")}` : ""}
                      </span>
                    </span>
                    <Dot
                      tone={CREDENTIAL_TONE[entry().state] ?? "warn"}
                      label={
                        ["stored", "revoked", "failed"].includes(entry().state)
                          ? ctx.at(`st_${entry().state}` as AppsKey)
                          : entry().state
                      }
                    />
                    <Show when={entry().state !== "revoked"}>
                      <span class="nsvx-apps-actions">
                        <button
                          type="button"
                          class="nsvx__button"
                          disabled={!admin()}
                          aria-expanded={replacing() === entry().id ? "true" : "false"}
                          onClick={() => {
                            clear();
                            setReplacing(replacing() === entry().id ? undefined : entry().id);
                          }}
                        >
                          <Icon name="edit" /> {ctx.at("replace")}
                        </button>
                        <Confirmable
                          ctx={ctx}
                          change={change}
                          busyKey="revoke"
                          label="revoke"
                          question="confirmRevokeLogin"
                          name={entry().label}
                          disabled={!admin()}
                          onConfirm={() =>
                            void change.run("revoke", "nsvx.access.change", {
                              op: "credentialRevoke",
                              id: entry().id,
                            })
                          }
                        />
                      </span>
                    </Show>
                    <Show when={replacing() === entry().id}>
                      <form
                        class="nsvx-apps-form nsvx-apps-item__form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void change
                            .run("replace", "nsvx.access.change", {
                              op: "credentialReplace",
                              id: entry().id,
                              username: form().username,
                              secret: form().secret,
                            })
                            .then((done) => {
                              clear();
                              if (done !== undefined) {
                                setReplacing(undefined);
                              }
                            });
                        }}
                      >
                        {fields(false)}
                        <button
                          type="submit"
                          class="nsvx__button nsvx__button--primary"
                          disabled={!form().username || !form().secret || change.busy() !== undefined}
                        >
                          {ctx.at("save")}
                        </button>
                      </form>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </>
      )}
    </SourceView>
  );
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host || origin;
  } catch {
    return origin.slice(0, 80) || "login";
  }
}
