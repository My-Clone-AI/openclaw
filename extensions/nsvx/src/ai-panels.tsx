/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import {
  AiIcon,
  Bar,
  createChanger,
  Dot,
  Mark,
  NoticeLine,
  Toggle,
  type Notice,
  type ViewProps,
} from "./ai-kit.js";
import { age, createSource, SourceView } from "./ui-kit.js";

// ---------------- clone-ai ----------------

type CloneAiPanel = {
  host: string;
  device: {
    available: boolean;
    device: null | {
      registered: boolean;
      online: boolean;
      busy: boolean;
      heartbeat_age_s: number | null;
      heartbeat_ttl_s: number | null;
      resources: null | { memory_free_pct: number | null; disk_free_bytes: number | null };
    };
  };
  shim: { ok: boolean; mac_online: boolean | null };
  routing: {
    enabled: boolean;
    lanes: { lane: string; position: number; eligible: boolean; reason: string; active: boolean }[];
  };
  promotion: {
    state: string;
    rollback_available: boolean;
    promoted_at: string | null;
    canary: { passed: number; total: number } | null;
    window: { attempts: number; failed: number; timeouts: number } | null;
  };
  training: {
    items: {
      id: string;
      status: string;
      created_at: string | null;
      chart: { cases: number; reference: number; clone_ai: number } | null;
    }[];
  };
  action?: { state: string; changed: boolean };
};

/** The heartbeat lease, not a stored flag, proves the Mac is online (NSVX localOnline). */
function macOnline(panel: CloneAiPanel): boolean {
  const device = panel.device.device;
  return Boolean(
    panel.device.available &&
    device?.online &&
    device.heartbeat_age_s !== null &&
    device.heartbeat_ttl_s &&
    device.heartbeat_age_s < device.heartbeat_ttl_s,
  );
}

