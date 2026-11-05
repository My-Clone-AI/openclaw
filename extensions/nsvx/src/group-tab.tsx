/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Apps } from "./group-apps.js";
import { CompanyView } from "./group-company.js";
import { groupTranslator } from "./group-i18n.js";
import { Errors, MetricsView } from "./group-insights.js";
import { Mail } from "./group-mail.js";
import { Servers } from "./group-servers.js";
import { Segments, type Ctx } from "./group-ui.js";
import type { T } from "./ui-kit.js";
import "./group.css";

type Section = "apps" | "errors" | "metrics" | "servers" | "mail";
const SECTIONS: Section[] = ["apps", "errors", "metrics", "servers", "mail"];

export function GroupTab(props: { host: ControlUiHost; t: T; query: string; locale: string }) {
  const search = new URLSearchParams(location.search);
  const initial = search.get("grp") as Section | null;
  const [section, setSection] = createSignal<Section>(
    initial && SECTIONS.includes(initial) ? initial : "apps",
  );
  const [app, setApp] = createSignal(search.get("app") ?? "");
  // Deep links: the address keeps the section and the open app (values passed in, not read back).
  const remember = (next: { grp: Section; app: string }) => {
    const url = new URL(location.href);
    url.searchParams.set("grp", next.grp);
    if (next.app) {
      url.searchParams.set("app", next.app);
    } else {
      url.searchParams.delete("app");
    }
    history.replaceState(history.state, "", url);
  };
  const ctx = createMemo<Ctx>(() => ({
    host: props.host,
    t: props.t,
    g: groupTranslator(props.locale),
    query: props.query,
    locale: props.locale,
  }));
  const go = (grp: Section, id = "") => {
    setSection(grp);
    setApp(id);
    remember({ grp, app: id });
  };
  return (
    <div class="nsvx-grp">
      <Segments
        name={ctx().g("group")}
        items={SECTIONS}
        value={section()}
        label={(key) => ctx().g(key === "apps" ? "apps" : key)}
        icon={(key) => key}
        onChange={(key) => go(key)}
      />
      <For each={[`${section()}:${section() === "apps" ? app() : ""}`]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={section() === "apps" && !app()}>
              <Apps ctx={ctx()} onOpen={(id) => go("apps", id)} />
            </Show>
            <Show when={section() === "apps" && app()}>
              <CompanyView ctx={ctx()} cid={app()} onBack={() => go("apps")} />
            </Show>
            <Show when={section() === "errors"}>
              <Errors ctx={ctx()} app={app()} onApp={(id) => go("errors", id)} />
            </Show>
            <Show when={section() === "metrics"}>
              <MetricsView ctx={ctx()} />
            </Show>
            <Show when={section() === "servers"}>
              <Servers ctx={ctx()} />
            </Show>
            <Show when={section() === "mail"}>
              <Mail ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
