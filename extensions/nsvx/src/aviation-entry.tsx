/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  blockTimes,
  CREWS,
  emptyFlight,
  flightFields,
  formFrom,
  hm,
  parseHm,
  ROLES,
  yesterday,
  type Candidate,
  type Entry,
  type FlightForm,
  type FormProblem,
  type RecentAircraft,
} from "./aviation-data.js";
import { aviationWord, type AviationKey } from "./aviation-i18n.js";
import {
  Badge,
  change,
  Chip,
  Counter,
  createAction,
  dayLabel,
  type AvCtx,
} from "./aviation-kit.js";
import { Note } from "./device-kit.js";
import { Icon } from "./ui-kit.js";

const DISMISS = [
  "dismissCancelled",
  "dismissSwapped",
  "dismissPassenger",
  "dismissNotFlown",
] as const;

function Problems(props: { ctx: AvCtx; problems: (FormProblem | string)[] }) {
  return (
    <Show when={props.problems.length > 0}>
      <ul class="nsvx-av__problems" role="alert">
        <For each={props.problems} keyed={false}>
          {(problem) => (
            <li>
              <Icon name="alert" />
              {aviationWord(props.ctx.at, `need_${problem()}`, problem())}
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

function Text(props: {
  label: string;
  value: string;
  placeholder?: string;
  upper?: boolean;
  max?: number;
  mode?: "numeric";
  list?: string;
  onInput: (value: string) => void;
}) {
  return (
    <label class="nsvx-field">
      <span>{props.label}</span>
      <input
        value={props.value}
        placeholder={props.placeholder}
        maxlength={props.max ?? 120}
        inputmode={props.mode}
        list={props.list}
        onInput={(event) =>
          props.onInput(
            props.upper ? event.currentTarget.value.toUpperCase() : event.currentTarget.value,
          )
        }
      />
    </label>
  );
}

/** The flight fields, with recent aircraft and captains as one-tap fills and the block time worked out live. */
function FlightFields(props: {
  ctx: AvCtx;
  form: FlightForm;
  set: (form: FlightForm) => void;
  recent: RecentAircraft[];
}) {
  const at = (key: AviationKey) => props.ctx.at(key);
  const u =
    <K extends keyof FlightForm>(key: K) =>
    (value: FlightForm[K]) =>
      props.set({ ...props.form, [key]: value });
  const block = createMemo(() => blockTimes(props.form.log_date, props.form.off, props.form.on));
  const aircraft = createMemo(() => {
    const seen = new Set<string>();
    return props.recent
      .filter((row) => {
        const key = `${row.aircraft_model} ${row.registration}`;
        return !seen.has(key) && seen.add(key);
      })
      .slice(0, 6);
  });
  const pics = createMemo(() =>
    [...new Set(props.recent.map((r) => r.pic_name).filter(Boolean))].slice(0, 8),
  );
  const listId = `nsvx-av-pics-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <>
      <div class="nsvx-av__fields">
        <label class="nsvx-field">
          <span>{at("dateUtc")}</span>
          <input
            type="date"
            value={props.form.log_date}
            max={yesterday()}
            onInput={(event) => u("log_date")(event.currentTarget.value)}
          />
        </label>
        <Text
          label={at("flightNo")}
          value={props.form.flight_no}
          placeholder="AIZ991"
          upper
          max={12}
          onInput={u("flight_no")}
        />
        <Text
          label={at("from")}
          value={props.form.dep_place}
          placeholder="LIS"
          upper
          max={4}
          onInput={u("dep_place")}
        />
        <Text
          label={at("to")}
          value={props.form.arr_place}
          placeholder="JFK"
          upper
          max={4}
          onInput={u("arr_place")}
        />
        <Text
          label={at("offBlock")}
          value={props.form.off}
          placeholder="21:55"
          mode="numeric"
          max={5}
          onInput={u("off")}
        />
        <Text
          label={at("onBlock")}
          value={props.form.on}
          placeholder="06:10"
          mode="numeric"
          max={5}
          onInput={u("on")}
        />
      </div>
      <p class="nsvx-av__block" aria-live="polite">
        <Icon name="history" />
        <Show when={block()} fallback={<span>{at("blockHint")}</span>}>
          {(b) => (
            <span>
              {at("block")} <strong>{hm(b().minutes)}</strong>
              {b().on.slice(0, 10) !== props.form.log_date ? ` (+1)` : ""}
            </span>
          )}
        </Show>
      </p>
      <Show when={aircraft().length > 0}>
        <div class="nsvx-av__chips" role="group" aria-label={at("recentAircraft")}>
          <For each={aircraft()} keyed={(row) => `${row.aircraft_model}${row.registration}`}>
            {(row) => (
              <Chip
                on={props.form.registration === row().registration}
                icon="plane"
                label={`${row().aircraft_model} ${row().registration}`}
                onClick={() =>
                  props.set({
                    ...props.form,
                    aircraft_model: row().aircraft_model,
                    registration: row().registration,
                    crew: row().mp ? "mp" : row().me ? "me" : "se",
                  })
                }
              />
            )}
          </For>
        </div>
      </Show>
      <div class="nsvx-av__fields">
        <Text
          label={at("model")}
          value={props.form.aircraft_model}
          placeholder="A332"
          max={40}
          onInput={u("aircraft_model")}
        />
        <Text
          label={at("registration")}
          value={props.form.registration}
          placeholder="9H-"
          upper
          max={12}
          onInput={u("registration")}
        />
        <Text label="PIC" value={props.form.pic_name} list={listId} onInput={u("pic_name")} />
      </div>
      <datalist id={listId}>
        <For each={pics()} keyed={false}>
          {(name) => <option value={name()} />}
        </For>
      </datalist>
      <div class="nsvx-av__chips" role="group" aria-label={at("crew")}>
        <For each={CREWS} keyed={false}>
          {(crew) => (
            <Chip
              on={props.form.crew === crew()}
              label={at(`crew_${crew()}`)}
              onClick={() => u("crew")(crew())}
            />
          )}
        </For>
      </div>
      <div class="nsvx-av__chips" role="group" aria-label={at("role")}>
        <For each={ROLES} keyed={false}>
          {(role) => (
            <Chip
              on={props.form.role === role()}
              label={at(role())}
              onClick={() => u("role")(role())}
            />
          )}
        </For>
      </div>
      <div class="nsvx-av__fields">
        <For each={["night", "ifr"] as const} keyed={false}>
          {(key) => (
            <div class="nsvx-av__quick">
              <Text
                label={key() === "night" ? at("night") : "IFR"}
                value={props.form[key()]}
                placeholder="0:00"
                mode="numeric"
                max={6}
                onInput={u(key())}
              />
              <button type="button" class="nsvx__button" onClick={() => u(key())("0:00")}>
                0
              </button>
              <Show when={block()}>
                {(b) => (
                  <button
                    type="button"
                    class="nsvx__button"
                    onClick={() => u(key())(hm(b().minutes))}
                  >
                    {at("allOfIt")}
                  </button>
                )}
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class="nsvx-av__counters">
        <Counter label={at("takeoffsDay")} value={props.form.to_day} onChange={u("to_day")} />
        <Counter label={at("takeoffsNight")} value={props.form.to_night} onChange={u("to_night")} />
        <Counter label={at("landingsDay")} value={props.form.ldg_day} onChange={u("ldg_day")} />
        <Counter
          label={at("landingsNight")}
          value={props.form.ldg_night}
          onChange={u("ldg_night")}
        />
      </div>
      <Text
        label={at("remarks")}
        value={props.form.remarks}
        placeholder="LIFUS, Line Check"
        max={200}
        onInput={u("remarks")}
      />
      <label class="nsvx-av__check">
        <input
          type="checkbox"
          checked={props.form.countersign_required}
          onChange={(event) => u("countersign_required")(event.currentTarget.checked)}
        />
        <span>{at("needsCountersign")}</span>
      </label>
    </>
  );
}

type Sim = {
  log_date: string;
  fstd_type: string;
  fstd_qualification: string;
  dur: string;
  remarks: string;
};

function simFields(sim: Sim): { fields?: Record<string, unknown>; problems: string[] } {
  const minutes = parseHm(sim.dur);
  if (!sim.fstd_type.trim() || !minutes) {
    return { problems: ["sim"] };
  }
  return {
    fields: {
      kind: "fstd",
      log_date: sim.log_date,
      fstd_type: sim.fstd_type.trim(),
      fstd_qualification: sim.fstd_qualification.trim() || null,
      fstd_min: minutes,
      remarks: sim.remarks.trim() || null,
    },
    problems: [],
  };
}

function SimFields(props: { ctx: AvCtx; sim: Sim; set: (sim: Sim) => void; fixedDate?: boolean }) {
  const u = (key: keyof Sim) => (value: string) => props.set({ ...props.sim, [key]: value });
  return (
    <div class="nsvx-av__fields">
      <Show when={!props.fixedDate}>
        <label class="nsvx-field">
          <span>{props.ctx.at("date")}</span>
          <input
            type="date"
            value={props.sim.log_date}
            max={yesterday()}
            onInput={(event) => u("log_date")(event.currentTarget.value)}
          />
        </label>
      </Show>
      <Text
        label={props.ctx.at("device")}
        value={props.sim.fstd_type}
        placeholder="A330 FFS"
        max={60}
        onInput={u("fstd_type")}
      />
      <Text
        label={props.ctx.at("qualification")}
        value={props.sim.fstd_qualification}
        max={60}
        onInput={u("fstd_qualification")}
      />
      <Text
        label={props.ctx.at("duration")}
        value={props.sim.dur}
        placeholder="4:00"
        mode="numeric"
        max={6}
        onInput={u("dur")}
      />
      <Text
        label={props.ctx.at("remarks")}
        value={props.sim.remarks}
        placeholder="OPC, LPC"
        max={200}
        onInput={u("remarks")}
      />
    </div>
  );
}

/** Add an entry, or correct one (NSVX keeps the old version and the reason). Older than yesterday needs a reason. */
export function EntryForm(props: {
  ctx: AvCtx;
  entry?: Entry;
  recent: RecentAircraft[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const start = props.entry;
  const [kind, setKind] = createSignal(start?.kind ?? "flight");
  const [form, setForm] = createSignal<FlightForm>(
    start && start.kind === "flight" ? formFrom(start.log_date, start) : emptyFlight(yesterday()),
  );
  const [sim, setSim] = createSignal<Sim>({
    log_date: start?.log_date ?? yesterday(),
    fstd_type: start?.fstd_type ?? "",
    fstd_qualification: start?.fstd_qualification ?? "",
    dur: start ? hm(start.fstd_min) : "",
    remarks: start?.remarks ?? "",
  });
  const [reason, setReason] = createSignal("");
  const [problems, setProblems] = createSignal<string[]>([]);
  const action = createAction(() => props.ctx);
  const day = () => (kind() === "flight" ? form().log_date : sim().log_date);
  const needReason = () => Boolean(start) || day() < yesterday();
  const save = async () => {
    const built = kind() === "flight" ? flightFields(form()) : simFields(sim());
    const missing = [
      ...built.problems,
      ...(needReason() && reason().trim().length < 3 ? ["reason"] : []),
    ];
    setProblems(missing);
    if (missing.length > 0 || !built.fields) {
      return;
    }
    const ok = await action.run(() =>
      change(
        props.ctx.host,
        start
          ? { action: "correct", id: start.id, fields: built.fields, reason: reason() }
          : { action: "add", fields: built.fields, ...(reason() ? { reason: reason() } : {}) },
      ),
    );
    if (ok) {
      props.onDone();
    }
  };
  return (
    <form
      class="nsvx-av__panel"
      aria-label={props.ctx.at(start ? "fix" : "add")}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Show when={!start}>
        <div class="nsvx-av__chips">
          <Chip
            on={kind() === "flight"}
            icon="plane"
            label={props.ctx.at("flight")}
            onClick={() => setKind("flight")}
          />
          <Chip
            on={kind() === "fstd"}
            icon="sim"
            label={props.ctx.at("sim")}
            onClick={() => setKind("fstd")}
          />
        </div>
      </Show>
      <Show
        when={kind() === "flight"}
        fallback={<SimFields ctx={props.ctx} sim={sim()} set={setSim} />}
      >
        <FlightFields ctx={props.ctx} form={form()} set={setForm} recent={props.recent} />
      </Show>
      <Show when={needReason()}>
        <Text label={props.ctx.at("reason")} value={reason()} max={500} onInput={setReason} />
      </Show>
      <Problems ctx={props.ctx} problems={problems()} />
      <Note note={action.note()} />
      <div class="nsvx-av__bar">
        <button type="button" class="nsvx__button" onClick={() => props.onCancel()}>
          {props.ctx.at("cancel")}
        </button>
        <button
          type="submit"
          class={["nsvx__button", "nsvx__button--primary"]}
          disabled={action.busy() || !props.ctx.host.connection.canWrite}
        >
          <Icon name="done" />
          <span>{props.ctx.at("save")}</span>
        </button>
      </div>
    </form>
  );
}

/** One flight waiting for the pilot: NSVX's prepared draft, the missing parts, then Confirm, Later, or Not flown. */
export function CandidateForm(props: {
  ctx: AvCtx;
  candidate: Candidate;
  left: number;
  recent: RecentAircraft[];
  onDone: () => void;
}) {
  const c = props.candidate;
  const isSim = c.activity === "ground";
  const draft = c.draft;
  const [form, setForm] = createSignal<FlightForm>(formFrom(c.log_date, draft));
  const [sim, setSim] = createSignal<Sim>({
    log_date: c.log_date,
    fstd_type: typeof draft.fstd_type === "string" ? draft.fstd_type : "",
    fstd_qualification: "",
    dur: typeof draft.fstd_min === "number" ? hm(draft.fstd_min) : "",
    remarks: typeof draft.remarks === "string" ? draft.remarks : "",
  });
  const [problems, setProblems] = createSignal<string[]>([]);
  const [dismissing, setDismissing] = createSignal(false);
  const action = createAction(() => props.ctx);
  const confirm = async () => {
    const built = isSim ? simFields(sim()) : flightFields(form());
    setProblems(built.problems);
    if (
      built.fields &&
      (await action.run(
        () => change(props.ctx.host, { action: "confirm", id: c.id, fields: built.fields }),
        props.ctx.at("recorded"),
      ))
    ) {
      props.onDone();
    }
  };
  const later = () =>
    void action.run(
      () =>
        change(props.ctx.host, {
          action: "draft",
          id: c.id,
          fields: Object.fromEntries(
            (
              [
                "flight_no",
                "dep_place",
                "arr_place",
                "aircraft_model",
                "registration",
                "pic_name",
                "remarks",
              ] as const
            ).map((key) => [key, form()[key]]),
          ),
        }),
      props.ctx.at("savedForLater"),
    );
  const dismiss = (reason: string) =>
    void action
      .run(() => change(props.ctx.host, { action: "dismiss", id: c.id, reason }))
      .then((ok) => ok && props.onDone());
  return (
    <div class="nsvx-av__stack">
      <div class="nsvx-av__planned">
        <Badge
          tone={c.planned.actual ? "ok" : "run"}
          label={props.ctx.at(c.planned.actual ? "actual" : "planned")}
        />
        <strong>{c.planned.title ?? ""}</strong>
        <span class="nsvx-av__muted">
          {dayLabel(props.ctx.locale, c.log_date)}
          {c.planned.actual
            ? ` · ${c.planned.start?.slice(11, 16) ?? ""}–${c.planned.end?.slice(11, 16) ?? ""} UTC ${c.planned.registration ?? ""}`
            : ` · ${c.planned.departure_local?.slice(11, 16) ?? "—"}–${c.planned.arrival_local?.slice(11, 16) ?? "—"} ${c.planned.tz ?? ""}`}
        </span>
        <Show when={props.left > 1}>
          <span class="nsvx-av__muted">+{props.left - 1}</span>
        </Show>
      </div>
      <Show
        when={isSim}
        fallback={
          <FlightFields ctx={props.ctx} form={form()} set={setForm} recent={props.recent} />
        }
      >
        <SimFields ctx={props.ctx} sim={sim()} set={setSim} fixedDate />
      </Show>
      <Problems ctx={props.ctx} problems={[...c.problems, ...problems()]} />
      <Note note={action.note()} />
      <div class="nsvx-av__bar">
        <button
          type="button"
          class={["nsvx__button", "nsvx__button--primary"]}
          disabled={action.busy()}
          onClick={() => void confirm()}
        >
          <Icon name="done" />
          <span>{props.ctx.at("confirm")}</span>
        </button>
        <button
          type="button"
          class="nsvx__button"
          disabled={action.busy() || isSim}
          onClick={later}
        >
          {props.ctx.at("later")}
        </button>
        <button
          type="button"
          class={["nsvx__button", "nsvx__button--danger"]}
          onClick={() => setDismissing(!dismissing())}
        >
          {props.ctx.at("notFlown")}
        </button>
      </div>
      <Show when={dismissing()}>
        <div class="nsvx-av__chips" role="group" aria-label={props.ctx.at("notFlown")}>
          <For each={DISMISS} keyed={false}>
            {(key) => (
              <Chip
                on={false}
                label={props.ctx.at(key())}
                onClick={() => dismiss(props.ctx.at(key()))}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