export function CloneAiView(props: ViewProps) {
  const panel = createSource(props.host, () =>
    props.host.request<CloneAiPanel>("nsvx.ai.read", { view: "cloneAi" }),
  );
  void panel.refresh();
  const changer = createChanger<CloneAiPanel>(props.host, props.at, panel);
  const [confirming, setConfirming] = createSignal(false);
  const locked = () => !props.host.connection.canWrite || changer.busy() !== "";
  const actionNotice = (result: unknown): Notice => {
    const action = (result as CloneAiPanel).action;
    return { text: props.at(action && !action.changed ? "noChange" : "saved") };
  };
  return (
    <SourceView source={panel} t={props.t}>
      {(data) => {
        const online = () => macOnline(data());
        const device = () => data().device.device;
        const memory = () => (online() ? (device()?.resources?.memory_free_pct ?? null) : null);
        const disk = () => (online() ? (device()?.resources?.disk_free_bytes ?? null) : null);
        const window = () => data().promotion.window;
        const windowMax = () =>
          Math.max(1, window()?.attempts ?? 0, window()?.failed ?? 0, window()?.timeouts ?? 0);
        return (
          <>
            <div class="nsvx-ai-health">
              <div class="nsvx-ai-card">
                <AiIcon name="cloneAi" class="nsvx-ai-card__icon" />
                <span>{props.at("device")}</span>
                <strong>{data().host}</strong>
                <Dot
                  tone={online() ? (device()?.busy ? "busy" : "ok") : "off"}
                  label={props.at(online() ? (device()?.busy ? "busy" : "online") : "offline")}
                />
              </div>
              <div class="nsvx-ai-card">
                <AiIcon name="routes" class="nsvx-ai-card__icon" />
                <span>{props.at("router")}</span>
                <Dot
                  tone={data().shim.ok ? "ok" : "bad"}
                  label={props.at(data().shim.ok ? "cloneAiHealthy" : "cloneAiDown")}
                />
              </div>
              <div class="nsvx-ai-card">
                <span>{props.at("memory")}</span>
                <Show
                  when={memory() !== null}
                  fallback={<strong>{props.at("notMeasured")}</strong>}
                >
                  <Bar value={(memory() ?? 0) / 100} label="" tone="ok" />
                </Show>
              </div>
              <div class="nsvx-ai-card">
                <span>{props.at("disk")}</span>
                <strong>
                  {disk() === null
                    ? props.at("notMeasured")
                    : `${Math.floor((disk() ?? 0) / 1024 ** 3)} GiB`}
                </strong>
              </div>
            </div>
            <div class="nsvx-ai-row">
              <span class="nsvx-ai-row__label">{props.at("useInRoutes")}</span>
              <Toggle
                checked={data().routing.enabled}
                label={props.at("useInRoutes")}
                disabled={locked()}
                onChange={(enabled) =>
                  void changer.run("routing", { op: "cloneAi.routing", enabled })
                }
              />
            </div>
            <NoticeLine notice={changer.notice()} />
            <h2 class="nsvx__heading">{props.at("routes")}</h2>
            <ul class="nsvx-list">
              <For each={data().routing.lanes} keyed={(lane) => `${lane.lane}:${lane.position}`}>
                {(lane) => (
                  <li class="nsvx-ai-account">
                    <AiIcon name={lane().lane} class="nsvx-ai-lane__icon" />
                    <span class="nsvx-ai-account__main">
                      <span class="nsvx-ai-node__title">{props.at(lane().lane)}</span>
                      <span class="nsvx-ai-node__detail">
                        {props.at("position")} {lane().position}
                      </span>
                    </span>
                    <Dot
                      tone={lane().active ? "busy" : lane().eligible ? "ok" : "off"}
                      label={props.at(
                        lane().active ? "answering" : lane().eligible ? "eligible" : lane().reason,
                      )}
                    />
                  </li>
                )}
              </For>
            </ul>
            <Show when={data().routing.lanes.length === 0}>
              <p class="nsvx__empty">{props.at("noRoutes")}</p>
            </Show>
            <h2 class="nsvx__heading">{props.at("training")}</h2>
            <div class="nsvx-ai-row">
              <Dot
                tone={data().promotion.state === "promoted" ? "ok" : "off"}
                label={props.at(data().promotion.state)}
              />
              <Show when={data().promotion.canary}>
                {(canary) => (
                  <span class="nsvx__chip">
                    {props.at("canary")} {canary().passed}/{canary().total}
                  </span>
                )}
              </Show>
              <span class="nsvx-ai-lane__tools">
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={locked()}
                  onClick={() =>
                    void changer.run("check", { op: "cloneAi.check" }, undefined, actionNotice)
                  }
                >
                  <AiIcon name="check" />
                  {props.at("check")}
                </button>
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={locked() || !data().promotion.rollback_available}
                  onClick={() => setConfirming(true)}
                >
                  <AiIcon name="restore" />
                  {props.at("rollback")}
                </button>
              </span>
            </div>
            <Show when={confirming()}>
              <div class="nsvx-ai-confirm" role="alertdialog" aria-label={props.at("rollbackAsk")}>
                <strong>{props.at("rollbackAsk")}</strong>
                <span class="nsvx-ai-lane__tools">
                  <button type="button" class="nsvx__button" onClick={() => setConfirming(false)}>
                    {props.at("cancel")}
                  </button>
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--danger"
                    disabled={locked()}
                    onClick={() => {
                      setConfirming(false);
                      void changer.run(
                        "rollback",
                        { op: "cloneAi.rollback" },
                        undefined,
                        actionNotice,
                      );
                    }}
                  >
                    {props.at("rollback")}
                  </button>
                </span>
              </div>
            </Show>
            <Show when={window()}>
              {(counts) => (
                <div class="nsvx-ai-chart" aria-label={props.at("last24h")}>
                  <Bar
                    value={counts().attempts / windowMax()}
                    label={`${props.at("attempts")} ${counts().attempts}`}
                    tone="ok"
                    count
                  />
                  <Bar
                    value={counts().failed / windowMax()}
                    label={`${props.at("failed")} ${counts().failed}`}
                    tone="bad"
                    count
                  />
                  <Bar
                    value={counts().timeouts / windowMax()}
                    label={`${props.at("timeouts")} ${counts().timeouts}`}
                    tone="warn"
                    count
                  />
                </div>
              )}
            </Show>
            <ul class="nsvx-list">
              <For each={data().training.items} keyed={(item) => item.id}>
                {(item) => (
                  <li class="nsvx-ai-account">
                    <Mark id="clone-ai" />
                    <span class="nsvx-ai-account__main">
                      <span class="nsvx-ai-node__title">
                        {props.at(`t_${item().status}`)}
                        <span class="nsvx-row__age">{age(item().created_at)}</span>
                      </span>
                      <Show when={item().chart}>
                        {(chart) => {
                          const max = () => Math.max(1, chart().reference, chart().clone_ai);
                          return (
                            <span class="nsvx-ai-account__bars">
                              <Bar
                                value={chart().reference / max()}
                                label={`${props.at("reference")} ${chart().reference}`}
                                tone="off"
                                count
                              />
                              <Bar
                                value={chart().clone_ai / max()}
                                label={`clone-ai ${chart().clone_ai}`}
                                tone="ok"
                                count
                              />
                            </span>
                          );
                        }}
                      </Show>
                    </span>
                  </li>
                )}
              </For>
            </ul>
            <Show when={data().training.items.length === 0}>
              <p class="nsvx__empty">{props.at("noTraining")}</p>
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

// ---------------- voice ----------------

type VoiceSettings = {
  model: string;
  voice: string;
  style: string;
  language: string;
  length: string;
  instructions: string;
  autoplay: boolean;
  mic_input: boolean;
  max_seconds: number;
  daily_usd: number;
  max_per_hour: number;
};
type VoiceData = {
  engine: string;
  settings: VoiceSettings;
  status: {
    key_present: boolean;
    spend_today_usd: string;
    routing: { label: string; channel: string; ready: boolean }[];
  };
  options: { voices: string[]; styles: string[]; languages: string[]; lengths: string[] };
};

const LANGUAGE_NAMES: Record<string, string> = {
  "pt-PT": "Português (PT)",
  "pt-BR": "Português (BR)",
  en: "English",
  es: "Español",
  fr: "Français",
};

async function loadVoice(host: ControlUiHost): Promise<VoiceData> {
  const [settings, engine] = await Promise.all([
    host.request<Omit<VoiceData, "engine">>("nsvx.ai.read", { view: "voice" }),
    host.request<{ engine: string }>("nsvx.ai.read", { view: "voiceEngine" }),
  ]);
  return { ...settings, engine: engine.engine };
}

export function VoiceView(props: ViewProps) {
  const voice = createSource(props.host, () => loadVoice(props.host));
  void voice.refresh();
  const changer = createChanger<VoiceData>(props.host, props.at, voice);
  const locked = () => !props.host.connection.canWrite || changer.busy() !== "";
  const current = () => voice.state().data;
  const save = (patch: Partial<VoiceSettings>) =>
    void changer.run("settings", { op: "voice.settings", patch }, (result) => {
      const data = current();
      return data
        ? { ...data, settings: (result as { settings: VoiceSettings }).settings }
        : undefined;
    });
  const choose = (engine: "classic" | "gpt_realtime") =>
    void changer.run("engine", { op: "voice.engine", engine }, (result) => {
      const data = current();
      return data ? { ...data, engine: (result as { engine: string }).engine } : undefined;
    });
  const Select = (field: {
    name: "voice" | "style" | "language";
    label: string;
    options: string[];
    text: (value: string) => string;
  }) => (
    <label class="nsvx-ai-field">
      <span>{field.label}</span>
      <select
        value={current()?.settings[field.name] ?? ""}
        disabled={locked()}
        onChange={(event) => save({ [field.name]: event.currentTarget.value })}
      >
        <For each={field.options}>
          {(value) => <option value={value}>{field.text(value)}</option>}
        </For>
      </select>
    </label>
  );
  return (
    <SourceView source={voice} t={props.t}>
      {(data) => {
        const spent = () => Number(data().status.spend_today_usd);
        const limit = () => data().settings.daily_usd;
        return (
          <>
            <div class="nsvx-ai-segment" role="radiogroup" aria-label={props.at("engine")}>
              <For each={["classic", "gpt_realtime"] as const}>
                {(engine) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={data().engine === engine ? "true" : "false"}
                    class={[
                      "nsvx-ai-segment__item",
                      { "nsvx-ai-segment__item--on": data().engine === engine },
                    ]}
                    disabled={locked()}
                    onClick={() => choose(engine)}
                  >
                    <AiIcon name={engine === "classic" ? "voice" : "openai"} />
                    {props.at(engine === "classic" ? "classic" : "gpt")}
                  </button>
                )}
              </For>
            </div>
            <div class="nsvx-ai-health">
              <div class="nsvx-ai-card">
                <Mark id="openai" />
                <span>{props.at("key")}</span>
                <Dot
                  tone={data().status.key_present ? "ok" : "bad"}
                  label={props.at(data().status.key_present ? "connected" : "off")}
                />
              </div>
              <div class="nsvx-ai-card">
                <span>{props.at("todaySpend")}</span>
                <strong>
                  {spent().toFixed(2)} / {limit().toFixed(2)} USD
                </strong>
                <Bar
                  value={limit() > 0 ? Math.min(1, spent() / limit()) : null}
                  label=""
                  tone={spent() >= limit() ? "bad" : "ok"}
                />
              </div>
              <For each={data().status.routing} keyed={(mic) => mic.channel + mic.label}>
                {(mic) => (
                  <div class="nsvx-ai-card">
                    <AiIcon name="voice" class="nsvx-ai-card__icon" />
                    <span>{mic().label}</span>
                    <Dot
                      tone={mic().ready ? "ok" : "warn"}
                      label={props.at(mic().ready ? "micReady" : "micUnchecked")}
                    />
                  </div>
                )}
              </For>
            </div>
            <NoticeLine notice={changer.notice()} />
            <div class="nsvx-ai-form">
              <Select
                name="voice"
                label={props.at("voiceName")}
                options={data().options.voices}
                text={(value) =>
                  value.charAt(0).toUpperCase() +
                  value.slice(1) +
                  (value === "marin" || value === "cedar" ? " ★" : "")
                }
              />
              <Select
                name="style"
                label={props.at("style")}
                options={data().options.styles}
                text={(value) => props.at(`s_${value}`)}
              />
              <Select
                name="language"
                label={props.at("language")}
                options={data().options.languages}
                text={(value) =>
                  value === "auto" ? props.at("auto") : (LANGUAGE_NAMES[value] ?? value)
                }
              />
              <div class="nsvx-ai-field">
                <span>{props.at("length")}</span>
                <div class="nsvx-ai-segment" role="radiogroup" aria-label={props.at("length")}>
                  <For each={data().options.lengths}>
                    {(value) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={data().settings.length === value ? "true" : "false"}
                        class={[
                          "nsvx-ai-segment__item",
                          { "nsvx-ai-segment__item--on": data().settings.length === value },
                        ]}
                        disabled={locked()}
                        onClick={() => save({ length: value })}
                      >
                        {props.at(`l_${value}`)}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div class="nsvx-ai-row">
                <span class="nsvx-ai-row__label">{props.at("autoplay")}</span>
                <Toggle
                  checked={data().settings.autoplay}
                  label={props.at("autoplay")}
                  disabled={locked()}
                  onChange={(autoplay) => save({ autoplay })}
                />
              </div>
              <div class="nsvx-ai-row">
                <span class="nsvx-ai-row__label">{props.at("micInput")}</span>
                <Toggle
                  checked={data().settings.mic_input}
                  label={props.at("micInput")}
                  disabled={locked()}
                  onChange={(mic_input) => save({ mic_input })}
                />
              </div>
              <label class="nsvx-ai-field nsvx-ai-field--wide">
                <span>{props.at("instructions")}</span>
                <textarea
                  rows={2}
                  maxlength={1000}
                  value={data().settings.instructions}
                  disabled={locked()}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value !== data().settings.instructions) {
                      save({ instructions: value });
                    }
                  }}
                />
              </label>
            </div>
            <details class="nsvx-ai-more">
              <summary>{props.at("more")}</summary>
              <dl class="nsvx-ai-facts">
                <dt>{props.at("model")}</dt>
                <dd>{data().settings.model}</dd>
                <dt>{props.at("maxSeconds")}</dt>
                <dd>{data().settings.max_seconds}</dd>
                <dt>{props.at("perHour")}</dt>
                <dd>{data().settings.max_per_hour}</dd>
                <dt>{props.at("dailyLimit")}</dt>
                <dd>{limit().toFixed(2)} USD</dd>
              </dl>
            </details>
          </>
        );
      }}
    </SourceView>
  );
}
