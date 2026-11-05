/** @jsxImportSource @solidjs/web */
import { createSignal, For, onCleanup, Show } from "solid-js";
import {
  blankDraft,
  blankRegister,
  READING_BUSY,
  READING_LOCKED,
  readingReady,
  type MeterDraft,
  type Reading,
  type Readings,
  type Register,
} from "./business-data.js";
import type { BusinessKey } from "./business-i18n.js";
import {
  businessView,
  Chip,
  createAction,
  dataUrl,
  Glyph,
  NoteLine,
  toUpload,
  when,
  type Ctx,
  type FileAnswer,
  type Upload,
} from "./business-ui.js";
import { createSource, SourceView } from "./ui-kit.js";

const POLL_MAX = 60;

function readingTone(state: string) {
  return state === "accepted"
    ? "ok"
    : READING_BUSY.has(state)
      ? "busy"
      : state === "rejected"
        ? "bad"
        : state === "cancelled"
          ? "off"
          : "warn";
}

/** Records from the microphone; the clip goes to NSVX's own speech-to-text, which only fills the draft. */
export function createRecorder(onClip: (clip: Upload) => void) {
  const [recording, setRecording] = createSignal(false);
  let recorder: MediaRecorder | undefined;
  const stop = () => recorder?.stop();
  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      setRecording(false);
      for (const track of stream.getTracks()) {
        track.stop();
      }
      const type = recorder?.mimeType.split(";")[0] || "audio/webm";
      const blob = new Blob(chunks, { type });
      void toUpload(new File([blob], `reading.${type.includes("mp4") ? "m4a" : "webm"}`, { type })).then(onClip);
    };
    recorder.start();
    setRecording(true);
  };
  onCleanup(() => {
    if (recorder?.state === "recording") {
      recorder.stop();
    }
  });
  return { recording, start, stop };
}

