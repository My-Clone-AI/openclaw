/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import type {
  Company,
  Manifest,
  Operation,
  OperationResult,
  Preview,
  ResourceDetail,
  ResourcePage,
  Tone,
} from "./group-data.js";
import {
  Glyph,
  view,
  AppMark,
  Dot,
  StatusChip,
  Segments,
  newKey,
  stamp,
  isUncertain,
  Fields,
  type Ctx,
} from "./group-ui.js";
import { createSource, errorMessage, SourceView } from "./ui-kit.js";

const TERMINAL = new Set([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "NEEDS_REVIEW",
  "ROLLED_BACK",
  "ROLLBACK_FAILED",
]);

function OperationForm(props: {
  ctx: Ctx;
  cid: string;
  op: Operation;
  target?: string;
  onClose: () => void;
}) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  const initial: Record<string, unknown> = {};
  for (const field of props.op.inputs) {
    if (props.target && field.key === `${props.op.resourceKind}Id`) {
      initial[field.key] = props.target;
    } else if (field.type === "boolean") {
      initial[field.key] = false;
    }
  }
  const [input, setInput] = createSignal(initial);
  const [targetId, setTargetId] = createSignal(props.target ?? "");
  const [reason, setReason] = createSignal("");
  const [confirmed, setConfirmed] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [preview, setPreview] = createSignal<Preview>();
  const [result, setResult] = createSignal<OperationResult>();
  const [attempted, setAttempted] = createSignal(false);
  // One key per intent: an uncertain run repeated with it is replayed by the app.
  const key = newKey();
  const high = ["high_risk", "irreversible"].includes(props.op.risk);
  const change = (next: Record<string, unknown>) => {
    setInput(next);
    setPreview(undefined);
    setConfirmed(false);
  };
  const body = () => ({
    cid: props.cid,
    op: props.op.id,
    targetId: targetId() || null,
    input: input(),
    reason: reason(),
    idempotencyKey: key,
  });
  const check = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setPreview(await host.request<Preview>("nsvx.group.preview", body()));
    } catch (cause) {
      setError(errorMessage(host, cause));
    } finally {
      setBusy(false);
    }
  };
  const poll = async (runId: string) => {
    for (let i = 0; i < 100 && !host.signal.aborted; i++) {
      await new Promise((resolve) => {
        setTimeout(resolve, 3000);
      });
      try {
        const next = await view<OperationResult>(host, "groupRun", { cid: props.cid, runId });
        setResult(next);
        if (TERMINAL.has(next.run?.state ?? "")) {
          return;
        }
      } catch {
        return;
      }
    }
  };
  const run = async () => {
    setAttempted(true);
    setBusy(true);
    setError(undefined);
    try {
      const answer = await host.request<OperationResult>("nsvx.group.operation", {
        ...body(),
        previewToken: preview()?.previewToken ?? null,
      });
      setResult(answer);
      if (answer.run?.runId && !TERMINAL.has(answer.run.state)) {
        void poll(answer.run.runId);
      }
    } catch (cause) {
      setError(isUncertain(cause) ? g("uncertain") : errorMessage(host, cause));
    } finally {
      setBusy(false);
    }
  };
  const ready = () =>
    confirmed() &&
    (!high || typed() === g("typeWord")) &&
    (!props.op.preview || preview()?.available === true) &&
    !busy() &&
    !attempted();
  const state = () => {
    const r = result();
    const s = r?.run?.state ?? r?.status ?? "";
    return s === "SUCCEEDED" || (s === "done" && r?.ok !== false)
      ? g("done")
      : TERMINAL.has(s)
        ? g("failed")
        : s
          ? g("running")
          : "";
  };
  return (
    <section class="nsvx-grp__panel" aria-label={props.op.label}>
      <header class="nsvx-grp__panel-head">
        <strong>{props.op.label}</strong>
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={g("cancel")}
          disabled={busy()}
          onClick={() => props.onClose()}
        >
          <Glyph name="close" />
        </button>
      </header>
      <fieldset class="nsvx-grp__form" disabled={busy() || attempted()}>
        <Show when={props.op.targetKind}>
          <label class="nsvx-field">
            <span>{props.op.targetKind}</span>
            <input
              value={targetId()}
              required
              onInput={(event) => {
                setTargetId(event.currentTarget.value);
                setPreview(undefined);
              }}
            />
          </label>
        </Show>
        <For each={props.op.inputs} keyed={(field) => field.key}>
          {(field) => (
            <label class={["nsvx-field", { "nsvx-grp__check": field().type === "boolean" }]}>
              <span>
                {field().label}
                {field().required ? " *" : ""}
              </span>
              <Show
                when={field().type === "boolean"}
                fallback={
                  <Show
                    when={field().type === "select"}
                    fallback={
                      <input
                        type={field().type === "number" ? "number" : "text"}
                        required={field().required}
                        value={String(input()[field().key] ?? "")}
                        onInput={(event) =>
                          change({
                            ...input(),
                            [field().key]:
                              field().type === "number"
                                ? Number(event.currentTarget.value)
                                : event.currentTarget.value,
                          })
                        }
                      />
                    }
                  >
                    <select
                      onChange={(event) =>
                        change({ ...input(), [field().key]: event.currentTarget.value })
                      }
                    >
                      <option value="" />
                      <For each={field().options ?? []} keyed={false}>
                        {(option) => (
                          <option value={option()} selected={input()[field().key] === option()}>
                            {option()}
                          </option>
                        )}
                      </For>
                    </select>
                  </Show>
                }
              >
                <input
                  type="checkbox"
                  checked={input()[field().key] === true}
                  onChange={(event) =>
                    change({ ...input(), [field().key]: event.currentTarget.checked })
                  }
                />
              </Show>
            </label>
          )}
        </For>
        <label class="nsvx-field">
          <span>{g("reason")}</span>
          <input
            maxlength={500}
            value={reason()}
            onInput={(event) => setReason(event.currentTarget.value)}
          />
        </label>
        <Show when={props.op.preview}>
          <button type="button" class="nsvx__button" onClick={() => void check()}>
            {g("check")}
          </button>
        </Show>
      </fieldset>
      <Show when={preview()}>
        {(p) => (
          <div class="nsvx-grp__preview" role="status">
            <Show when={p().unavailableReason}>
              <p class="nsvx-grp__note nsvx-grp__note--bad">{p().unavailableReason}</p>
            </Show>
            <For each={p().preconditions ?? []} keyed={(item) => item.id}>
              {(item) => (
                <p>
                  <Dot tone={item().satisfied ? "ok" : "warn"} /> {item().label}
                  {item().detail ? ` · ${item().detail}` : ""}
                </p>
              )}
            </For>
            <For each={p().effects ?? []} keyed={false}>
              {(effect) => <p>→ {effect()}</p>}
            </For>
            <For each={p().warnings ?? []} keyed={false}>
              {(warning) => <p class="nsvx-grp__note nsvx-grp__note--bad">{warning()}</p>}
            </For>
          </div>
        )}
      </Show>
      <label class="nsvx-grp__check">
        <input
          type="checkbox"
          checked={confirmed()}
          disabled={attempted()}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        {g("confirm")} · {props.op.label}
      </label>
      <Show when={high}>
        <label class="nsvx-field">
          <span>{g("typeToConfirm")}</span>
          <input
            autocomplete="off"
            value={typed()}
            disabled={attempted()}
            onInput={(event) => setTyped(event.currentTarget.value)}
          />
        </label>
      </Show>
      <button
        type="button"
        class="nsvx__button nsvx__button--primary"
        disabled={!ready()}
        onClick={() => void run()}
      >
        {g("run")}
      </button>
      <Show when={error()}>
        <p class="nsvx-grp__note nsvx-grp__note--bad" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={result()}>
        {(r) => (
          <div class="nsvx-grp__result" role="status">
            <strong>{state()}</strong>
            <Show when={r().run?.progressPercent !== undefined}>
              <progress value={r().run?.progressPercent ?? 0} max={100} />
            </Show>
            <Show when={r().message}>
              <p>{r().message}</p>
            </Show>
            <Show when={r().run?.error}>
              <p class="nsvx-grp__note nsvx-grp__note--bad">{r().run?.error?.message}</p>
            </Show>
            <code>{r().run?.runId ?? r().auditId ?? ""}</code>
          </div>
        )}
      </Show>
    </section>
  );
}

