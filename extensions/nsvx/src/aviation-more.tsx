/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { hm, type FlightLog, type SyncRun, type Totals } from "./aviation-data.js";
import {
  Badge,
  Bars,
  Card,
  change,
  createAction,
  dayLabel,
  saveNsvxFile,
  type AvCtx,
} from "./aviation-kit.js";
import { Note, view } from "./device-kit.js";
import { age, createSource, Icon, SourceView } from "./ui-kit.js";

type Settings = {
  sync: { time: string; tz: string; enabled: boolean };
  holder: { name: string; licence: string };
  roots: string[];
  folders: { path: string; selected: boolean }[];
  show_identity: boolean;
  sheet: { pending_write: number; imported: { at: string; added: number } | null };
  drive: { account_state: string | null };
};
type Compliance = { items: { id: string; ok: boolean | null; text: string }[] };
type Cert = {
  id: number;
  period_from: string;
  period_to: string;
  entries: number;
  certified_at: string;
  still_valid: boolean;
};
type Preview = {
  rows: number;
  flights: number;
  sessions: number;
  new: { row: number; log_date: string; label: string }[];
  already: number;
  problems: { row: number | null; problems: string[] }[];
  totals_match: boolean;
  digest: string;
};
type Insights = {
  last_90: Totals;
  recency_90d: { landings: number; takeoffs: number };
  routes: { r: string; n: number; minutes: number }[];
  yearly: {
    y: number;
    flights: number;
    total: number;
    night: number;
    ifr: number;
    pic: number;
    copilot: number;
    landings: number;
    fstd: number;
  }[];
};
const ZONES = ["Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira", "UTC"];

function lastMonth() {
  const now = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
}

