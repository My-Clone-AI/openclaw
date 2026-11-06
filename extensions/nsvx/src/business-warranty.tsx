/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import {
  CLAIM_FIELDS,
  CLAIM_STAGES,
  claimActive,
  claimReviewable,
  type Claim,
  type ClaimRow,
  type Packet,
  type Purchase,
} from "./business-data.js";
import type { BusinessKey } from "./business-i18n.js";
import {
  businessView,
  Chip,
  createAction,
  Glyph,
  NoteLine,
  saveFile,
  toUpload,
  type Ctx,
  type FileAnswer,
} from "./business-ui.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

const POLL_MAX = 150;

function claimTone(state: string) {
  return state === "reviewed" || state === "ready"
    ? "ok"
    : claimActive(state)
      ? "busy"
      : state === "cancelled"
        ? "off"
        : "warn";
}

function PacketView(props: { ctx: Ctx; packet: Packet }) {
  const b = props.ctx.b;
  const fields = createMemo(() =>
    CLAIM_FIELDS.map((key) => [key, props.packet.fields[key]] as const).filter(
      ([, field]) => field?.value || field?.conflict,
    ),
  );
  return (
    <div class="nsvx-biz__packet">
      <dl class="nsvx-biz__facts">
        <For each={fields()} keyed={(entry) => entry[0]}>
          {(entry) => (
            <div title={entry()[1]?.sources[0]?.quote}>
              <dt>{b(`f_${entry()[0]}` as BusinessKey)}</dt>
              <dd>{entry()[1]?.conflict ? `⚠ ${b("check")}` : entry()[1]?.value}</dd>
            </div>
          )}
        </For>
      </dl>
      <pre class="nsvx-biz__letter">{props.packet.letter}</pre>
      <Show when={props.packet.unresolved.length > 0}>
        <ul class="nsvx-biz__flags">
          <For each={props.packet.unresolved} keyed={false}>
            {(item) => <li>⚠ {b(`u_${item().split(":")[0]}` as BusinessKey)}</li>}
          </For>
        </ul>
      </Show>
      <p class="nsvx-biz__muted">
        <Glyph name="file" /> {props.packet.evidence.map((e) => e.name).join(" · ")} · {b("terms")}{" "}
        {props.packet.terms.length || "?"}
      </p>
    </div>
  );
}

