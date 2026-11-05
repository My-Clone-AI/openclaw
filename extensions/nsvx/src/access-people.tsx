/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  permissionsSummary,
  type Assignment,
  type Candidate,
  type Permissions,
  type Scope,
  type Tone,
} from "./access-data.js";
import { Chip, Empty, isConflict, isUncertain, Tiles, view, type Ctx } from "./access-ui.js";
import { createSource, errorMessage, Icon, matches, SourceView } from "./ui-kit.js";

const STATES = ["active", "pending", "disabled"] as const;
const TONE: Record<string, Tone> = { active: "ok", pending: "warn", disabled: "off" };

/** One person's areas, state, and verified identity, saved with the revision shown; and their own sign-in. */
function PersonCard(props: {
  ctx: Ctx;
  person: Assignment;
  scopes: Scope[];
  onChange: () => void;
}) {
  const a = props.ctx.a;
  const host = props.ctx.host;
  // Edits start from what NSVX sent; the card is rebuilt (keyed by revision) when NSVX sends a newer one.
  const [scopes, setScopes] = createSignal(props.person.scopes);
  const [state, setState] = createSignal(props.person.state);
  const [identity, setIdentity] = createSignal(props.person.person_id ?? "");
  const [query, setQuery] = createSignal(props.person.label);
  const [candidates, setCandidates] = createSignal<Candidate[]>([]);
  const [username, setUsername] = createSignal(props.person.username ?? "");
  const [password, setPassword] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const effective = () => props.person.effective_state ?? props.person.state;
  const dirty = createMemo(
    () =>
      state() !== props.person.state ||
      identity() !== (props.person.person_id ?? "") ||
      scopes().length !== props.person.scopes.length ||
      scopes().some((s) => !props.person.scopes.includes(s)),
  );
  const run = async (method: string, params: Record<string, unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await host.request(method, params);
      after?.();
      setNote({ text: a("done"), bad: false });
      props.onChange();
    } catch (cause) {
      if (isConflict(cause)) {
        setNote({ text: a("changedElsewhere"), bad: true });
        props.onChange();
      } else {
        setNote({
          text: isUncertain(cause) ? a("uncertain") : errorMessage(host, cause),
          bad: true,
        });
      }
    } finally {
      setBusy(false);
    }
  };
  const find = async () => {
    try {
      const answer = await view<{ items: Candidate[] }>(host, "permissionPeople", { q: query() });
      setCandidates(answer.items);
    } catch (cause) {
      setNote({ text: errorMessage(host, cause), bad: true });
    }
  };
  return (
    <article
      class={["nsvx-acc__card", `nsvx-acc__card--${TONE[effective()] ?? "off"}`]}
      data-assignment={props.person.id}
    >
      <header class="nsvx-acc__card-head">
        <span class="nsvx-acc__avatar" aria-hidden="true">
          {props.person.label.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span class="nsvx-acc__id">
          <strong>{props.person.label}</strong>
          <span>
            <Icon name="phone" /> {props.person.phone_verified ? a("phoneOk") : a("phoneNo")}
            {" · "}
            <Icon name="lock" /> {props.person.username ?? props.person.legacy_al ?? a("noAccount")}
          </span>
        </span>
        <Chip
          a={a}
          tone={TONE[effective()] ?? "off"}
          label={a(effective() as (typeof STATES)[number])}
        />
      </header>
      <fieldset class="nsvx-acc__scopes">
        <legend>{a("areas")}</legend>
        <For each={props.scopes} keyed={(s) => s.code}>
          {(s) => (
            <label
              class={["nsvx-acc__scope", { "nsvx-acc__scope--on": scopes().includes(s().code) }]}
            >
              <input
                type="checkbox"
                checked={scopes().includes(s().code)}
                onChange={(event) =>
                  setScopes(
                    event.currentTarget.checked
                      ? [...scopes(), s().code]
                      : scopes().filter((code) => code !== s().code),
                  )
                }
              />
              {s().label}
            </label>
          )}
        </For>
      </fieldset>
      <div class="nsvx-seg" role="radiogroup" aria-label={a("person")}>
        <For each={STATES} keyed={false}>
          {(value) => (
            <button
              type="button"
              role="radio"
              aria-checked={state() === value() ? "true" : "false"}
              class={["nsvx-seg__item", { "nsvx-seg__item--on": state() === value() }]}
              onClick={() => setState(value())}
            >
              {a(value())}
            </button>
          )}
        </For>
      </div>
      <details class="nsvx-acc__more" open={!props.person.person_id}>
        <summary>
          <Icon name="link" />
          {identity() ? a("linkedPerson") : a("notLinked")}
        </summary>
        <form
          class="nsvx-acc__type"
          onSubmit={(event) => {
            event.preventDefault();
            void find();
          }}
        >
          <input
            class="nsvx-acc__input"
            aria-label={a("find")}
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <button type="submit" class="nsvx__button">
            <Icon name="find" />
            {a("find")}
          </button>
        </form>
        <Show when={candidates().length > 0}>
          <ul class="nsvx-acc__candidates" role="listbox" aria-label={a("linkedPerson")}>
            <For each={candidates()} keyed={(c) => c.id}>
              {(c) => (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={identity() === c().id ? "true" : "false"}
                    class={[
                      "nsvx-acc__candidate",
                      { "nsvx-acc__candidate--on": identity() === c().id },
                    ]}
                    disabled={
                      !c().verified_association ||
                      (Boolean(props.person.person_id) && props.person.person_id !== c().id)
                    }
                    onClick={() => setIdentity(c().id)}
                  >
                    <Icon name={c().verified_association ? "ok" : "alert"} />
                    {c().display_name}
                    <Show when={!c().verified_association}>
                      <span class="nsvx-acc__muted"> · {a("unverified")}</span>
                    </Show>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </details>
      <button
        type="button"
        class="nsvx__button nsvx__button--primary"
        disabled={busy() || !dirty() || (state() === "active" && !identity())}
        onClick={() =>
          void run("nsvx.access.savePerson", {
            assignmentId: props.person.id,
            revision: props.person.revision,
            personId: identity() || null,
            state: state(),
            scopes: scopes(),
          })
        }
      >
        <Icon name="shield" />
        {a("save")}
      </button>
      <Show when={props.person.person_id && props.person.state === "active"}>
        <details class="nsvx-acc__more">
          <summary>
            <Icon name="lock" />
            {a("account")}
          </summary>
          <form
            class="nsvx-acc__form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                "nsvx.access.personAccount",
                { assignmentId: props.person.id, username: username(), password: password() },
                () => setPassword(""),
              );
            }}
          >
            <label class="nsvx-acc__field">
              <span>{a("user")}</span>
              <input
                class="nsvx-acc__input"
                autocomplete="off"
                value={username()}
                onInput={(event) => setUsername(event.currentTarget.value.toLowerCase())}
              />
            </label>
            <label class="nsvx-acc__field">
              <span>{a("secret")}</span>
              <input
                class="nsvx-acc__input"
                type="password"
                autocomplete="new-password"
                minlength={12}
                placeholder={a("password12")}
                value={password()}
                onInput={(event) => setPassword(event.currentTarget.value)}
              />
            </label>
            <button
              type="submit"
              class="nsvx__button"
              disabled={busy() || username().length < 3 || password().length < 12}
            >
              {a("save")}
            </button>
          </form>
        </details>
      </Show>
      <Show when={note()}>
        {(n) => (
          <p class={["nsvx-acc__note", { "nsvx-acc__note--bad": n().bad }]} role="status">
            {n().text}
          </p>
        )}
      </Show>
    </article>
  );
}

