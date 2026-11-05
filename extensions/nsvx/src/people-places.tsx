/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  byYear,
  CONSENT_CATEGORIES,
  eventDate,
  mapLayout,
  type DatePrecision,
  type GeoFeature,
  type Places,
  type Visit,
} from "./people-data.js";
import type { PeopleKey, PT } from "./people-i18n.js";
import { ConfirmBar, createChange, IconButton, Note, Section, Switch } from "./people-ui.js";
import type { Base } from "./people-ui.js";
import { age, createSource, Icon, SourceView } from "./ui-kit.js";

// ---------- places ----------

const VENUES = [
  { id: "city", key: "city" },
  { id: "restaurant", key: "restaurant" },
  { id: "public_venue", key: "venue" },
] as const;
const PRECISIONS: { id: DatePrecision; key: PeopleKey; input: string }[] = [
  { id: "day", key: "day", input: "date" },
  { id: "month", key: "month", input: "month" },
  { id: "year", key: "year", input: "number" },
  { id: "unknown", key: "noDate", input: "" },
];
const CATEGORY_KEY: Record<string, PeopleKey> = {
  profile: "profileCat",
  history: "historyCat",
  photos: "photosCat",
  followup: "followupCat",
};
const MAP = { width: 340, height: 200, pad: 36 };

export function PlacesSection(props: Base & { personId: string; locale: string }) {
  const places = createSource(props.host, () =>
    props.host.request<Places>("nsvx.view", {
      view: "personPlaces",
      params: { id: props.personId },
    }),
  );
  void places.refresh();
  const change = createChange(props.host, props.pt, () => places.refresh());
  const [adding, setAdding] = createSignal(false);
  const [settings, setSettings] = createSignal(false);
  const [erasing, setErasing] = createSignal(false);
  const [selected, setSelected] = createSignal<string>();
  const category = (name: string, on: boolean) =>
    void change.run(name, "nsvx.people.change", {
      action: "placesCategory",
      personId: props.personId,
      category: name,
      on,
    });
  return (
    <Section
      icon="pin"
      title={props.pt("places")}
      count={places.state().data?.summary?.count}
      action={
        <Show when={places.state().data?.grants.history?.granted}>
          <IconButton
            icon="plus"
            label={props.pt("place")}
            pressed={adding()}
            onClick={() => setAdding(!adding())}
          />
        </Show>
      }
    >
      <SourceView source={places} t={props.t}>
        {(p) => (
          <>
            <Show
              when={p().grants.history?.granted}
              fallback={
                <div class="nsvx-ppl-off">
                  <Icon name="pause" />
                  <span>{props.pt("placesOff")}</span>
                  <button
                    type="button"
                    class="nsvx__button"
                    onClick={() => category("history", true)}
                  >
                    {props.pt("turnOn")}
                  </button>
                </div>
              }
            >
              <Show when={adding()}>
                <VisitForm
                  pt={props.pt}
                  busy={change.busy() !== undefined}
                  onSave={(body) =>
                    void change.run(
                      "propose",
                      "nsvx.people.change",
                      { action: "placesPropose", personId: props.personId, ...body },
                      () => setAdding(false),
                    )
                  }
                />
              </Show>
              <Show when={p().summary?.last}>
                {(last) => (
                  <Show when={last().visit}>
                    {(visit) => (
                      <div class="nsvx-ppl-last">
                        <Icon name="pin" />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__detail">{props.pt("lastVisit")}</span>
                          <strong>{placeName(visit())}</strong>
                          <span class="nsvx-row__detail">
                            {eventDate(
                              visit().event_date,
                              visit().event_date_precision,
                              props.locale,
                            )}{" "}
                            · {props.pt("notNow")}
                          </span>
                        </span>
                      </div>
                    )}
                  </Show>
                )}
              </Show>
              <PlacesMap
                features={p().summary?.geojson.features ?? []}
                selected={selected()}
                onSelect={setSelected}
              />
              <For each={byYear(p().visits?.items ?? [])}>
                {(group) => (
                  <>
                    <h4 class="nsvx-ppl-year">{group.year ?? props.pt("noDate")}</h4>
                    <ul class="nsvx-list">
                      <For each={group.items}>
                        {(visit) => (
                          <VisitRow
                            pt={props.pt}
                            locale={props.locale}
                            visit={visit}
                            selected={selected() === visit.id}
                            busy={change.busy() !== undefined}
                            onHide={() =>
                              void change.run("hide", "nsvx.people.change", {
                                action: "placesHide",
                                personId: props.personId,
                                visitId: visit.id,
                              })
                            }
                          />
                        )}
                      </For>
                    </ul>
                  </>
                )}
              </For>
            </Show>
            <Show when={p().fields && Object.keys(p().fields ?? {}).length > 0}>
              <dl class="nsvx-ppl-about">
                <For each={Object.entries(p().fields ?? {})}>
                  {([name, field]) => (
                    <div>
                      <dt>{name.replaceAll("_", " ")}</dt>
                      <dd>{field.state === "declined" ? "—" : field.value}</dd>
                    </div>
                  )}
                </For>
              </dl>
            </Show>
            <Show when={(p().photos ?? []).length > 0}>
              <div class="nsvx-ppl-photos">
                <For each={(p().photos ?? []).slice(0, 6)}>
                  {(photo) => (
                    <PlacePhoto host={props.host} personId={props.personId} photoId={photo.id} />
                  )}
                </For>
              </div>
            </Show>
            <Show when={p().erasure}>
              {(erasure) => (
                <p class="nsvx__chip">
                  {props.pt(
                    erasure().status === "done"
                      ? "erased"
                      : erasure().status === "partial"
                        ? "partlyErased"
                        : "erasing",
                  )}{" "}
                  · {age(erasure().created_at)}
                </p>
              )}
            </Show>
            <button
              type="button"
              class="nsvx__button nsvx-more"
              aria-expanded={settings() ? "true" : "false"}
              onClick={() => setSettings(!settings())}
            >
              <Icon name="lock" />
              {props.pt("keep")}
            </button>
            <Show when={settings()}>
              <div class="nsvx-ppl-switches">
                <For each={CONSENT_CATEGORIES}>
                  {(c) => (
                    <Switch
                      label={props.pt(CATEGORY_KEY[c] ?? "profileCat")}
                      on={p().grants[c]?.granted === true}
                      disabled={change.busy() !== undefined}
                      onChange={(on) => category(c, on)}
                    />
                  )}
                </For>
              </div>
              <Show
                when={erasing()}
                fallback={
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--danger"
                    onClick={() => setErasing(true)}
                  >
                    <Icon name="trash" />
                    {props.pt("eraseAll")}
                  </button>
                }
              >
                <ConfirmBar
                  pt={props.pt}
                  text={props.pt("sure")}
                  label={props.pt("eraseAll")}
                  busy={change.busy() !== undefined}
                  onCancel={() => setErasing(false)}
                  onConfirm={() => {
                    setErasing(false);
                    void change.run("erase", "nsvx.people.change", {
                      action: "placesErase",
                      personId: props.personId,
                    });
                  }}
                />
              </Show>
            </Show>
            <Note change={change} />
          </>
        )}
      </SourceView>
    </Section>
  );
}

