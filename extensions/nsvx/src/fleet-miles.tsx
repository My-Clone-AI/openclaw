/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { shortDate } from "./finance-data.js";
import { percent, stateTone, type Forecast, type Mileage, type Reading } from "./fleet-data.js";
import { stateLabel } from "./fleet-i18n.js";
import type { Go } from "./fleet-tab.js";
import {
  Block,
  ChangeNote,
  Chip,
  createFleetChange,
  Empty,
  fleetView,
  Glyph,
  type Ctx,
  type FleetChange,
} from "./fleet-ui.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

const km = (value: number | null, locale: string) =>
  value === null ? "—" : `${value.toLocaleString(locale, { maximumFractionDigits: 0 })} km`;

/** One service limit: real km against the limit as a bar, then the forecast date. */
export function ForecastCard(props: { ctx: Ctx; forecast: Forecast; onOpen?: () => void }) {
  const ft = props.ctx.ft;
  const f = () => props.forecast;
  const fill = () => percent(f().actual_km, f().threshold_km);
  const tone = () => (f().state === "reached" ? "bad" : f().state === "forecast" ? "ok" : "warn");
  return (
    <article class={["nsvx-fleet-forecast", `nsvx-fleet-forecast--${tone()}`]}>
      <header class="nsvx-fleet-forecast__head">
        <Glyph name="service" />
        <strong>{f().title}</strong>
        <Show when={props.onOpen}>
          <button
            type="button"
            class="nsvx-fleet-mini-plate nsvx-fleet-link"
            onClick={() => props.onOpen?.()}
          >
            {f().vehicle_label ?? "—"}
          </button>
        </Show>
      </header>
      <Show when={fill() !== null}>
        <div
          class="nsvx-fleet-meter"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={String(Math.round(fill()!))}
          aria-label={ft("limit")}
        >
          <span class="nsvx-fleet-meter__fill" style={{ width: `${fill()}%` }} />
        </div>
      </Show>
      <div class="nsvx-fleet-facts">
        <span>
          <small>{ft("actual")}</small>
          <strong>{km(f().actual_km, props.ctx.host.locale)}</strong>
        </span>
        <span>
          <small>{ft("limit")}</small>
          <strong>{km(f().threshold_km, props.ctx.host.locale)}</strong>
        </span>
        <span>
          <small>{ft("forecast")}</small>
          <strong>
            {f().estimated_on
              ? shortDate(f().estimated_on, props.ctx.host.locale)
              : f().documented_due_on
                ? shortDate(f().documented_due_on, props.ctx.host.locale)
                : "—"}
          </strong>
        </span>
      </div>
      <footer class="nsvx-fleet-forecast__foot">
        <Chip tone={tone()}>{stateLabel(ft, "st_", f().state)}</Chip>
        <Show when={f().remaining_km !== null && f().remaining_km! > 0}>
          <span class="nsvx-row__detail">
            {km(f().remaining_km, props.ctx.host.locale)} {ft("left")}
          </span>
        </Show>
      </footer>
    </article>
  );
}

