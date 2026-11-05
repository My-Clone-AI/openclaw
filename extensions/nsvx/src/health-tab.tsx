/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  LEGAL_LANGS,
  LEGAL_PAGES,
  type HealthOverview,
  type LegalBlock,
  type LegalPage,
  type LegalPageId,
  type LegalRun,
} from "./device-data.js";
import { deviceWord, type DT } from "./device-i18n.js";
import { Segs } from "./device-kit.js";
import { BrandLogo } from "./messages-ui.js";
import { age, createSource, Icon, matches, SourceView, type IconName, type T } from "./ui-kit.js";
import "./device.css";

type Section = "health" | "legal";
const SECTIONS: Section[] = ["health", "legal"];

/** Expected on the live site, so not a warning there. */
const QUIET_LIMITS = new Set(["not_development_runtime"]);

function Status(props: { ok: boolean | undefined; label: string; value: string; icon?: IconName }) {
  const tone = () => (props.ok === undefined ? "muted" : props.ok ? "ok" : "bad");
  return (
    <div class={["nsvx-kpi", `nsvx-kpi--${tone()}`]}>
      <span class="nsvx-kpi__label">{props.label}</span>
      <strong class="nsvx-kpi__value nsvx-health__value">
        <Icon
          name={props.icon ?? (props.ok === false ? "bad" : "ok")}
          class={["nsvx-row__icon", `nsvx-row__icon--${tone()}`]}
        />
        {props.value}
      </strong>
    </div>
  );
}

type Attempt = {
  lease_epoch: number;
  kind: string;
  outcome: string;
  started_at: string;
  finished_at: string | null;
  executor_revision: string | null;
};

