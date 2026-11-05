/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { saveNsvxFile } from "./aviation-kit.js";
import type { DT } from "./device-i18n.js";
import { ConfirmButton, createAction, Note, view, type Ctx } from "./device-kit.js";
import { BrandLogo, every } from "./messages-ui.js";
import { Choice, Field, Panel, Pill, Reveal, Toggle } from "./office-kit.js";
import { IconButton } from "./people-ui.js";
import {
  contactChoices,
  deliveryState,
  researchActions,
  researchProgress,
  researchTone,
  type ResearchJob,
  type ResearchSettings,
  type ResearchSettingsValue,
} from "./research-data.js";
import { researchState, type RT } from "./research-i18n.js";
import { createSource, Icon, matches, SourceView, type T } from "./ui-kit.js";
import "./device.css";
import "./office.css";

type ResearchCtx = Ctx & { rt: RT; locale: string };

const stamp = (iso: string | undefined | null, locale: string) =>
  iso ? new Date(iso).toLocaleString(locale) : "";

function JobRow(props: { ctx: ResearchCtx; job: ResearchJob; onOpen: () => void }) {
  return (
    <li>
      <button type="button" class="nsvx-of__row" onClick={() => props.onOpen()}>
        <BrandLogo channel={props.job.requester.channel} size={20} />
        <span class="nsvx-of__main">
          <strong>{props.job.requester.display_name || props.job.requester.name}</strong>
          <span class="nsvx-of__sub">{props.job.request_text}</span>
          <Show when={props.job.reason}>
            <span class="nsvx-of__sub">{props.job.reason}</span>
          </Show>
          <Show
            when={props.job.next_attempt_at && (props.job.reason || props.job.status === "stuck")}
          >
            <span class="nsvx-of__sub">
              {props.ctx.rt("next")} · {stamp(props.job.next_attempt_at, props.ctx.locale)}
            </span>
          </Show>
        </span>
        <Pill tone={researchTone(props.job.status)}>
          {researchState(props.ctx.locale, props.job.status)}
        </Pill>
      </button>
    </li>
  );
}

