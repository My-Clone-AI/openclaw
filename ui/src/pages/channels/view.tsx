import type { JSX } from "@solidjs/web";
import { createMemo, Errored, For, Loading, Show } from "solid-js";
import type { ChannelAccountSnapshot, ChannelsStatusSnapshot } from "../../api/types.ts";
import "../../styles/channels.css";
import { ChannelIcon } from "../../components/solid/channel-icon.tsx";
import { Icon } from "../../components/solid/icon.tsx";
import {
  SettingsEmpty,
  SettingsPage,
  SettingsSection,
} from "../../components/solid/settings-ui.tsx";
import "../../components/openclaw-mascot.tsx";
import { WizardBusyButton, WizardStepControls } from "../../components/wizard-step-controls.tsx";
import { registerSettingsEnglish } from "../../i18n/locales/en-settings.ts";
import {
  channelSnapshotEntryIsActive,
  resolveChannelAccounts,
  type ChannelRead,
  type ChannelsState,
} from "../../lib/channels/index.ts";
import { formatUiError, formatUiExternalText } from "../../lib/format-error.ts";
import { formatRelativeTimestamp } from "../../lib/format.ts";
import "../../components/modal-dialog.tsx";
import { registerEnglishCatalog, t } from "../../lib/reactive/i18n.ts";
import { channelDocsUrl } from "./hub-meta.ts";
import { renderChannelDetail as ChannelDetail } from "./view.detail.tsx";
import { renderChannelPairingPrompt, renderChannelPairingQueue } from "./view.pairing.tsx";
import {
  ChannelHealthStatus,
  channelLastActivity,
  ChannelRefresh,
  resolveChannelHealth,
} from "./view.shared.tsx";
import type { ChannelsProps } from "./view.types.ts";
import type { ChannelWizardState } from "./wizard-runner.ts";
registerEnglishCatalog(registerSettingsEnglish);

const RECOMMENDED_CHANNEL_ORDER: string[] = [
  "gmail",
  "whatsapp",
  "telegram",
  "instagram",
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
  "nostr",
];

const CHANNEL_LABELS: Record<string, string> = {
  gmail: "Gmail",
  imap: "Email",
  email: "Email",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  discord: "Discord",
  googlechat: "Google Chat",
  slack: "Slack",
  signal: "Signal",
  imessage: "iMessage",
  nostr: "Nostr",
};

export function humanChannelLabel(channelId: string, provided?: string): string {
  const known = CHANNEL_LABELS[channelId];
  if (!provided || provided === channelId) {
    return known ?? provided ?? channelId;
  }
  return provided;
}