function Stats(props: { ctx: AvCtx }) {
  const source = createSource(props.ctx.host, () =>
    view<Insights>(props.ctx.host, "aviationInsights"),
  );
  void source.refresh();
  return (
    <SourceView source={source} t={props.ctx.t}>
      {(d) => {
        const current = () => d().recency_90d.landings >= 3 && d().recency_90d.takeoffs >= 3;
        return (
          <Card title={props.ctx.at("stats")} icon="progress">
            <div
              class={[
                "nsvx-av__banner",
                current() ? "nsvx-av__banner--ok" : "nsvx-av__banner--warn",
              ]}
            >
              <Icon name={current() ? "done" : "alert"} />
              <span>
                90 d · {d().recency_90d.takeoffs} ↗ · {d().recency_90d.landings} ↘ ·{" "}
                {hm(d().last_90.total_min)}
                {current() ? "" : ` · ${props.ctx.at("recency")}`}
              </span>
            </div>
            <Bars
              rows={d().routes.map((r) => ({ label: r.r, value: r.minutes, sub: `${r.n}×` }))}
            />
            <div
              class="nsvx-av__table"
              role="region"
              aria-label={props.ctx.at("year")}
              tabindex="0"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">{props.ctx.at("year")}</th>
                    <th scope="col">{props.ctx.at("flights")}</th>
                    <th scope="col">{props.ctx.at("total")}</th>
                    <th scope="col">{props.ctx.at("night")}</th>
                    <th scope="col">IFR</th>
                    <th scope="col">PIC</th>
                    <th scope="col">{props.ctx.at("sim")}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={d().yearly} keyed={(row) => row.y}>
                    {(row) => (
                      <tr>
                        <th scope="row">{row().y}</th>
                        <td>{row().flights}</td>
                        <td>{hm(row().total)}</td>
                        <td>{hm(row().night)}</td>
                        <td>{hm(row().ifr)}</td>
                        <td>{hm(row().pic)}</td>
                        <td>{hm(row().fstd)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Card>
        );
      }}
    </SourceView>
  );
}

function Compare(props: { ctx: AvCtx }) {
  const source = createSource(props.ctx.host, () =>
    view<FlightLog>(props.ctx.host, "aviationFlightLog"),
  );
  void source.refresh();
  const action = createAction(() => props.ctx);
  const busy = () => ["queued", "running"].includes(source.state().data?.job?.status ?? "");
  const row = (r: FlightLog["missing"][number]) =>
    `${dayLabel(props.ctx.locale, r.start)} · ${r.kind === "flight" ? `${r.dep}–${r.arr} ${r.registration ?? ""}` : props.ctx.at("sim")} ${hm(r.minutes)}${r.problems?.length ? ` · ${r.problems.join("; ")}` : ""}`;
  return (
    <Card title={props.ctx.at("flightLog")} icon="plane">
      <SourceView source={source} t={props.ctx.t}>
        {(f) => (
          <>
            <Show
              when={f().rows > 0}
              fallback={<p class="nsvx__empty">{props.ctx.at("notRead")}</p>}
            >
              <div
                class={[
                  "nsvx-av__banner",
                  f().missing.length || f().different.length
                    ? "nsvx-av__banner--warn"
                    : "nsvx-av__banner--ok",
                ]}
              >
                <Icon name={f().missing.length || f().different.length ? "alert" : "done"} />
                <span>
                  {f().matched} / {f().rows} {props.ctx.at("match")}
                  {f().missing.length ? ` · ${f().missing.length} ${props.ctx.at("missing")}` : ""}
                  {f().different.length
                    ? ` · ${f().different.length} ${props.ctx.at("different")}`
                    : ""}
                </span>
              </div>
            </Show>
            <ul class="nsvx-av__plain">
              <For each={[...f().missing, ...f().different]} keyed={(r) => `${r.start}${r.dep}`}>
                {(r) => <li>{row(r())}</li>}
              </For>
            </ul>
            <div class="nsvx-av__bar">
              <span class="nsvx-av__muted">
                {age(f().last_read)}
                {f().job?.status === "failed" ? ` · ${f().job?.last_error ?? ""}` : ""}
              </span>
              <button
                type="button"
                class="nsvx__button"
                disabled={busy() || action.busy() || !props.ctx.host.connection.canWrite}
                onClick={() =>
                  void action
                    .run(
                      () => change(props.ctx.host, { action: "compare" }),
                      props.ctx.at("reading"),
                    )
                    .then(() => source.refresh())
                }
              >
                <Icon name="refresh" />
                <span>{busy() ? props.ctx.at("reading") : props.ctx.at("compare")}</span>
              </button>
            </div>
            <Note note={action.note()} />
          </>
        )}
      </SourceView>
    </Card>
  );
}

function MasterFile(props: { ctx: AvCtx; settings: Settings; onChange: () => void }) {
  const preview = createSource(props.ctx.host, () =>
    view<Preview>(props.ctx.host, "aviationImport"),
  );
  const [shown, setShown] = createSignal(false);
  const action = createAction(() => props.ctx);
  return (
    <Card title={props.ctx.at("masterFile")} icon="folder">
      <p class="nsvx-av__muted">
        {props.settings.sheet.imported
          ? `${props.ctx.at("imported")} ${age(props.settings.sheet.imported.at)} · ${props.settings.sheet.imported.added}`
          : props.ctx.at("notImported")}
        {props.settings.sheet.pending_write
          ? ` · ${props.settings.sheet.pending_write} ${props.ctx.at("notInFile")}`
          : ""}
      </p>
      <div class="nsvx-av__bar">
        <button
          type="button"
          class="nsvx__button"
          onClick={() => {
            setShown(true);
            void preview.refresh();
          }}
        >
          <Icon name="refresh" />
          <span>{props.ctx.at("reviewFile")}</span>
        </button>
        <For each={["xlsx", "csv", "print"] as const} keyed={false}>
          {(kind) => (
            <button
              type="button"
              class="nsvx__button"
              disabled={action.busy()}
              onClick={() => void action.run(() => saveNsvxFile(props.ctx.host, { kind: kind() }))}
            >
              <Icon name="download" />
              <span>{props.ctx.at(`export_${kind()}`)}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={shown()}>
        <SourceView source={preview} t={props.ctx.t}>
          {(p) => (
            <div class="nsvx-av__panel">
              <dl class="nsvx-av__kv nsvx-av__kv--row">
                <div>
                  <dt>{props.ctx.at("flights")}</dt>
                  <dd>{p().flights}</dd>
                </div>
                <div>
                  <dt>{props.ctx.at("sim")}</dt>
                  <dd>{p().sessions}</dd>
                </div>
                <div>
                  <dt>{props.ctx.at("new")}</dt>
                  <dd>{p().new.length}</dd>
                </div>
                <div>
                  <dt>{props.ctx.at("already")}</dt>
                  <dd>{p().already}</dd>
                </div>
              </dl>
              <Badge
                tone={p().totals_match ? "ok" : "warn"}
                label={props.ctx.at(p().totals_match ? "totalsMatch" : "totalsDiffer")}
              />
              <ul class="nsvx-av__plain">
                <For each={p().problems} keyed={false}>
                  {(x) => (
                    <li>
                      {x().row ? `#${x().row}: ` : ""}
                      {x().problems.join("; ")}
                    </li>
                  )}
                </For>
              </ul>
              <Show when={p().new.length > 0}>
                <button
                  type="button"
                  class={["nsvx__button", "nsvx__button--primary"]}
                  disabled={action.busy() || !props.ctx.host.connection.canWrite}
                  onClick={() =>
                    void action
                      .run(
                        () => change(props.ctx.host, { action: "import", digest: p().digest }),
                        props.ctx.at("importedNow"),
                      )
                      .then((ok) => {
                        if (ok) {
                          setShown(false);
                          props.onChange();
                        }
                      })
                  }
                >
                  <Icon name="download" />
                  <span>
                    {props.ctx.at("import")} {p().new.length}
                  </span>
                </button>
              </Show>
            </div>
          )}
        </SourceView>
      </Show>
      <Note note={action.note()} />
    </Card>
  );
}

function Rules(props: { ctx: AvCtx }) {
  const compliance = createSource(props.ctx.host, () =>
    view<Compliance>(props.ctx.host, "aviationCompliance"),
  );
  const certs = createSource(props.ctx.host, () =>
    view<{ certifications: Cert[] }>(props.ctx.host, "aviationCertifications"),
  );
  void compliance.refresh();
  void certs.refresh();
  const period = lastMonth();
  const [from, setFrom] = createSignal(period.from);
  const [to, setTo] = createSignal(period.to);
  const action = createAction(() => props.ctx);
  return (
    <Card title="EASA / ANAC" icon="shield">
      <SourceView source={compliance} t={props.ctx.t}>
        {(c) => (
          <ul class="nsvx-list">
            <For each={c().items} keyed={(item) => item.id}>
              {(item) => (
                <li class="nsvx-row">
                  <Icon
                    name={item().ok === true ? "done" : item().ok === false ? "alert" : "ask"}
                    class={[
                      "nsvx-row__icon",
                      item().ok === true ? "nsvx-row__icon--ok" : "nsvx-row__icon--warn",
                    ]}
                  />
                  <span class="nsvx-row__main">
                    <span class="nsvx-av__wrap">{item().text}</span>
                  </span>
                </li>
              )}
            </For>
          </ul>
        )}
      </SourceView>
      <ul class="nsvx-av__plain">
        <For each={(certs.state().data?.certifications ?? []).slice(0, 4)} keyed={(c) => c.id}>
          {(c) => (
            <li>
              <Badge
                tone={c().still_valid ? "ok" : "warn"}
                label={props.ctx.at(c().still_valid ? "certValid" : "certChanged")}
              />{" "}
              {dayLabel(props.ctx.locale, c().period_from)}–
              {dayLabel(props.ctx.locale, c().period_to)} · {c().entries}
            </li>
          )}
        </For>
      </ul>
      <div class="nsvx-av__fields">
        <label class="nsvx-field">
          <span>{props.ctx.at("from")}</span>
          <input
            type="date"
            value={from()}
            onInput={(event) => setFrom(event.currentTarget.value)}
          />
        </label>
        <label class="nsvx-field">
          <span>{props.ctx.at("to")}</span>
          <input type="date" value={to()} onInput={(event) => setTo(event.currentTarget.value)} />
        </label>
      </div>
      <button
        type="button"
        class={["nsvx__button", "nsvx__button--primary"]}
        disabled={action.busy() || !from() || !to() || !props.ctx.host.connection.canWrite}
        onClick={() =>
          void action
            .run(
              () => change(props.ctx.host, { action: "certify", from: from(), to: to() }),
              props.ctx.at("certified"),
            )
            .then(() => {
              void certs.refresh();
              void compliance.refresh();
            })
        }
      >
        <Icon name="done" />
        <span>{props.ctx.at("certify")}</span>
      </button>
      <Note note={action.note()} />
    </Card>
  );
}

export function MoreView(props: { ctx: AvCtx }) {
  const settings = createSource(props.ctx.host, () =>
    view<Settings>(props.ctx.host, "aviationSettings"),
  );
  const runs = createSource(props.ctx.host, () =>
    view<{ runs: SyncRun[] }>(props.ctx.host, "aviationRuns", { limit: "10" }),
  );
  void settings.refresh();
  void runs.refresh();
  const action = createAction(() => props.ctx);
  const save = (body: Record<string, unknown>) =>
    void action
      .run(() => change(props.ctx.host, { action: "settings", ...body }), props.ctx.at("saved"))
      .then(() => settings.refresh());
  const [roots, setRoots] = createSignal<string[]>();
  return (
    <SourceView source={settings} t={props.ctx.t}>
      {(s) => (
        <div class="nsvx-av__stack">
          <Note note={action.note()} />
          <div class="nsvx-av__grid">
            <Card title={props.ctx.at("dailyCheck")} icon="history">
              <label class="nsvx-av__check">
                <input
                  type="checkbox"
                  checked={s().sync.enabled}
                  onChange={(event) => save({ enabled: event.currentTarget.checked })}
                />
                <span>{props.ctx.at("on")}</span>
              </label>
              <div class="nsvx-av__fields">
                <label class="nsvx-field">
                  <span>{props.ctx.at("time")}</span>
                  <input
                    type="time"
                    value={s().sync.time}
                    onChange={(event) =>
                      event.currentTarget.value && save({ time: event.currentTarget.value })
                    }
                  />
                </label>
                <label class="nsvx-field">
                  <span>{props.ctx.at("zone")}</span>
                  <select
                    value={s().sync.tz}
                    onChange={(event) => save({ tz: event.currentTarget.value })}
                  >
                    <For
                      each={ZONES.includes(s().sync.tz) ? ZONES : [s().sync.tz, ...ZONES]}
                      keyed={false}
                    >
                      {(zone) => <option value={zone()}>{zone()}</option>}
                    </For>
                  </select>
                </label>
              </div>
              <ul class="nsvx-list">
                <For each={runs.state().data?.runs ?? []} keyed={(run) => run.id}>
                  {(run) => (
                    <li class="nsvx-row">
                      <Icon
                        name={
                          run().state === "ok"
                            ? "done"
                            : run().state === "error"
                              ? "alert"
                              : "history"
                        }
                        class={[
                          "nsvx-row__icon",
                          run().state === "ok"
                            ? "nsvx-row__icon--ok"
                            : run().state === "error"
                              ? "nsvx-row__icon--bad"
                              : "",
                        ]}
                      />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">
                          {dayLabel(props.ctx.locale, run().target_date)}
                        </span>
                        <span class="nsvx-row__detail">
                          {run().state === "error"
                            ? (run().error ?? "")
                            : run().state === "no_source"
                              ? (run().warnings[0] ?? "")
                              : `+${run().added} · ${run().awaiting} ${props.ctx.at("toConfirm")}`}
                        </span>
                      </span>
                      <span class="nsvx-row__age">{age(run().finished_at)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Card>
            <Compare ctx={props.ctx} />
            <MasterFile ctx={props.ctx} settings={s()} onChange={() => void settings.refresh()} />
            <Card title={props.ctx.at("holder")} icon="user">
              <div class="nsvx-av__fields">
                <label class="nsvx-field">
                  <span>{props.ctx.at("name")}</span>
                  <input
                    value={s().holder.name}
                    maxlength={120}
                    onChange={(event) => save({ holderName: event.currentTarget.value })}
                  />
                </label>
                <label class="nsvx-field">
                  <span>{props.ctx.at("licence")}</span>
                  <input
                    value={s().holder.licence}
                    maxlength={60}
                    onChange={(event) => save({ holderLicence: event.currentTarget.value })}
                  />
                </label>
              </div>
            </Card>
            <Rules ctx={props.ctx} />
            <Card title={props.ctx.at("library")} icon="folder">
              <ul class="nsvx-av__plain">
                <For each={s().folders} keyed={(f) => f.path}>
                  {(f) => (
                    <li>
                      <label class="nsvx-av__check">
                        <input
                          type="checkbox"
                          checked={(roots() ?? s().roots).includes(f().path)}
                          onChange={(event) => {
                            const picked = roots() ?? s().roots;
                            setRoots(
                              event.currentTarget.checked
                                ? [...picked, f().path]
                                : picked.filter((p) => p !== f().path),
                            );
                          }}
                        />
                        <span>{f().path}</span>
                      </label>
                    </li>
                  )}
                </For>
              </ul>
              <div class="nsvx-av__bar">
                <label class="nsvx-av__check">
                  <input
                    type="checkbox"
                    checked={s().show_identity}
                    onChange={(event) =>
                      void action
                        .run(() =>
                          change(props.ctx.host, {
                            action: "identity",
                            show: event.currentTarget.checked,
                          }),
                        )
                        .then(() => settings.refresh())
                    }
                  />
                  <span>{props.ctx.at("showIds")}</span>
                </label>
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={!roots()?.length || action.busy()}
                  onClick={() =>
                    void action
                      .run(
                        () => change(props.ctx.host, { action: "roots", roots: roots() }),
                        props.ctx.at("saved"),
                      )
                      .then((ok) => {
                        if (ok) {
                          setRoots(undefined);
                          void settings.refresh();
                        }
                      })
                  }
                >
                  {props.ctx.at("save")}
                </button>
              </div>
            </Card>
            <Stats ctx={props.ctx} />
          </div>
        </div>
      )}
    </SourceView>
  );
}
