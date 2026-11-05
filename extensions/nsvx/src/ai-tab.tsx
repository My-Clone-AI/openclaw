/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import type { AiRequestRow, Tone } from "./ai-data.js";
import { AiIcon, createChanger, Dot, Mark, NoticeLine, type ViewProps } from "./ai-kit.js";
import { CloneAiView, VoiceView } from "./ai-panels.js";
import { AccountsView, RoutesView } from "./ai-routes.js";
import { age, createSource, matches, SourceView } from "./ui-kit.js";
import "./ai.css";

type View = "routes" | "accounts" | "cloneAi" | "voice" | "log" | "openclaw";
const VIEWS: View[] = ["routes", "accounts", "cloneAi", "voice", "log", "openclaw"];

// ---------------- log ----------------

type EvalRow = { suite: string; run_at: string; passed: number; total: number };

function seconds(row: AiRequestRow): string {
  const start = Date.parse(row.started_at);
  const end = row.finished_at ? Date.parse(row.finished_at) : Number.NaN;
  return Number.isNaN(start) || Number.isNaN(end) ? "" : `${((end - start) / 1000).toFixed(1)} s`;
}

function requestTone(status: string): Tone {
  if (status === "ok" || status === "completed" || status === "succeeded") {
    return "ok";
  }
  if (status === "running" || status === "started") {
    return "busy";
  }
  return status === "cancelled" ? "off" : "bad";
}