function JobDetail(props: { ctx: ResearchCtx; id: string; onBack: () => void }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<ResearchJob>(ctx().host, "researchJob", { id: props.id }),
  );
  void source.refresh();
  every(15_000, () => void source.refresh());
  const action = createAction(ctx);
  const act = (name: "retry" | "cancel" | "send" | "resend", done?: string) =>
    void action.run(async () => {
      await ctx().host.request("nsvx.research.change", { action: name, id: props.id });
      await source.refresh();
    }, done);
  return (
    <div class="nsvx-of">
      <div class="nsvx-of__bar">
        <IconButton icon="back" label={ctx().rt("back")} onClick={() => props.onBack()} />
      </div>
      <SourceView source={source} t={ctx().t}>
        {(loaded) => {
          const job = loaded;
          const can = () => researchActions(job());
          const [name, setName] = createSignal(job().requester.display_name ?? "");
          return (
            <>
              <header class="nsvx-of__head">
                <BrandLogo channel={job().requester.channel} size={24} />
                <h2>{job().requester.display_name || job().requester.name}</h2>
                <Pill tone={researchTone(job().status)}>
                  {researchState(ctx().locale, job().status)}
                </Pill>
                <Show when={job().runner_data.stub}>
                  <Pill tone="warn">{ctx().rt("demo")}</Pill>
                </Show>
              </header>
              <div class="nsvx-of__progress" role="progressbar" aria-label={ctx().rt("progress")}>
                <span style={{ width: `${researchProgress(job())}%` }} />
              </div>
              <Show when={job().reason}>
                <p class="nsvx-of__warn" role="status">
                  {job().reason}
                </p>
              </Show>
              <Show when={job().next_attempt_at && job().reason}>
                <p class="nsvx-of__muted">
                  {ctx().rt("next")} · {stamp(job().next_attempt_at, ctx().locale)}
                </p>
              </Show>
              <div class="nsvx-of__bar">
                <Show when={job().pdf}>
                  {(pdf) => (
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--primary"
                      disabled={action.busy()}
                      onClick={() =>
                        void action.run(() =>
                          saveNsvxFile(ctx().host, { id: props.id }, "nsvx.research.file"),
                        )
                      }
                    >
                      <Icon name="download" />
                      <span>
                        {ctx().rt("pdf")} · {pdf().pages} {ctx().rt("pages")}
                      </span>
                    </button>
                  )}
                </Show>
                <Show when={can().send}>
                  <ConfirmButton
                    label={ctx().rt("send")}
                    confirm={ctx().rt("confirmSend")}
                    cancel={ctx().rt("keep")}
                    icon="send"
                    disabled={action.busy() || !ctx().host.connection.canWrite}
                    onConfirm={() => act("send", ctx().rt("queued"))}
                  />
                </Show>
                <Show when={can().resend}>
                  <ConfirmButton
                    label={ctx().rt("resend")}
                    confirm={ctx().rt("confirmSend")}
                    cancel={ctx().rt("keep")}
                    icon="send"
                    disabled={action.busy() || !ctx().host.connection.canWrite}
                    onConfirm={() => act("resend", ctx().rt("queued"))}
                  />
                </Show>
                <Show when={can().retry}>
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={action.busy() || !ctx().host.connection.canWrite}
                    onClick={() => act("retry")}
                  >
                    <Icon name="refresh" />
                    <span>{ctx().rt("retry")}</span>
                  </button>
                </Show>
                <Show when={can().cancel}>
                  <ConfirmButton
                    label={ctx().rt("cancel")}
                    confirm={ctx().rt("confirmCancel")}
                    cancel={ctx().rt("keep")}
                    icon="stop"
                    danger
                    disabled={action.busy() || !ctx().host.connection.canWrite}
                    onConfirm={() => act("cancel")}
                  />
                </Show>
              </div>
              <Note note={action.note()} />
              <Panel title={ctx().rt("request")} icon="messages">
                <p class="nsvx-of__muted">{ctx().rt("fromOther")}</p>
                <p class="nsvx-of__body">{job().request_text}</p>
                <Show when={job().prompt}>
                  <details>
                    <summary>{ctx().rt("prompt")}</summary>
                    <div class="nsvx-of__mono">{job().prompt}</div>
                  </details>
                </Show>
              </Panel>
              <Panel title={ctx().rt("contact")} icon="user">
                <dl class="nsvx-of__dl">
                  <Show when={job().requester.phone}>
                    <dt>{ctx().rt("phone")}</dt>
                    <dd>{job().requester.phone}</dd>
                  </Show>
                  <Show when={job().requester.email}>
                    <dt>{ctx().rt("email")}</dt>
                    <dd>{job().requester.email}</dd>
                  </Show>
                  <dt>{ctx().rt("account")}</dt>
                  <dd>
                    {job().requester.channel} · {job().requester.account}
                  </dd>
                  <dt>{ctx().rt("model")}</dt>
                  <dd>{job().runner_data.model || "—"}</dd>
                  <dt>{ctx().rt("mode")}</dt>
                  <dd>{job().runner_data.mode || "—"}</dd>
                </dl>
                <form
                  class="nsvx-of__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action.run(async () => {
                      await ctx().host.request("nsvx.research.change", {
                        action: "name",
                        id: props.id,
                        displayName: name(),
                      });
                      await source.refresh();
                    }, ctx().rt("saved"));
                  }}
                >
                  <Field
                    label={ctx().rt("nameToUse")}
                    value={name()}
                    max={120}
                    placeholder={job().requester.name}
                    onInput={setName}
                  />
                  <div class="nsvx-dev__bar">
                    <button
                      type="submit"
                      class="nsvx__button"
                      disabled={action.busy() || !can().rename}
                    >
                      {ctx().rt("save")}
                    </button>
                    <Show when={job().outbox_id}>
                      <span class="nsvx-of__muted">{ctx().rt("nameLocked")}</span>
                    </Show>
                  </div>
                </form>
              </Panel>
              <Panel title={ctx().rt("progress")} icon="history">
                <ol class="nsvx-of__timeline">
                  <For each={job().events ?? []} keyed={false}>
                    {(event) => (
                      <li>
                        <span>
                          <Pill tone={researchTone(event().status)}>
                            {researchState(ctx().locale, event().status)}
                          </Pill>{" "}
                          <span class="nsvx-of__sub">{stamp(event().at, ctx().locale)}</span>
                        </span>
                        <Show when={event().detail}>
                          <span class="nsvx-of__sub">{event().detail}</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ol>
              </Panel>
              <Panel title={ctx().rt("delivery")} icon="send">
                <div>
                  <Pill tone={researchTone(job().delivery_status)}>
                    {researchState(ctx().locale, job().delivery_status)}
                  </Pill>
                </div>
                <Show when={job().cover_message}>
                  <p class="nsvx-of__body">{job().cover_message}</p>
                </Show>
                <Show when={job().delivery_detail?.state_detail}>
                  <p class="nsvx-of__muted">{job().delivery_detail?.state_detail}</p>
                </Show>
              </Panel>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}

function SettingsForm(props: {
  ctx: ResearchCtx;
  data: ResearchSettings;
  account: string;
  reload: () => Promise<void>;
}) {
  const ctx = () => props.ctx;
  const saved = () => props.data.setting;
  const [value, setValue] = createSignal<ResearchSettingsValue>({
    enabled: saved().enabled,
    mode: saved().mode,
    contacts: saved().contacts,
  });
  const [search, setSearch] = createSignal("");
  const action = createAction(ctx);
  const state = createMemo(() =>
    deliveryState(value().enabled, saved().enabled, props.data.effective_enabled),
  );
  const nameOf = (key: string) =>
    props.data.contacts.find((choice) => choice.key === key)?.name ?? key;
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await ctx().host.request("nsvx.research.change", {
            action: "settings",
            accountId: props.account || null,
            ...value(),
          });
          await props.reload();
        }, ctx().rt("saved"));
      }}
    >
      <Show when={props.data.inherited}>
        <p class="nsvx-of__muted nsvx-of__wide">{ctx().rt("inherited")}</p>
      </Show>
      <Toggle
        label={`${ctx().rt("auto")}: ${ctx().rt(state())}`}
        checked={value().enabled}
        onChange={(enabled) => setValue({ ...value(), enabled })}
      />
      <Show when={state() === "suspended"}>
        <p class="nsvx-of__warn nsvx-of__wide" role="status">
          {ctx().rt("held")} ({props.data.environment})
        </p>
      </Show>
      <Show when={value().enabled !== saved().enabled}>
        <p class="nsvx-of__muted nsvx-of__wide" role="status">
          {ctx().rt("unsaved")}
        </p>
      </Show>
      <Choice
        label={ctx().rt("who")}
        value={value().mode}
        options={[
          ["blocklist", ctx().rt("block")],
          ["allowlist", ctx().rt("allow")],
        ]}
        onChange={(mode) => setValue({ ...value(), mode })}
      />
      <Field label={ctx().rt("find")} type="search" value={search()} onInput={setSearch} />
      <div class="nsvx-of__wide nsvx-of__list">
        <For
          each={contactChoices(props.data.contacts, search(), value().contacts).slice(0, 60)}
          keyed={(choice) => choice.key}
          fallback={<p class="nsvx-of__muted">{ctx().rt("noneContacts")}</p>}
        >
          {(choice) => (
            <Toggle
              label={choice().name}
              checked={value().contacts.includes(choice().key)}
              onChange={(on) =>
                setValue({
                  ...value(),
                  contacts: on
                    ? [...value().contacts, choice().key]
                    : value().contacts.filter((key) => key !== choice().key),
                })
              }
            />
          )}
        </For>
      </div>
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !ctx().host.connection.canWrite}
        >
          {ctx().rt("save")}
        </button>
      </div>
      <details class="nsvx-of__wide">
        <summary>{ctx().rt("history")}</summary>
        <ol class="nsvx-of__timeline">
          <For each={props.data.history} keyed={(row) => row.id}>
            {(row) => (
              <li>
                <strong>
                  {ctx().rt(row().value.enabled ? "on" : "off")} ·{" "}
                  {ctx().rt(row().value.mode === "allowlist" ? "allow" : "block")}
                </strong>
                <span class="nsvx-of__sub">
                  {stamp(row().at, ctx().locale)} · {row().source}
                </span>
                <Show when={row().value.contacts.length}>
                  <span class="nsvx-of__sub">{row().value.contacts.map(nameOf).join(", ")}</span>
                </Show>
              </li>
            )}
          </For>
        </ol>
      </details>
    </form>
  );
}

