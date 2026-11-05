/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { DT } from "./device-i18n.js";
import { Segs, type Ctx } from "./device-kit.js";
import { GrowApps } from "./grow-apps.js";
import { GrowBrain } from "./grow-brain.js";
import type { GT } from "./grow-i18n.js";
import { GrowIdeas } from "./grow-ideas.js";
import { GrowTimersView } from "./grow-timers.js";
import type { IconName, T } from "./ui-kit.js";
import "./device.css";
import "./grow.css";

export type GrowCtx = Ctx & { gt: GT; locale: string };

type Section = "apps" | "ideas" | "brain" | "timers";
const SECTIONS: Section[] = ["apps", "ideas", "brain", "timers"];
const SECTION_ICON: Record<Section, IconName> = {
  apps: "work",
  ideas: "spark",
  brain: "memory",
  timers: "history",
};

/** NSVX Grow (`/empresas-do-grupo`), Build Me admin, and the OpenClaw brain panel (`/apps`), natively. */
export function GrowTab(props: {
  host: ControlUiHost;
  t: T;
  dt: DT;
  gt: GT;
  locale: string;
  query: string;
}) {
  const pick = new URLSearchParams(location.search).get("grow");
  const [section, setSection] = createSignal<Section>(
    SECTIONS.includes(pick as Section) ? (pick as Section) : "apps",
  );
  const ctx = createMemo<GrowCtx>(() => ({
    host: props.host,
    t: props.t,
    dt: props.dt,
    gt: props.gt,
    locale: props.locale,
    query: props.query,
  }));
  return (
    <div class="nsvx-dev nsvx-grow">
      <Segs
        name={props.gt("grow")}
        items={SECTIONS}
        value={section()}
        label={(key) => props.gt(key)}
        icon={(key) => SECTION_ICON[key]}
        onChange={(next) => {
          setSection(next);
          const url = new URL(location.href);
          url.searchParams.set("grow", next);
          url.searchParams.delete("idea");
          history.replaceState(history.state, "", url);
        }}
      />
      <For each={[section()]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={section() === "apps"}>
              <GrowApps ctx={ctx()} />
            </Show>
            <Show when={section() === "ideas"}>
              <GrowIdeas ctx={ctx()} />
            </Show>
            <Show when={section() === "brain"}>
              <GrowBrain ctx={ctx()} />
            </Show>
            <Show when={section() === "timers"}>
              <GrowTimersView ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
