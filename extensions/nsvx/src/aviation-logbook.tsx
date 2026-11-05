/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  byMonth,
  hm,
  roleOf,
  utcClock,
  type Candidate,
  type Entry,
  type EntryFull,
  type RecentAircraft,
  type Totals,
} from "./aviation-data.js";
import { CandidateForm, EntryForm } from "./aviation-entry.js";
import {
  Chip,
  createAction,
  dayLabel,
  monthLabel,
  saveNsvxFile,
  change,
  type AvCtx,
} from "./aviation-kit.js";
import { ConfirmButton, Note, view } from "./device-kit.js";
import { createSource, Icon, matches, SourceView } from "./ui-kit.js";

type EntriesData = {
  entries: Entry[];
  filters: { models: string[] | null };
  period_totals: Totals | null;
};

export function EntryLine(props: {
  ctx: AvCtx;
  entry: Entry;
  onOpen?: () => void;
  open?: boolean;
}) {
  const e = () => props.entry;
  const role = () => roleOf(e());
  const body = () => (
    <>
      <Icon
        name={e().kind === "fstd" ? "sim" : "plane"}
        class={["nsvx-row__icon", e().status === "voided" ? "nsvx-row__icon--bad" : ""]}
      />
      <span class="nsvx-row__main">
        <span class={["nsvx-row__title", { "nsvx-av__voided": e().status === "voided" }]}>
          {e().kind === "fstd"
            ? `${e().fstd_type ?? ""} · ${props.ctx.at("sim")}`
            : `${e().dep_place} → ${e().arr_place}${e().flight_no ? ` · ${e().flight_no}` : ""}`}
        </span>
        <span class="nsvx-row__detail">
          {dayLabel(props.ctx.locale, e().log_date)}
          {e().kind === "flight"
            ? ` · ${utcClock(e().off_block_at)}–${utcClock(e().on_block_at)} UTC · ${e().aircraft_model ?? ""} ${e().registration ?? ""}`
            : e().remarks
              ? ` · ${e().remarks}`
              : ""}
        </span>
      </span>
      <Show when={e().sheet_state === "pending_write"}>
        <Icon name="folder" class={["nsvx-row__icon"]} />
      </Show>
      <Show when={e().countersign === "required"}>
        <Icon name="edit" class={["nsvx-row__icon", "nsvx-row__icon--warn"]} />
      </Show>
      <span class="nsvx-av__time">
        <strong>{hm(e().kind === "fstd" ? e().fstd_min : e().total_min)}</strong>
        <Show when={role()}>{(r) => <span>{props.ctx.at(r())}</span>}</Show>
      </span>
    </>
  );
  return (
    <Show when={props.onOpen} fallback={<div class="nsvx-row">{body()}</div>}>
      <button
        type="button"
        class={["nsvx-row", "nsvx-row--link"]}
        aria-expanded={props.open ? "true" : "false"}
        onClick={() => props.onOpen?.()}
      >
        {body()}
      </button>
    </Show>
  );
}