function Records(props: {
  ctx: Ctx;
  cid: string;
  kind: string;
  operations: Operation[];
  onOperation: (op: Operation, target: string) => void;
}) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  const audit = props.kind === "audit";
  // Request inputs live in plain fields: a signal read right after its write still returns the old value.
  const ask = { cursor: "", rid: "" };
  const [cursor, setCursor] = createSignal("");
  const [opened, setOpened] = createSignal<string>();
  const page = createSource(host, () =>
    view<ResourcePage>(
      host,
      audit ? "groupAudit" : "groupResources",
      audit
        ? { cid: props.cid, ...(ask.cursor ? { cursor: ask.cursor } : {}) }
        : {
            cid: props.cid,
            kind: props.kind,
            ...(props.ctx.query ? { q: props.ctx.query } : {}),
            ...(ask.cursor ? { cursor: ask.cursor } : {}),
          },
    ),
  );
  void page.refresh();
  const detail = createSource(host, () =>
    view<ResourceDetail>(host, "groupResource", { cid: props.cid, kind: props.kind, rid: ask.rid }),
  );
  const open = (id: string) => {
    ask.rid = id;
    setOpened(id);
    void detail.refresh();
  };
  const page2 = (next: string) => {
    ask.cursor = next;
    setCursor(next);
    void page.refresh();
  };
  return (
    <SourceView source={page} t={props.ctx.t}>
      {(data) => (
        <>
          <Show when={audit}>
            <ul class="nsvx-list">
              <For each={data().entries ?? []} keyed={false}>
                {(entry) => (
                  <li class="nsvx-grp__entry">
                    <Fields fields={entry()} />
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={!audit}>
            <ul class="nsvx-list">
              <For each={data().items ?? []} keyed={(item) => item.id}>
                {(item) => (
                  <li>
                    <button
                      type="button"
                      class="nsvx-row nsvx-row--link"
                      aria-expanded={opened() === item().id ? "true" : "false"}
                      onClick={() =>
                        opened() === item().id ? setOpened(undefined) : open(item().id)
                      }
                    >
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{item().title ?? item().id}</span>
                        <span class="nsvx-row__detail">{item().subtitle}</span>
                      </span>
                      <Show when={item().status}>
                        <span class="nsvx__chip">{item().status}</span>
                      </Show>
                    </button>
                    <Show when={opened() === item().id}>
                      <div class="nsvx-grp__detail">
                        <SourceView source={detail} t={props.ctx.t}>
                          {(d) => (
                            <>
                              <Fields fields={d().fields} />
                              <ol class="nsvx-grp__timeline">
                                <For each={d().timeline ?? []} keyed={false}>
                                  {(step) => (
                                    <li>
                                      <time datetime={step().at}>
                                        {stamp(props.ctx.locale, step().at)}
                                      </time>{" "}
                                      · {step().label ?? step().title}
                                      {step().detail ? ` · ${step().detail}` : ""}
                                    </li>
                                  )}
                                </For>
                              </ol>
                              <div class="nsvx-grp__acts">
                                <For
                                  each={props.operations.filter((op) =>
                                    d().operations?.includes(op.id),
                                  )}
                                  keyed={(op) => op.id}
                                >
                                  {(op) => (
                                    <button
                                      type="button"
                                      class="nsvx__button"
                                      disabled={Boolean(op().disabledReason)}
                                      title={op().disabledReason}
                                      onClick={() => props.onOperation(op(), item().id)}
                                    >
                                      {op().label}
                                    </button>
                                  )}
                                </For>
                              </div>
                            </>
                          )}
                        </SourceView>
                      </div>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={(audit ? data().entries : data().items)?.length === 0}>
            <p class="nsvx__empty">{g("nothing")}</p>
          </Show>
          <div class="nsvx-grp__acts">
            <Show when={cursor()}>
              <button type="button" class="nsvx__button" onClick={() => page2("")}>
                {g("first")}
              </button>
            </Show>
            <Show when={data().nextCursor}>
              {(next) => (
                <button type="button" class="nsvx__button" onClick={() => page2(next())}>
                  {g("more")}
                </button>
              )}
            </Show>
          </div>
        </>
      )}
    </SourceView>
  );
}

export function CompanyView(props: { ctx: Ctx; cid: string; onBack: () => void }) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  // The manifest exists only for apps with an admin adapter, so it is read after the summary says so.
  const company = createSource(host, async () => {
    const summary = await view<Company>(host, "groupCompany", { cid: props.cid });
    const manifest = summary.configured
      ? await view<Manifest>(host, "groupManifest", { cid: props.cid })
      : undefined;
    return { summary, manifest };
  });
  void company.refresh();
  const [part, setPart] = createSignal("summary");
  const [selected, setSelected] = createSignal<{ op: Operation; target?: string }>();
  const tone = (status: string): Tone =>
    status === "ok" || status === "healthy"
      ? "ok"
      : status === "down"
        ? "bad"
        : status === "degraded"
          ? "warn"
          : "off";
  return (
    <div class="nsvx-grp__company">
      <button type="button" class="nsvx__button nsvx-grp__back" onClick={() => props.onBack()}>
        <Glyph name="back" />
        {g("back")}
      </button>
      <SourceView source={company} t={props.ctx.t}>
        {(loaded) => {
          const c = () => loaded().summary;
          const manifest = () => loaded().manifest;
          const parts = createMemo(() => [
            "summary",
            ...(manifest()?.resources.map((r) => r.kind) ?? []),
            ...(manifest() ? ["operations", "audit"] : []),
          ]);
          const partLabel = (key: string) =>
            key === "summary" || key === "operations" || key === "audit"
              ? g(key)
              : (manifest()?.resources.find((r) => r.kind === key)?.label ?? key);
          return (
            <>
              <header class="nsvx-grp__company-head">
                <AppMark id={c().id} name={c().name} />
                <span class="nsvx-grp__id">
                  <strong>{c().name}</strong>
                  <span>
                    {c().domain}
                    {c().release?.revision ? ` · ${c().release?.revision?.slice(0, 7)}` : ""}
                  </span>
                </span>
                <StatusChip g={g} tone={tone(c().configured ? c().status : c().public.status)} />
              </header>
              <Segments
                name={c().name}
                items={parts()}
                value={part()}
                label={partLabel}
                onChange={(key) => setPart(key)}
              />
              <Show when={c().error}>
                <p class="nsvx-grp__note nsvx-grp__note--bad">{c().error}</p>
              </Show>
              <Show when={part() === "summary"}>
                <div class="nsvx-kpis">
                  <For each={c().metrics.slice(0, 6)} keyed={(m) => m.key}>
                    {(m) => (
                      <div class="nsvx-kpi">
                        <span class="nsvx-kpi__label">{m().label || m().key}</span>
                        <strong class="nsvx-kpi__value">
                          {typeof m().value === "number"
                            ? new Intl.NumberFormat(props.ctx.locale).format(m().value as number)
                            : String(m().value ?? "—")}
                        </strong>
                      </div>
                    )}
                  </For>
                </div>
                <ul class="nsvx-list">
                  <For each={c().attention.filter((a) => a.count > 0)} keyed={(a) => a.key}>
                    {(a) => (
                      <li class="nsvx-row">
                        <Dot tone="warn" />
                        <span class="nsvx-row__main">{a().label}</span>
                        <strong>{a().count}</strong>
                      </li>
                    )}
                  </For>
                  <For each={c().public.checks} keyed={(check) => check.url}>
                    {(check) => (
                      <li class="nsvx-row">
                        <Dot tone={tone(check().status)} />
                        <span class="nsvx-row__main">{check().url.replace(/^https:\/\//, "")}</span>
                        <span class="nsvx__chip">{g("site")}</span>
                      </li>
                    )}
                  </For>
                  <For each={c().health?.checks ?? []} keyed={(check) => check.key}>
                    {(check) => (
                      <li class="nsvx-row">
                        <Dot tone={tone(check().status)} />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{check().key}</span>
                          <span class="nsvx-row__detail">{check().detail}</span>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={!c().configured}>
                  <p class="nsvx-grp__muted" role="status">
                    {g("notSet")}
                  </p>
                </Show>
              </Show>
              <Show when={part() === "operations" && manifest()}>
                {(m) => (
                  <>
                    <div class="nsvx-grp__ops">
                      <For each={m().operations} keyed={(op) => op.id}>
                        {(op) => (
                          <button
                            type="button"
                            class={[
                              "nsvx-grp__op",
                              { "nsvx-grp__op--write": op().risk !== "read" },
                            ]}
                            disabled={Boolean(op().disabledReason)}
                            title={op().disabledReason}
                            onClick={() => setSelected({ op: op() })}
                          >
                            <strong>{op().label}</strong>
                            <Show when={op().disabledReason}>
                              <span>{op().disabledReason}</span>
                            </Show>
                          </button>
                        )}
                      </For>
                    </div>
                    <Show when={m().operations.length === 0}>
                      <p class="nsvx__empty">{g("nothing")}</p>
                    </Show>
                  </>
                )}
              </Show>
              <For
                each={part() !== "summary" && part() !== "operations" ? [part()] : []}
                keyed={(key) => key}
              >
                {(kind) => (
                  <Records
                    ctx={props.ctx}
                    cid={props.cid}
                    kind={kind()}
                    operations={manifest()?.operations ?? []}
                    onOperation={(op, target) => setSelected({ op, target })}
                  />
                )}
              </For>
              <For
                each={selected() ? [selected()!] : []}
                keyed={(s) => `${s.op.id}:${s.target ?? ""}`}
              >
                {(s) => (
                  <OperationForm
                    ctx={props.ctx}
                    cid={props.cid}
                    op={s().op}
                    target={s().target}
                    onClose={() => {
                      setSelected(undefined);
                      void company.refresh();
                    }}
                  />
                )}
              </For>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}