export function People(props: { ctx: Ctx }) {
  const a = props.ctx.a;
  const host = props.ctx.host;
  const data = createSource(host, () => view<Permissions>(host, "permissions"));
  void data.refresh();
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<string>();
  const add = async () => {
    try {
      await host.request("nsvx.access.addPerson", { label: name().trim() });
      setName("");
      setError(undefined);
      void data.refresh();
    } catch (cause) {
      setError(errorMessage(host, cause));
    }
  };
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const summary = createMemo(() => permissionsSummary(loaded().people));
        return (
          <div class="nsvx-acc__section">
            <Tiles
              items={[
                { label: a("active"), value: summary().active, tone: "ok", icon: "ok" },
                { label: a("pending"), value: summary().pending, tone: "warn", icon: "link" },
                { label: a("disabled"), value: summary().disabled, tone: "off", icon: "bad" },
              ]}
            />
            <div class="nsvx-acc__admin">
              <Icon name="shield" />
              <strong>{a("admin")}</strong>
              <span>{a("adminAll")}</span>
            </div>
            <Show
              when={loaded().people.length > 0}
              fallback={<Empty icon="people" text={a("noPeople")} />}
            >
              <div class="nsvx-acc__grid">
                <For
                  each={loaded().people.filter((p) =>
                    matches(props.ctx.query, p.label, p.username),
                  )}
                  keyed={(p) => `${p.id}:${p.revision}`}
                >
                  {(p) => (
                    <PersonCard
                      ctx={props.ctx}
                      person={p()}
                      scopes={loaded().scopes}
                      onChange={() => void data.refresh()}
                    />
                  )}
                </For>
              </div>
            </Show>
            <form
              class="nsvx-acc__type"
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
            >
              <input
                class="nsvx-acc__input"
                aria-label={a("newPerson")}
                placeholder={a("newPerson")}
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
              />
              <button
                type="submit"
                class="nsvx__button nsvx__button--primary"
                disabled={!name().trim()}
              >
                <Icon name="plus" />
                {a("addPerson")}
              </button>
            </form>
            <Show when={error()}>
              <p class="nsvx__error" role="alert">
                {error()}
              </p>
            </Show>
          </div>
        );
      }}
    </SourceView>
  );
}