const placeName = (v: Visit) =>
  v.city && v.city !== v.place_label ? `${v.place_label}, ${v.city}` : v.place_label;

function VisitRow(props: {
  pt: PT;
  locale: string;
  visit: Visit;
  selected: boolean;
  busy: boolean;
  onHide: () => void;
}) {
  return (
    <li
      id={`nsvx-visit-${props.visit.id}`}
      class={[
        "nsvx-row",
        { "nsvx-ppl--past": props.visit.state === "hidden", "nsvx-ppl-visit--on": props.selected },
      ]}
    >
      <Icon name="pin" class={["nsvx__icon", "nsvx-ppl-visit__pin"]} />
      <span class="nsvx-row__main">
        <span class="nsvx-row__title">{placeName(props.visit)}</span>
        <span class="nsvx-row__detail">
          {eventDate(props.visit.event_date, props.visit.event_date_precision, props.locale)}
          <Show when={props.visit.state === "proposed"}> · {props.pt("toConfirm")}</Show>
          <Show when={props.visit.state === "hidden"}> · {props.pt("hidden")}</Show>
        </span>
      </span>
      <Show when={props.visit.state !== "hidden"}>
        <IconButton
          icon="hide"
          label={props.pt("hide")}
          disabled={props.busy}
          onClick={props.onHide}
        />
      </Show>
    </li>
  );
}

