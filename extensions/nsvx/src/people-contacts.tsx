/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { BrandLogo } from "./messages-ui.js";
import {
  identityName,
  type ContactDetails,
  type ContactEntry,
  type Identity,
  type Person,
} from "./people-data.js";
import type { PeopleKey } from "./people-i18n.js";
import { createChange, IconButton, Note, Section, type Change, type Base } from "./people-ui.js";
import { age, createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

// ---------- contacts ----------

const CONTACT_KINDS: { id: ContactEntry["kind"]; icon: IconName; key: PeopleKey; type: string }[] =
  [
    { id: "phone", icon: "phone", key: "phone", type: "tel" },
    { id: "email", icon: "mail", key: "email", type: "email" },
    { id: "iban", icon: "bank", key: "iban", type: "text" },
    { id: "account", icon: "bank", key: "account", type: "text" },
  ];
const kindOf = (kind: string) => CONTACT_KINDS.find((k) => k.id === kind) ?? CONTACT_KINDS[0]!;

export function ContactsSection(props: Base & { personId: string }) {
  const details = createSource(props.host, () =>
    props.host.request<ContactDetails>("nsvx.view", {
      view: "personContacts",
      params: { id: props.personId },
    }),
  );
  void details.refresh();
  const change = createChange(props.host, props.pt, () => details.refresh());
  const [edit, setEdit] = createSignal<ContactEntry[]>();
  const shown = createMemo(() => {
    const d = details.state().data;
    return d
      ? [
          ...d.entries,
          ...d.linked.filter(
            (l) => !d.entries.some((e) => e.kind === l.kind && e.value === l.value),
          ),
        ]
      : [];
  });
  const save = (d: ContactDetails, entries: ContactEntry[], captureIds: string[] = []) =>
    void change.run(
      "contacts",
      "nsvx.people.change",
      {
        action: "contacts",
        personId: props.personId,
        revision: d.revision,
        entries: entries.map(({ id, kind, value, label }) => ({
          ...(id ? { id } : {}),
          kind,
          value,
          label,
        })),
        captureIds,
      },
      () => setEdit(undefined),
    );
  const update = (index: number, patch: Partial<ContactEntry>) =>
    setEdit((edit() ?? []).map((e, i) => (i === index ? Object.assign({}, e, patch) : e)));
  return (
    <Section
      icon="phone"
      title={props.pt("contacts")}
      count={shown().length}
      action={
        <Show when={details.state().data}>
          {(d) => (
            <IconButton
              icon="edit"
              label={props.pt("edit")}
              pressed={edit() !== undefined}
              onClick={() => setEdit(edit() ? undefined : structuredClone(d().entries))}
            />
          )}
        </Show>
      }
    >
      <SourceView source={details} t={props.t}>
        {(d) => (
          <>
            <Show
              when={edit()}
              fallback={
                <ul class="nsvx-list">
                  <For each={shown()}>
                    {(entry) => (
                      <li class="nsvx-row">
                        <Icon
                          name={kindOf(entry.kind).icon}
                          class={["nsvx__icon", "nsvx-row__icon"]}
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title nsvx-ppl-wrap">
                            {entry.kind === "email" ? (
                              <a href={`mailto:${entry.value}`}>{entry.value}</a>
                            ) : entry.kind === "phone" ? (
                              <a href={`tel:${entry.value}`}>{entry.value}</a>
                            ) : (
                              entry.value
                            )}
                          </span>
                          <span class="nsvx-row__detail">
                            {[props.pt(kindOf(entry.kind).key), entry.label]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              }
            >
              {(rows) => (
                <form
                  class="nsvx-ppl-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    save(d(), rows());
                  }}
                >
                  <For each={rows()} keyed={false}>
                    {(entry, index) => (
                      <div class="nsvx-ppl-contact-edit">
                        <select
                          aria-label={props.pt("contacts")}
                          value={entry().kind}
                          onChange={(event) =>
                            update(index, {
                              kind: event.currentTarget.value as ContactEntry["kind"],
                            })
                          }
                        >
                          <For each={CONTACT_KINDS}>
                            {(k) => <option value={k.id}>{props.pt(k.key)}</option>}
                          </For>
                        </select>
                        <input
                          class="nsvx__search"
                          type={kindOf(entry().kind).type}
                          aria-label={props.pt(kindOf(entry().kind).key)}
                          placeholder={
                            entry().kind === "phone"
                              ? "+351…"
                              : entry().kind === "iban"
                                ? "PT50…"
                                : ""
                          }
                          maxlength={254}
                          value={entry().value}
                          onInput={(event) => update(index, { value: event.currentTarget.value })}
                        />
                        <input
                          class="nsvx__search"
                          aria-label={props.pt("name")}
                          placeholder={props.pt("name")}
                          maxlength={80}
                          value={entry().label}
                          onInput={(event) => update(index, { label: event.currentTarget.value })}
                        />
                        <IconButton
                          icon="trash"
                          label={props.pt("remove")}
                          onClick={() => setEdit(rows().filter((_, i) => i !== index))}
                        />
                      </div>
                    )}
                  </For>
                  <div class="nsvx-ppl-row">
                    <button
                      type="button"
                      class="nsvx__button"
                      onClick={() => setEdit([...rows(), { kind: "phone", value: "", label: "" }])}
                    >
                      <Icon name="plus" />
                      {props.pt("add")}
                    </button>
                    <button
                      type="submit"
                      class="nsvx__button nsvx__button--primary"
                      disabled={change.busy() !== undefined || rows().some((r) => !r.value.trim())}
                    >
                      {props.pt("save")}
                    </button>
                  </div>
                </form>
              )}
            </Show>
            <For each={d().suggestions}>
              {(s) => (
                <div class="nsvx-ppl-suggest">
                  <Icon name="bank" />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__detail">{props.pt("theirAccount")}</span>
                    <span class="nsvx-ppl-wrap">{s.value}</span>
                  </span>
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={change.busy() !== undefined}
                    onClick={() => save(d(), d().entries, [s.id])}
                  >
                    <Icon name="done" />
                    {props.pt("keep")}
                  </button>
                </div>
              )}
            </For>
            <Note change={change} />
          </>
        )}
      </SourceView>
    </Section>
  );
}

// ---------- accounts (identity links) ----------

export function AccountsSection(props: Base & { p: Person; change: Change }) {
  const [linking, setLinking] = createSignal(false);
  const [chosen, setChosen] = createSignal<Identity>();
  const [search, setSearch] = createSignal("");
  const unlinked = createSource(props.host, () =>
    props.host.request<Identity[]>("nsvx.view", { view: "unlinkedIdentities" }),
  );
  const shown = createMemo(
    () =>
      unlinked
        .state()
        .data?.filter((i) =>
          matches(search(), i.display_name, i.handle, i.external_id, i.channel, i.label),
        )
        .slice(0, 50) ?? [],
  );
  return (
    <Section
      icon="link"
      title={props.pt("accounts")}
      count={props.p.identities.length}
      action={
        <IconButton
          icon="plus"
          label={props.pt("link")}
          pressed={linking()}
          onClick={() => {
            setLinking(!linking());
            setChosen(undefined);
            void unlinked.refresh();
          }}
        />
      }
    >
      <ul class="nsvx-list">
        <For each={props.p.identities}>
          {(i) => (
            <li class="nsvx-row">
              <BrandLogo channel={i.channel} size={24} />
              <span class="nsvx-row__main">
                <span class="nsvx-row__title nsvx-ppl-wrap">{identityName(i)}</span>
                <span class="nsvx-row__detail">{i.label}</span>
              </span>
              <span class={["nsvx__chip", { "nsvx-ppl-chip--ok": i.link_status === "verified" }]}>
                {props.pt(i.link_status === "verified" ? "verified" : "suggested")}
              </span>
            </li>
          )}
        </For>
      </ul>
      <Show when={linking()}>
        <div class="nsvx-ppl-picker">
          <p class="nsvx-ppl__hint">
            <Icon name="lock" />
            {props.pt("onlyWhenSure")}
          </p>
          <Show
            when={chosen()}
            fallback={
              <>
                <input
                  class="nsvx__search"
                  type="search"
                  placeholder={props.t("search")}
                  aria-label={props.t("search")}
                  value={search()}
                  onInput={(event) => setSearch(event.currentTarget.value)}
                />
                <SourceView source={unlinked} t={props.t}>
                  {() => (
                    <Show
                      when={shown().length > 0}
                      fallback={<p class="nsvx__empty">{props.pt("nothingToLink")}</p>}
                    >
                      <ul class="nsvx-list">
                        <For each={shown()}>
                          {(i) => (
                            <li>
                              <button
                                type="button"
                                class="nsvx-row nsvx-row--link"
                                onClick={() => setChosen(i)}
                              >
                                <BrandLogo channel={i.channel} size={22} />
                                <span class="nsvx-row__main">
                                  <span class="nsvx-row__title nsvx-ppl-wrap">
                                    {identityName(i)}
                                  </span>
                                  <span class="nsvx-row__detail">{i.label}</span>
                                </span>
                                <span class="nsvx-row__age">{age(i.last_at)}</span>
                              </button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  )}
                </SourceView>
              </>
            }
          >
            {(identity) => (
              <div class="nsvx-ppl-pair">
                <BrandLogo channel={identity().channel} size={24} />
                <strong class="nsvx-ppl-wrap">{identityName(identity())}</strong>
                <Icon name="link" />
                <strong>{props.p.display_name}</strong>
                <button type="button" class="nsvx__button" onClick={() => setChosen(undefined)}>
                  {props.pt("back")}
                </button>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={props.change.busy() !== undefined}
                  onClick={() =>
                    void props.change.run(
                      "link",
                      "nsvx.people.change",
                      { action: "link", personId: props.p.id, identityId: identity().id },
                      () => {
                        setLinking(false);
                        setChosen(undefined);
                      },
                    )
                  }
                >
                  {props.pt("link")}
                </button>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </Section>
  );
}
