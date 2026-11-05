/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, Show } from "solid-js";
import type { AppsKey, AppsT } from "./apps-i18n.js";
import { BrandLogo } from "./messages-ui.js";
import { errorMessage, Icon, type IconName, type T } from "./ui-kit.js";

export type Ctx = { host: ControlUiHost; t: T; at: AppsT; locale: string };

export type AppsMethod = "nsvx.apps.change" | "nsvx.access.change";

export function view<V>(host: ControlUiHost, name: string, params: Record<string, unknown> = {}) {
  return host.request<V>("nsvx.view", { view: name, params });
}

/** NSVX channel ids that have a logo under another name. */
const LOGO: Record<string, string> = { drive: "googledrive" };

/** The app's official logo, or a neutral icon for apps without one. */
export function AppLogo(props: { channel: string; size?: number }) {
  const size = () => props.size ?? 36;
  return (
    <span class="nsvx-apps-logo" style={{ width: `${size()}px`, height: `${size()}px` }}>
      <Show
        when={["whatsapp", "instagram", "telegram", "gmail", "drive"].includes(props.channel)}
        fallback={<Icon name={props.channel === "phone" || props.channel === "key" ? props.channel : "apps"} />}
      >
        <BrandLogo channel={LOGO[props.channel] ?? props.channel} size={Math.round(size() * 0.7)} />
      </Show>
    </span>
  );
}

export const CHANNEL_NAME: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
  gmail: "Gmail",
  drive: "Google Drive",
  standvirtual: "Standvirtual",
  phone: "Phone",
  fixture: "Test",
};

export const channelName = (channel: string) => CHANNEL_NAME[channel] ?? channel;

export function Dot(props: { tone: string; label: string }) {
  return (
    <span class={["nsvx-apps-state", `nsvx-apps-state--${props.tone}`]}>
      <span class="nsvx-apps-state__dot" aria-hidden="true" />
      {props.label}
    </span>
  );
}

/** One line of a status list: icon, what, state. */
export function Row(props: { icon: IconName; label: string; children: JSX.Element }) {
  return (
    <li class="nsvx-apps-row">
      <Icon name={props.icon} />
      <span class="nsvx-apps-row__what">{props.label}</span>
      <span class="nsvx-apps-row__value">{props.children}</span>
    </li>
  );
}

/**
 * One owner change at a time per surface, with a visible outcome. A stale revision reloads instead of overwriting;
 * an uncertain result says so and is never repeated by itself.
 */
export function createChange(ctx: Ctx, reload: () => unknown) {
  const [busy, setBusy] = createSignal<string>();
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const run = async <V,>(
    key: string,
    method: AppsMethod,
    params: Record<string, unknown>,
    done: AppsKey = "done",
  ): Promise<V | undefined> => {
    setBusy(key);
    setNote(undefined);
    try {
      const value = await ctx.host.request<V>(method, params);
      setNote({ text: ctx.at(done), bad: false });
      await reload();
      return value;
    } catch (cause) {
      const code = (cause as { gatewayCode?: string }).gatewayCode;
      setNote({
        text:
          code === "conflict"
            ? ctx.at("changed")
            : code === "uncertain"
              ? ctx.at("uncertain")
              : errorMessage(ctx.host, cause),
        bad: true,
      });
      if (code === "conflict") {
        await reload();
      }
      return undefined;
    } finally {
      setBusy(undefined);
    }
  };
  return { busy, note, run };
}

export type Change = ReturnType<typeof createChange>;

export function Note(props: { change: Change }) {
  return (
    <p class="nsvx-apps-note" role="status" aria-live="polite">
      <Show when={props.change.note()}>
        {(note) => (
          <span class={["nsvx__notice", { "nsvx__notice--bad": note().bad }]}>{note().text}</span>
        )}
      </Show>
    </p>
  );
}

export function when(locale: string, iso: string | null | undefined) {
  if (!iso) {
    return "";
  }
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

/** A remote browser picture the owner can tap; taps map to the 1280x900 page NSVX drives. */
export function RemotePage(props: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  disabled?: boolean;
  onTap?: (point: { x: number; y: number }) => void;
}) {
  return (
    <button
      type="button"
      class="nsvx-apps-page"
      aria-label={props.alt}
      disabled={props.disabled || !props.onTap}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const w = props.width ?? 1280;
        const h = props.height ?? 900;
        props.onTap?.({
          x: Math.round(Math.max(0, Math.min(w, ((event.clientX - box.left) * w) / box.width))),
          y: Math.round(Math.max(0, Math.min(h, ((event.clientY - box.top) * h) / box.height))),
        });
      }}
    >
      <img src={props.src} alt="" draggable={false} />
    </button>
  );
}
