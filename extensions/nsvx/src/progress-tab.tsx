/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { For, Show } from "solid-js";
import type { ParityData } from "./types.js";
import { createSource, matches, SourceView, type T } from "./ui-kit.js";

const SEGMENTS = ["native", "partial", "blocked", "missing"] as const;

export function ProgressTab(props: { host: ControlUiHost; t: T; query: string }) {
  const parity = createSource(props.host, () => props.host.request<ParityData>("nsvx.parity"));
  void parity.refresh();
  return (
    <SourceView source={parity} t={props.t}>
      {(data) => (
        <>
          <div class="nsvx-hero">
            <strong class="nsvx-hero__value">
              {Math.floor((data().verified / data().discovered) * 100)}%
            </strong>
            <span>
              {props.t("verified")} · {data().verified} / {data().discovered}
            </span>
          </div>
          <ul class="nsvx-legend">
            <For each={SEGMENTS}>
              {(segment) => (
                <li>
                  <span class={["nsvx-swatch", `nsvx-swatch--${segment}`]} aria-hidden="true" />
                  {props.t(segment)} {data()[segment]}
                </li>
              )}
            </For>
          </ul>
          <table class="nsvx-progress">
            <thead class="nsvx-visually-hidden">
              <tr>
                <th>{props.t("features")}</th>
                <th>{props.t("progress")}</th>
                <th>{props.t("verified")}</th>
              </tr>
            </thead>
            <tbody>
              <For
                each={data().families.filter((family) => matches(props.query, family.name))}
                keyed={(family) => family.id}
              >
                {(family) => (
                  <tr>
                    <th scope="row">{family().name}</th>
                    <td>
                      <span class="nsvx-bar">
                        <For each={SEGMENTS}>
                          {(segment) => (
                            <Show when={family()[segment] > 0}>
                              <span
                                class={["nsvx-swatch", `nsvx-swatch--${segment}`]}
                                style={{ "flex-grow": String(family()[segment]) }}
                                title={`${props.t(segment)}: ${family()[segment]}`}
                              />
                            </Show>
                          )}
                        </For>
                      </span>
                    </td>
                    <td class="nsvx-progress__count">
                      {family().verified}/{family().discovered}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </>
      )}
    </SourceView>
  );
}