function LogView(props: ViewProps) {
  const log = createSource(props.host, async () => {
    const [requests, evals] = await Promise.all([
      props.host.request<AiRequestRow[]>("nsvx.ai.read", { view: "requests" }),
      props.host.request<EvalRow[]>("nsvx.ai.read", { view: "evals" }),
    ]);
    return { requests, evals };
  });
  void log.refresh();
  return (
    <SourceView source={log} t={props.t}>
      {(data) => (
        <>
          <Show when={data().evals.length > 0}>
            <div class="nsvx-ai-suites" aria-label={props.at("suites")}>
              <For each={data().evals} keyed={(row) => row.suite}>
                {(row) => (
                  <span
                    class={[
                      "nsvx-ai-suite",
                      row().passed === row().total ? "nsvx-ai-suite--ok" : "nsvx-ai-suite--bad",
                    ]}
                    title={row().run_at}
                  >
                    <AiIcon name={row().passed === row().total ? "check" : "cross"} />
                    {row().suite} {row().passed}/{row().total}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <ul class="nsvx-list">
            <For
              each={data().requests.filter((row) =>
                matches(
                  props.query,
                  row.lane,
                  props.at(row.lane),
                  row.model,
                  row.provider,
                  row.status,
                  row.task_type,
                  row.error_category,
                ),
              )}
              keyed={(row) => row.id}
            >
              {(row) => (
                <li class="nsvx-ai-account">
                  <Mark id={row().provider ?? "other"} size="sm" />
                  <span class="nsvx-ai-account__main">
                    <span class="nsvx-ai-node__title">
                      {props.at(row().lane)} · {row().model ?? "—"}
                    </span>
                    <span
                      class={[
                        "nsvx-ai-node__detail",
                        { "nsvx-row__detail--bad": Boolean(row().error_category) },
                      ]}
                    >
                      {[row().task_type ?? "", row().error_category ?? "", seconds(row())]
                        .filter((part) => part)
                        .join(" · ")}
                    </span>
                  </span>
                  <Dot tone={requestTone(row().status)} label={row().status} />
                  <span class="nsvx-row__age">{age(row().started_at)}</span>
                </li>
              )}
            </For>
          </ul>
          <Show when={data().requests.length === 0}>
            <p class="nsvx__empty">{props.at("noRequests")}</p>
          </Show>
        </>
      )}
    </SourceView>
  );
}

// ---------------- openclaw ----------------

type OpenClawProviders = {
  hash: string;
  providers: {
    id: string;
    kind: string;
    blocked: boolean;
    models: { id: string; name?: string; available?: boolean }[];
  }[];
  cloneAi: { registered: boolean; healthy: boolean };
};

function OpenClawView(props: ViewProps) {
  const inventory = createSource(props.host, () =>
    props.host.request<OpenClawProviders>("nsvx.ai.read", { view: "openclaw" }),
  );
  void inventory.refresh();
  const changer = createChanger<OpenClawProviders>(props.host, props.at, inventory);
  return (
    <SourceView source={inventory} t={props.t}>
      {(data) => (
        <>
          <div class="nsvx-ai-row">
            <Mark id="clone-ai" />
            <span class="nsvx-ai-row__label">
              {props.at(data().cloneAi.registered ? "cloneAiConnected" : "cloneAi")}
            </span>
            <Dot
              tone={data().cloneAi.healthy ? "ok" : "bad"}
              label={props.at(data().cloneAi.healthy ? "cloneAiHealthy" : "cloneAiDown")}
            />
            <Show when={!data().cloneAi.registered}>
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                disabled={!props.host.connection.canAdmin || changer.busy() !== ""}
                onClick={() =>
                  void changer.run("register", {
                    op: "openclaw.registerCloneAi",
                    hash: data().hash,
                  })
                }
              >
                {props.at("connectCloneAi")}
              </button>
            </Show>
          </div>
          <NoticeLine notice={changer.notice()} />
          <ul class="nsvx-list">
            <For
              each={data().providers.filter((provider) =>
                matches(
                  props.query,
                  provider.id,
                  provider.kind,
                  ...provider.models.map((model) => model.id),
                ),
              )}
              keyed={(provider) => provider.id}
            >
              {(provider) => (
                <li class="nsvx-ai-account">
                  <Mark id={provider().id} />
                  <span class="nsvx-ai-account__main">
                    <span class="nsvx-ai-node__title">{provider().id}</span>
                    <span class="nsvx-ai-node__detail">
                      {provider()
                        .models.map((model) => model.id)
                        .join(", ")}
                    </span>
                  </span>
                  <span class={["nsvx__chip", { "nsvx__chip--write": provider().blocked }]}>
                    {props.at(
                      provider().blocked
                        ? "paid"
                        : provider().kind === "local"
                          ? "local"
                          : "subscription",
                    )}
                  </span>
                </li>
              )}
            </For>
          </ul>
          <Show when={data().providers.length === 0}>
            <p class="nsvx__empty">{props.at("noProviders")}</p>
          </Show>
        </>
      )}
    </SourceView>
  );
}

// ---------------- tab ----------------

const VIEW_PARAM = "ai";

export function AiTab(props: ViewProps) {
  const initial = new URLSearchParams(location.search).get(VIEW_PARAM) as View | null;
  const [view, setView] = createSignal<View>(
    initial && VIEWS.includes(initial) ? initial : "routes",
  );
  // Deep link: the sub view survives reloads and shared addresses.
  const select = (next: View) => {
    setView(next);
    const url = new URL(location.href);
    url.searchParams.set(VIEW_PARAM, next);
    history.replaceState(history.state, "", url);
  };
  return (
    <div class="nsvx-ai">
      <nav class="nsvx-ai-views" role="tablist" aria-label="AI">
        <For each={VIEWS}>
          {(id) => (
            <button
              type="button"
              role="tab"
              aria-selected={view() === id ? "true" : "false"}
              aria-label={props.at(id)}
              title={props.at(id)}
              class={["nsvx-ai-view", { "nsvx-ai-view--active": view() === id }]}
              onClick={() => select(id)}
            >
              <AiIcon name={id} />
              <span class="nsvx-ai-view__label">{props.at(id)}</span>
            </button>
          )}
        </For>
      </nav>
      <For each={[view()]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={view() === "routes"}>
              <RoutesView {...props} />
            </Show>
            <Show when={view() === "accounts"}>
              <AccountsView {...props} />
            </Show>
            <Show when={view() === "cloneAi"}>
              <CloneAiView {...props} />
            </Show>
            <Show when={view() === "voice"}>
              <VoiceView {...props} />
            </Show>
            <Show when={view() === "log"}>
              <LogView {...props} />
            </Show>
            <Show when={view() === "openclaw"}>
              <OpenClawView {...props} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