export function humanAccountLabel(account: { accountId: string; name?: string }): string {
  const name = account.name?.trim();
  if (name && name !== account.accountId) {
    return name;
  }
  if (account.accountId === "default" || account.accountId === "main") {
    return "Main account";
  }
  if (account.accountId.includes("@") || account.accountId.startsWith("+")) {
    return account.accountId;
  }
  return account.accountId
    .replace(/[-_]+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

export function newYorkClock(timestampMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestampMs);
}

function ChannelStatusNotices(props: { channels: ChannelsState; error: string | null }) {
  const showingStaleSnapshot = () =>
    Boolean(
      props.channels.channelsLoading &&
      props.channels.channelsSnapshot &&
      props.channels.channelsLastSuccess,
    );
  const partialWarnings = createMemo(
    () =>
      props.channels.channelsSnapshot?.warnings
        ?.filter((warning) => warning.trim())
        .slice(0, 3)
        .map((warning) => formatUiExternalText(warning))
        .join("; ") ?? "",
  );
  return (
    <>
      {showingStaleSnapshot() ? (
        <span class="settings-control__sr-label" role="status">
          {t("channels.refreshingStaleSnapshot")}
        </span>
      ) : undefined}
      {props.channels.channelsSnapshot?.partial ? (
        <div class="callout warn">
          {t("channels.hub.partialSnapshot")} {partialWarnings()}
        </div>
      ) : undefined}
      {props.error ? (
        <div class="callout danger" role="alert">
          {props.error}
        </div>
      ) : undefined}
    </>
  );
}

function ChannelStatusSettled(props: { channels: ChannelsState; receipt: ChannelRead }) {
  const ready = createMemo(async () => {
    const error = await props.receipt.completion;
    if (error !== null) {
      throw new Error(error);
    }
    return true;
  });
  return (
    <Show when={ready()}>
      <ChannelStatusNotices channels={props.channels} error={null} />
    </Show>
  );
}

function ChannelStatusFeedback(props: { channels: ChannelsState }) {
  const retained = () => (
    <ChannelStatusNotices channels={props.channels} error={props.channels.channelsError} />
  );
  return (
    <Show when={props.channels.channelsRead} keyed fallback={retained()}>
      {(receipt) => (
        <Errored
          fallback={(error) => (
            <ChannelStatusNotices channels={props.channels} error={formatUiError(error())} />
          )}
        >
          <Loading fallback={retained()}>
            <ChannelStatusSettled channels={props.channels} receipt={receipt} />
          </Loading>
        </Errored>
      )}
    </Show>
  );
}

export function ChannelsView(props: ChannelsProps) {
  const snapshot = createMemo(() => props.channels.channelsSnapshot);
  const channelOrder = createMemo(() => resolveChannelOrder(snapshot()));
  // Key both lists so status updates cannot retarget an in-flight channel click.
  const connected = createMemo(() =>
    channelOrder().filter((key) => channelSnapshotEntryIsActive(snapshot(), key)),
  );
  const available = createMemo(() =>
    channelOrder().filter((key) => !channelSnapshotEntryIsActive(snapshot(), key)),
  );

  return (
    <>
      <SettingsPage>
        <ChannelStatusFeedback channels={props.channels} />
        {/* An open channel shows this above its own footer instead. */}
        {props.wizardHost.blockedByDirtyConfig() &&
        !props.selectedChannel &&
        (props.config.configFormDirty || Object.keys(props.configEdits).length > 0) ? (
          <div class="callout warn">{t("channels.hub.saveBeforeSetup")}</div>
        ) : undefined}
        <SettingsSection
          title={t("channels.hub.connectedTitle")}
          actions={
            <ChannelRefresh
              updatedAt={props.channels.channelsLastSuccess}
              busy={props.channels.channelsLoading}
              disabled={!props.channels.connected}
              onRefresh={() => props.onRefresh(true)}
            />
          }
        >
          {connected().length === 0 && snapshot() ? (
            <div class="channels-empty">
              {/* No configured transports is a true empty state, so Clawd rests here. */}
              <openclaw-mascot mood="sleepy" prop:size={80} />
              <SettingsEmpty message={t("channels.hub.noneConnected")} />
            </div>
          ) : (
            <div class="channel-grid">
              <For each={connected()}>{(key) => <ChannelCard channelId={key} props={props} />}</For>
            </div>
          )}
        </SettingsSection>
        <SettingsSection
          title={t("channels.hub.addTitle")}
          description={t("channels.hub.addSubtitle")}
        >
          {!props.canAdmin && props.channels.connected ? (
            <div class="callout info" role="note">
              {t("channels.hub.adminRequired")}
            </div>
          ) : (
            <>
              <div class="channel-grid">
                <For each={available()}>
                  {(key) => <ChannelCard channelId={key} props={props} />}
                </For>
              </div>
              {renderBrowseAllRow(props)}
            </>
          )}
        </SettingsSection>
        {renderChannelPairingQueue(props)}
      </SettingsPage>
      <Show when={props.selectedChannel} keyed>
        {(channel) => (
          <ChannelDetail
            channelId={channel}
            label={resolveChannelLabel(props, channel)}
            pluginIconUrl={props.presentation.pluginIconUrls[channel]}
            props={props}
            onClose={() => props.onCloseDetail()}
            onSetup={() => props.onStartSetup(channel)}
          />
        )}
      </Show>
      {props.canAdmin ? <ChannelWizard {...props} /> : undefined}
      {renderChannelPairingPrompt(props)}
    </>
  );
}

export function resolveChannelOrder(snapshot: ChannelsStatusSnapshot | null): string[] {
  const statusOrder = snapshot?.channelMeta?.length
    ? snapshot.channelMeta.map((entry) => entry.id)
    : (snapshot?.channelOrder ?? []);
  return [...new Set([...statusOrder, ...RECOMMENDED_CHANNEL_ORDER])];
}

function resolveChannelPlugin(props: ChannelsProps, key: string) {
  return props.presentation.pluginCatalog?.plugins.find((plugin) => plugin.id === key);
}

export function resolveChannelLabel(props: ChannelsProps, key: string): string {
  const snapshot = props.channels.channelsSnapshot;
  const labels = snapshot?.channelLabels;
  return humanChannelLabel(
    key,
    resolveChannelPlugin(props, key)?.name ??
      snapshot?.channelMeta?.find((entry) => entry.id === key)?.label ??
      (labels && Object.hasOwn(labels, key) ? labels[key] : undefined),
  );
}

function resolveChannelDetailLabel(props: ChannelsProps, key: string): string | null {
  const snapshot = props.channels.channelsSnapshot;
  const labels = snapshot?.channelDetailLabels;
  const detail =
    snapshot?.channelMeta?.find((entry) => entry.id === key)?.detailLabel ??
    (labels && Object.hasOwn(labels, key) ? labels[key] : null);
  return detail && detail !== resolveChannelLabel(props, key) ? detail : null;
}

function ChannelMark(props: { channelId: string; label: string; pluginIconUrl?: string }) {
  const iconUrl = createMemo(() => props.pluginIconUrl);
  const brand = createMemo(() => channelBrand(props.channelId));
  const channelId = createMemo(() => props.channelId);
  const label = createMemo(() => props.label);
  return (
    <Show
      when={iconUrl()}
      fallback={
        <Show
          when={brand()}
          fallback={<ChannelIcon channelId={channelId()} label={label()} variant="tile" />}
        >
          {(mark) => (
            <span
              class={["channels-tile", "channels-tile--brand", `channels-tile--${channelId()}`]}
              aria-hidden="true"
            >
              {mark()}
            </span>
          )}
        </Show>
      }
    >
      {(url) => (
        <ChannelIcon channelId={channelId()} label={label()} variant="tile" pluginIconUrl={url()} />
      )}
    </Show>
  );
}

function channelBrand(channelId: string) {
  if (channelId === "gmail") {
    return (
      <svg viewBox="0 0 24 24" class="channel-brand">
        <rect
          x="3.5"
          y="5.5"
          width="17"
          height="13"
          rx="1.5"
          fill="none"
          stroke="#fff"
          stroke-width="1.8"
        />
        <path fill="none" stroke="#fff" stroke-width="1.8" d="M4 7.5 12 13l8-5.5" />
      </svg>
    );
  }
  if (channelId === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24" class="channel-brand">
        <path
          fill="#fff"
          d="M12 4a8 8 0 0 0-6.9 12L4 20l4.1-1.1A8 8 0 1 0 12 4Zm4.2 10.3c-.2.5-1 .9-1.4 1-.4.1-.8.1-1.3-.1-.3-.1-1.2-.5-2.3-1.4-1.1-.9-1.8-2-2-2.3-.2-.3-.4-.8-.1-1.2.2-.3.4-.5.6-.7l.4-.4c.1-.1.1-.3 0-.4l-.7-1.6c-.2-.4-.4-.3-.6-.3h-.5c-.2 0-.5.1-.7.4-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.9 4.4 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3l-1.1-.5c-.2-.1-.4 0-.5.1l-.4.5Z"
        />
      </svg>
    );
  }
  if (channelId === "telegram") {
    return (
      <svg viewBox="0 0 24 24" class="channel-brand">
        <path
          fill="#fff"
          d="M19.5 5.2 4.7 10.8c-1 .4-1 1 .1 1.3l3.8 1.2 1.5 4.6c.2.5.1.7.6.7.3 0 .5-.1.7-.4l2.1-2 3.8 2.8c.7.4 1.2.2 1.4-.6l2.5-11.8c.2-1-.4-1.5-1.2-1.2Z"
        />
      </svg>
    );
  }
  if (channelId === "instagram") {
    return (
      <svg viewBox="0 0 24 24" class="channel-brand">
        <rect
          x="5"
          y="5"
          width="14"
          height="14"
          rx="4"
          fill="none"
          stroke="#fff"
          stroke-width="1.8"
        />
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8" />
        <circle cx="16.2" cy="7.8" r="1" fill="#fff" />
      </svg>
    );
  }
  return undefined;
}

