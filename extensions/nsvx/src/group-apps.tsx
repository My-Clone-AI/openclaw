/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  appCards,
  devActionsFor,
  groupSummary,
  levelTone,
  sparkPoints,
  type AppCard,
  type DevAction,
  type DevActions,
  type Incidents,
  type Overview,
} from "./group-data.js";
import type { GroupKey } from "./group-i18n.js";
import {
  Glyph,
  GitHubMark,
  view,
  AppMark,
  Dot,
  StatusChip,
  newKey,
  isUncertain,
  type Ctx,
} from "./group-ui.js";
import { age, createSource, errorMessage, matches, SourceView } from "./ui-kit.js";

function DevActionButton(props: {
  ctx: Ctx;
  app: AppCard;
  action: { id: DevAction; available: boolean; reason: string | null };
  onDone: () => void;
}) {
  const g = props.ctx.g;
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [result, setResult] = createSignal<{ text: string; failed: boolean }>();
  let key = newKey();
  const label = () =>
    g(
      props.action.id === "ci"
        ? "ci_run"
        : props.action.id === "restart"
          ? "restart_dev"
          : props.action.id,
    );
  const why = () =>
    props.action.available
      ? ""
      : (g((props.action.reason ?? "unavailable") as GroupKey) ?? g("unavailable"));
  const run = async () => {
    setBusy(true);
    setResult(undefined);
    try {
      const answer = await props.ctx.host.request<{ status?: string }>("nsvx.group.devAction", {
        cid: props.app.id,
        action: props.action.id,
        idempotencyKey: key,
      });
      setResult({
        text: g(answer.status === "queued" || answer.status === "pending" ? "queued" : "done"),
        failed: false,
      });
      key = newKey();
      props.onDone();
    } catch (cause) {
      const uncertain = isUncertain(cause);
      setResult({
        text: uncertain ? g("uncertain") : errorMessage(props.ctx.host, cause),
        failed: true,
      });
      if (!uncertain) {
        key = newKey();
      }
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <span class="nsvx-grp__act">
      <Show
        when={confirming()}
        fallback={
          <button
            type="button"
            class="nsvx__button nsvx__button--icon nsvx-grp__act-btn"
            disabled={!props.action.available || busy()}
            aria-label={`${label()} · ${props.app.name}${why() ? ` · ${why()}` : ""}`}
            title={why() ? `${label()} · ${why()}` : label()}
            onClick={() => setConfirming(true)}
          >
            {props.action.id === "ci" ? (
              <GitHubMark />
            ) : (
              <Glyph name={props.action.id === "restart" ? "restart_dev" : props.action.id} />
            )}
          </button>
        }
      >
        <span class="nsvx-grp__confirm" role="group" aria-label={label()}>
          <span>{label()}?</span>
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            disabled={busy()}
            onClick={() => void run()}
          >
            {g("confirm")}
          </button>
          <button
            type="button"
            class="nsvx__button"
            disabled={busy()}
            onClick={() => setConfirming(false)}
          >
            {g("cancel")}
          </button>
        </span>
      </Show>
      <Show when={result()}>
        {(r) => (
          <span class={["nsvx-grp__note", { "nsvx-grp__note--bad": r().failed }]} role="status">
            {r().text}
          </span>
        )}
      </Show>
    </span>
  );
}

type Filter = "all" | "online" | "attention" | "errors" | "pending";

function AppCardView(props: {
  ctx: Ctx;
  card: AppCard;
  actions: DevActions | undefined;
  incident?: { action?: string };
  onOpen: () => void;
  onDone: () => void;
}) {
  const g = props.ctx.g;
  const nf = () => new Intl.NumberFormat(props.ctx.locale);
  const c = () => props.card;
  const actions = createMemo(() => devActionsFor(props.actions, { id: c().id, grow: c().grow }));
  return (
    <article class={["nsvx-grp__card", `nsvx-grp__card--${c().health}`]} data-app={c().id}>
      <header class="nsvx-grp__card-head">
        <button type="button" class="nsvx-grp__open" onClick={() => props.onOpen()}>
          <AppMark id={c().id} name={c().name} />
          <span class="nsvx-grp__id">
            <strong>{c().name}</strong>
            <span>{c().domain}</span>
          </span>
        </button>
        <StatusChip g={g} tone={c().health} />
      </header>
      <div class="nsvx-grp__chips">
        <span class="nsvx-grp__chip" title={`${g("dev")} ${c().dev.sha ?? ""}`}>
          <Dot tone={c().dev.tone} />
          {g("dev")}
          <code>{c().dev.sha ?? "—"}</code>
        </span>
        <span class="nsvx-grp__chip" title={`${g("prod")} ${c().prod.sha ?? ""}`}>
          <Dot tone={c().prod.tone} />
          {g("prod")}
          <code>{c().prod.sha ?? "—"}</code>
        </span>
        <Show when={c().ahead}>
          {(ahead) => (
            <span class="nsvx-grp__chip nsvx-grp__chip--accent" title={g("toShip")}>
              +{ahead()}
            </span>
          )}
        </Show>
        <Show when={c().ci}>
          {(ci) => (
            <span class="nsvx-grp__chip" title={`${g("ci")} · ${g(ci())}`}>
              <GitHubMark />
              <Dot tone={ci()} />
              {g("ci")}
            </span>
          )}
        </Show>
        <Show when={c().prs}>
          {(prs) => (
            <span class="nsvx-grp__chip" title={g("prs")}>
              {g("prs")} {prs().count}
              <Show when={prs().failing > 0}>
                <Dot tone="bad" />
              </Show>
            </span>
          )}
        </Show>
      </div>
      <div class="nsvx-grp__stats">
        <span class="nsvx-grp__stat" title={`${g("errors")} · 24h`}>
          <Glyph name="errors" class="nsvx-grp__stat-icon" />
          <Dot tone={c().errors.tone} />
          <strong>{c().errors.count === null ? "—" : nf().format(c().errors.count ?? 0)}</strong>
        </span>
        <span class="nsvx-grp__stat nsvx-grp__spark" title={`${g("visitors")} · ${g("week")}`}>
          <Show when={c().spark.length > 1}>
            <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                points={sparkPoints(c().spark)}
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
              />
            </svg>
          </Show>
          <strong>{c().visitors === null ? "—" : nf().format(c().visitors ?? 0)}</strong>
          <span class="nsvx-visually-hidden">{g("visitors")}</span>
        </span>
      </div>
      <Show when={c().errors.top.length > 0}>
        <ol class="nsvx-grp__top">
          <For each={c().errors.top} keyed={(row) => row.group}>
            {(row) => (
              <li title={row().route ?? row().message}>
                <Dot tone={levelTone(row().level)} />
                <span>{row().message}</span>
                <strong>×{nf().format(row().count)}</strong>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <Show when={props.incident?.action}>
        <p class="nsvx-grp__auto">⟳ {props.incident?.action}</p>
      </Show>
      <Show when={c().noAdmin}>
        <p class="nsvx-grp__muted">{g("noAdmin")}</p>
      </Show>
      <Show when={actions().length > 0}>
        <footer class="nsvx-grp__acts" role="group" aria-label={`${g("dev")} · ${c().name}`}>
          <For each={actions()} keyed={(action) => action.id}>
            {(action) => (
              <DevActionButton ctx={props.ctx} app={c()} action={action()} onDone={props.onDone} />
            )}
          </For>
        </footer>
      </Show>
    </article>
  );
}

export function Apps(props: { ctx: Ctx; onOpen: (id: string) => void }) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  const overview = createSource(host, () => view<Overview>(host, "groupOverview"));
  const actions = createSource(host, () => view<DevActions>(host, "groupDevActions"));
  const incidents = createSource(host, () => view<Incidents>(host, "groupIncidents"));
  void overview.refresh();
  void actions.refresh();
  void incidents.refresh();
  const [filter, setFilter] = createSignal<Filter>("all");
  return (
    <SourceView source={overview} t={props.ctx.t}>
      {(data) => {
        const cards = createMemo(() => appCards(data()));
        const summary = createMemo(() => groupSummary(cards()));
        const shown = createMemo(() =>
          cards().filter(
            (card) =>
              matches(props.ctx.query, card.name, card.domain, card.id) &&
              (
                {
                  all: true,
                  online: card.prod.tone === "ok",
                  attention: card.attention,
                  errors: (card.errors.count ?? 0) > 0,
                  pending: card.ahead !== null,
                } as Record<Filter, boolean>
              )[filter()],
          ),
        );
        const tiles = () =>
          [
            [
              "online",
              `${summary().online}/${summary().total}`,
              summary().online < summary().total ? "warn" : "ok",
            ],
            ["attention", String(summary().attention), summary().attention ? "bad" : "ok"],
            ["errors", String(summary().errors), summary().errors ? "warn" : "ok"],
            ["pending", String(summary().pending), summary().pending ? "accent" : "off"],
          ] as const;
        return (
          <>
            <div class="nsvx-grp__tiles" role="group" aria-label={g("apps")}>
              <For each={tiles()} keyed={(tile) => tile[0]}>
                {(tile) => (
                  <button
                    type="button"
                    class={["nsvx-grp__tile", `nsvx-grp__tile--${tile()[2]}`]}
                    aria-pressed={filter() === tile()[0] ? "true" : "false"}
                    onClick={() => setFilter(filter() === tile()[0] ? "all" : tile()[0])}
                  >
                    <span>{g(tile()[0] === "pending" ? "toShip" : (tile()[0] as GroupKey))}</span>
                    <strong>{tile()[1]}</strong>
                  </button>
                )}
              </For>
            </div>
            <p class="nsvx-grp__fresh" title={data().generatedAt}>
              {age(data().generatedAt)}
            </p>
            <div class="nsvx-grp__grid">
              <For each={shown()} keyed={(card) => card.id}>
                {(card) => (
                  <AppCardView
                    ctx={props.ctx}
                    card={card()}
                    actions={actions.state().data}
                    incident={
                      incidents.state().data?.items[`${card().id}:outage`] ??
                      incidents.state().data?.items[`${card().id}:errors`]
                    }
                    onOpen={() => props.onOpen(card().id)}
                    onDone={() => void actions.refresh()}
                  />
                )}
              </For>
            </div>
            <Show when={shown().length === 0}>
              <p class="nsvx__empty">{filter() === "attention" ? g("allGood") : g("nothing")}</p>
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}
