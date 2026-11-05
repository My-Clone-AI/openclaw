/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { SUPPLIERS } from "./business-data.js";
import { Grants } from "./business-grants.js";
import { businessTranslator } from "./business-i18n.js";
import { ProviderCard } from "./business-providers.js";
import { MeterReadings } from "./business-readings.js";
import { Segments, type Ctx } from "./business-ui.js";
import { Warranties } from "./business-warranty.js";
import { AmazonCard, QuarterWorkflow } from "./business-workflow.js";
import type { T } from "./ui-kit.js";
import "./business.css";

type Section = "suppliers" | "quarter" | "orders" | "home" | "readings" | "warranty" | "grants";
const SECTIONS: Section[] = ["suppliers", "quarter", "orders", "home", "readings", "warranty", "grants"];

/** Business and home: supplier invoices, the quarter's collection, orders, home services, meters, warranties, grants. */
export function BusinessTab(props: { host: ControlUiHost; t: T; query: string; locale: string }) {
  const search = new URLSearchParams(location.search);
  const initial = search.get("biz") as Section | null;
  const [section, setSection] = createSignal<Section>(
    initial && SECTIONS.includes(initial) ? initial : "suppliers",
  );
  const [claim, setClaim] = createSignal(search.get("claim") ?? undefined);
  // Deep links keep the section and an open warranty claim (values passed in, not read back).
  const remember = (next: { biz: Section; claim: string | undefined }) => {
    const url = new URL(location.href);
    url.searchParams.set("biz", next.biz);
    if (next.claim) {
      url.searchParams.set("claim", next.claim);
    } else {
      url.searchParams.delete("claim");
    }
    history.replaceState(history.state, "", url);
  };
  const ctx = createMemo<Ctx>(() => ({
    host: props.host,
    t: props.t,
    b: businessTranslator(props.locale),
    query: props.query,
    locale: props.locale,
  }));
  const go = (biz: Section) => {
    setSection(biz);
    remember({ biz, claim: biz === "warranty" ? claim() : undefined });
  };
  const openClaim = (id: string | undefined) => {
    setClaim(id);
    remember({ biz: "warranty", claim: id });
  };
  return (
    <div class="nsvx-biz">
      <Segments
        name={ctx().b("business")}
        items={SECTIONS}
        value={section()}
        label={(key) => ctx().b(key)}
        icon={(key) => key}
        onChange={go}
      />
      <For each={[section()]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={section() === "suppliers"}>
              <div class="nsvx-biz__grid">
                <For each={SUPPLIERS} keyed={false}>
                  {(provider) => <ProviderCard ctx={ctx()} provider={provider()} />}
                </For>
              </div>
            </Show>
            <Show when={section() === "quarter"}>
              <QuarterWorkflow ctx={ctx()} />
            </Show>
            <Show when={section() === "orders"}>
              <div class="nsvx-biz__grid">
                <ProviderCard ctx={ctx()} provider="glovo" />
                <AmazonCard ctx={ctx()} />
              </div>
            </Show>
            <Show when={section() === "home"}>
              <div class="nsvx-biz__grid">
                <ProviderCard ctx={ctx()} provider="nos" />
                <ProviderCard ctx={ctx()} provider="endesa" />
              </div>
            </Show>
            <Show when={section() === "readings"}>
              <MeterReadings ctx={ctx()} onEndesa={() => go("home")} />
            </Show>
            <Show when={section() === "warranty"}>
              <Warranties ctx={ctx()} open={claim()} onOpen={openClaim} />
            </Show>
            <Show when={section() === "grants"}>
              <Grants ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
