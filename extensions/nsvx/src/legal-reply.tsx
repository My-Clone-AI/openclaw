/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import type { LegalReview } from "./legal-data.js";
import { legalTranslator } from "./legal-i18n.js";
import { every } from "./messages-ui.js";
import { Pill, type OfficeTone } from "./office-kit.js";
import { errorMessage, Icon } from "./ui-kit.js";
import "./office.css";

const ACTIVE = new Set(["queued", "running", "waiting_quota"]);
const REVIEW_TONE: Record<string, OfficeTone> = {
  prepared: "warn",
  queued: "run",
  running: "run",
  waiting_quota: "off",
  ready: "ok",
  failed: "bad",
  cancelled: "off",
};

/**
 * Private legal analysis of one draft (NSVX `LegalReply.tsx`). It never sends anything: the proposed reply goes back to
 * the draft, and sending stays the owner's separate tap.
 */
export function LegalReplyButton(props: {
  host: ControlUiHost;
  locale: string;
  outboxId: string;
  revision: string | null | undefined;
  savedReview?: string | undefined;
  text: string;
  disabled: boolean;
  onChange: () => void;
}) {
  const lt = () => legalTranslator(props.locale);
  const [review, setReview] = createSignal<LegalReview>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const run = async (fn: () => Promise<LegalReview | undefined>) => {
    setBusy(true);
    setError("");
    try {
      const next = await fn();
      if (next) {
        setReview(next);
      }
    } catch (cause) {
      setError(errorMessage(props.host, cause));
    } finally {
      setBusy(false);
    }
  };
  const change = (params: Record<string, unknown>) =>
    props.host.request<LegalReview>("nsvx.legalReview.change", params);
  const prepare = () =>
    change({
      action: "prepare",
      outboxId: props.outboxId,
      revision: props.revision,
      text: props.text,
    });
  every(3_000, () => {
    const current = review();
    if (open() && current && ACTIVE.has(current.status)) {
      void props.host
        .request<LegalReview>("nsvx.view", { view: "legalReview", params: { id: current.id } })
        .then((next) => {
          setReview(next);
          if (!ACTIVE.has(next.status)) {
            props.onChange();
          }
        });
    }
  });
  return (
    <>
      <button
        type="button"
        class="nsvx__button"
        aria-expanded={open() ? "true" : "false"}
        disabled={props.disabled || busy() || !props.revision}
        onClick={() => {
          if (open()) {
            setOpen(false);
            return;
          }
          setOpen(true);
          void run(() =>
            props.savedReview
              ? props.host.request<LegalReview>("nsvx.view", {
                  view: "legalReview",
                  params: { id: props.savedReview },
                })
              : prepare(),
          );
        }}
      >
        <Icon name="shield" />
        <span>{lt()("legalAi")}</span>
      </button>
      <Show when={open()}>
        <div class="nsvx-of__reveal nsvx-of">
          <Show when={error()}>
            <p class="nsvx-of__warn" role="alert">
              {error()}
            </p>
          </Show>
          <Show when={review()}>
            {(current) => (
              <>
                <div class="nsvx-of__bar" role="status">
                  <Pill tone={REVIEW_TONE[current().status] ?? "off"}>
                    {lt()(`review_${current().status}`)}
                  </Pill>
                </div>
                <Show when={current().status === "prepared"}>
                  <div class="nsvx-of__bar">
                    <Pill icon="messages">{current().manifest.messages}</Pill>
                    <Pill icon="doc">{current().manifest.sources}</Pill>
                    <Show when={current().manifest.cases.length}>
                      <Pill icon="legal">{current().manifest.cases.length}</Pill>
                    </Show>
                  </div>
                  <p class="nsvx-of__muted">
                    {current()
                      .manifest.routing_chain.map((route) => `${route.model} (${route.effort})`)
                      .join(" → ")}
                  </p>
                  <Show
                    when={current().manifest.omitted_messages || current().manifest.warnings.length}
                  >
                    <p class="nsvx-of__warn">{lt()("contextLimits")}</p>
                  </Show>
                </Show>
                <Show when={current().error}>
                  <p class="nsvx-of__warn">{current().error}</p>
                </Show>
                <Show when={current().output}>
                  {(output) => (
                    <>
                      <h4 class="nsvx-of__sub">{lt()("privateAnalysis")}</h4>
                      <p class="nsvx-of__body">{output().analysis}</p>
                      <Show when={output().gaps.length}>
                        <h4 class="nsvx-of__sub">{lt()("toConfirm")}</h4>
                        <ul class="nsvx-of__list">
                          <For each={output().gaps} keyed={false}>
                            {(gap) => <li class="nsvx-of__body">{gap()}</li>}
                          </For>
                        </ul>
                      </Show>
                      <h4 class="nsvx-of__sub">{lt()("proposedReply")}</h4>
                      <p class="nsvx-of__mono">{output().reply}</p>
                      <p class="nsvx-of__muted">{lt()("analysisStaysPrivate")}</p>
                    </>
                  )}
                </Show>
                <div class="nsvx-of__bar">
                  <Show when={current().status === "prepared"}>
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--primary"
                      disabled={busy()}
                      onClick={() =>
                        void run(() =>
                          change({
                            action: "authorize",
                            reviewId: current().id,
                            manifest_sha256: current().manifest_sha256,
                          }),
                        )
                      }
                    >
                      {lt()("analyze")}
                    </button>
                  </Show>
                  <Show when={ACTIVE.has(current().status)}>
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={busy()}
                      onClick={() =>
                        void run(() => change({ action: "cancel", reviewId: current().id }))
                      }
                    >
                      {lt()("cancel")}
                    </button>
                  </Show>
                  <Show when={["ready", "failed", "cancelled"].includes(current().status)}>
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={busy()}
                      onClick={() => void run(prepare)}
                    >
                      {lt()("newAnalysis")}
                    </button>
                  </Show>
                </div>
              </>
            )}
          </Show>
        </div>
      </Show>
    </>
  );
}
