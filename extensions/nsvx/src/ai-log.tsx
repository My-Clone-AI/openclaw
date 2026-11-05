/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { LANES, seconds, type AiRequest, type Lane, type Tone } from "./ai-data.js";
import { AiLogo, LANE_ICONS, laneTitle, poll, type AiBase } from "./ai-ui.js";
import { age, createSource, Icon, matches, SourceView } from "./ui-kit.js";

/** NSVX polls its request list with the routing state, every 20 s. */
const LOG_REFRESH_MS = 20_000;

const REQUEST_TONE: Record<AiRequest["status"], Tone> = {
  running: "run",
  ok: "ok",
  failed: "bad",
  unavailable: "bad",
  limited: "warn",
  cancelled: "off",
  interrupted: "warn",
};

const LOG_STATUSES = ["", "ok", "failed", "limited"] as const;

export function LogView(props: AiBase) {
  const [lane, setLane] = createSignal<Lane | "">("");
  const [status, setStatus] = createSignal<(typeof LOG_STATUSES)[number]>("");
  // The filter the next read sends; signals only show the choice (their writes land after the read starts).
  let filter: { lane: string; status: string } = { lane: "", status: "" };
  const rows = createSource(props.host, () =>
    props.host.request<AiRequest[]>("nsvx.view", {
      view: "aiRequests",
      params: {
        limit: "50",
        ...(filter.lane ? { lane: filter.lane } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
    }),
  );
  poll(() => rows.refresh(), LOG_REFRESH_MS);
  const pick = (next: { lane?: Lane | ""; status?: (typeof LOG_STATUSES)[number] }) => {
    filter = { ...filter, ...next };
    if (next.lane !== undefined) {
      setLane(next.lane);
    }
    if (next.status !== undefined) {
      setStatus(next.status);
    }
    void rows.refresh();
  };
  return (
    <>
      <div class="nsvx-ai-filters">
        <div class="nsvx-segment" role="group" aria-label={props.at("routes")}>
          <For each={["", ...LANES] as const}>
            {(id) => (
              <button
                type="button"
                aria-pressed={lane() === id ? "true" : "false"}
                aria-label={id ? laneTitle(props.at, id) : props.at("all")}
                title={id ? laneTitle(props.at, id) : props.at("all")}
                onClick={() => pick({ lane: id })}
              >
                <Show when={id} fallback={props.at("all")}>
                  <Icon name={LANE_ICONS[id as Lane]} />
                </Show>
              </button>
            )}
          </For>
        </div>
        <div class="nsvx-segment" role="group" aria-label={props.at("log")}>
          <For each={LOG_STATUSES}>
            {(id) => (
              <button
                type="button"
                aria-pressed={status() === id ? "true" : "false"}
                onClick={() => pick({ status: id })}
              >
                <Show when={id} fallback={props.at("all")}>
                  <span
                    class={["nsvx__dot", `nsvx__dot--${REQUEST_TONE[id as AiRequest["status"]]}`]}
                    aria-hidden="true"
                  />
                  {props.at(id === "limited" ? "s_limited" : (id as "ok" | "failed"))}
                </Show>
              </button>
            )}
          </For>
        </div>
      </div>
      <SourceView source={rows} t={props.t}>
        {(data) => {
          const shown = createMemo(() =>
            data().filter((r) =>
              matches(props.query, r.model, r.actual_model, r.provider, r.task_type, r.lane),
            ),
          );
          return (
            <Show
              when={shown().length > 0}
              fallback={<p class="nsvx__empty">{props.at("noRequests")}</p>}
            >
              <ul class="nsvx-ai-log">
                <For each={shown()}>
                  {(r) => (
                    <li class="nsvx-ai-req">
                      <span
                        class={["nsvx__dot", `nsvx__dot--${REQUEST_TONE[r.status] ?? "off"}`]}
                        role="img"
                        aria-label={r.status}
                      />
                      <AiLogo provider={r.provider} />
                      <span class="nsvx-ai-req__main">
                        <span class="nsvx-ai-req__model">{r.actual_model ?? r.model ?? "—"}</span>
                        <span class="nsvx-ai-req__sub">
                          <Icon name={LANE_ICONS[r.lane] ?? "ai"} />
                          {[
                            laneTitle(props.at, r.lane),
                            r.task_type,
                            r.attempts > 1 ? `×${r.attempts}` : "",
                            r.error_category ?? "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span class="nsvx-ai-req__time">
                        <span>{seconds(r.duration_ms)}</span>
                        <span class="nsvx-ai-req__age">{age(r.started_at)}</span>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          );
        }}
      </SourceView>
    </>
  );
}