/** Schematic map of the declared city points; the list below has the same facts. */
function PlacesMap(props: {
  features: GeoFeature[];
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  const layout = createMemo(() => mapLayout(props.features, MAP.width, MAP.height, MAP.pad));
  return (
    <Show when={layout().points.length > 0}>
      <svg class="nsvx-ppl-map" viewBox={`0 0 ${MAP.width} ${MAP.height}`} role="group">
        <rect class="nsvx-ppl-map__bg" width={MAP.width} height={MAP.height} rx="12" />
        <For each={layout().lines}>
          {(line) => (
            <line class="nsvx-ppl-map__seq" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          )}
        </For>
        <For each={layout().points}>
          {(point) => (
            <g
              class={["nsvx-ppl-map__pt", { "nsvx-ppl-map__pt--on": props.selected === point.id }]}
              role="button"
              tabindex="0"
              aria-label={point.label}
              onClick={() => {
                props.onSelect(point.id);
                document
                  .getElementById(`nsvx-visit-${point.id}`)
                  ?.scrollIntoView({ block: "nearest" });
              }}
            >
              <circle cx={point.x} cy={point.y} r="7" />
              <text x={point.x} y={point.y - 12} text-anchor="middle">
                {point.label.length > 16 ? `${point.label.slice(0, 15)}…` : point.label}
              </text>
            </g>
          )}
        </For>
      </svg>
    </Show>
  );
}

function PlacePhoto(props: { host: ControlUiHost; personId: string; photoId: string }) {
  const image = createSource(props.host, () =>
    props.host.request<{ src: string }>("nsvx.view", {
      view: "personPhoto",
      params: { id: props.personId, photo: props.photoId },
    }),
  );
  void image.refresh();
  return (
    <Show when={image.state().data?.src}>
      {(src) => <img class="nsvx-ppl-photo" src={src()} alt="" loading="lazy" />}
    </Show>
  );
}

function VisitForm(props: {
  pt: PT;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [venue, setVenue] = createSignal<(typeof VENUES)[number]["id"]>("city");
  const [place, setPlace] = createSignal("");
  const [city, setCity] = createSignal("");
  const [precision, setPrecision] = createSignal<DatePrecision>("day");
  const [date, setDate] = createSignal("");
  // One key per intended visit: a repeated save after an uncertain answer is deduped by NSVX.
  const key = crypto.randomUUID();
  const input = () => PRECISIONS.find((p) => p.id === precision())?.input ?? "";
  return (
    <form
      class="nsvx-ppl-form"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave({
          key,
          venue: venue(),
          place: venue() === "city" ? null : place(),
          city: city(),
          date: precision() === "unknown" ? null : date(),
        });
      }}
    >
      <div class="nsvx-segment" role="radiogroup">
        <For each={VENUES}>
          {(v) => (
            <button
              type="button"
              aria-pressed={venue() === v.id ? "true" : "false"}
              onClick={() => setVenue(v.id)}
            >
              {props.pt(v.key)}
            </button>
          )}
        </For>
      </div>
      <Show when={venue() !== "city"}>
        <input
          class="nsvx__search"
          placeholder={props.pt("name")}
          aria-label={props.pt("name")}
          maxlength={120}
          value={place()}
          onInput={(event) => setPlace(event.currentTarget.value)}
        />
      </Show>
      <input
        class="nsvx__search"
        placeholder={props.pt("city")}
        aria-label={props.pt("city")}
        autocomplete="address-level2"
        maxlength={80}
        value={city()}
        onInput={(event) => setCity(event.currentTarget.value)}
      />
      <div class="nsvx-segment" role="radiogroup" aria-label={props.pt("when")}>
        <For each={PRECISIONS}>
          {(p) => (
            <button
              type="button"
              aria-pressed={precision() === p.id ? "true" : "false"}
              onClick={() => {
                setPrecision(p.id);
                setDate("");
              }}
            >
              {props.pt(p.key)}
            </button>
          )}
        </For>
      </div>
      <Show when={input()}>
        <input
          class="nsvx__search"
          type={input()}
          aria-label={props.pt("when")}
          min={input() === "number" ? 1900 : undefined}
          max={input() === "number" ? new Date().getFullYear() : undefined}
          value={date()}
          onInput={(event) => setDate(event.currentTarget.value)}
        />
      </Show>
      <button
        type="submit"
        class="nsvx__button nsvx__button--primary"
        disabled={props.busy || (!city().trim() && !place().trim())}
      >
        <Icon name="done" />
        {props.pt("save")}
      </button>
    </form>
  );
}