function accountHealth(account: ChannelAccountSnapshot) {
  if (account.lastError) {
    return "attention" as const;
  }
  if (account.running || account.connected) {
    return "running" as const;
  }
  if (account.configured || account.linked) {
    return "configured" as const;
  }
  return "notConfigured" as const;
}

function ChannelCard(params: { channelId: string; props: ChannelsProps }) {
  const plugin = createMemo(() => resolveChannelPlugin(params.props, params.channelId));
  const label = createMemo(() => resolveChannelLabel(params.props, params.channelId));
  const active = createMemo(() =>
    channelSnapshotEntryIsActive(params.props.channels.channelsSnapshot, params.channelId),
  );
  const accounts = createMemo(() =>
    resolveChannelAccounts(
      params.props.channels.channelsSnapshot?.channelAccounts,
      params.channelId,
    ),
  );
  const statusIssue = createMemo(() =>
    params.props.channels.channelsSnapshot?.statusIssues?.find(
      (issue) => issue.channel === params.channelId,
    ),
  );
  const description = createMemo(() => {
    const issue = statusIssue() ? formatUiExternalText(statusIssue()?.message) : null;
    if (params.props.configEdits[params.channelId]) {
      return issue
        ? t("channels.config.unsavedWithDetail", { detail: issue })
        : t("channels.config.unsaved");
    }
    if (active()) {
      return (
        issue ??
        channelLastActivity(params.channelId, params.props) ??
        resolveChannelDetailLabel(params.props, params.channelId) ??
        t("channels.hub.openDetails")
      );
    }
    return (
      issue ??
      plugin()?.description ??
      resolveChannelDetailLabel(params.props, params.channelId) ??
      t("channels.hub.guidedSetup")
    );
  });
  return (
    <article class="channel-card channels-item">
      <div class="channel-card__head">
        <button
          type="button"
          class="channels-item__detail"
          title={t("channels.hub.openDetails")}
          onClick={() => params.props.onShowDetail(params.channelId)}
        >
          <ChannelMark
            channelId={params.channelId}
            label={label()}
            pluginIconUrl={params.props.presentation.pluginIconUrls[params.channelId]}
          />
          <span class="settings-row__text">
            <span class="settings-row__title">{label()}</span>
            <span class="settings-row__desc">{description()}</span>
          </span>
        </button>
        <ChannelHealthStatus health={resolveChannelHealth(params.channelId, params.props)} />
        {params.props.canAdmin ? (
          <button
            type="button"
            class="btn btn--sm"
            disabled={!params.props.channels.connected}
            onClick={() => params.props.onStartSetup(params.channelId)}
          >
            {t("channels.hub.addAccount")}
          </button>
        ) : undefined}
      </div>
      <ul class="channel-accounts">
        <Show
          when={accounts().length > 0}
          fallback={
            <li class="channel-account channel-account--empty">{t("channels.hub.noAccounts")}</li>
          }
        >
          <For each={accounts()} keyed={(account) => account.accountId}>
            {(account) => {
              const name = () => humanAccountLabel(account());
              const when = () => account().lastInboundAt ?? account().lastConnectedAt ?? null;
              const relative = () =>
                typeof when() === "number" && when()! > 0 ? formatRelativeTimestamp(when()) : "";
              const clock = () =>
                typeof when() === "number" && when()! > 0 ? newYorkClock(when()!) : "";
              return (
                <li class="channel-account">
                  <openclaw-tooltip prop:content={clock() ? `${name()} · ${clock()} ET` : name()}>
                    <span class="channel-account__name">{name()}</span>
                  </openclaw-tooltip>
                  <span class="channel-account__meta">
                    {relative() ? (
                      <span class="channel-account__time">{relative()}</span>
                    ) : undefined}
                    <ChannelHealthStatus health={accountHealth(account())} />
                  </span>
                </li>
              );
            }}
          </For>
        </Show>
      </ul>
    </article>
  );
}