/** One warranty claim: files and fault in, NSVX's draft packet out; confirm, then export. Nothing is sent. */
function ClaimView(props: {
  ctx: Ctx;
  id: string | undefined;
  onOpen: (id: string | undefined) => void;
  onCreated: (id: string) => void;
}) {
  const b = props.ctx.b;
  const host = props.ctx.host;
  const act = createAction(() => props.ctx);
  const [claim, setClaim] = createSignal<Claim>();
  const [fault, setFault] = createSignal("");
  const [chosen, setChosen] = createSignal<string[]>([]);
  const [search, setSearch] = createSignal("");
  const [found, setFound] = createSignal<Purchase[]>([]);
  const [edited, setEdited] = createSignal(false);
  let disposed = false;
  let polls = 0;
  let clientKey = crypto.randomUUID();
  onCleanup(() => {
    disposed = true;
  });
  const lang = props.ctx.locale.toLowerCase().startsWith("pt") ? "pt" : "en";
  const request = <V,>(op: string, extra: Record<string, unknown> = {}) =>
    host.request<V>("nsvx.business.warranty", { op, ...extra });
  const accept = (next: Claim) => {
    setClaim(next);
    if (!edited()) {
      setFault(next.fault);
      setChosen(next.document_ids);
    }
    if (claimActive(next.state) && polls++ < POLL_MAX) {
      setTimeout(() => {
        if (!disposed && !host.signal.aborted && claim()?.id === next.id) {
          void businessView<Claim>(host, "warranty", { id: next.id }).then(accept, () => undefined);
        }
      }, 1500);
    }
  };
  if (props.id) {
    void act.run(async () =>
      accept(await businessView<Claim>(host, "warranty", { id: props.id! })),
    );
  }
  const find = (q: string) => {
    setSearch(q);
    void businessView<{ items: Purchase[] }>(host, "purchases", q ? { q } : {}).then(
      (r) => search() === q && setFound(r.items),
      () => undefined,
    );
  };
  find("");
  const start = async (ids = chosen()) => {
    const created = await request<Claim>("create", {
      clientKey,
      documentIds: ids,
      fault: fault(),
      language: lang,
    });
    clientKey = crypto.randomUUID();
    setEdited(false);
    accept(created);
    props.onCreated(created.id);
    return created;
  };
  const update = () =>
    void act.run(async () => {
      const current = claim()!;
      setEdited(false);
      accept(
        await request<Claim>("edit", {
          id: current.id,
          revision: current.revision,
          fault: fault(),
          product: current.product,
          documentIds: chosen(),
        }),
      );
    }, "saved");
  const upload = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }
    const picked = Array.from(files);
    void act.run(async () => {
      const current = claim() ?? (await start([]));
      accept(
        await request<Claim>("upload", {
          id: current.id,
          revision: current.revision,
          files: await Promise.all(picked.map(toUpload)),
        }),
      );
    });
  };
  const versioned = (op: string) =>
    void act.run(async () => {
      const current = claim()!;
      accept(await request<Claim>(op, { id: current.id, revision: current.revision }));
    });
  const packet = () => claim()?.packet ?? claim()?.preview ?? undefined;
  const purchases = createMemo(() => {
    const extra = (packet()?.evidence ?? [])
      .filter((e) => !found().some((p) => p.id === e.id))
      .map((e) => ({ id: e.id, original_name: e.name, mime: e.mime }));
    return [...found(), ...extra];
  });
  const picker = (camera: boolean) => (
    <label class={["nsvx__button", { "nsvx__button--primary": camera }]}>
      <Glyph name={camera ? "camera" : "file"} />
      {b(camera ? "photo" : "add")}
      <input
        type="file"
        class="nsvx-biz__file"
        aria-label={b(camera ? "photo" : "add")}
        multiple={!camera}
        accept={camera ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png"}
        capture={camera ? "environment" : undefined}
        disabled={act.busy()}
        onChange={(event) => {
          upload(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
  return (
    <div class="nsvx-biz__stack">
      <Show when={!props.id}>
        <ol class="nsvx-biz__wizard" aria-label={b("warranty")}>
          <li>
            <Glyph name="file" /> {b("bill")}
          </li>
          <li>
            <Glyph name="mic" /> {b("fault")}
          </li>
          <li>
            <Glyph name="warranty" /> {b("draft")}
          </li>
        </ol>
      </Show>
      <section class="nsvx-biz__card nsvx-biz__card--wide" aria-label={b("evidence")}>
        <div class="nsvx-biz__row">
          {picker(true)}
          {picker(false)}
          <Show when={props.id}>
            <button type="button" class="nsvx__button" onClick={() => props.onOpen(undefined)}>
              <Glyph name="plus" />
              {b("new")}
            </button>
          </Show>
        </div>
        <label class="nsvx-biz__label">
          {b("whatHappened")}
          <textarea
            class="nsvx-biz__input nsvx-biz__text"
            rows={3}
            maxlength={8000}
            value={fault()}
            onInput={(event) => {
              setFault(event.currentTarget.value);
              setEdited(true);
            }}
          />
        </label>
        <input
          class="nsvx-biz__input"
          type="search"
          aria-label={b("findPurchase")}
          placeholder={b("findPurchase")}
          value={search()}
          onInput={(event) => find(event.currentTarget.value)}
        />
        <div class="nsvx-biz__purchases">
          <For each={purchases()} keyed={(p) => p.id}>
            {(p) => (
              <label class="nsvx-biz__purchase">
                <input
                  type="checkbox"
                  checked={chosen().includes(p().id)}
                  disabled={act.busy()}
                  onChange={(event) => {
                    setChosen(
                      event.currentTarget.checked
                        ? [...chosen(), p().id]
                        : chosen().filter((id) => id !== p().id),
                    );
                    setEdited(true);
                  }}
                />
                <Glyph name="file" />
                <span>{p().original_name}</span>
              </label>
            )}
          </For>
        </div>
        <Show
          when={claim()}
          fallback={
            <button
              type="button"
              class="nsvx__button nsvx__button--primary"
              disabled={act.busy() || (!fault().trim() && chosen().length === 0)}
              onClick={() => void act.run(() => start())}
            >
              <Glyph name="spark" />
              {b("prepare")}
            </button>
          }
        >
          <Show when={edited()}>
            <button
              type="button"
              class="nsvx__button nsvx__button--primary"
              disabled={act.busy()}
              onClick={update}
            >
              {b("update")}
            </button>
          </Show>
        </Show>
        <NoteLine note={act.note()} />
      </section>
      <Show when={claim()}>
        {(c) => (
          <section
            class="nsvx-biz__card nsvx-biz__card--wide"
            aria-live="polite"
            aria-label={b("draft")}
          >
            <div class="nsvx-biz__run-head">
              <Glyph name="warranty" />
              <strong>{packet()?.fields.product?.value ?? c().product ?? b("draft")}</strong>
              <Chip tone={claimTone(c().state)}>
                {c().error ? b("paused") : b(`claim_${c().state}` as BusinessKey)}
              </Chip>
              <span class="nsvx-biz__muted">v{c().revision}</span>
            </div>
            <Show when={claimActive(c().state)}>
              <ol class="nsvx-biz__stages" aria-label={b("progress")}>
                <For each={CLAIM_STAGES} keyed={false}>
                  {(stage, index) => (
                    <li
                      class={{
                        "nsvx-biz__stage--done": index < CLAIM_STAGES.indexOf(c().stage as never),
                        "nsvx-biz__stage--now": stage() === c().stage,
                      }}
                      title={stage()}
                    />
                  )}
                </For>
              </ol>
              <button
                type="button"
                class="nsvx__button"
                disabled={act.busy()}
                onClick={() => versioned("cancel")}
              >
                {b("cancel")}
              </button>
            </Show>
            <Show when={c().error}>
              <p class="nsvx-biz__detail">
                {c().error === "inference_unavailable" ? b("aiOff") : b("notFinished")}
              </p>
            </Show>
            <Show when={["waiting", "failed", "cancelled"].includes(c().state)}>
              <button
                type="button"
                class="nsvx__button"
                disabled={act.busy()}
                onClick={() => versioned("resume")}
              >
                <Glyph name="refresh" />
                {b("resume")}
              </button>
            </Show>
            <Show when={packet()}>{(p) => <PacketView ctx={props.ctx} packet={p()} />}</Show>
            <Show when={claimReviewable(c()) && !edited()}>
              <div class="nsvx-biz__confirm">
                <span class="nsvx-biz__muted">{b("draftOnly")}</span>
                <Show
                  when={c().state === "reviewed"}
                  fallback={
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--primary"
                      disabled={act.busy()}
                      onClick={() =>
                        void act.run(async () =>
                          accept(
                            await request<Claim>("confirm", {
                              id: c().id,
                              revision: c().revision,
                              packetId: c().packet!.id,
                              sha256: c().packet!.sha256,
                            }),
                          ),
                        )
                      }
                    >
                      <Glyph name="check" />
                      {b("confirmDraft")}
                    </button>
                  }
                >
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--primary"
                    disabled={act.busy()}
                    onClick={() =>
                      void act.run(async () =>
                        saveFile(
                          await host.request<FileAnswer>("nsvx.business.file", {
                            name: "warrantyExport",
                            id: c().id,
                            packetId: c().packet!.id!,
                          }),
                          "warranty-draft.zip",
                        ),
                      )
                    }
                  >
                    <Glyph name="download" />
                    {b("export")}
                  </button>
                </Show>
              </div>
            </Show>
          </section>
        )}
      </Show>
    </div>
  );
}

export function Warranties(props: {
  ctx: Ctx;
  open: string | undefined;
  onOpen: (id: string | undefined) => void;
}) {
  const b = props.ctx.b;
  const history = createSource(props.ctx.host, () =>
    businessView<{ items: ClaimRow[] }>(props.ctx.host, "warranties"),
  );
  void history.refresh();
  // A new claim keeps its view (and any upload in flight); opening another one starts a fresh view.
  const [mounted, setMounted] = createSignal(props.open ?? "");
  const open = (id: string | undefined) => {
    setMounted(id ?? "");
    props.onOpen(id);
    void history.refresh();
  };
  return (
    <div class="nsvx-biz__stack">
      <For each={[mounted()]} keyed={(key) => key}>
        {(id) => (
          <ClaimView
            ctx={props.ctx}
            id={id() || undefined}
            onOpen={open}
            onCreated={props.onOpen}
          />
        )}
      </For>
      <Show when={!props.open}>
        <SourceView source={history} t={props.ctx.t}>
          {(data) => (
            <Show when={data().items.length > 0}>
              <h3 class="nsvx__heading">{b("saved")}</h3>
              <ul class="nsvx-list">
                <For
                  each={data().items.filter((c) => matches(props.ctx.query, c.product, c.state))}
                  keyed={(c) => c.id}
                >
                  {(row) => (
                    <li>
                      <button
                        type="button"
                        class="nsvx-row nsvx-row--link nsvx-biz__open"
                        onClick={() => open(row().id)}
                      >
                        <Glyph name="warranty" />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{row().product || b("draft")}</span>
                        </span>
                        <Chip tone={claimTone(row().state)}>
                          {b(`claim_${row().state}` as BusinessKey)}
                        </Chip>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          )}
        </SourceView>
      </Show>
    </div>
  );
}