function JobLookup(props: { host: ControlUiHost; t: T; dt: DT }) {
  const request = { job: "" };
  const [job, setJob] = createSignal("");
  const [asked, setAsked] = createSignal(false);
  const source = createSource(props.host, () =>
    props.host.request<{ attempts: Attempt[] }>("nsvx.view", {
      view: "runtimeExecution",
      params: { job_id: request.job },
    }),
  );
  return (
    <div class="nsvx-dev__card">
      <form
        class="nsvx-dev__bar"
        onSubmit={(event) => {
          event.preventDefault();
          request.job = job();
          setAsked(true);
          void source.refresh();
        }}
      >
        <label class="nsvx-field nsvx-dev__grow">
          <span>{props.dt("job")}</span>
          <input
            inputmode="numeric"
            pattern="[0-9]{1,18}"
            required
            value={job()}
            onInput={(event) => setJob(event.currentTarget.value.replace(/\D/g, ""))}
          />
        </label>
        <button type="submit" class="nsvx__button nsvx__button--primary" disabled={!job()}>
          {props.dt("show")}
        </button>
      </form>
      <Show when={asked()}>
        <SourceView source={source} t={props.t}>
          {(data) => (
            <>
              <ul class="nsvx-list" aria-label={props.dt("attempts")}>
                <For each={data().attempts} keyed={(a) => String(a.lease_epoch)}>
                  {(a) => (
                    <li class="nsvx-row">
                      <Icon
                        name={
                          a().outcome === "done"
                            ? "done"
                            : a().outcome === "running"
                              ? "activity"
                              : "alert"
                        }
                        class={[
                          "nsvx-row__icon",
                          a().outcome === "done"
                            ? "nsvx-row__icon--ok"
                            : a().outcome === "running"
                              ? ""
                              : "nsvx-row__icon--bad",
                        ]}
                      />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">
                          #{a().lease_epoch} · {a().kind}
                        </span>
                        <span class="nsvx-row__detail">
                          {(a().executor_revision ?? "").slice(0, 7)}
                        </span>
                      </span>
                      <span class="nsvx__chip">{a().outcome}</span>
                      <span class="nsvx-row__age">{age(a().started_at)}</span>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={data().attempts.length === 0}>
                <p class="nsvx__empty">{props.dt("noAttempts")}</p>
              </Show>
            </>
          )}
        </SourceView>
      </Show>
    </div>
  );
}

function Health(props: { host: ControlUiHost; t: T; dt: DT }) {
  const source = createSource(props.host, () => props.host.request<HealthOverview>("nsvx.health"));
  void source.refresh();
  return (
    <SourceView source={source} t={props.t}>
      {(data) => {
        const up = createMemo(() => data().live?.ok);
        const ready = createMemo(() => data().ready?.ready);
        const limits = createMemo(() =>
          (data().runtime?.limitations ?? []).filter((name) => !QUIET_LIMITS.has(name)),
        );
        const instagram = createMemo(() =>
          (data().runtime?.instagram ?? []).filter((row) => row.warnings.length > 0),
        );
        const warnings = createMemo(
          () =>
            limits().length +
            (data().runtime?.whatsappWarnings ?? 0) +
            instagram().length +
            (data().ready?.capabilitiesFailed.length ?? 0),
        );
        return (
          <div class="nsvx-dev__stack">
            <div
              class={[
                "nsvx-health__hero",
                up() && ready() ? "nsvx-health__hero--ok" : "nsvx-health__hero--bad",
              ]}
              role="status"
            >
              <Icon name={up() && ready() ? "ok" : "bad"} class="nsvx-health__big" />
              <span class="nsvx-row__main">
                <strong class="nsvx-health__title">
                  {up() === undefined
                    ? props.dt("unknown")
                    : up()
                      ? props.dt("up")
                      : props.dt("down")}
                  {" · "}
                  {ready() === undefined
                    ? props.dt("unknown")
                    : ready()
                      ? props.dt("ready")
                      : props.dt("notReady")}
                </strong>
                <span class="nsvx-row__detail">
                  {data().address} · {props.dt("checked")} {age(data().checkedAt)}
                </span>
              </span>
            </div>
            <div class="nsvx-kpis">
              <Status
                ok={up()}
                label={props.dt("live")}
                value={
                  up() === undefined
                    ? props.dt("unknown")
                    : up()
                      ? props.dt("up")
                      : props.dt("down")
                }
              />
              <Status
                ok={ready()}
                label={props.dt("ready")}
                value={
                  ready() === undefined
                    ? props.dt("unknown")
                    : ready()
                      ? props.dt("ready")
                      : props.dt("notReady")
                }
              />
              <Status
                ok={data().runtime ? true : undefined}
                icon="device"
                label={props.dt("runtime")}
                value={
                  data().runtime
                    ? props.dt(data().runtime?.development ? "dev" : "prod")
                    : props.dt("unknown")
                }
              />
              <Status
                ok={data().live?.revision ? true : undefined}
                icon="work"
                label={props.dt("build")}
                value={(data().live?.revision ?? data().runtime?.revision ?? "—").slice(0, 7)}
              />
              <Status
                ok={data().ready?.digest ? true : undefined}
                icon="history"
                label={props.dt("release")}
                value={(data().ready?.digest ?? "—").slice(0, 10)}
              />
            </div>
            <Show when={data().ready?.checks}>
              {(checks) => (
                <>
                  <h2 class="nsvx__heading">{props.dt("checks")}</h2>
                  <ul class="nsvx-health__checks">
                    <For each={Object.entries(checks())} keyed={([name]) => name}>
                      {(entry) => (
                        <li class={entry()[1] ? "" : "nsvx-health__check--bad"}>
                          <Icon
                            name={entry()[1] ? "ok" : "bad"}
                            class={[
                              "nsvx-row__icon",
                              entry()[1] ? "nsvx-row__icon--ok" : "nsvx-row__icon--bad",
                            ]}
                          />
                          <span>{deviceWord(props.dt, entry()[0])}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </>
              )}
            </Show>
            <h2 class="nsvx__heading">
              {props.dt("warnings")} · {warnings()}
            </h2>
            <Show when={warnings() === 0}>
              <p class="nsvx-row__detail">{props.dt("allGood")}</p>
            </Show>
            <ul class="nsvx-list">
              <Show when={(data().runtime?.whatsappWarnings ?? 0) > 0}>
                <li class="nsvx-row">
                  <BrandLogo channel="whatsapp" size={18} />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">{props.dt("whatsapp")}</span>
                  </span>
                  <span class="nsvx__chip nsvx-dev__state--warn">
                    {data().runtime?.whatsappWarnings}
                  </span>
                </li>
              </Show>
              <For each={instagram()} keyed={(row) => row.binding}>
                {(row) => (
                  <li class="nsvx-row">
                    <BrandLogo channel="instagram" size={18} />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{props.dt("instagram")}</span>
                      <span class="nsvx-row__detail">
                        {row()
                          .warnings.map((name) => deviceWord(props.dt, name))
                          .join(" · ")}
                      </span>
                    </span>
                  </li>
                )}
              </For>
              <For each={data().ready?.capabilitiesFailed ?? []} keyed={(name) => name}>
                {(name) => (
                  <li class="nsvx-row">
                    <Icon name="alert" class="nsvx-row__icon nsvx-row__icon--bad" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{name()}</span>
                    </span>
                  </li>
                )}
              </For>
              <For each={limits()} keyed={(name) => name}>
                {(name) => (
                  <li class="nsvx-row">
                    <Icon name="alert" class="nsvx-row__icon nsvx-row__icon--warn" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{name().replaceAll("_", " ")}</span>
                    </span>
                  </li>
                )}
              </For>
            </ul>
            <h2 class="nsvx__heading">{props.dt("attempts")}</h2>
            <JobLookup host={props.host} t={props.t} dt={props.dt} />
          </div>
        );
      }}
    </SourceView>
  );
}

function Runs(props: { runs: LegalRun[] }) {
  return (
    <For each={props.runs} keyed={false}>
      {(run) => (
        <Show
          when={run().href}
          fallback={
            <Show when={run().strong} fallback={run().text}>
              <strong>{run().text}</strong>
            </Show>
          }
        >
          {(href) => (
            <a href={href()} target="_blank" rel="noopener noreferrer">
              {run().text}
            </a>
          )}
        </Show>
      )}
    </For>
  );
}

function Block(props: { block: LegalBlock }) {
  const of = <K extends LegalBlock["kind"]>(kind: K) =>
    props.block.kind === kind ? (props.block as Extract<LegalBlock, { kind: K }>) : undefined;
  return (
    <>
      <Show when={of("p")}>
        {(block) => (
          <p>
            <Runs runs={block().runs} />
          </p>
        )}
      </Show>
      <Show when={of("list")}>
        {(block) => (
          <ul>
            <For each={block().items} keyed={false}>
              {(item) => (
                <li>
                  <Runs runs={item()} />
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
      <Show when={of("table")}>
        {(table) => (
          <table class="nsvx-legal__table">
            <thead>
              <tr>
                <For each={table().head} keyed={false}>
                  {(cell) => <th>{cell()}</th>}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={table().rows} keyed={false}>
                {(row) => (
                  <tr>
                    <For each={row()} keyed={false}>
                      {(cell, index) => <td data-label={table().head[index] ?? ""}>{cell()}</td>}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        )}
      </Show>
    </>
  );
}

const PAGE_ICON: Record<LegalPageId, IconName> = {
  privacy: "plug",
  terms: "doc",
  cookies: "spark",
  "data-deletion": "trash",
};

function Legal(props: { host: ControlUiHost; t: T; dt: DT; query: string }) {
  const request = {
    page: "privacy" as LegalPageId,
    lang: props.host.locale.toLowerCase().startsWith("pt") ? "pt" : "en",
  };
  const [page, setPage] = createSignal<LegalPageId>(request.page);
  const [lang, setLang] = createSignal(request.lang);
  const source = createSource(props.host, () =>
    props.host.request<LegalPage>("nsvx.legal", { page: request.page, lang: request.lang }),
  );
  void source.refresh();
  return (
    <div class="nsvx-dev__stack">
      <div class="nsvx-dev__bar">
        <Segs
          name={props.dt("legal")}
          items={LEGAL_PAGES}
          value={page()}
          label={(key) => props.dt(key)}
          icon={(key) => PAGE_ICON[key]}
          onChange={(next) => {
            request.page = next;
            setPage(next);
            void source.refresh();
          }}
        />
        <Segs
          name="Language"
          items={LEGAL_LANGS}
          value={lang() as (typeof LEGAL_LANGS)[number]}
          label={(key) => key.toUpperCase()}
          onChange={(next) => {
            request.lang = next;
            setLang(next);
            void source.refresh();
          }}
        />
      </div>
      <SourceView source={source} t={props.t}>
        {(data) => (
          <article class="nsvx-legal" lang={lang() === "pt" ? "pt-PT" : "en"}>
            <h2 class="nsvx-legal__title">{data().title}</h2>
            <p class="nsvx-row__detail">{data().updated}</p>
            <For
              each={data().sections.filter((section) =>
                matches(
                  props.query,
                  section.title,
                  ...section.blocks.flatMap((block) =>
                    block.kind === "p"
                      ? block.runs.map((run) => run.text)
                      : block.kind === "list"
                        ? block.items.flat().map((run) => run.text)
                        : block.rows.flat(),
                  ),
                ),
              )}
              keyed={(section) => section.id}
            >
              {(section) => (
                <details
                  class="nsvx-legal__section"
                  open={props.query.trim() !== "" || section().id === data().sections[0]?.id}
                >
                  <summary>{section().title}</summary>
                  <For each={section().blocks} keyed={false}>
                    {(block) => <Block block={block()} />}
                  </For>
                </details>
              )}
            </For>
          </article>
        )}
      </SourceView>
    </div>
  );
}

export function HealthTab(props: { host: ControlUiHost; t: T; dt: DT; query: string }) {
  const pick = new URLSearchParams(location.search).get("sys");
  const [section, setSection] = createSignal<Section>(
    SECTIONS.includes(pick as Section) ? (pick as Section) : "health",
  );
  return (
    <div class="nsvx-dev">
      <Segs
        name={props.dt("health")}
        items={SECTIONS}
        value={section()}
        label={(key) => props.dt(key)}
        icon={(key) => (key === "health" ? "health" : "legal")}
        onChange={(next) => {
          setSection(next);
          const url = new URL(location.href);
          url.searchParams.set("sys", next);
          history.replaceState(history.state, "", url);
        }}
      />
      <Show when={section() === "health"}>
        <Health host={props.host} t={props.t} dt={props.dt} />
      </Show>
      <Show when={section() === "legal"}>
        <Legal host={props.host} t={props.t} dt={props.dt} query={props.query} />
      </Show>
    </div>
  );
}