function renderBrowseAllRow(props: ChannelsProps) {
  return (
    <button
      type="button"
      class="settings-row settings-row--nav channels-item"
      disabled={!props.channels.connected}
      onClick={() => props.onStartSetup(null)}
    >
      <span
        class="channels-tile channels-tile--fallback"
        style={{ "--channels-art-a": "#64748b", "--channels-art-b": "#1e293b" }}
        aria-hidden="true"
      >
        <span>+</span>
      </span>
      <div class="settings-row__text">
        <span class="settings-row__title">{t("channels.hub.browseAllTitle")}</span>
        <span class="settings-row__desc">{t("channels.hub.browseAllSubtitle")}</span>
      </div>
      <div class="settings-row__control">
        <span class="settings-row__chevron">
          <Icon name="chevronRight" />
        </span>
      </div>
    </button>
  );
}

function renderCloseButton(props: ChannelsProps, labelKey: string, primary = false) {
  return (
    <button type="button" class={["btn", { primary }]} onClick={() => props.wizardHost.close()}>
      {t(labelKey)}
    </button>
  );
}

function WizardStepBody(props: {
  wizard: Extract<ChannelWizardState, { phase: "step" }>;
  controls: ChannelsProps;
}) {
  const informational = () => ["note", "progress", "action"].includes(props.wizard.step.type);
  const message = () => props.wizard.step.message?.trim() ?? "";
  const gatewayOwned = () => props.wizard.step.executor === "gateway";
  const outputClass = () => [
    gatewayOwned() ? "channels-wizard__message" : "channels-wizard__output",
    !gatewayOwned() &&
      (message().includes("{") || message().includes("  ")) &&
      "channels-wizard__output--code",
  ];
  return (
    <Show
      when={informational()}
      fallback={
        <WizardStepControls
          step={props.wizard.step}
          value={
            props.wizard.step.type === "multiselect"
              ? props.controls.wizardHost.draft.multiselect
              : props.wizard.step.type === "text"
                ? props.controls.wizardHost.draft.textValue
                : props.wizard.step.initialValue
          }
          busy={props.controls.mutationBusy?.wizard || props.wizard.busy}
          inputId="channel-wizard-text-input"
          validationErrorId={
            props.wizard.validationError ? "channel-wizard-validation-error" : undefined
          }
          presentation="channels"
          channelSelect={props.wizard.channel === null}
          answerLabel={t("channels.setup.continue")}
          busyLabel={t("channels.setup.working")}
          sensitiveRevealed={props.controls.wizardHost.draft.secretVisible}
          onValueChange={
            props.wizard.step.type === "text"
              ? (value) =>
                  props.controls.wizardHost.setTextValue(typeof value === "string" ? value : "")
              : (value) => props.controls.wizardHost.toggleMultiselect(value)
          }
          onAnswer={(value) => props.controls.wizardHost.answer(value)}
          onToggleSensitiveVisibility={() => props.controls.wizardHost.toggleSecretVisibility()}
        />
      }
    >
      {props.wizard.step.title ? (
        <div class="channels-wizard__message">{props.wizard.step.title}</div>
      ) : undefined}
      {message() ? <div class={outputClass()}>{message()}</div> : undefined}
      <openclaw-modal-actions class="channels-wizard__footer">
        {gatewayOwned() ? renderCloseButton(props.controls, "common.cancel") : undefined}
        {gatewayOwned() || props.controls.mutationBusy?.wizard || props.wizard.busy ? (
          <WizardBusyButton
            statusLabel={(gatewayOwned() && message()) || t("channels.setup.working")}
          />
        ) : (
          <button
            type="button"
            class="btn primary"
            onClick={() => props.controls.wizardHost.answer(null)}
          >
            {t("channels.setup.continue")}
          </button>
        )}
      </openclaw-modal-actions>
    </Show>
  );
}

