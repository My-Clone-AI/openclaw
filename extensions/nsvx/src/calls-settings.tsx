/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  RETENTION_DAYS,
  type CallPolicyChoice,
  type CallsStatus,
  type SocialCallsStatus,
} from "./calls-data.js";
import type { CallsKey } from "./calls-i18n.js";
import type { CallsCtx } from "./calls-ui.js";
import { createAction, Note, Segs, view } from "./device-kit.js";
import { BrandLogo } from "./messages-ui.js";
import { Choice, Field, Panel, Pill, Reveal, Toggle } from "./office-kit.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

function Budget(props: { ctx: CallsCtx; status: CallsStatus; onSaved: () => Promise<void> }) {
  const ctx = () => props.ctx;
  const [day, setDay] = createSignal(String(props.status.budget.daily_usd));
  const [month, setMonth] = createSignal(String(props.status.budget.monthly_usd));
  const [minutes, setMinutes] = createSignal(
    String(Math.round(props.status.budget.max_call_seconds / 60)),
  );
  const action = createAction(ctx);
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await ctx().host.request("nsvx.calls.change", {
            action: "settings",
            dailyUsd: Number(day().replace(",", ".")),
            monthlyUsd: Number(month().replace(",", ".")),
            maxCallSeconds: Math.round(Number(minutes()) * 60),
          });
          await props.onSaved();
        }, ctx().ct("saved"));
      }}
    >
      <Field label={ctx().ct("perDay")} mode="decimal" value={day()} onInput={setDay} />
      <Field label={ctx().ct("perMonth")} mode="decimal" value={month()} onInput={setMonth} />
      <Field label={ctx().ct("maxMinutes")} mode="numeric" value={minutes()} onInput={setMinutes} />
      <div class="nsvx-of__wide">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !ctx().host.connection.canWrite}
        >
          {ctx().ct("save")}
        </button>
      </div>
      <Note note={action.note()} />
    </form>
  );
}

function Pin(props: { ctx: CallsCtx; set: boolean; onSaved: () => Promise<void> }) {
  const ctx = () => props.ctx;
  const [pin, setPin] = createSignal("");
  const action = createAction(ctx);
  return (
    <Reveal label={ctx().ct(props.set ? "pinChange" : "pinNew")} icon="lock">
      {(close) => (
        <form
          class="nsvx-of__form"
          onSubmit={(event) => {
            event.preventDefault();
            void action
              .run(async () => {
                await ctx().host.request("nsvx.calls.pin", { pin: pin() });
                setPin("");
                await props.onSaved();
              }, ctx().ct("pinSet"))
              .then((ok) => ok && close());
          }}
        >
          <label class="nsvx-of__field">
            <span>{ctx().ct("pin")}</span>
            <input
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength={10}
              value={pin()}
              onInput={(event) => setPin(event.currentTarget.value.replace(/\D/g, "").slice(0, 10))}
            />
          </label>
          <p class="nsvx-of__muted nsvx-of__wide">{ctx().ct("pinHint")}</p>
          <button
            type="submit"
            class="nsvx__button nsvx__button--primary"
            disabled={action.busy() || !/^\d{6,10}$/.test(pin())}
          >
            {ctx().ct("save")}
          </button>
          <Note note={action.note()} />
        </form>
      )}
    </Reveal>
  );
}