/** Who gets finished research automatically: NSVX's delivery gate, per account or for all. */
function SettingsPanel(props: { ctx: ResearchCtx }) {
  const ctx = () => props.ctx;
  const [account, setAccount] = createSignal("");
  const source = createSource(ctx().host, () =>
    view<ResearchSettings>(
      ctx().host,
      "researchSettings",
      account() ? { account_id: account() } : {},
    ),
  );
  void source.refresh();
  return (
    <div class="nsvx-of__form">
      <SourceView source={source} t={ctx().t}>
        {(data) => (
          <>
            <Choice
              label={ctx().rt("scope")}
              value={account()}
              options={[
                ["", ctx().rt("allAccounts")],
                ...data().accounts.map((row) => [row.id, `${row.label} · ${row.channel}`] as const),
              ]}
              onChange={(next) => {
                setAccount(next);
                void source.refresh();
              }}
            />
            <For
              each={[`${account()}:${data().setting.account_scope}:${data().setting.revision}`]}
              keyed={(key) => key}
            >
              {() => (
                <SettingsForm
                  ctx={ctx()}
                  data={data()}
                  account={account()}
                  reload={source.refresh}
                />
              )}
            </For>
          </>
        )}
      </SourceView>
    </div>
  );
}

/** NSVX Pesquisas (`/pesquisas`), natively: jobs, one job's progress and delivery, and delivery settings. */
export function ResearchTab(props: {
  host: ControlUiHost;
  t: T;
  dt: DT;
  rt: RT;
  locale: string;
  query: string;
}) {
  const ctx = createMemo<ResearchCtx>(() => ({
    host: props.host,
    t: props.t,
    dt: props.dt,
    rt: props.rt,
    locale: props.locale,
    query: props.query,
  }));
  const [opened, setOpened] = createSignal(
    new URLSearchParams(location.search).get("research") ?? "",
  );
  const [completed, setCompleted] = createSignal(false);
  const source = createSource(props.host, () =>
    view<{ jobs: ResearchJob[] }>(props.host, "research", {
      completed: completed() ? "true" : "false",
    }),
  );
  void source.refresh();
  every(15_000, () => {
    if (!opened()) {
      void source.refresh();
    }
  });
  const open = (id: string) => {
    setOpened(id);
    const url = new URL(location.href);
    if (id) {
      url.searchParams.set("research", id);
    } else {
      url.searchParams.delete("research");
    }
    history.replaceState(history.state, "", url);
  };
  const rows = createMemo(() =>
    (source.state().data?.jobs ?? []).filter((job) =>
      matches(props.query, job.requester.name, job.requester.display_name, job.request_text),
    ),
  );
  return (
    <div class="nsvx-dev nsvx-of">
      <Show
        when={!opened()}
        fallback={
          <For each={[opened()]} keyed={(id) => id}>
            {(id) => <JobDetail ctx={ctx()} id={id()} onBack={() => open("")} />}
          </For>
        }
      >
        <div class="nsvx-of__bar">
          <div class="nsvx-seg" role="radiogroup" aria-label={props.rt("research")}>
            <For each={[false, true]} keyed={false}>
              {(done) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={completed() === done() ? "true" : "false"}
                  class={["nsvx-seg__item", { "nsvx-seg__item--on": completed() === done() }]}
                  onClick={() => {
                    setCompleted(done());
                    void source.refresh();
                  }}
                >
                  <Icon name={done() ? "done" : "activity"} />
                  <span>{props.rt(done() ? "completed" : "active")}</span>
                </button>
              )}
            </For>
          </div>
          <Reveal label={props.rt("settings")} icon="setup">
            {() => <SettingsPanel ctx={ctx()} />}
          </Reveal>
        </div>
        <SourceView source={source} t={props.t}>
          {() => (
            <ul class="nsvx-of__list">
              <For
                each={rows()}
                keyed={(job) => job.id}
                fallback={<p class="nsvx__empty">{props.rt("none")}</p>}
              >
                {(job) => <JobRow ctx={ctx()} job={job()} onOpen={() => open(job().id)} />}
              </For>
            </ul>
          )}
        </SourceView>
      </Show>
    </div>
  );
}
