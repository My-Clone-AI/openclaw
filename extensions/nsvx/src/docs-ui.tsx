/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, Show } from "solid-js";
import { saveNsvxFile } from "./aviation-kit.js";
import type { Ctx } from "./device-kit.js";
import { docState, signTone, type Doc } from "./docs-data.js";
import type { DocsKey, KT } from "./docs-i18n.js";
import { fileToBase64 } from "./legal-data.js";
import { Pill } from "./office-kit.js";
import { Icon } from "./ui-kit.js";

export type DocsCtx = Ctx & {
  kt: KT;
  locale: string;
  /** Opens the signature desk on one signature document. */
  onSign: (id: string) => void;
};

export function docsChange<V = unknown>(host: ControlUiHost, params: Record<string, unknown>) {
  return host.request<V>("nsvx.docs.change", params);
}

export function signChange<V = unknown>(host: ControlUiHost, params: Record<string, unknown>) {
  return host.request<V>("nsvx.sign.change", params);
}

/** Saves a document or signature PDF NSVX serves, without leaving Control. */
export function saveDocFile(host: ControlUiHost, params: Record<string, unknown>) {
  return saveNsvxFile(host, params, "nsvx.docs.file");
}

export async function filesIn(list: readonly File[]) {
  return Promise.all(
    list.map(async (file) => ({
      name: file.name,
      mime: file.type,
      data: await fileToBase64(file),
    })),
  );
}

/** Google Drive's official mark (Simple Icons). */
export function DriveLogo(props: { size?: number }) {
  return (
    <svg
      class="nsvx-brand"
      viewBox="0 0 24 24"
      width={props.size ?? 18}
      height={props.size ?? 18}
      role="img"
      aria-label="Google Drive"
    >
      <path
        fill="#4285F4"
        d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z"
      />
    </svg>
  );
}

/** Where a document came from: the Drive logo, a paperclip-like upload mark, or a bank. */
export function SourceMark(props: { source: string; kt: KT }) {
  return (
    <Show
      when={props.source === "drive"}
      fallback={
        <span
          class="nsvx-docs__src"
          role="img"
          aria-label={props.kt(`src_${props.source}` as DocsKey)}
        >
          <Icon name={props.source === "bank" ? "bank" : "upload"} />
        </span>
      }
    >
      <DriveLogo size={14} />
    </Show>
  );
}

export function DocPill(props: { doc: Pick<Doc, "status" | "review_status">; kt: KT }) {
  const state = () => docState(props.doc);
  return (
    <Pill
      tone={state().tone}
      icon={state().tone === "ok" ? "done" : state().tone === "bad" ? "alert" : undefined}
    >
      {props.kt(`st_${state().key}` as DocsKey) ?? state().key}
    </Pill>
  );
}

export function SignPill(props: { state: string; desktop?: boolean; kt: KT }) {
  const key = () =>
    (props.state === "awaiting_external" && props.desktop
      ? "sign_running"
      : `sign_${props.state}`) as DocsKey;
  return (
    <Pill
      tone={signTone(props.state)}
      icon={
        signTone(props.state) === "ok"
          ? "shield"
          : signTone(props.state) === "run"
            ? "history"
            : "edit"
      }
    >
      {props.kt(key()) ?? props.state}
    </Pill>
  );
}

/**
 * One page image NSVX renders, fetched through the Gateway as a data URL. `onEnd` tells the pager the page does not
 * exist (NSVX answers not found past the last page).
 */
export function PageImage(props: {
  ctx: DocsCtx;
  view: "archivePage" | "signaturePage";
  params: Record<string, string>;
  alt: string;
  onLoad?: () => void;
  onEnd?: () => void;
  children?: unknown;
}) {
  const [src, setSrc] = createSignal<string>();
  const [failed, setFailed] = createSignal(false);
  void props.ctx.host
    .request<{ src: string }>("nsvx.view", { view: props.view, params: props.params })
    .then(
      (image) => {
        setSrc(image.src);
        props.onLoad?.();
      },
      (cause: { gatewayCode?: string }) => {
        if (cause.gatewayCode === "not-found") {
          props.onEnd?.();
        }
        setFailed(true);
      },
    );
  return (
    <div class="nsvx-docs__page">
      <Show
        when={src()}
        fallback={
          <p class="nsvx__empty" aria-busy={failed() ? "false" : "true"}>
            {failed() ? props.ctx.kt("noPreview") : props.ctx.t("loading")}
          </p>
        }
      >
        {(url) => (
          <div class="nsvx-docs__sheet">
            <img src={url()} alt={props.alt} />
            {props.children as never}
          </div>
        )}
      </Show>
    </div>
  );
}

/** A file button: opens the system picker (camera on phones with `capture`), then hands the files over. */
export function PickFiles(props: {
  label: string;
  icon: "upload" | "image" | "plus";
  accept: string;
  multiple?: boolean;
  capture?: boolean;
  primary?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <label
      class={[
        "nsvx__button",
        "nsvx-docs__pick",
        { "nsvx__button--primary": props.primary, "nsvx-docs__pick--off": props.disabled },
      ]}
    >
      <Icon name={props.icon} />
      <span>{props.label}</span>
      <input
        type="file"
        hidden
        accept={props.accept}
        multiple={props.multiple}
        capture={props.capture ? "environment" : undefined}
        disabled={props.disabled}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          if (files.length) {
            props.onFiles(files);
          }
        }}
      />
    </label>
  );
}
