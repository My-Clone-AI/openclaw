/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import type { WorkConnection, WorkItem } from "./aviation-data.js";
import { aviationWord } from "./aviation-i18n.js";
import {
  Badge,
  change,
  Chip,
  createAction,
  dayLabel,
  lisbonTime,
  type AvCtx,
} from "./aviation-kit.js";
import { Note, view } from "./device-kit.js";
import { age, createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

/** The airline's own systems as NSVX reads them (HiFly CWP roster, company mail, portal); read-only here. */
type Kind = "duty" | "mail" | "notice";
const KINDS: Kind[] = ["duty", "mail", "notice"];
const SERVICE: Record<Kind, WorkConnection["service"]> = {
  duty: "cwp",
  mail: "mail",
  notice: "portal",
};
const KIND_ICON: Record<Kind, IconName> = { duty: "agenda", mail: "mail", notice: "doc" };

function stateTone(state: string) {
  return state === "fresh"
    ? "ok"
    : state === "needs_owner" || state === "failed" || state === "expired"
      ? "bad"
      : state === "syncing" || state === "queued"
        ? "run"
        : "warn";
}

function Item(props: { ctx: AvCtx; item: WorkItem }) {
  const [open, setOpen] = createSignal(false);
  const body = createSource(props.ctx.host, () =>
    view<{ body: string | null }>(props.ctx.host, "workItem", { id: props.item.id }),
  );
  const i = () => props.item;
  const when = () => i().departure_at ?? i().starts_at ?? i().report_at ?? i().observed_at;
  return (
    <li>
      <button
        type="button"
        class={["nsvx-row", "nsvx-row--link"]}
        aria-expanded={open() ? "true" : "false"}
        onClick={() => {
          setOpen(!open());
          if (!body.state().data) {
            void body.refresh();
          }
        }}
      >
        <Icon
          name={i().kind === "duty" ? "plane" : i().kind === "mail" ? "mail" : "doc"}
          class={["nsvx-row__icon", i().status === "cancelled" ? "nsvx-row__icon--bad" : ""]}
        />
        <span class="nsvx-row__main">
          <span class={["nsvx-row__title", { "nsvx-av__voided": i().status === "cancelled" }]}>
            {i().meta.from && i().meta.to ? `${i().meta.from} → ${i().meta.to}` : (i().title ?? "")}
            {i().meta.flight ? ` · ${i().meta.flight}` : ""}
          </span>
          <span class="nsvx-row__detail">
            {i().kind === "duty"
              ? lisbonTime(props.ctx.locale, when())
              : dayLabel(props.ctx.locale, when())}
            {i().meta.from_name ? ` · ${i().meta.from_name}` : ""}
            {i().meta.aircraft ? ` · ${i().meta.aircraft} ${i().meta.registration ?? ""}` : ""}
          </span>
        </span>
        <Show when={i().meta.unread}>
          <span class="nsvx__dot nsvx__dot--run" />
        </Show>
      </button>
      <Show when={open() && i().kind !== "duty"}>
        <SourceView source={body} t={props.ctx.t}>
          {(data) => <pre class="nsvx-av__text">{data().body ?? i().excerpt ?? ""}</pre>}
        </SourceView>
      </Show>
    </li>
  );
}

export function RosterView(props: { ctx: AvCtx }) {
  let current: Kind = "duty";
  const [kind, setKind] = createSignal<Kind>("duty");
  const connections = createSource(props.ctx.host, () =>
    view<{ connections: WorkConnection[] }>(props.ctx.host, "workConnections"),
  );
  const items = createSource(props.ctx.host, () =>
    view<{ items: WorkItem[] }>(props.ctx.host, "workItems", { kind: current, limit: "100" }),
  );
  void connections.refresh();
  void items.refresh();
  const action = createAction(() => props.ctx);
  const pick = (next: Kind) => {
    current = next;
    setKind(next);
    void items.refresh();
  };
  const connection = () =>
    connections.state().data?.connections.find((c) => c.service === SERVICE[kind()]);
  return (
    <div class="nsvx-av__stack">
      <div class="nsvx-av__bar">
        <div class="nsvx-av__chips" role="group" aria-label={props.ctx.at("roster")}>
          <For each={KINDS} keyed={false}>
            {(k) => (
              <Chip
                on={kind() === k()}
                icon={KIND_ICON[k()]}
                label={props.ctx.at(`work_${k()}`)}
                onClick={() => pick(k())}
              />
            )}
          </For>
        </div>
        <Show when={connection()}>
          {(c) => (
            <span class="nsvx-av__sync">
              <Badge
                tone={stateTone(c().state)}
                label={aviationWord(props.ctx.at, `ws_${c().state}`, c().state)}
              />
              <span class="nsvx-av__muted">{age(c().last_complete_at)}</span>
              <button
                type="button"
                class="nsvx__button"
                aria-label={props.ctx.at("readNow")}
                disabled={!c().configured || action.busy() || !props.ctx.host.connection.canWrite}
                onClick={() =>
                  void action
                    .run(
                      () => change(props.ctx.host, { action: "workSync", service: c().service }),
                      props.ctx.at("reading"),
                    )
                    .then(() => connections.refresh())
                }
              >
                <Icon name="refresh" />
              </button>
            </span>
          )}
        </Show>
      </div>
      <Note note={action.note()} />
      <SourceView source={items} t={props.ctx.t}>
        {(data) => {
          const rows = () =>
            data().items.filter((i) =>
              matches(
                props.ctx.query,
                i.title,
                i.meta.flight,
                i.meta.from,
                i.meta.to,
                i.meta.from_name,
              ),
            );
          return (
            <Show
              when={rows().length > 0}
              fallback={<p class="nsvx__empty">{props.ctx.at("nothing")}</p>}
            >
              <ul class="nsvx-list">
                <For each={rows()} keyed={(i) => i.id}>
                  {(i) => <Item ctx={props.ctx} item={i()} />}
                </For>
              </ul>
            </Show>
          );
        }}
      </SourceView>
    </div>
  );
}
