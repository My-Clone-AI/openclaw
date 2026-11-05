/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { CallDetailView, CallControls } from "./calls-call.js";
import {
  byDay,
  callTone,
  dialBlocker,
  spendShare,
  TRANSPORTS,
  unknownNumber,
  usd,
  type CallRow,
  type CallsStatus,
} from "./calls-data.js";
import type { CT } from "./calls-i18n.js";
import { CallsSettings } from "./calls-settings.js";
import { ChannelMark, type CallsCtx } from "./calls-ui.js";
import { WhoCalled } from "./calls-who.js";
import type { DT } from "./device-i18n.js";
import { createAction, Note, Segs, view } from "./device-kit.js";
import { every } from "./messages-ui.js";
import { Field, Pill } from "./office-kit.js";
import { createSource, Icon, matches, SourceView, type T } from "./ui-kit.js";
import "./office.css";
import "./calls.css";

const SECTIONS = ["history", "whoCalled", "settings"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_ICON = { history: "phone", whoCalled: "find", settings: "setup" } as const;

const BLOCKER = {
  voice: "blockVoice",
  carrier: "blockCarrier",
  off: "blockOff",
  budget: "blockBudget",
  stopped: "blockStopped",
} as const;

/** The call form: number and goal, NSVX's summary of what it knows, then one confirmed tap. */
function Dial(props: { ctx: CallsCtx; status: CallsStatus; onDone: () => void }) {
  const ctx = () => props.ctx;
  const [to, setTo] = createSignal("+351");
  const [purpose, setPurpose] = createSignal("");
  const [brief, setBrief] = createSignal<{ text: string | null; past: number }>();
  // One key per intent: every retry of this tap reaches NSVX as the same call.
  const [key, setKey] = createSignal(crypto.randomUUID());
  const action = createAction(ctx);
  const ready = () => purpose().trim().length >= 3 && to().replace(/\D/g, "").length >= 9;
  return (
    <form
      class="nsvx-of__form nsvx-calls__dial"
      onSubmit={(event) => {
        event.preventDefault();
        if (!brief()) {
          void action.run(async () => {
            const answer = await ctx()
              .host.request<{
                briefing: string | null;
                recent_calls: unknown[];
              }>("nsvx.calls.briefing", { to: to(), purpose: purpose() })
              .catch(() => ({ briefing: null, recent_calls: [] }));
            setBrief({ text: answer.briefing, past: answer.recent_calls.length });
          });
          return;
        }
        void action.run(async () => {
          await ctx().host.request("nsvx.calls.dial", { to: to(), purpose: purpose(), key: key() });
          setKey(crypto.randomUUID());
          setPurpose("");
          setBrief(undefined);
          props.onDone();
        }, ctx().ct("dialing"));
      }}
    >
      <Show
        when={brief()}
        fallback={
          <>
            <Field
              label={ctx().ct("number")}
              type="tel"
              value={to()}
              max={32}
              required
              placeholder={props.status.allowed_prefixes.join(" ")}
              onInput={setTo}
            />
            <Field
              label={ctx().ct("purpose")}
              value={purpose()}
              max={300}
              required
              placeholder={ctx().ct("purposeHint")}
              onInput={setPurpose}
            />
            <p class="nsvx-of__muted nsvx-of__wide">
              <Icon name="shield" /> {ctx().ct("introNote")}
            </p>
            <button
              type="submit"
              class="nsvx__button nsvx__button--primary"
              disabled={action.busy() || !ready()}
            >
              <Icon name="forward" />
              <span>{ctx().ct("review")}</span>
            </button>
          </>
        }
      >
        {(shown) => (
          <>
            <div class="nsvx-calls__brief nsvx-of__wide" role="status">
              <strong>
                <Icon name="phone" /> {to()}
              </strong>
              <span>{purpose()}</span>
              <Show
                when={shown().text}
                fallback={<span class="nsvx-of__muted">{ctx().ct("noBrief")}</span>}
              >
                <p class="nsvx-calls__brief-text">
                  <Icon name="spark" /> {shown().text}
                </p>
              </Show>
              <Show when={shown().past > 0}>
                <span class="nsvx-of__muted">
                  <Icon name="history" /> {ctx().ct("pastCalls")}: {shown().past}
                </span>
              </Show>
            </div>
            <div class="nsvx-of__bar nsvx-of__wide">
              <button type="button" class="nsvx__button" onClick={() => setBrief(undefined)}>
                <Icon name="edit" />
                <span>{ctx().ct("change")}</span>
              </button>
              <button
                type="submit"
                class="nsvx__button nsvx__button--primary"
                disabled={action.busy() || !ctx().host.connection.canWrite}
              >
                <Icon name="phone" />
                <span>{ctx().ct("dialNow")}</span>
              </button>
            </div>
          </>
        )}
      </Show>
      <Note note={action.note()} />
    </form>
  );
}

/** Switches, spend against the cap, and the one primary action: call. */
function Overview(props: {
  ctx: CallsCtx;
  status: CallsStatus;
  onReload: () => void;
  onOpen: (id: string) => void;
}) {
  const ctx = () => props.ctx;
  const [dialing, setDialing] = createSignal(false);
  const blocker = () => dialBlocker(props.status);
  return (
    <>
      <div class="nsvx-calls__hero">
        <span class="nsvx-calls__line">
          <Icon name="phone" />
          <strong>{props.status.from_number ?? "—"}</strong>
          <Pill tone={props.status.enabled ? "ok" : "off"}>
            {ctx().ct(props.status.enabled ? "on" : "off")}
          </Pill>
        </span>
        <span
          class="nsvx-calls__meter"
          role="meter"
          aria-label={ctx().ct("today")}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={String(Math.round(spendShare(props.status)))}
        >
          <span style={{ width: `${spendShare(props.status)}%` }} />
        </span>
        <span class="nsvx-of__muted">
          {props.status.budget.daily_usd > 0
            ? `${ctx().ct("today")} ${usd(props.status.spend_today_usd)} / ${usd(props.status.budget.daily_usd)} · ${ctx().ct("month")} ${usd(props.status.spend_month_usd)}`
            : ctx().ct("noBudget")}
        </span>
        <button
          type="button"
          class="nsvx__button nsvx__button--primary nsvx-calls__call"
          aria-expanded={dialing() ? "true" : "false"}
          disabled={Boolean(blocker())}
          onClick={() => setDialing(!dialing())}
        >
          <Icon name="phone" />
          <span>{ctx().ct("call")}</span>
        </button>
      </div>
      <Show when={blocker()}>
        {(why) => (
          <p class="nsvx-of__warn" role="note">
            <Icon name="alert" /> {ctx().ct(BLOCKER[why()])}
          </p>
        )}
      </Show>
      <Show when={dialing() && !blocker()}>
        <Dial
          ctx={ctx()}
          status={props.status}
          onDone={() => {
            setDialing(false);
            props.onReload();
          }}
        />
      </Show>
      <Show when={props.status.active.length > 0}>
        <section class="nsvx-calls__live" aria-label={ctx().ct("live")}>
          <h3>
            <span class="nsvx-calls__pulse" aria-hidden="true" /> {ctx().ct("live")}
          </h3>
          <ul class="nsvx-of__list">
            <For each={props.status.active} keyed={(call) => call.id}>
              {(call) => (
                <li class="nsvx-calls__live-row" data-call={call().id}>
                  <ChannelMark channel={call().channel} ct={ctx().ct} />
                  <span class="nsvx-of__main">
                    <strong>
                      {call().channel === "browser"
                        ? ctx().ct("app")
                        : (call().caller ?? call().channel)}
                    </strong>
                    <span class="nsvx-of__sub">{call().label}</span>
                  </span>
                  <CallControls
                    ctx={ctx()}
                    id={call().id}
                    channel={call().channel}
                    state={call().state}
                    onChange={props.onReload}
                  />
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--icon"
                    aria-label={ctx().ct("transcript")}
                    title={ctx().ct("transcript")}
                    onClick={() => props.onOpen(call().id)}
                  >
                    <Icon name="messages" />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </>
  );
}

function CallRowView(props: {
  ctx: CallsCtx;
  row: CallRow;
  onOpen: () => void;
  onWho: (number: string, callId: string) => void;
}) {
  const ctx = () => props.ctx;
  return (
    <li class="nsvx-calls__row" data-call={props.row.id}>
      <button type="button" class="nsvx-of__row" onClick={() => props.onOpen()}>
        <ChannelMark channel={props.row.channel} ct={ctx().ct} />
        <span class="nsvx-of__main">
          <strong>
            {props.row.channel === "browser"
              ? ctx().ct("app")
              : (props.row.who ?? ctx().ct("unknown"))}
            <Show when={props.row.direction === "outbound"}>
              {" "}
              <Icon name="forward" class="nsvx-calls__out" />
            </Show>
          </strong>
          <span class="nsvx-of__sub">
            {new Date(props.row.started_at).toLocaleTimeString(ctx().locale, {
              timeStyle: "short",
            })}{" "}
            · {props.row.n_turns} {ctx().ct("turns")} · {props.row.cost_estimated ? "≈ " : ""}
            {usd(props.row.cost_usd)}
          </span>
          <Show when={props.row.purpose}>
            <span class="nsvx-of__sub">{props.row.purpose}</span>
          </Show>
        </span>
        <Pill tone={callTone(props.row.state)}>{props.row.label}</Pill>
      </button>
      <Show when={unknownNumber(props.row)}>
        <button
          type="button"
          class="nsvx__button nsvx-calls__who"
          onClick={() => props.onWho(props.row.who ?? "", props.row.id)}
        >
          <Icon name="find" />
          <span>{ctx().ct("whoCalled")}</span>
        </button>
      </Show>
    </li>
  );
}

const BRANDS: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  sip: "SIP",
};

const TRANSPORT_LABEL = (ct: CT, transport: string) =>
  transport === "pstn" ? ct("phone") : transport === "browser" ? ct("app") : BRANDS[transport];

/** NSVX Chamadas e voz (`/apps/voz`) and Quem ligou (`/pessoas/quem-ligou`), natively. */
export function CallsTab(props: {
  host: ControlUiHost;
  t: T;
  dt: DT;
  ct: CT;
  locale: string;
  query: string;
  onMission?: (id: string) => void;
}) {
  const ctx = createMemo<CallsCtx>(() => ({
    onMission: props.onMission,
    host: props.host,
    t: props.t,
    dt: props.dt,
    ct: props.ct,
    locale: props.locale,
    query: props.query,
  }));
  const search = new URLSearchParams(location.search);
  const start = search.get("section");
  const [section, setSection] = createSignal<Section>(
    SECTIONS.includes(start as Section) ? (start as Section) : "history",
  );
  const [opened, setOpened] = createSignal(search.get("call") ?? "");
  const [who, setWho] = createSignal<{ number: string; callId?: string }>({
    number: search.get("number") ?? "",
  });
  const [transport, setTransport] = createSignal("");
  const remember = (next: { section: Section; call?: string }) => {
    const url = new URL(location.href);
    url.searchParams.set("section", next.section);
    if (next.call) {
      url.searchParams.set("call", next.call);
    } else {
      url.searchParams.delete("call");
    }
    url.searchParams.delete("number");
    history.replaceState(history.state, "", url);
  };
  const go = (next: Section) => {
    setSection(next);
    setOpened("");
    remember({ section: next });
  };
  const open = (id: string) => {
    setOpened(id);
    remember({ section: "history", call: id });
  };
  const status = createSource(props.host, () => view<CallsStatus>(props.host, "callsStatus"));
  // NSVX searches name, number, and goal beyond the rows shown; the page search also filters what is here.
  const calls = createSource(props.host, () =>
    view<CallRow[]>(props.host, "calls", {
      channel: "calls",
      ...(transport() ? { transport: transport() } : {}),
      ...(props.query.trim() ? { q: props.query.trim() } : {}),
    }),
  );
  const reload = () => {
    void status.refresh();
    void calls.refresh();
  };
  reload();
  every(15_000, () => {
    if (section() === "history" && !opened()) {
      reload();
    }
  });
  const rows = createMemo(() =>
    (calls.state().data ?? []).filter((row) =>
      matches(props.query, row.who, row.purpose, row.label),
    ),
  );
  return (
    <div class="nsvx-dev nsvx-of nsvx-calls">
      <Segs
        name={props.ct("calls")}
        items={SECTIONS}
        value={section()}
        label={(key) => props.ct(key)}
        icon={(key) => SECTION_ICON[key]}
        onChange={go}
      />
      <Show when={section() === "history"}>
        <Show
          when={!opened()}
          fallback={
            <For each={[opened()]} keyed={(id) => id}>
              {(id) => (
                <CallDetailView
                  ctx={ctx()}
                  id={id()}
                  onBack={() => {
                    open("");
                    reload();
                  }}
                />
              )}
            </For>
          }
        >
          <SourceView source={status} t={props.t}>
            {(loaded) => <Overview ctx={ctx()} status={loaded()} onReload={reload} onOpen={open} />}
          </SourceView>
          {/* History waits for the status read, so a missing sign-in shows one card, not two. */}
          <Show when={status.state().data}>
            <div class="nsvx-calls__filters" role="radiogroup" aria-label={props.ct("calls")}>
              <For each={["", ...TRANSPORTS]} keyed={false}>
                {(item) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={transport() === item() ? "true" : "false"}
                    class={["nsvx-of__pick", { "nsvx-of__pick--on": transport() === item() }]}
                    onClick={() => {
                      setTransport(item());
                      void calls.refresh();
                    }}
                  >
                    <Show when={item()} fallback={props.ct("all")}>
                      <span aria-hidden="true">
                        <ChannelMark channel={item()} size={16} ct={props.ct} />
                      </span>
                      <span>{TRANSPORT_LABEL(props.ct, item())}</span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
            <SourceView source={calls} t={props.t}>
              {() => (
                <For
                  each={byDay(rows(), props.locale)}
                  keyed={(group) => group.key}
                  fallback={<p class="nsvx__empty">{props.ct("none")}</p>}
                >
                  {(group) => (
                    <section class="nsvx-calls__day" aria-label={group().label}>
                      <h3>
                        {group().label === "today" || group().label === "yesterday"
                          ? props.ct(group().label as "today" | "yesterday")
                          : group().label}{" "}
                        <span class="nsvx-of__count">{group().rows.length}</span>
                      </h3>
                      <ul class="nsvx-of__list">
                        <For each={group().rows} keyed={(row) => row.id}>
                          {(row) => (
                            <CallRowView
                              ctx={ctx()}
                              row={row()}
                              onOpen={() => open(row().id)}
                              onWho={(number, callId) => {
                                setWho({ number, callId });
                                setSection("whoCalled");
                                remember({ section: "whoCalled" });
                              }}
                            />
                          )}
                        </For>
                      </ul>
                    </section>
                  )}
                </For>
              )}
            </SourceView>
          </Show>
        </Show>
      </Show>
      <Show when={section() === "whoCalled"}>
        <For each={[`${who().number}:${who().callId ?? ""}`]} keyed={(key) => key}>
          {() => <WhoCalled ctx={ctx()} number={who().number} callId={who().callId} />}
        </For>
      </Show>
      <Show when={section() === "settings"}>
        <CallsSettings ctx={ctx()} />
      </Show>
    </div>
  );
}