function PhoneSettings(props: { ctx: CallsCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () => view<CallsStatus>(ctx().host, "callsStatus"));
  void source.refresh();
  const action = createAction(ctx);
  const save = (body: Record<string, unknown>) =>
    void action.run(async () => {
      await ctx().host.request("nsvx.calls.change", { action: "settings", ...body });
      await source.refresh();
    }, ctx().ct("saved"));
  return (
    <SourceView source={source} t={ctx().t}>
      {(status) => (
        <>
          <Panel title={ctx().ct("phone")} icon="phone">
            <div class="nsvx-calls__toggles">
              <Toggle
                label={ctx().ct("appVoice")}
                checked={status().voice_enabled}
                disabled={action.busy() || !ctx().host.connection.canWrite}
                onChange={(value) => save({ voiceEnabled: value })}
              />
              <Toggle
                label={ctx().ct("phoneLine")}
                checked={status().enabled}
                disabled={action.busy() || !ctx().host.connection.canWrite}
                onChange={(value) => save({ enabled: value })}
              />
              <Toggle
                label={ctx().ct("flights")}
                checked={Boolean(status().public_flight_schedule)}
                disabled={action.busy() || !ctx().host.connection.canWrite}
                onChange={(value) => save({ publicFlightSchedule: value })}
              />
            </div>
            <Note note={action.note()} />
            <Show when={(status().phone_routes ?? []).length > 0}>
              <ul class="nsvx-of__list" aria-label={ctx().ct("routes")}>
                <For each={status().phone_routes ?? []} keyed={(route) => route.carrier}>
                  {(route) => (
                    <li class="nsvx-calls__route" data-route={route().carrier}>
                      <Icon name="sim" />
                      <span class="nsvx-of__main">
                        <strong>{route().carrier.toUpperCase()}</strong>
                        <span class="nsvx-of__sub">
                          {route().provider} ·{" "}
                          {ctx().ct(route().direction === "both" ? "both" : "inbound")}
                        </span>
                      </span>
                      <Pill tone={route().configured && route().provider_ready ? "ok" : "warn"}>
                        {ctx().ct(
                          route().configured && route().provider_ready ? "ready" : "notReady",
                        )}
                      </Pill>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Pin ctx={ctx()} set={status().owner_pin_set} onSaved={source.refresh} />
          </Panel>
          <Panel title={ctx().ct("budget")} icon="euro">
            <Budget ctx={ctx()} status={status()} onSaved={source.refresh} />
          </Panel>
        </>
      )}
    </SourceView>
  );
}

const POLICY_ROWS = [
  ["aiProcessing", "ai_processing", "ai", "bot"],
  ["transcription", "transcription", "transcription", "doc"],
  ["recording", "recording", "record", "mic"],
] as const;

function AppCalls(props: { ctx: CallsCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () => view<SocialCallsStatus>(ctx().host, "callsSocial"));
  void source.refresh();
  const action = createAction(ctx);
  const save = (body: Record<string, unknown>) =>
    void action.run(async () => {
      await ctx().host.request("nsvx.calls.change", { action: "social", ...body });
      await source.refresh();
    }, ctx().ct("saved"));
  const off = () => action.busy() || !ctx().host.connection.canWrite;
  return (
    <SourceView source={source} t={ctx().t}>
      {(social) => (
        <Panel title={ctx().ct("appCalls")} icon="messages">
          <div class="nsvx-calls__toggles">
            <Toggle
              label={ctx().ct("on")}
              checked={social().enabled}
              disabled={off()}
              onChange={(value) => save({ enabled: value })}
            />
            <Toggle
              label={ctx().ct("autoAnswer")}
              checked={social().policy.auto_answer}
              disabled={off()}
              onChange={(value) => save({ autoAnswer: value })}
            />
          </div>
          <Show when={social().kill_switch && social().kill_switch !== "social_calls_disabled"}>
            <p class="nsvx-of__warn" role="note">
              <Pill tone="warn">{ctx().ct("stopped")}</Pill> {social().kill_switch}
            </p>
          </Show>
          <ul class="nsvx-of__list">
            <For
              each={social().accounts}
              keyed={(account) => `${account.channel}:${account.account_id ?? "-"}`}
            >
              {(account) => {
                const word = (): CallsKey =>
                  account().available ? "ready" : account().eligible ? "untested" : "notReady";
                return (
                  <li class="nsvx-calls__account" data-channel={account().channel}>
                    <BrandLogo channel={account().channel} size={30} />
                    <span class="nsvx-of__main">
                      <strong>{account().account_label ?? account().channel}</strong>
                      <Show
                        when={!account().available && (account().reason_pt || account().reason)}
                      >
                        <span class="nsvx-of__sub">
                          {ctx().locale.startsWith("pt")
                            ? (account().reason_pt ?? account().reason)
                            : (account().reason ?? account().reason_pt)}
                        </span>
                      </Show>
                    </span>
                    <Pill tone={account().available ? "ok" : account().eligible ? "warn" : "off"}>
                      {ctx().ct(word())}
                    </Pill>
                  </li>
                );
              }}
            </For>
          </ul>
          <div class="nsvx-calls__policy">
            <For each={POLICY_ROWS} keyed={false}>
              {(row) => (
                <div class="nsvx-calls__policy-row">
                  <span>
                    <Icon name={row()[3]} /> {ctx().ct(row()[2])}
                  </span>
                  <Segs
                    name={ctx().ct(row()[2])}
                    items={["ask", "off"] as const}
                    value={social().policy[row()[1]]}
                    label={(key: CallPolicyChoice) => ctx().ct(key)}
                    onChange={(key) => save({ [row()[0]]: key })}
                  />
                </div>
              )}
            </For>
            <Choice
              label={ctx().ct("keepFor")}
              value={String(social().policy.retention_days)}
              disabled={off()}
              options={[...new Set([...RETENTION_DAYS, social().policy.retention_days])]
                .toSorted((a, b) => a - b)
                .map((days) => [String(days), `${days} ${ctx().ct("days")}`] as const)}
              onChange={(value) => save({ retentionDays: Number(value) })}
            />
            <p class="nsvx-of__muted">{ctx().ct("askHint")}</p>
          </div>
          <Note note={action.note()} />
        </Panel>
      )}
    </SourceView>
  );
}

/** Voice switches, lines, PIN, budget, and the WhatsApp, Telegram, and Instagram call policy. */
export function CallsSettings(props: { ctx: CallsCtx }) {
  return (
    <div class="nsvx-calls__settings">
      <PhoneSettings ctx={props.ctx} />
      <AppCalls ctx={props.ctx} />
    </div>
  );
}