function EntryDetail(props: {
  ctx: AvCtx;
  id: string;
  recent: RecentAircraft[];
  onChange: () => void;
}) {
  const source = createSource(props.ctx.host, () =>
    view<EntryFull>(props.ctx.host, "aviationEntry", { id: props.id }),
  );
  void source.refresh();
  const action = createAction(() => props.ctx);
  const [mode, setMode] = createSignal<"view" | "fix" | "sign" | "void">("view");
  const [reason, setReason] = createSignal("");
  const [sign, setSign] = createSignal<"not_required" | "required" | "recorded">("not_required");
  const [note, setNote] = createSignal("");
  const done = () => {
    setMode("view");
    void source.refresh();
    props.onChange();
  };
  return (
    <SourceView source={source} t={props.ctx.t}>
      {(entry) => {
        const at = props.ctx.at;
        const rows = (): [string, string][] =>
          entry().kind === "fstd"
            ? [
                [at("sim"), entry().fstd_type ?? ""],
                [at("time"), hm(entry().fstd_min)],
              ]
            : [
                [at("aircraft"), `${entry().aircraft_model ?? ""} · ${entry().registration ?? ""}`],
                ["PIC", entry().pic_name ?? ""],
                [at("night"), hm(entry().night_min)],
                ["IFR", hm(entry().ifr_min)],
                [at("takeoffs"), `${entry().to_day} · ${entry().to_night}☾`],
                [at("landings"), `${entry().ldg_day} · ${entry().ldg_night}☾`],
              ];
        return (
          <div class="nsvx-av__detail">
            <dl class="nsvx-av__kv">
              <For each={rows()} keyed={false}>
                {(row) => (
                  <div>
                    <dt>{row()[0]}</dt>
                    <dd>{row()[1]}</dd>
                  </div>
                )}
              </For>
            </dl>
            <Show when={entry().remarks}>
              <p class="nsvx-av__muted">{entry().remarks}</p>
            </Show>
            <p class="nsvx-av__muted">
              {at(`source_${entry().source}`)} ·{" "}
              {at(entry().sheet_state === "in_master" ? "inFile" : "notInFileOne")}
              {entry().countersign === "recorded" ? ` · ✍ ${entry().countersign_note ?? ""}` : ""}
            </p>
            <Show when={entry().status === "recorded"}>
              <div class="nsvx-av__bar">
                <button type="button" class="nsvx__button" onClick={() => setMode("fix")}>
                  <Icon name="edit" />
                  <span>{at("fix")}</span>
                </button>
                <button
                  type="button"
                  class="nsvx__button"
                  onClick={() => {
                    setSign(entry().countersign);
                    setNote(entry().countersign_note ?? "");
                    setMode("sign");
                  }}
                >
                  <Icon name="done" />
                  <span>{at("countersign")}</span>
                </button>
                <button
                  type="button"
                  class={["nsvx__button", "nsvx__button--danger"]}
                  onClick={() => setMode("void")}
                >
                  <Icon name="trash" />
                  <span>{at("void")}</span>
                </button>
              </div>
            </Show>
            <Show when={mode() === "fix"}>
              <EntryForm
                ctx={props.ctx}
                entry={entry()}
                recent={props.recent}
                onDone={done}
                onCancel={() => setMode("view")}
              />
            </Show>
            <Show when={mode() === "sign"}>
              <div class="nsvx-av__form">
                <div class="nsvx-av__chips">
                  <For each={["not_required", "required", "recorded"] as const} keyed={false}>
                    {(state) => (
                      <Chip
                        on={sign() === state()}
                        label={at(`sign_${state()}`)}
                        onClick={() => setSign(state())}
                      />
                    )}
                  </For>
                </div>
                <Show when={sign() === "recorded"}>
                  <label class="nsvx-field">
                    <span>{at("signedWhere")}</span>
                    <input
                      value={note()}
                      maxlength={300}
                      onInput={(event) => setNote(event.currentTarget.value)}
                    />
                  </label>
                </Show>
                <button
                  type="button"
                  class={["nsvx__button", "nsvx__button--primary"]}
                  disabled={action.busy()}
                  onClick={() =>
                    void action
                      .run(() =>
                        change(props.ctx.host, {
                          action: "countersign",
                          id: props.id,
                          state: sign(),
                          note: note() || null,
                        }),
                      )
                      .then((ok) => ok && done())
                  }
                >
                  {at("save")}
                </button>
              </div>
            </Show>
            <Show when={mode() === "void"}>
              <div class="nsvx-av__form">
                <label class="nsvx-field">
                  <span>{at("reason")}</span>
                  <input
                    value={reason()}
                    maxlength={500}
                    onInput={(event) => setReason(event.currentTarget.value)}
                  />
                </label>
                <ConfirmButton
                  label={at("void")}
                  confirm={at("void")}
                  cancel={at("cancel")}
                  icon="trash"
                  danger
                  disabled={reason().trim().length < 3 || action.busy()}
                  onConfirm={() =>
                    void action
                      .run(() =>
                        change(props.ctx.host, { action: "void", id: props.id, reason: reason() }),
                      )
                      .then((ok) => ok && done())
                  }
                />
              </div>
            </Show>
            <Note note={action.note()} />
            <Show when={entry().history.length > 0}>
              <details class="nsvx-av__details">
                <summary>
                  {at("history")} ({entry().history.length})
                </summary>
                <ul class="nsvx-av__plain">
                  <For each={entry().history} keyed={(h) => h.revision}>
                    {(h) => (
                      <li>
                        v{h().revision} · {dayLabel(props.ctx.locale, h().changed_at)} ·{" "}
                        {h().reason}
                      </li>
                    )}
                  </For>
                </ul>
              </details>
            </Show>
          </div>
        );
      }}
    </SourceView>
  );
}

