/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";
import { isSocial } from "./calls-data.js";
import type { CT } from "./calls-i18n.js";
import type { Ctx } from "./device-kit.js";
import { BrandLogo } from "./messages-ui.js";
import { Icon } from "./ui-kit.js";

export type CallsCtx = Ctx & { ct: CT; locale: string; onMission?: (id: string) => void };

export const stamp = (iso: string | null | undefined, locale: string) =>
  iso ? new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "";

/** Official logo for WhatsApp, Telegram, and Instagram; a plain phone or microphone for telephone and app voice. */
export function ChannelMark(props: { channel: string; size?: number; ct: CT }) {
  return (
    <Show
      when={isSocial(props.channel)}
      fallback={
        <span
          class="nsvx-calls__mark"
          role="img"
          aria-label={props.ct(props.channel === "browser" ? "app" : "phone")}
        >
          <Icon name={props.channel === "browser" ? "mic" : "phone"} />
        </span>
      }
    >
      <BrandLogo channel={props.channel} size={props.size ?? 22} />
    </Show>
  );
}
