/** @jsxImportSource @solidjs/web */
import { createMemo, For, Show } from "solid-js";
import type { GptVoice, GptVoiceSettings } from "./ai-data.js";
import type { AiKey } from "./ai-i18n.js";
import {
  AiLogo,
  ChangeNote,
  codeLabel,
  createAiChange,
  Meter,
  poll,
  StateChip,
  type AiBase,
} from "./ai-ui.js";
import { BrandLogo } from "./messages-ui.js";
import { Switch } from "./people-ui.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

/** Language names stay in their own language, as NSVX shows them. */
const LANGUAGE_NAME: Record<string, string> = {
  "pt-PT": "Português (PT)",
  "pt-BR": "Português (BR)",
  en: "English",
  es: "Español",
  fr: "Français",
};
/** NSVX marks its two recommended voices. */
const RECOMMENDED = new Set(["marin", "cedar"]);
const VOICE_CHANNELS = new Set(["whatsapp", "telegram", "instagram"]);

/** GPT voice notes (NSVX Apps → Voz): voice, style, length, language, playback, and the daily spending limit. */
export function VoiceView(props: AiBase) {
  const voice = createSource(props.host, () =>
    props.host.request<GptVoice>("nsvx.view", { view: "gptVoice" }),
  );
  poll(() => voice.refresh(), 60_000);
  const change = createAiChange(props.host, props.at, () => voice.refresh());
  const busy = () => change.busy() !== undefined;
  const save = (patch: Partial<GptVoiceSettings>) =>
    void change.run<{ settings: GptVoiceSettings }>(
      "voice",
      { action: "voice", settings: patch },
      (saved) => {
        const current = voice.state().data;
        // NSVX answers with the saved settings; anything else is read again rather than shown.
        if (current && saved?.settings) {
          voice.replace({ ...current, settings: saved.settings });
        } else {
          void voice.refresh();
        }
      },
    );
  return (
    <SourceView source={voice} t={props.t}>
      {(data) => {
        const s = () => data().settings;
        const spent = createMemo(() => Number(data().status.spend_today_usd));
        const select = (
          name: "voice" | "style" | "language" | "model",
          title: AiKey,
          options: string[],
          text: (value: string) => string,
        ) => (
          <label class="nsvx-ai-field">
            <span>{props.at(title)}</span>
            <select
              class="nsvx-ai-select"
              value={s()[name]}
              disabled={busy()}
              onChange={(event) => save({ [name]: event.currentTarget.value })}
            >
              <For each={options}>{(value) => <option value={value}>{text(value)}</option>}</For>
            </select>
          </label>
        );
        const number = (
          name: "max_seconds" | "daily_usd" | "max_per_hour" | "connect_timeout_s",
          title: AiKey,
          min: number,
          max: number,
          step = 1,
        ) => (
          <label class="nsvx-ai-field">
            <span>{props.at(title)}</span>
            <input
              type="number"
              inputmode="decimal"
              min={min}
              max={max}
              step={step}
              value={s()[name]}
              disabled={busy()}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value) && value >= min && value <= max && value !== s()[name]) {
                  save({ [name]: value });
                }
              }}
            />
          </label>
        );
        return (
          <>
            <ChangeNote change={change} />
            <section class="nsvx-ai-hero">
              <AiLogo provider="openai" size="l" />
              <span class="nsvx-ai-hero__text">
                <strong>GPT Realtime</strong>
                <span>{props.at(data().status.key_present ? "openaiOn" : "openaiOff")}</span>
              </span>
              <StateChip
                tone={data().status.key_present ? "ok" : "warn"}
                label={props.at(data().status.key_present ? "on" : "off")}
              />
            </section>
            <div class="nsvx-ai-cards">
              <div class="nsvx-ai-card">
                <Meter
                  at={props.at}
                  label={props.at("spentToday")}
                  value={s().daily_usd > 0 ? Math.min(1, spent() / s().daily_usd) : null}
                />
                <span class="nsvx-ai-card__value">
                  {spent().toFixed(2)} / {Number(s().daily_usd).toFixed(2)} USD
                </span>
              </div>
              <For each={data().status.routing}>
                {(mic) => (
                  <div class="nsvx-ai-card nsvx-ai-card--row">
                    <Show when={VOICE_CHANNELS.has(mic.channel)} fallback={<Icon name="mic" />}>
                      <BrandLogo channel={mic.channel} size={20} />
                    </Show>
                    <span class="nsvx-ai-card__label">{mic.label}</span>
                    <StateChip
                      tone={mic.ready ? "ok" : "warn"}
                      label={props.at(mic.ready ? "micReady" : "micUnchecked")}
                    />
                  </div>
                )}
              </For>
            </div>
            <div class="nsvx-ai-form">
              {select(
                "voice",
                "voiceName",
                data().options.voices,
                (v) => `${v.charAt(0).toUpperCase()}${v.slice(1)}${RECOMMENDED.has(v) ? " ★" : ""}`,
              )}
              {select("style", "style", data().options.styles, (v) =>
                codeLabel(props.at, "st_", v, "st_natural"),
              )}
              {select("language", "language", data().options.languages, (v) =>
                v === "auto" ? props.at("lang_auto") : (LANGUAGE_NAME[v] ?? v),
              )}
              <div class="nsvx-ai-field">
                <span>{props.at("length")}</span>
                <div class="nsvx-segment" role="radiogroup" aria-label={props.at("length")}>
                  <For each={data().options.lengths}>
                    {(value) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={s().length === value ? "true" : "false"}
                        aria-pressed={s().length === value ? "true" : "false"}
                        disabled={busy()}
                        onClick={() => save({ length: value })}
                      >
                        {codeLabel(props.at, "len_", value, "len_normal")}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </div>
            <Switch
              icon="resume"
              label={props.at("listen")}
              on={s().autoplay}
              disabled={busy()}
              onChange={(on) => save({ autoplay: on })}
            />
            <Switch
              icon="mic"
              label={props.at("useMic")}
              on={s().mic_input}
              disabled={busy()}
              onChange={(on) => save({ mic_input: on })}
            />
            <details class="nsvx-ai-settings">
              <summary>
                <Icon name="edit" />
                {props.at("advanced")}
              </summary>
              <div class="nsvx-ai-settings__body">
                {select("model", "model", data().options.models, (v) => v)}
                {number("max_seconds", "maxSeconds", 5, 180)}
                {number("daily_usd", "dailyLimit", 0, 50, 0.5)}
                {number("max_per_hour", "perHour", 1, 120)}
                {number("connect_timeout_s", "connectWait", 3, 30)}
                <label class="nsvx-ai-field nsvx-ai-field--wide">
                  <span>{props.at("instructions")}</span>
                  <textarea
                    rows={2}
                    maxlength={1000}
                    value={s().instructions}
                    disabled={busy()}
                    onChange={(event) => {
                      if (event.currentTarget.value !== s().instructions) {
                        save({ instructions: event.currentTarget.value });
                      }
                    }}
                  />
                </label>
              </div>
            </details>
          </>
        );
      }}
    </SourceView>
  );
}