function Confirming(props: { ctx: AvCtx; onClose: () => void }) {
  const source = createSource(props.ctx.host, () =>
    view<{ candidates: Candidate[]; recent: RecentAircraft[] }>(
      props.ctx.host,
      "aviationCandidates",
    ),
  );
  void source.refresh();
  return (
    <section class="nsvx-av__panel" aria-label={props.ctx.at("toConfirm")}>
      <div class="nsvx-av__bar">
        <strong>{props.ctx.at("toConfirm")}</strong>
        <button type="button" class="nsvx__button" onClick={() => props.onClose()}>
          <Icon name="close" />
          <span>{props.ctx.at("close")}</span>
        </button>
      </div>
      <SourceView source={source} t={props.ctx.t}>
        {(data) => (
          <Show
            when={data().candidates[0]}
            fallback={<p class="nsvx__empty">{props.ctx.at("nothingToConfirm")}</p>}
          >
            {(first) => (
              <For each={[first()]} keyed={(c) => c.id}>
                {(candidate) => (
                  <CandidateForm
                    ctx={props.ctx}
                    candidate={candidate()}
                    left={data().candidates.length}
                    recent={data().recent}
                    onDone={() => void source.refresh()}
                  />
                )}
              </For>
            )}
          </Show>
        )}
      </SourceView>
    </section>
  );
}

type Filters = {
  kind: "" | "flight" | "fstd";
  condition: "" | "night" | "ifr";
  aircraft: string;
  start: string;
  end: string;
};