/** Meter readings: photo of the meter, NSVX reads it, the owner checks three things, then confirms one send. */
export function MeterReadings(props: { ctx: Ctx; onEndesa: () => void }) {
  const b = props.ctx.b;
  const host = props.ctx.host;
  const overview = createSource(host, () => businessView<Readings>(host, "readings"));
  const act = createAction(() => props.ctx);
  const [reading, setReading] = createSignal<Reading>();
  const [draft, setDraft] = createSignal<MeterDraft>(blankDraft());
  const [dirty, setDirty] = createSignal(false);
  const [photo, setPhoto] = createSignal<string>();
  const [turn, setTurn] = createSignal(0);
  const [heard, setHeard] = createSignal("");
  let disposed = false;
  let polls = 0;
  onCleanup(() => {
    disposed = true;
  });
  const request = <V,>(op: string, extra: Record<string, unknown> = {}) =>
    host.request<V>("nsvx.business.reading", { op, ...extra });
  const poll = (id: string) =>
    setTimeout(() => {
      if (disposed || host.signal.aborted || reading()?.id !== id) {
        return;
      }
      void businessView<Reading>(host, "reading", { id }).then(show, () => undefined);
    }, 2000);
  const show = (next: Reading) => {
    const fresh = reading()?.id !== next.id;
    setReading(next);
    setDraft({ ...blankDraft(), ...next.draft });
    setDirty(false);
    if (fresh) {
      polls = 0;
      setPhoto(undefined);
      setTurn(0);
      setHeard("");
      void host
        .request<FileAnswer>("nsvx.business.file", { name: "readingImage", params: { id: next.id } })
        .then((file) => reading()?.id === next.id && setPhoto(dataUrl(file)), () => undefined);
    }
    if (READING_BUSY.has(next.state) && polls++ < POLL_MAX) {
      poll(next.id);
    }
  };
  const load = async () => {
    await overview.refresh();
    const first = overview.state().data?.readings[0];
    if (!reading() && first) {
      show(first);
    }
  };
  void load();
  const change = (patch: Partial<MeterDraft>) => {
    setDraft({ ...draft(), ...patch });
    setDirty(true);
  };
  const setRegister = (index: number, patch: Partial<Register>) =>
    change({
      registers: draft().registers.map((r, i) => (i === index ? { ...r, ...patch } : r)),
      values_confirmed: false,
    });
  const save = async () => {
    const current = reading();
    if (!current || !dirty()) {
      return current;
    }
    const saved = await request<Reading>("edit", {
      id: current.id,
      revision: current.revision,
      draft: draft(),
    });
    show(saved);
    return saved;
  };
  const step = (op: string, done?: BusinessKey) =>
    void act.run(async () => {
      const current = op === "prepare" ? await save() : reading();
      if (current) {
        show(await request<Reading>(op, { id: current.id, revision: current.revision }));
      }
    }, done);
  const capture = (file: File | undefined) => {
    if (!file) {
      return;
    }
    void act.run(async () => {
      await save();
      show(await request<Reading>("upload", { file: await toUpload(file) }));
      await overview.refresh();
    });
  };
  const voice = createRecorder((clip) => {
    const current = reading();
    if (!current) {
      return;
    }
    void act.run(async () => {
      const heardDraft = await request<{ draft: MeterDraft; text: string }>("voice", {
        id: current.id,
        file: clip,
      });
      if (reading()?.revision === current.revision) {
        change({ ...heardDraft.draft, identity_confirmed: false, date_confirmed: false, values_confirmed: false });
        setHeard(heardDraft.text);
      }
    });
  });
  const locked = () => act.busy() || !reading() || READING_LOCKED.has(reading()!.state) || voice.recording();
  const busy = () => Boolean(reading() && READING_BUSY.has(reading()!.state));
  const picker = (camera: boolean) => (
    <label class={["nsvx__button", { "nsvx__button--primary": camera }]}>
      <Glyph name={camera ? "camera" : "file"} />
      {b(camera ? "photo" : "open")}
      <input
        type="file"
        class="nsvx-biz__file"
        aria-label={b(camera ? "photo" : "open")}
        accept={camera ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
        capture={camera ? "environment" : undefined}
        disabled={act.busy() || busy()}
        onChange={(event) => {
          capture(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
  return (
    <section class="nsvx-biz__card nsvx-biz__card--wide" aria-label={b("readings")}>
      <header class="nsvx-biz__head">
        <Glyph name="readings" />
        <strong class="nsvx-biz__name">{b("readings")}</strong>
        <Show when={reading()}>
          {(r) => <Chip tone={readingTone(r().state)}>{b(`meter_${r().state}` as BusinessKey)}</Chip>}
        </Show>
      </header>
      <div class="nsvx-biz__row">
        {picker(true)}
        {picker(false)}
      </div>
      <NoteLine note={act.note()} />
      <SourceView source={overview} t={props.ctx.t}>
        {(data) => (
          <>
            <For each={data().providers.filter((p) => !p.supported)} keyed={(p) => p.id}>
              {(p) => (
                <p class="nsvx-biz__muted">
                  {p().label} · {b("sendOff")}
                </p>
              )}
            </For>
            <Show when={data().readings.length > 1}>
              <select
                class="nsvx-biz__input"
                aria-label={b("saved")}
                disabled={dirty() || busy()}
                value={reading()?.id ?? ""}
                onChange={(event) => {
                  const next = data().readings.find((r) => r.id === event.currentTarget.value);
                  if (next) {
                    show(next);
                  }
                }}
              >
                <For each={data().readings} keyed={(r) => r.id}>
                  {(r) => (
                    <option value={r().id}>
                      {r().draft.reading_date ?? when(props.ctx.locale, r().created_at)} · {b(`meter_${r().state}` as BusinessKey)}
                    </option>
                  )}
                </For>
              </select>
            </Show>
            <Show
              when={reading()}
              fallback={
                <div class="nsvx-biz__empty">
                  <Glyph name="camera" class="nsvx-biz__hero" />
                  <span>{b("meterHint")}</span>
                </div>
              }
            >
              {(r) => (
                <div class="nsvx-biz__meter-grid">
                  <figure class="nsvx-biz__photo">
                    <Show when={photo()} fallback={<span class="nsvx-biz__muted">{b("loading")}</span>}>
                      {(src) => <img src={src()} alt={b("meterPhoto")} style={{ transform: `rotate(${turn()}deg)` }} />}
                    </Show>
                    <button type="button" class="nsvx__button nsvx__button--icon" aria-label={b("rotate")} onClick={() => setTurn((turn() + 90) % 360)}>
                      <Glyph name="rotate" />
                    </button>
                  </figure>
                  <form class="nsvx-biz__form" aria-label={b("check")} onSubmit={(event) => event.preventDefault()}>
                    <Show when={r().state !== "accepted"}>
                      <button
                        type="button"
                        class="nsvx__button"
                        disabled={(locked() || dirty()) && !voice.recording()}
                        aria-label={voice.recording() ? b("stop") : b("voice")}
                        onClick={() => (voice.recording() ? voice.stop() : void act.run(voice.start))}
                      >
                        <Glyph name={voice.recording() ? "stop" : "mic"} />
                        {voice.recording() ? b("stop") : b("voice")}
                      </button>
                      <Show when={heard()}>
                        <p class="nsvx-biz__muted">“{heard()}”</p>
                      </Show>
                      <fieldset class="nsvx-biz__fields" disabled={locked()}>
                        <label>
                          {b("place")}
                          <select
                            class="nsvx-biz__input"
                            value={draft().installation_id ?? ""}
                            onChange={(event) => change({ installation_id: event.currentTarget.value || null, identity_confirmed: false })}
                          >
                            <option value="">—</option>
                            <For each={data().installations} keyed={(i) => i.id}>
                              {(i) => <option value={i().id}>{i().label} · {i().id}</option>}
                            </For>
                          </select>
                        </label>
                        <Show when={data().installations.length === 0}>
                          <button type="button" class="nsvx__button" onClick={() => props.onEndesa()}>
                            <Glyph name="plug" />
                            Endesa
                          </button>
                        </Show>
                        <label>
                          {b("meter")}
                          <input
                            class="nsvx-biz__input"
                            autocomplete="off"
                            value={draft().serial ?? ""}
                            onInput={(event) => change({ serial: event.currentTarget.value || null, serial_certain: false, identity_confirmed: false })}
                          />
                        </label>
                        <label>
                          {b("date")}
                          <input
                            class="nsvx-biz__input"
                            type="date"
                            value={draft().reading_date ?? ""}
                            onInput={(event) => change({ reading_date: event.currentTarget.value || null, date_certain: false, date_confirmed: false })}
                          />
                        </label>
                        <For each={draft().registers} keyed={false}>
                          {(reg, index) => (
                            <div class="nsvx-biz__register" role="group" aria-label={`${b("register")} ${index + 1}`}>
                              <input class="nsvx-biz__input" aria-label={`${b("register")} ${index + 1}`} placeholder="1.8.1" value={reg().code} onInput={(event) => setRegister(index, { code: event.currentTarget.value, code_certain: false })} />
                              <input class="nsvx-biz__input" aria-label={`${b("value")} ${index + 1}`} inputmode="decimal" value={reg().display} onInput={(event) => setRegister(index, { display: event.currentTarget.value, certain: false })} />
                              <select class="nsvx-biz__input" aria-label={`${b("decimal")} ${index + 1}`} value={reg().decimal} onChange={(event) => setRegister(index, { decimal: event.currentTarget.value as Register["decimal"], decimal_certain: false })}>
                                <option value="unknown">—</option>
                                <option value="integer">123</option>
                                <option value="comma">123,4</option>
                                <option value="dot">123.4</option>
                              </select>
                              <select class="nsvx-biz__input" aria-label={`${b("unit")} ${index + 1}`} value={reg().unit} onChange={(event) => setRegister(index, { unit: event.currentTarget.value as Register["unit"], unit_certain: false })}>
                                <option value="unknown">—</option>
                                <option value="kWh">kWh</option>
                                <option value="m3">m³</option>
                              </select>
                              <button type="button" class="nsvx__button nsvx__button--icon" aria-label={`${b("remove")} ${index + 1}`} onClick={() => change({ registers: draft().registers.filter((_, i) => i !== index), values_confirmed: false })}>
                                <Glyph name="trash" />
                              </button>
                            </div>
                          )}
                        </For>
                        <Show when={draft().registers.length < 12}>
                          <button type="button" class="nsvx__button" onClick={() => change({ registers: [...draft().registers, blankRegister()], values_confirmed: false })}>
                            <Glyph name="plus" />
                            {b("register")}
                          </button>
                        </Show>
                        <For each={["identity_confirmed", "date_confirmed", "values_confirmed"] as const} keyed={false}>
                          {(key) => (
                            <label class="nsvx-biz__tick">
                              <input type="checkbox" checked={draft()[key()]} onChange={(event) => change({ [key()]: event.currentTarget.checked })} />
                              {b(key())}
                            </label>
                          )}
                        </For>
                      </fieldset>
                    </Show>
                    <ul class="nsvx-biz__flags" aria-live="polite">
                      <For each={r().flags} keyed={(f) => f.code}>
                        {(flag) => <li class={{ "nsvx-biz__flag--bad": flag().blocking }}>⚠ {flag().text}</li>}
                      </For>
                    </ul>
                    <Show when={!dirty() && r().confirmation}>
                      {(c) => (
                        <div class="nsvx-biz__confirm" role="group" aria-label={b("send")}>
                          <strong>
                            {c().summary.provider} · {c().summary.installation_id}
                          </strong>
                          <span>{c().summary.date}</span>
                          <For each={c().summary.registers} keyed={(x) => x.code}>
                            {(x) => (
                              <span>
                                {x().code} · <b>{x().value}</b> {x().unit}
                              </span>
                            )}
                          </For>
                          <button
                            type="button"
                            class="nsvx__button nsvx__button--primary"
                            disabled={act.busy()}
                            onClick={() =>
                              void act.run(async () =>
                                show(await request<Reading>("confirm", { id: r().id, revision: r().revision, binding: c().binding })),
                              )
                            }
                          >
                            <Glyph name="check" />
                            {b("confirmSend")}
                          </button>
                        </div>
                      )}
                    </Show>
                    <Show when={r().state === "accepted" && r().receipt}>
                      {(receipt) => (
                        <p class="nsvx-biz__confirm">
                          <Glyph name="check" /> {b("meter_accepted")} · {receipt().reference ?? ""} · {when(props.ctx.locale, receipt().observed_at)}
                        </p>
                      )}
                    </Show>
                    <Show when={busy()}>
                      <span class="nsvx-biz__meter nsvx-biz__meter--busy" role="progressbar" aria-label={b("progress")}>
                        <span />
                      </span>
                    </Show>
                    <div class="nsvx-biz__row">
                      <Show when={!locked() && (!r().confirmation || dirty())}>
                        <button type="button" class="nsvx__button nsvx__button--primary" disabled={!readingReady(draft())} onClick={() => step("prepare")}>
                          {b("prepare")}
                        </button>
                      </Show>
                      <Show when={!locked() && dirty()}>
                        <button type="button" class="nsvx__button" onClick={() => void act.run(save, "saved")}>
                          {b("save")}
                        </button>
                      </Show>
                      <Show when={r().state === "blocked" && draft().registers.length === 0}>
                        <button type="button" class="nsvx__button nsvx__button--primary" onClick={() => step("retry")}>
                          {b("readAgain")}
                        </button>
                      </Show>
                      <Show when={r().state === "uncertain"}>
                        <button type="button" class="nsvx__button nsvx__button--primary" onClick={() => step("reconcile")}>
                          {b("verify")}
                        </button>
                      </Show>
                      <Show when={!READING_LOCKED.has(r().state)}>
                        <button type="button" class="nsvx__button" onClick={() => step("cancel")}>
                          {b("cancel")}
                        </button>
                      </Show>
                    </div>
                  </form>
                </div>
              )}
            </Show>
          </>
        )}
      </SourceView>
    </section>
  );
}
