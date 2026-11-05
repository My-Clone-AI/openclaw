/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { brandFor } from "./brand-logos.js";
import type { DeskKey } from "./desk-i18n.js";
import {
  BackButton,
  ConfirmButton,
  createAct,
  Empty,
  ErrorLine,
  IconButton,
  Initial,
  Panel,
  Seg,
  ToneChip,
  when,
  type DeskCtx,
} from "./desk-ui.js";
import { view } from "./group-ui.js";
import {
  contactChoices,
  nameLocked,
  RESEARCH_STAGES,
  researchActions,
  researchStage,
  researchTone,
  type ResearchJob,
  type ResearchSettings,
  type ResearchSettingValue,
} from "./research-data.js";
import { createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

const STAGE_WORD: Record<(typeof RESEARCH_STAGES)[number], DeskKey> = {
  asked: "stageAsked",
  researching: "stageResearching",
  report: "stageReport",
  delivered: "stageDelivered",
};
const STAGE_ICON: Record<(typeof RESEARCH_STAGES)[number], IconName> = {
  asked: "messages",
  researching: "research",
  report: "doc",
  delivered: "send",
};

/** NSVX's status word for each state; unknown states show as NSVX names them. */
function statusWord(d: DeskCtx["d"], state: string): string {
  const map: Record<string, DeskKey> = {
    detected: "stageAsked",
    prompt_ready: "queued",
    submitting: "running",
    submitted: "running",
    researching: "stageResearching",
    waiting_chatgpt_login: "attention",
    report_ready: "stageReport",
    pdf_ready: "pdf",
    awaiting_approval: "toConfirm",
    delivery_queued: "queued",
    queued: "queued",
    sending: "running",
    verifying: "running",
    draft: "draft",
    sent: "sent",
    delivered: "stageDelivered",
    stuck: "attention",
    done: "completed",
    failed: "failed",
    cancelled: "cancelled",
  };
  return map[state] ? d(map[state]) : state;
}

/** NSVX Pesquisas: reports people asked for in chats, each with its steps, PDF, and delivery. */
export function ResearchTab(props: { ctx: DeskCtx }) {
  const search = new URLSearchParams(location.search);
  const [done, setDone] = createSignal(search.get("rs") === "done");
  const [open, setOpen] = createSignal(search.get("report") ?? "");
  const remember = (next: { done: boolean; report: string }) => {
    const url = new URL(location.href);
    url.searchParams.set("rs", next.done ? "done" : "running");
    if (next.report) {
      url.searchParams.set("report", next.report);
    } else {
      url.searchParams.delete("report");
    }
    history.replaceState(history.state, "", url);
  };
  const d = props.ctx.d;
  return (
    <div class="nsvx-grp nsvx-desk">
      <Show
        when={open()}
        fallback={
          <>
            <SettingsCard ctx={props.ctx} />
            <Seg
              name={d("research")}
              items={["running", "done"] as const}
              value={done() ? "done" : "running"}
              label={(key) => d(key === "done" ? "finished" : "inProgress")}
              icon={(key) => (key === "done" ? "done" : "research")}
              onChange={(key) => {
                setDone(key === "done");
                remember({ done: key === "done", report: "" });
              }}
            />
            <For each={[String(done())]} keyed={(key) => key}>
              {() => (
                <Jobs
                  ctx={props.ctx}
                  done={done()}
                  onOpen={(id) => {
                    setOpen(id);
                    remember({ done: done(), report: id });
                  }}
                />
              )}
            </For>
          </>
        }
      >
        <For each={[open()]} keyed={(key) => key}>
          {(id) => (
            <Report
              ctx={props.ctx}
              id={id()}
              onBack={() => {
                setOpen("");
                remember({ done: done(), report: "" });
              }}
            />
          )}
        </For>
      </Show>
    </div>
  );
}

function ChannelMark(props: { channel: string }) {
  const brand = () => brandFor(props.channel);
  return (
    <Show when={brand()} fallback={<Icon name="messages" class="nsvx-desk__brand" />}>
      {(b) => (
        <svg viewBox="0 0 24 24" class="nsvx-desk__brand" role="img" aria-label={b().title}>
          <path d={b().path} fill={b().color} />
        </svg>
      )}
    </Show>
  );
}

function Jobs(props: { ctx: DeskCtx; done: boolean; onOpen: (id: string) => void }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const list = createSource(host, () =>
    view<{ jobs: ResearchJob[] }>(host, "researchJobs", { completed: props.done ? "true" : "false" }),
  );
  void list.refresh();
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => {
        const rows = createMemo(() =>
          data().jobs.filter((j) => matches(props.ctx.query, j.requester.name, j.request_text, j.requester.channel)),
        );
        return (
          <Show
            when={rows().length > 0}
            fallback={
              <Empty icon="research" text={d("noResearch")}>
                <Show when={!props.done}>
                  <small>{d("researchHint")}</small>
                </Show>
              </Empty>
            }
          >
            <ul class="nsvx-list">
              <For each={rows()} keyed={(j) => j.id}>
                {(j) => (
                  <li>
                    <button type="button" class="nsvx-row nsvx-row--link nsvx-desk__row" data-report={j().id} onClick={() => props.onOpen(j().id)}>
                      <Initial name={j().requester.display_name || j().requester.name} />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{j().requester.display_name || j().requester.name}</span>
                        <span class="nsvx-desk__clip">{j().request_text}</span>
                        <span class="nsvx-row__detail nsvx-desk__meta">
                          <ChannelMark channel={j().requester.channel} />
                          {j().requester.account}
                          <Show when={j().reason}>
                            <em class="nsvx-desk__warn">{j().reason}</em>
                          </Show>
                        </span>
                      </span>
                      <ToneChip tone={researchTone(j().status)} label={statusWord(d, j().status)} />
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        );
      }}
    </SourceView>
  );
}

function Report(props: { ctx: DeskCtx; id: string; onBack: () => void }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const job = createSource(host, () => view<ResearchJob>(host, "researchJob", { id: props.id }));
  void job.refresh();
  const [name, setName] = createSignal<string>();
  const [pdf, setPdf] = createSignal(false);
  const step = async (action: string) => {
    if (await act.run("nsvx.research.action", { id: props.id, action })) {
      await job.refresh();
    }
  };
  const rename = async (j: ResearchJob) => {
    if (await act.run("nsvx.research.name", { id: j.id, name: name() ?? "" })) {
      setName(undefined);
      await job.refresh();
    }
  };
  // The PDF crosses the Gateway as data; the browser saves it from memory, never from NSVX.
  const download = async (j: ResearchJob) => {
    setPdf(true);
    try {
      const file = await act.run<{ src: string }>("nsvx.view", { view: "researchPdf", params: { id: j.id } });
      if (file) {
        const blob = await (await fetch(file.src)).blob();
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = j.pdf?.name ?? "research.pdf";
        link.click();
        setTimeout(() => URL.revokeObjectURL(href), 30_000);
      }
    } finally {
      setPdf(false);
    }
  };
  return (
    <div class="nsvx-grp__company">
      <BackButton d={d} onClick={props.onBack} />
      <SourceView source={job} t={props.ctx.t}>
        {(j) => {
          const can = () => researchActions(j());
          const stage = () => researchStage(j());
          return (
            <>
              <header class="nsvx-desk__hero" data-report-page={j().id}>
                <Initial name={j().requester.display_name || j().requester.name} />
                <div class="nsvx-desk__hero-main">
                  <span class="nsvx-desk__card-top">
                    <ToneChip tone={researchTone(j().status)} label={statusWord(d, j().status)} />
                    <Show when={j().runner_data.stub}>
                      <span class="nsvx-grp__chip">{d("demo")}</span>
                    </Show>
                  </span>
                  <h2 class="nsvx-desk__h">{j().requester.display_name || j().requester.name}</h2>
                </div>
              </header>
              <ol class="nsvx-desk__stages" aria-label={d("research")}>
                <For each={RESEARCH_STAGES} keyed={false}>
                  {(s, i) => (
                    <li class={{ "nsvx-desk__stage--done": i() < stage(), "nsvx-desk__stage--now": i() === stage() }}>
                      <Icon name={STAGE_ICON[s()]} />
                      <span>{d(STAGE_WORD[s()])}</span>
                    </li>
                  )}
                </For>
              </ol>
              <Show when={j().reason}>
                <p class="nsvx__notice" role="status">
                  {j().reason}
                  <Show when={j().next_attempt_at}>
                    {" · "}
                    {d("nextTry")} {when(props.ctx.locale, j().next_attempt_at)}
                  </Show>
                </p>
              </Show>
              <div class="nsvx-grp__acts">
                <Show when={j().pdf}>
                  {(file) => (
                    <IconButton
                      icon="download"
                      label={`${d("pdf")} · ${file().pages} p.`}
                      primary
                      disabled={pdf()}
                      onClick={() => void download(j())}
                    />
                  )}
                </Show>
                <Show when={can().send}>
                  <ConfirmButton d={d} icon="send" label={d("send")} question={d("sendConfirm")} disabled={act.busy()} onConfirm={() => void step("send")} />
                </Show>
                <Show when={can().resend}>
                  <ConfirmButton d={d} icon="send" label={d("resend")} question={d("sendConfirm")} disabled={act.busy()} onConfirm={() => void step("resend")} />
                </Show>
                <Show when={can().retry}>
                  <IconButton icon="refresh" label={d("retry")} disabled={act.busy()} onClick={() => void step("retry")} />
                </Show>
                <Show when={can().cancel}>
                  <ConfirmButton d={d} icon="stop" label={d("cancel")} question={d("cancel")} danger disabled={act.busy()} onConfirm={() => void step("cancel")} />
                </Show>
              </div>
              <ErrorLine error={act.error()} />
              <div class="nsvx-desk__cols">
                <Panel icon="messages" title={d("request")}>
                  <p class="nsvx-desk__text">{j().request_text}</p>
                  <div class="nsvx-grp__chips">
                    <Show when={j().runner_data.mode}>
                      <span class="nsvx-grp__chip">
                        <Icon name="research" class="nsvx-desk__chip-icon" />
                        {j().runner_data.mode}
                      </span>
                    </Show>
                    <Show when={j().runner_data.model}>
                      <span class="nsvx-grp__chip">
                        <Icon name="bot" class="nsvx-desk__chip-icon" />
                        {j().runner_data.model}
                      </span>
                    </Show>
                  </div>
                </Panel>
                <Panel icon="send" title={d("delivery")}>
                  <ToneChip tone={researchTone(j().delivery_status)} label={statusWord(d, j().delivery_status)} />
                  <Show when={j().cover_message}>
                    <blockquote class="nsvx-desk__quote">{j().cover_message}</blockquote>
                  </Show>
                  <Show when={j().delivery_detail?.state_detail}>
                    <p class="nsvx-grp__note">{j().delivery_detail?.state_detail}</p>
                  </Show>
                </Panel>
                <Panel icon="user" title={d("contact")}>
                  <div class="nsvx-grp__acts">
                    <label class="nsvx-field nsvx-desk__grow">
                      <span>{d("nameToUse")}</span>
                      <input
                        maxLength={120}
                        value={name() ?? j().requester.display_name ?? ""}
                        placeholder={j().requester.name}
                        disabled={nameLocked(j()) || act.busy()}
                        onInput={(e) => setName(e.currentTarget.value)}
                      />
                    </label>
                    <IconButton
                      icon="done"
                      label={d("save")}
                      disabled={nameLocked(j()) || act.busy() || name() === undefined}
                      onClick={() => void rename(j())}
                    />
                  </div>
                  <Show when={j().outbox_id}>
                    <small class="nsvx-grp__note">{d("locked")}</small>
                  </Show>
                  <p class="nsvx-desk__line">
                    <ChannelMark channel={j().requester.channel} />
                    <span>
                      {j().requester.account} · {j().requester.thread_id}
                    </span>
                  </p>
                  <Show when={j().requester.phone}>
                    <p class="nsvx-desk__line">
                      <Icon name="phone" />
                      <span>{j().requester.phone}</span>
                    </p>
                  </Show>
                  <Show when={j().requester.email}>
                    <p class="nsvx-desk__line">
                      <Icon name="mail" />
                      <span>{j().requester.email}</span>
                    </p>
                  </Show>
                </Panel>
                <Panel icon="history" title={d("timeline")}>
                  <ol class="nsvx-desk__timeline">
                    <For each={j().events ?? []} keyed={false}>
                      {(e) => (
                        <li>
                          <span class={["nsvx-grp__dot", `nsvx-desk__dot--${researchTone(e().status)}`]} />
                          <time>{when(props.ctx.locale, e().at)}</time>
                          <span>{statusWord(d, e().status)}</span>
                          <Show when={e().detail}>
                            <small>{e().detail}</small>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ol>
                </Panel>
              </div>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}

/** Automatic delivery: whether finished reports go out by themselves, per account, and to whom. */
function SettingsCard(props: { ctx: DeskCtx }) {
  const host = props.ctx.host;
  const d = props.ctx.d;
  const [openCard, setOpenCard] = createSignal(false);
  const [account, setAccount] = createSignal("");
  const ask = { account: "" };
  const data = createSource(host, () =>
    view<ResearchSettings>(host, "researchSettings", ask.account ? { account_id: ask.account } : {}),
  );
  void data.refresh();
  return (
    <section class="nsvx-grp__panel nsvx-desk__panel" data-research-settings>
      <button type="button" class="nsvx-grp__panel-head nsvx-desk__toggle" aria-expanded={openCard() ? "true" : "false"} onClick={() => setOpenCard(!openCard())}>
        <Icon name="setup" />
        <strong>{d("autoSend")}</strong>
        <Show when={data.state().data}>
          {(s) => (
            <ToneChip
              tone={s().setting.enabled ? (s().effective_enabled ? "ok" : "warn") : "off"}
              label={s().setting.enabled ? (s().effective_enabled ? d("on") : d("suspendedHere")) : d("off")}
            />
          )}
        </Show>
      </button>
      <Show when={openCard()}>
        <SourceView source={data} t={props.ctx.t}>
          {(s) => (
            <>
              <label class="nsvx-field">
                <span>{d("account")}</span>
                <select
                  value={account()}
                  onChange={(e) => {
                    ask.account = e.currentTarget.value;
                    setAccount(ask.account);
                    void data.refresh();
                  }}
                >
                  <option value="">{d("allAccounts")}</option>
                  <For each={s().accounts} keyed={(a) => a.id}>
                    {(a) => (
                      <option value={a().id}>
                        {a().label} · {a().channel}
                      </option>
                    )}
                  </For>
                </select>
              </label>
              <For each={[`${s().setting.account_scope}:${s().setting.revision}`]} keyed={(key) => key}>
                {() => <SettingsForm ctx={props.ctx} data={s()} account={account()} onSaved={() => void data.refresh()} />}
              </For>
            </>
          )}
        </SourceView>
      </Show>
    </section>
  );
}

function SettingsForm(props: { ctx: DeskCtx; data: ResearchSettings; account: string; onSaved: () => void }) {
  const d = props.ctx.d;
  const act = createAct(() => props.ctx);
  const [value, setValue] = createSignal<ResearchSettingValue>({
    enabled: props.data.setting.enabled,
    mode: props.data.setting.mode,
    contacts: [...props.data.setting.contacts],
  });
  const [find, setFind] = createSignal("");
  const names = createMemo(() => new Map(props.data.contacts.map((c) => [c.key, c.name])));
  const save = async () => {
    if (await act.run("nsvx.research.settings", { account: props.account || null, ...value() })) {
      props.onSaved();
    }
  };
  return (
    <div class="nsvx-desk__stack">
      <Show when={props.data.inherited}>
        <small class="nsvx-grp__note">{d("inherited")}</small>
      </Show>
      <label class="nsvx-grp__check">
        <input
          type="checkbox"
          role="switch"
          checked={value().enabled}
          onChange={(e) => setValue({ ...value(), enabled: e.currentTarget.checked })}
        />
        {d("autoSend")}
      </label>
      <Show when={value().enabled && props.data.setting.enabled && !props.data.effective_enabled}>
        <small class="nsvx-desk__warn" role="status">
          {d("suspendedHere")} · {props.data.environment}
        </small>
      </Show>
      <div class="nsvx-grp__chips" role="radiogroup" aria-label={d("who")}>
        <For each={["blocklist", "allowlist"] as const} keyed={false}>
          {(mode) => (
            <button
              type="button"
              role="radio"
              class="nsvx-grp__chip nsvx-grp__chip--button"
              aria-checked={value().mode === mode() ? "true" : "false"}
              aria-pressed={value().mode === mode() ? "true" : "false"}
              onClick={() => setValue({ ...value(), mode: mode() })}
            >
              <Icon name={mode() === "allowlist" ? "done" : "close"} class="nsvx-desk__chip-icon" />
              {d(mode() === "allowlist" ? "onlyThese" : "everyoneExcept")}
            </button>
          )}
        </For>
      </div>
      <label class="nsvx-field">
        <span>{d("findContact")}</span>
        <input type="search" autocomplete="off" value={find()} onInput={(e) => setFind(e.currentTarget.value)} />
      </label>
      <div class="nsvx-desk__picker">
        <For each={contactChoices(props.data.contacts, find(), value().contacts).slice(0, 60)} keyed={(c) => c.key}>
          {(c) => (
            <label class="nsvx-grp__check">
              <input
                type="checkbox"
                checked={value().contacts.includes(c().key)}
                onChange={(e) =>
                  setValue({
                    ...value(),
                    contacts: e.currentTarget.checked
                      ? [...value().contacts, c().key]
                      : value().contacts.filter((k) => k !== c().key),
                  })
                }
              />
              <Initial name={c().name} size="sm" />
              {c().name}
            </label>
          )}
        </For>
      </div>
      <div class="nsvx-grp__acts">
        <IconButton icon="done" label={d("save")} primary disabled={act.busy()} onClick={() => void save()} />
      </div>
      <ErrorLine error={act.error()} />
      <Show when={props.data.history.length > 0}>
        <ol class="nsvx-desk__timeline">
          <For each={props.data.history.slice(0, 10)} keyed={(h) => h.id}>
            {(h) => (
              <li>
                <span class={["nsvx-grp__dot", `nsvx-desk__dot--${h().value.enabled ? "ok" : "off"}`]} />
                <time>{when(props.ctx.locale, h().at)}</time>
                <span>
                  {h().value.enabled ? d("on") : d("off")} · {d(h().value.mode === "allowlist" ? "onlyThese" : "everyoneExcept")}
                </span>
                <Show when={h().value.contacts.length > 0}>
                  <small>{h().value.contacts.map((k) => names().get(k) ?? k).join(", ")}</small>
                </Show>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </div>
  );
}