export function LogbookView(props: { ctx: AvCtx; confirm: boolean }) {
  // The request reads this plain value, so a refresh right after a tap already asks with the new filters.
  let current: Filters = { kind: "", condition: "", aircraft: "", start: "", end: "" };
  const [filters, setFilters] = createSignal<Filters>(current);
  const filter = (patch: Partial<Filters>) => {
    current = { ...current, ...patch };
    setFilters(current);
    void entries.refresh();
  };
  const [openId, setOpenId] = createSignal<string>();
  const [adding, setAdding] = createSignal(false);
  const [confirming, setConfirming] = createSignal(props.confirm);
  const action = createAction(() => props.ctx);
  const entries = createSource(props.ctx.host, () =>
    view<EntriesData>(props.ctx.host, "aviationEntries", { ...current, limit: "1000" }),
  );
  const sync = createSource(props.ctx.host, () =>
    view<{ open: Candidate[] }>(props.ctx.host, "aviationSync"),
  );
  const recent = createSource(props.ctx.host, () =>
    view<{ recent: RecentAircraft[] }>(props.ctx.host, "aviationCandidates"),
  );
  void entries.refresh();
  void sync.refresh();
  void recent.refresh();
  const reload = () => {
    void entries.refresh();
    void sync.refresh();
  };
  // The Control search box filters loaded rows over the fields NSVX's own search reads.
  const months = createMemo(() =>
    byMonth(
      (entries.state().data?.entries ?? []).filter((e) =>
        matches(
          props.ctx.query,
          e.log_date,
          e.flight_no,
          e.dep_place,
          e.arr_place,
          e.aircraft_model,
          e.registration,
          e.pic_name,
          e.fstd_type,
          e.remarks,
        ),
      ),
    ),
  );
  const pending = () => sync.state().data?.open.length ?? 0;
  const save = (kind: "csv" | "xlsx" | "print") =>
    void action.run(() =>
      saveNsvxFile(props.ctx.host, {
        kind,
        ...(current.start ? { start: current.start } : {}),
        ...(current.end ? { end: current.end } : {}),
      }),
    );
  return (
    <div class="nsvx-av__stack">
      <div class="nsvx-av__bar">
        <button
          type="button"
          class={["nsvx__button", "nsvx__button--primary"]}
          onClick={() => setAdding(!adding())}
        >
          <Icon name="add" />
          <span>{props.ctx.at("add")}</span>
        </button>
        <span class="nsvx-av__spacer" />
        <For each={["xlsx", "csv", "print"] as const} keyed={false}>
          {(format) => (
            <button
              type="button"
              class="nsvx__button"
              disabled={action.busy()}
              onClick={() => save(format())}
            >
              <Icon name="download" />
              <span>{props.ctx.at(`export_${format()}`)}</span>
            </button>
          )}
        </For>
      </div>
      <Note note={action.note()} />
      <Show when={adding()}>
        <EntryForm
          ctx={props.ctx}
          recent={recent.state().data?.recent ?? []}
          onDone={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      </Show>
      <Show when={pending() > 0 && !confirming()}>
        <button
          type="button"
          class={["nsvx-av__banner", "nsvx-av__banner--warn"]}
          onClick={() => setConfirming(true)}
        >
          <Icon name="history" />
          <span>
            {pending()} {props.ctx.at("toConfirm")}
          </span>
        </button>
      </Show>
      <Show when={confirming()}>
        <Confirming
          ctx={props.ctx}
          onClose={() => {
            setConfirming(false);
            reload();
          }}
        />
      </Show>
      <div class="nsvx-av__chips" role="group" aria-label={props.ctx.at("filters")}>
        <Chip
          on={filters().kind === ""}
          label={props.ctx.at("all")}
          onClick={() => filter({ kind: "" })}
        />
        <Chip
          on={filters().kind === "flight"}
          icon="plane"
          label={props.ctx.at("flightsTab")}
          onClick={() => filter({ kind: current.kind === "flight" ? "" : "flight" })}
        />
        <Chip
          on={filters().kind === "fstd"}
          icon="sim"
          label={props.ctx.at("sim")}
          onClick={() => filter({ kind: current.kind === "fstd" ? "" : "fstd" })}
        />
        <Chip
          on={filters().condition === "night"}
          icon="moon"
          label={props.ctx.at("night")}
          onClick={() => filter({ condition: current.condition === "night" ? "" : "night" })}
        />
        <Chip
          on={filters().condition === "ifr"}
          label="IFR"
          onClick={() => filter({ condition: current.condition === "ifr" ? "" : "ifr" })}
        />
        <select
          class="nsvx-av__select"
          aria-label={props.ctx.at("aircraft")}
          value={filters().aircraft}
          onChange={(event) => filter({ aircraft: event.currentTarget.value })}
        >
          <option value="">{props.ctx.at("aircraft")}</option>
          <For each={entries.state().data?.filters.models ?? []} keyed={false}>
            {(model) => <option value={model()}>{model()}</option>}
          </For>
        </select>
        <input
          class="nsvx-av__select"
          type="date"
          aria-label={props.ctx.at("from")}
          value={filters().start}
          onChange={(event) => filter({ start: event.currentTarget.value })}
        />
        <input
          class="nsvx-av__select"
          type="date"
          aria-label={props.ctx.at("to")}
          value={filters().end}
          onChange={(event) => filter({ end: event.currentTarget.value })}
        />
      </div>
      <Show when={entries.state().data?.period_totals}>
        {(t) => (
          <dl class="nsvx-av__kv nsvx-av__kv--row">
            <div>
              <dt>{props.ctx.at("flights")}</dt>
              <dd>{t().flights}</dd>
            </div>
            <div>
              <dt>{props.ctx.at("total")}</dt>
              <dd>{hm(t().total_min)}</dd>
            </div>
            <div>
              <dt>{props.ctx.at("night")}</dt>
              <dd>{hm(t().night_min)}</dd>
            </div>
            <div>
              <dt>IFR</dt>
              <dd>{hm(t().ifr_min)}</dd>
            </div>
            <div>
              <dt>{props.ctx.at("sim")}</dt>
              <dd>{hm(t().fstd_min)}</dd>
            </div>
          </dl>
        )}
      </Show>
      <SourceView source={entries} t={props.ctx.t}>
        {() => (
          <Show
            when={months().length > 0}
            fallback={<p class="nsvx__empty">{props.ctx.at("noEntries")}</p>}
          >
            <For each={months()} keyed={(group) => group.m}>
              {(group) => (
                <section
                  class="nsvx-av__month"
                  aria-label={monthLabel(props.ctx.locale, group().m)}
                >
                  <h3 class="nsvx-av__month-head">
                    <span>{monthLabel(props.ctx.locale, group().m)}</span>
                    <span class="nsvx-av__muted">
                      {[
                        group().total ? hm(group().total) : "",
                        group().fstd ? `${props.ctx.at("sim")} ${hm(group().fstd)}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </h3>
                  <ul class="nsvx-list">
                    <For each={group().items} keyed={(entry) => entry.id}>
                      {(entry) => (
                        <li>
                          <EntryLine
                            ctx={props.ctx}
                            entry={entry()}
                            open={openId() === entry().id}
                            onOpen={() =>
                              setOpenId(openId() === entry().id ? undefined : entry().id)
                            }
                          />
                          <Show when={openId() === entry().id}>
                            <EntryDetail
                              ctx={props.ctx}
                              id={entry().id}
                              recent={recent.state().data?.recent ?? []}
                              onChange={reload}
                            />
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              )}
            </For>
          </Show>
        )}
      </SourceView>
    </div>
  );
}