function renderWhatsAppLinking(props: ChannelsProps) {
  const connected = () => props.channels.whatsappLoginConnected === true;
  const busy = () => props.mutationBusy?.whatsapp || props.channels.whatsappBusy;
  return (
    <>
      <div class="channels-wizard__message" role="status">
        {connected() ? t("channels.setup.whatsappLinked") : t("channels.setup.whatsappScanTitle")}
      </div>
      {props.channels.whatsappLoginMessage ? (
        <div class="channels-wizard__note" role="status">
          {props.channels.whatsappLoginMessage}
        </div>
      ) : undefined}
      {connected() ? undefined : (
        <>
          <div class="channels-wizard__qr">
            {props.channels.whatsappLoginQrDataUrl ? (
              <img
                src={props.channels.whatsappLoginQrDataUrl}
                alt={t("channels.setup.whatsappQrAlt")}
              />
            ) : busy() ? undefined : (
              <div class="channels-wizard__spinner">{t("channels.setup.whatsappQrHint")}</div>
            )}
          </div>
          <div class="channels-wizard__note">{t("channels.setup.whatsappScanHelp")}</div>
        </>
      )}
      <openclaw-modal-actions class="channels-wizard__footer">
        {connected() ? (
          renderCloseButton(props, "channels.setup.finish", true)
        ) : (
          <>
            {renderCloseButton(props, "channels.setup.linkLater")}
            {busy() ? (
              <WizardBusyButton statusLabel={t("channels.setup.whatsappQrLoading")} />
            ) : (
              <>
                <button type="button" class="btn" onClick={() => void props.onWhatsAppStart(true)}>
                  {props.channels.whatsappLoginQrDataUrl
                    ? t("channels.setup.regenerateQr")
                    : t("common.showQr")}
                </button>
                {props.channels.whatsappLoginQrDataUrl ? (
                  <button
                    type="button"
                    class="btn primary"
                    onClick={() => void props.onWhatsAppWait()}
                  >
                    {t("common.waitForScan")}
                  </button>
                ) : undefined}
              </>
            )}
          </>
        )}
      </openclaw-modal-actions>
    </>
  );
}