export function FleetMiles(props: { ctx: Ctx; go: Go }) {
  const ft = props.ctx.ft;
  const fleet = createSource(props.ctx.host, () =>
    fleetView<{ forecasts: Forecast[] }>(props.ctx.host, "fleetForecasts"),
  );
  void fleet.refresh();
  // Urgent first: limit reached, then needs a reading or limit, then the nearest dated forecast.
  const rank = (f: Forecast) => (f.state === "reached" ? 0 : f.state === "forecast" ? 2 : 1);
  return (
    <SourceView source={fleet} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data()
            .forecasts.filter((f) => matches(props.ctx.query, f.title, f.vehicle_label))
            .toSorted(
              (a, b) =>
                rank(a) - rank(b) ||
                (a.estimated_on ?? "9999").localeCompare(b.estimated_on ?? "9999"),
            );
        return (
          <>
            <div class="nsvx-fleet-grid">
              <For each={rows()} keyed={(f) => f.maintenance_id}>
                {(forecast) => (
                  <ForecastCard
                    ctx={props.ctx}
                    forecast={forecast()}
                    onOpen={() => props.go("cars", { kind: "car", id: forecast().vehicle_id })}
                  />
                )}
              </For>
            </div>
            <Show when={rows().length === 0}>
              <Empty icon="miles" text={props.ctx.query ? ft("noResults") : ft("noneYet")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function PendingReading(props: {
  ctx: Ctx;
  vehicleId: string;
  reading: Reading;
  change: FleetChange;
}) {
  const ft = props.ctx.ft;
  const r = () => props.reading;
  const [value, setValue] = createSignal(r().result?.odometer ?? r().original_value ?? "");
  const [unit, setUnit] = createSignal<"km" | "mi">(
    (r().result?.unit ?? r().original_unit) === "mi" ? "mi" : "km",
  );
  const [day, setDay] = createSignal(r().result?.observed_on ?? r().observed_on ?? "");
  const [carOk, setCarOk] = createSignal(false);
  const [doubtsOk, setDoubtsOk] = createSignal(false);
  const issues = () => r().result?.issues ?? [];
  const needsCar = () => !r().result?.plate;
  const ready = () => r().extraction_state === "ready";
  const canConfirm = () =>
    ready() &&
    Boolean(value().trim()) &&
    Boolean(day()) &&
    (!needsCar() || carOk()) &&
    (issues().length === 0 || doubtsOk());
  return (
    <li class="nsvx-fleet-reading">
      <div class="nsvx-fleet-reading__head">
        <Glyph name="docs" />
        <span class="nsvx-row__main">
          <span class="nsvx-row__title">{r().filename}</span>
          <Show when={issues().length > 0}>
            <span class="nsvx-row__detail nsvx-row__detail--bad">{issues().join(" · ")}</span>
          </Show>
        </span>
        <Chip tone={ready() ? "warn" : "run"}>{stateLabel(ft, "st_", r().state)}</Chip>
      </div>
      <Show
        when={ready()}
        fallback={
          <button
            type="button"
            class="nsvx__button"
            disabled={Boolean(props.change.busy()) || !props.ctx.host.connection.canWrite}
            onClick={() =>
              void props.change.run(`retry:${r().id}`, {
                action: "mileageRetry",
                vehicleId: props.vehicleId,
                readingId: r().id,
              })
            }
          >
            <Glyph name="sync" />
            <span>{ft("retry")}</span>
          </button>
        }
      >
        <div class="nsvx-fleet-reading__form">
          <input
            type="text"
            inputmode="decimal"
            aria-label={ft("actual")}
            value={value()}
            onInput={(event) => setValue(event.currentTarget.value)}
          />
          <select
            aria-label="km / mi"
            onChange={(event) => setUnit(event.currentTarget.value === "mi" ? "mi" : "km")}
          >
            <option value="km" selected={unit() === "km"}>
              km
            </option>
            <option value="mi" selected={unit() === "mi"}>
              mi
            </option>
          </select>
          <input
            type="date"
            aria-label={ft("today")}
            value={day()}
            max={new Date().toISOString().slice(0, 10)}
            onInput={(event) => setDay(event.currentTarget.value)}
          />
        </div>
        <div class="nsvx-fleet-reading__checks">
          <Show when={needsCar()}>
            <label class="nsvx-fleet-tick">
              <input
                type="checkbox"
                checked={carOk()}
                onChange={(event) => setCarOk(event.currentTarget.checked)}
              />
              <span>{ft("carChecked")}</span>
            </label>
          </Show>
          <Show when={issues().length > 0}>
            <label class="nsvx-fleet-tick">
              <input
                type="checkbox"
                checked={doubtsOk()}
                onChange={(event) => setDoubtsOk(event.currentTarget.checked)}
              />
              <span>{ft("doubtsCleared")}</span>
            </label>
          </Show>
          <span class="nsvx-fleet-grow" />
          <button
            type="button"
            class="nsvx__button"
            disabled={Boolean(props.change.busy()) || !props.ctx.host.connection.canWrite}
            onClick={() =>
              void props.change.run(`reject:${r().id}`, {
                action: "mileage",
                decision: "reject",
                vehicleId: props.vehicleId,
                readingId: r().id,
                revision: r().revision,
              })
            }
          >
            <Glyph name="close" />
            <span>{ft("reject")}</span>
          </button>
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            disabled={
              !canConfirm() || Boolean(props.change.busy()) || !props.ctx.host.connection.canWrite
            }
            onClick={() =>
              void props.change.run(`confirm:${r().id}`, {
                action: "mileage",
                decision: "confirm",
                vehicleId: props.vehicleId,
                readingId: r().id,
                revision: r().revision,
                value: value().trim(),
                unit: unit(),
                observedOn: day(),
                vehicleConfirmed: carOk(),
                issuesResolved: doubtsOk(),
              })
            }
          >
            <Glyph name="check" />
            <span>{ft("confirm")}</span>
          </button>
        </div>
      </Show>
    </li>
  );
}

/** A car's service forecasts and the readings that still need the owner's word. */
export function VehicleMileage(props: { ctx: Ctx; vehicleId: string }) {
  const ft = props.ctx.ft;
  const mileage = createSource(props.ctx.host, () =>
    fleetView<Mileage>(props.ctx.host, "fleetMileage", { id: props.vehicleId }),
  );
  void mileage.refresh();
  const change = createFleetChange(props.ctx, mileage.refresh);
  return (
    <Block icon="miles" title={ft("miles")}>
      <SourceView source={mileage} t={props.ctx.t}>
        {(data) => {
          const pending = () => data().readings.filter((r) => r.state === "pending");
          const done = () =>
            data()
              .readings.filter((r) => r.state !== "pending")
              .slice(0, 6);
          return (
            <>
              <div class="nsvx-fleet-grid">
                <For each={data().forecasts} keyed={(f) => f.maintenance_id}>
                  {(forecast) => <ForecastCard ctx={props.ctx} forecast={forecast()} />}
                </For>
              </div>
              <Show when={pending().length > 0}>
                <ul class="nsvx-list">
                  <For each={pending()} keyed={(r) => `${r.id}:${r.revision}`}>
                    {(reading) => (
                      <PendingReading
                        ctx={props.ctx}
                        vehicleId={props.vehicleId}
                        reading={reading()}
                        change={change}
                      />
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={done().length > 0}>
                <ul class="nsvx-list">
                  <For each={done()} keyed={(r) => r.id}>
                    {(reading) => (
                      <li class="nsvx-row">
                        <Glyph name="miles" class="nsvx-row__icon" />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">
                            {reading().km
                              ? `${Number(reading().km).toLocaleString(props.ctx.host.locale)} km`
                              : "—"}
                          </span>
                          <span class="nsvx-row__detail">
                            {shortDate(reading().observed_on, props.ctx.host.locale)} ·{" "}
                            {reading().filename}
                          </span>
                        </span>
                        <Chip tone={stateTone(reading().state === "accepted" ? "done" : "failed")}>
                          {stateLabel(ft, "st_", reading().state)}
                        </Chip>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={data().forecasts.length === 0 && data().readings.length === 0}>
                <Empty icon="miles" text={ft("noneYet")} />
              </Show>
              <ChangeNote change={change} />
            </>
          );
        }}
      </SourceView>
    </Block>
  );
}
