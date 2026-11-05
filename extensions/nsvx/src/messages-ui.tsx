/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, onSettled, Show } from "solid-js";
import { BRAND_LOGOS, type BrandChannel } from "./brand-logos.js";
import type { MT } from "./messages-i18n.js";
import { errorMessage, Icon } from "./ui-kit.js";

/** The channel's official logo, or nothing for channels without one. */
export function BrandLogo(props: { channel: string; size?: number }) {
  const logo = () => BRAND_LOGOS[props.channel as BrandChannel];
  return (
    <Show when={logo()}>
      {(brand) => (
        <svg
          class="nsvx-brand"
          viewBox="0 0 24 24"
          width={props.size ?? 16}
          height={props.size ?? 16}
          role="img"
          aria-label={brand().title}
        >
          <path d={brand().path} fill={brand().color} />
        </svg>
      )}
    </Show>
  );
}

/** Initial in a circle, with the channel logo as a badge. */
export function Avatar(props: { name: string; channel: string }) {
  return (
    <span class="nsvx-avatar" aria-hidden="true">
      <span class="nsvx-avatar__initial">{props.name.trim().charAt(0).toUpperCase() || "?"}</span>
      <span class="nsvx-avatar__badge">
        <BrandLogo channel={props.channel} size={14} />
      </span>
    </span>
  );
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function recognitionClass(): (new () => Recognition) | undefined {
  const scope = globalThis as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/** Dictation into a field with the browser's own speech recognition; hidden where the browser has none. */
export function Speak(props: { locale: string; mt: MT; onText: (text: string) => void }) {
  const Recognizer = recognitionClass();
  const [listening, setListening] = createSignal(false);
  let active: Recognition | undefined;
  const toggle = () => {
    if (active) {
      active.stop();
      return;
    }
    if (!Recognizer) {
      return;
    }
    const recognition = new Recognizer();
    recognition.lang = props.locale;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const said = Array.from(event.results, (result) => result[0]?.transcript ?? "").join(" ");
      if (said.trim()) {
        props.onText(said.trim());
      }
    };
    recognition.onend = () => {
      active = undefined;
      setListening(false);
    };
    active = recognition;
    setListening(true);
    recognition.start();
  };
  return (
    <Show when={Recognizer}>
      <button
        type="button"
        class={["nsvx__button", "nsvx__button--icon", { "nsvx-speak--on": listening() }]}
        aria-label={props.mt("speak")}
        title={props.mt("speak")}
        aria-pressed={listening() ? "true" : "false"}
        onClick={toggle}
      >
        <Icon name="mic" />
      </button>
    </Show>
  );
}

/**
 * Runs one owner change. `uncertain` keeps the caller's idempotency key so a retry replays instead of repeating;
 * every other outcome is reported as is.
 */
export async function ownerChange<V>(
  host: ControlUiHost,
  mt: MT,
  run: () => Promise<V>,
): Promise<{ ok: true; value: V } | { ok: false; message: string; uncertain: boolean }> {
  try {
    return { ok: true, value: await run() };
  } catch (cause) {
    const uncertain = (cause as { gatewayCode?: string }).gatewayCode === "uncertain";
    return {
      ok: false,
      uncertain,
      message: uncertain ? mt("uncertain") : errorMessage(host, cause),
    };
  }
}

/** Polls a Quick Reply draft until its reply is written or the generation stops. */
export async function waitForDraft<D extends { state: string }>(
  host: ControlUiHost,
  draftId: string,
  preparing: (draft: D) => boolean,
): Promise<D> {
  for (let attempt = 0; ; attempt++) {
    const draft = await host.request<D>("nsvx.view", {
      view: "quickReplyDraft",
      params: { id: draftId },
    });
    if (!preparing(draft) || attempt >= 80 || host.signal.aborted) {
      return draft;
    }
    await new Promise((done) => {
      setTimeout(done, 1500);
    });
  }
}

/** Runs `run` every `ms` while the page is visible, for as long as the calling component lives. */
export function every(ms: number, run: () => void) {
  onSettled(() => {
    const timer = setInterval(() => {
      if (!document.hidden) {
        run();
      }
    }, ms);
    return () => clearInterval(timer);
  });
}
