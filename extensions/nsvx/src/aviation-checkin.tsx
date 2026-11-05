/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { CHECKIN_TONE, checkinActions, type Checkin } from "./aviation-data.js";
import { Badge, change, createAction, lisbonTime, type AvCtx } from "./aviation-kit.js";
import { ConfirmButton, Note, view } from "./device-kit.js";
import { every } from "./messages-ui.js";
import { createSource, Icon, matches, SourceView } from "./ui-kit.js";

type CheckinsData = {
  checkins: Checkin[];
  passenger_profile?: { surname?: string; first_name?: string };
};
type Airline = { code: string; name: string };

/**
 * NSVX auto check-in: a booking reference and airline; NSVX finds the booking, checks in when the window opens,
 * picks a free window seat, and files each boarding pass in Drive. It never pays; a paid seat is only a decision.
 */
export function CheckinView(props: { ctx: AvCtx; onDoc: (id: string) => void }) {
  const source = createSource(props.ctx.host, () =>
    view<CheckinsData>(props.ctx.host, "aviationCheckins"),
  );
  const airlines = createSource(props.ctx.host, () =>
    view<{ airlines: Airline[] }>(props.ctx.host, "aviationAirlines", { q: "" }),
  );
  void source.refresh();
  void airlines.refresh();
  // NSVX's screen polls every 15 s; a running check-in changes state within seconds.
  every(15_000, () => {
    if (source.state().data?.checkins.some((row) => row.status === "running")) {
      void source.refresh();
    }
  });
  const [pnr, setPnr] = createSignal("");
  const [airline, setAirline] = createSignal("");
  const [surname, setSurname] = createSignal("");
  const [firstName, setFirstName] = createSignal("");
  const action = createAction(() => props.ctx);
  const profile = () => source.state().data?.passenger_profile;
  const valid = () =>
    /^[A-Za-z0-9]{5,8}$/.test(pnr().trim()) &&
    airline().trim().length > 0 &&
    (Boolean(profile()?.surname) || surname().trim().length > 0);
  const schedule = () =>
    void action
      .run(
        () =>
          change(props.ctx.host, {
            action: "checkin",
            pnr: pnr().trim().toUpperCase(),
            airline: airline().trim(),
            ...(surname().trim() ? { surname: surname().trim() } : {}),
            ...(firstName().trim() ? { firstName: firstName().trim() } : {}),
          }),
        props.ctx.at("scheduled"),
      )
      .then((ok) => {
        // Even an uncertain answer reloads: NSVX's list shows whether the check-in exists.
        void source.refresh();
        if (ok) {
          setPnr("");
          setAirline("");
          setSurname("");
          setFirstName("");
        }
      });
  const control = (id: string, what: "cancelCheckin" | "retryCheckin") =>
    void action
      .run(() => change(props.ctx.host, { action: what, id }))
      .then(() => source.refresh());
  return (
    <div class="nsvx-av__stack">
      <form
        class="nsvx-av__panel"
        aria-label={props.ctx.at("checkin")}
        onSubmit={(event) => {
          event.preventDefault();
          if (valid() && !action.busy()) {
            schedule();
          }
        }}
      >
        <div class="nsvx-av__fields">
          <label class="nsvx-field">
            <span>{props.ctx.at("booking")}</span>
            <input
              value={pnr()}
              maxlength={8}
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
              placeholder="ABC123"
              onInput={(event) => setPnr(event.currentTarget.value.toUpperCase())}
            />
          </label>
          <label class="nsvx-field">
            <span>{props.ctx.at("airline")}</span>
            <input
              value={airline()}
              maxlength={100}
              list="nsvx-av-airlines"
              placeholder="TAP"
              onInput={(event) => setAirline(event.currentTarget.value)}
            />
          </label>
          <label class="nsvx-field">
            <span>{props.ctx.at("surname")}</span>
            <input
              value={surname()}
              maxlength={100}
              autocomplete="family-name"
              placeholder={profile()?.surname ?? ""}
              onInput={(event) => setSurname(event.currentTarget.value)}
            />
          </label>
          <label class="nsvx-field">
            <span>{props.ctx.at("firstName")}</span>
            <input
              value={firstName()}
              maxlength={100}
              autocomplete="given-name"
              placeholder={profile()?.first_name ?? ""}
              onInput={(event) => setFirstName(event.currentTarget.value)}
            />
          </label>
        </div>
        <datalist id="nsvx-av-airlines">
          <For each={airlines.state().data?.airlines ?? []} keyed={(a) => a.code}>
            {(a) => <option value={a().name}>{a().code}</option>}
          </For>
        </datalist>
        <div class="nsvx-av__bar">
          <span class="nsvx-av__muted">
            <Icon name="lock" /> {props.ctx.at("noPayments")}
          </span>
          <button
            type="submit"
            class={["nsvx__button", "nsvx__button--primary"]}
            disabled={!valid() || action.busy() || !props.ctx.host.connection.canWrite}
          >
            <Icon name="plane" />
            <span>{props.ctx.at("schedule")}</span>
          </button>
        </div>
        <Note note={action.note()} />
      </form>
      <SourceView source={source} t={props.ctx.t}>
        {(data) => (
          <Show
            when={data().checkins.length > 0}
            fallback={<p class="nsvx__empty">{props.ctx.at("noCheckins")}</p>}
          >
            <ul class="nsvx-av__checkins">
              <For
                each={data().checkins.filter((row) =>
                  matches(props.ctx.query, row.pnr, row.airline_code),
                )}
                keyed={(row) => row.id}
              >
                {(row) => (
                  <li class="nsvx-av__checkin">
                    <div class="nsvx-av__bar">
                      <strong class="nsvx-av__pnr">
                        <Icon name="plane" /> {row().airline_code} · {row().pnr}
                      </strong>
                      <Badge
                        tone={CHECKIN_TONE[row().status]}
                        label={props.ctx.at(`ci_${row().status}`)}
                      />
                    </div>
                    <Show when={row().flight_legs.length > 0}>
                      <div class="nsvx-av__legs">
                        <For each={row().flight_legs} keyed={false}>
                          {(leg) => (
                            <span class="nsvx-av__leg">
                              <strong>{leg().origin}</strong>
                              <Icon name="plane" />
                              <strong>{leg().destination}</strong>
                              <Show when={leg().flight_no}>
                                <span class="nsvx-av__muted">{leg().flight_no}</span>
                              </Show>
                            </span>
                          )}
                        </For>
                      </div>
                    </Show>
                    <Show
                      when={
                        row().scheduled_for &&
                        (row().status === "scheduled" || row().status === "waiting_window")
                      }
                    >
                      <span class="nsvx-av__muted">
                        <Icon name="history" />{" "}
                        {lisbonTime(props.ctx.locale, row().scheduled_for ?? "")}
                      </span>
                    </Show>
                    <Show when={row().seat_chosen?.length}>
                      <span>
                        {props.ctx.at("seat")}:{" "}
                        {row()
                          .seat_chosen?.map((seat) => seat.seat ?? props.ctx.at("autoSeat"))
                          .join(" · ")}
                      </span>
                    </Show>
                    <Show
                      when={
                        row().pending_owner_item &&
                        row().status !== "needs_owner" &&
                        row().status !== "needs_approval"
                      }
                    >
                      <Badge tone="warn" label={props.ctx.at("ci_needs_approval")} />
                    </Show>
                    <div class="nsvx-av__bar">
                      <For each={row().boarding_passes} keyed={(pass) => pass.drive_file_id}>
                        {(pass) => (
                          <button
                            type="button"
                            class="nsvx__button"
                            title={pass().name}
                            onClick={() => props.onDoc(pass().drive_file_id)}
                          >
                            <Icon name="doc" />
                            <span>
                              {props.ctx.at("boardingPass")}
                              {row().boarding_passes.length > 1 ? ` ${pass().leg_index + 1}` : ""}
                            </span>
                          </button>
                        )}
                      </For>
                      <button
                        type="button"
                        class="nsvx__button"
                        onClick={() => props.ctx.onMission(row().mission_id)}
                      >
                        <Icon name="task" />
                        <span>{props.ctx.at("task")}</span>
                      </button>
                      <Show when={checkinActions(row().status).retry}>
                        <button
                          type="button"
                          class="nsvx__button"
                          disabled={action.busy()}
                          onClick={() => control(row().id, "retryCheckin")}
                        >
                          <Icon name="refresh" />
                          <span>{props.ctx.at("retry")}</span>
                        </button>
                      </Show>
                      <Show when={checkinActions(row().status).cancel}>
                        <ConfirmButton
                          label={props.ctx.at("stop")}
                          confirm={props.ctx.at("stop")}
                          cancel={props.ctx.at("keep")}
                          icon="stop"
                          danger
                          disabled={action.busy()}
                          onConfirm={() => control(row().id, "cancelCheckin")}
                        />
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        )}
      </SourceView>
    </div>
  );
}