function renderDoneBody(channels: readonly string[], props: ChannelsProps) {
  if (channels.includes("whatsapp")) {
    return renderWhatsAppLinking(props);
  }
  const changed = channels.length > 0;
  return (
    <>
      <div class="channels-wizard__message" role="status">
        {t(changed ? "channels.setup.doneTitle" : "channels.setup.doneNoChangesTitle")}
      </div>
      <div class="channels-wizard__note">
        {t(changed ? "channels.setup.doneBody" : "channels.setup.doneNoChangesBody")}
      </div>
      <openclaw-modal-actions class="channels-wizard__footer">
        {renderCloseButton(props, changed ? "channels.setup.finish" : "common.close", true)}
      </openclaw-modal-actions>
    </>
  );
}

function ChannelWizard(props: ChannelsProps): JSX.Element {
  return (
    <Show when={props.wizardHost.state().phase !== "idle"}>
      <WizardDialog controls={props} />
    </Show>
  );
}

function WizardDialog(props: { controls: ChannelsProps }) {
  const wizard = () => props.controls.wizardHost.state();
  const channel = () => {
    const current = wizard();
    return current.phase === "idle" ? null : current.channel;
  };
  const label = createMemo(() => {
    const current = channel();
    return current
      ? resolveChannelLabel(props.controls, current)
      : t("channels.setup.genericTitle");
  });
  const step = () => {
    const current = wizard();
    return current.phase === "step" ? current : undefined;
  };
  // Keep same-ID controls through action settlement and fresh validation replies.
  const steps = createMemo(() => {
    const current = step();
    return current ? [current] : [];
  });
  const error = () => {
    const current = wizard();
    return current.phase === "error" ? current : undefined;
  };
  const done = () => {
    const current = wizard();
    return current.phase === "done" ? current : undefined;
  };
  return (
    <openclaw-modal-dialog
      label={t("channels.setup.dialogLabel", { channel: label() })}
      onModal-cancel={() => props.controls.wizardHost.close()}
    >
      <div class="oc-dialog channels-wizard">
        <div class="oc-dialog__header">
          <h2 class="oc-dialog__title">
            <Show when={channel()}>
              {(channelId) => (
                <ChannelIcon
                  channelId={channelId()}
                  label={label()}
                  variant="picker"
                  pluginIconUrl={props.controls.presentation.pluginIconUrls[channelId()]}
                />
              )}
            </Show>
            {t("channels.setup.title", { channel: label() })}
          </h2>
          <button
            type="button"
            class="oc-dialog__close"
            aria-label={t("common.close")}
            onClick={() => props.controls.wizardHost.close()}
          >
            <Icon name="x" />
          </button>
          <div class="oc-dialog__description">
            <p class="channels-wizard__subtitle">
              <span>{t("channels.setup.subtitle")}</span>{" "}
              {channel() ? (
                <a
                  class="channels-wizard__link"
                  href={channelDocsUrl(channel()!)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t("channels.setup.viewDocs")}
                </a>
              ) : undefined}
            </p>
          </div>
        </div>
        <div class="oc-dialog__body channels-wizard__body">
          <Show when={step()?.step.externalUrl}>
            {(url) => (
              <div class="channels-wizard__links">
                <a
                  class="channels-wizard__link"
                  href={url()}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t("channels.setup.openLink")}
                </a>
              </div>
            )}
          </Show>
          <Show when={wizard().phase === "starting"}>
            <openclaw-modal-actions class="channels-wizard__footer">
              <WizardBusyButton statusLabel={t("channels.setup.starting")} />
            </openclaw-modal-actions>
          </Show>
          <Show when={error()}>
            {(failure) => (
              <div class="callout danger channels-wizard__error" role="alert">
                {failure().message}
              </div>
            )}
          </Show>
          <Show when={done()}>
            {(completed) => <>{renderDoneBody(completed().channels, props.controls)}</>}
          </Show>
          <For each={steps()} keyed={(current) => current.step.id}>
            {(current) => (
              <>
                {current().validationError ? (
                  <div
                    id="channel-wizard-validation-error"
                    class="callout danger channels-wizard__error"
                    role="alert"
                  >
                    {current().validationError}
                  </div>
                ) : undefined}
                <WizardStepBody wizard={current()} controls={props.controls} />
              </>
            )}
          </For>
        </div>
      </div>
    </openclaw-modal-dialog>
  );
}
