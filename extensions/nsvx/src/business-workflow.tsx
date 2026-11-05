/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  canResume,
  currentQuarter,
  PROVIDER_NAMES,
  WORKFLOW_PROVIDERS,
  type AmazonHistory,
  type ProviderStatus,
  type ReturnDraft,
  type Workflow,
} from "./business-data.js";
import { createProviderStatus, runLabel, toneOfRun } from "./business-providers.js";
import {
  businessView,
  Chip,
  createAction,
  Glyph,
  Mark,
  NoteLine,
  QuarterPick,
  when,
  type Ctx,
} from "./business-ui.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

/** NSVX keeps no "last collection" pointer; like its screen, this device remembers the one it started. */
const LAST = "nsvx-business-workflow";

function lastId() {
  try {
    return localStorage.getItem(LAST) ?? undefined;
  } catch {
    return undefined;
  }
}

/** One collection across Via Verde, Prio, Bolt, and Fidelidade; each step ends only once Drive confirms it. */
export function QuarterWorkflow(props: { ctx: Ctx }) {
  const b = props.ctx.b;
  const host = props.ctx.host;
  const [pick, setPick] = createSignal(currentQuarter());
  const [chosen, setChosen] = createSignal<string[]>([...WORKFLOW_PROVIDERS]);
  const [id, setId] = createSignal(lastId());
  const act = createAction(() => props.ctx);
  const status = createSource(host, () =>
    businessView<Workflow>(host, "workflow", { id: id() ?? "" }),
  );
  if (id()) {
    void status.refresh();
  }
  const remember = (next: string) => {
    setId(next);
    try {
      localStorage.setItem(LAST, next);
    } catch {
      // Private windows keep it for this view only.
    }
    void status.refresh();
  };
  const toggle = (provider: string) =>
    setChosen(
      chosen().includes(provider) ? chosen().filter((p) => p !== provider) : [...chosen(), provider],
    );
  const running = () => ["queued", "running"].includes(status.state().data?.state ?? "");
  return (
    <div class="nsvx-biz__stack">
      <section class="nsvx-biz__card nsvx-biz__card--wide" aria-label={b("quarter")}>
        <div class="nsvx-biz__picks" role="group" aria-label={b("suppliers")}>
          <For each={WORKFLOW_PROVIDERS} keyed={false}>
            {(provider) => (
              <button
                type="button"
                class={["nsvx-biz__pick", { "nsvx-biz__pick--on": chosen().includes(provider()) }]}
                aria-pressed={chosen().includes(provider()) ? "true" : "false"}
                onClick={() => toggle(provider())}
              >
                <Mark provider={provider()} />
                <span>{PROVIDER_NAMES[provider()]}</span>
                <Show when={chosen().includes(provider())}>
                  <Glyph name="check" />
                </Show>
              </button>
            )}
          </For>
        </div>
        <div class="nsvx-biz__row nsvx-biz__collect">
          <QuarterPick b={b} year={pick().year} quarter={pick().quarter} onChange={setPick} />
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            disabled={act.busy() || chosen().length === 0 || running()}
            onClick={() =>
              void act.run(async () => {
                const started = await host.request<Workflow>("nsvx.business.workflow", {
                  op: "start",
                  ...pick(),
                  providers: chosen(),
                });
                remember(started.id);
              }, "started")
            }
          >
            <Glyph name="download" />
            {b("collectAll")}
          </button>
        </div>
        <NoteLine note={act.note()} />
      </section>
      <Show when={id()}>
        <SourceView source={status} t={props.ctx.t}>
          {(data) => (
            <section class="nsvx-biz__card nsvx-biz__card--wide" aria-live="polite" aria-label={b("progress")}>
              <div class="nsvx-biz__run-head">
                <strong>
                  {data().year} · Q{data().quarter}
                </strong>
                <Chip tone={toneOfRun(data().state)}>{runLabel(b, data().state)}</Chip>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--icon"
                  aria-label={b("update")}
                  onClick={() => void status.refresh()}
                >
                  <Glyph name="refresh" />
                </button>
              </div>
              <Show when={data().detail}>
                <p class="nsvx-biz__detail">{data().detail}</p>
              </Show>
              <ol class="nsvx-biz__steps">
                <For each={data().providers.filter((p) => data().steps[p])} keyed={false}>
                  {(provider) => {
                    const step = () => data().steps[provider()]!;
                    return (
                      <li class="nsvx-biz__step">
                        <Show when={(WORKFLOW_PROVIDERS as readonly string[]).includes(provider())}>
                          <Mark provider={provider() as (typeof WORKFLOW_PROVIDERS)[number]} />
                        </Show>
                        <span class="nsvx-biz__item-text">
                          {PROVIDER_NAMES[provider() as (typeof WORKFLOW_PROVIDERS)[number]] ?? provider()}
                          <span class="nsvx-biz__muted">
                            {step().items} <Glyph name="file" />
                            {step().verified_at ? ` · ${when(props.ctx.locale, step().verified_at)}` : ""}
                            {step().state !== "completed" && step().detail ? ` · ${step().detail}` : ""}
                          </span>
                        </span>
                        <Chip tone={toneOfRun(step().state)}>{runLabel(b, step().state)}</Chip>
                      </li>
                    );
                  }}
                </For>
              </ol>
              <Show when={canResume(data().state)}>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={act.busy()}
                  onClick={() =>
                    void act.run(async () => {
                      await host.request("nsvx.business.workflow", { op: "resume", id: data().id });
                      await status.refresh();
                    }, "started")
                  }
                >
                  <Glyph name="refresh" />
                  {b("resume")}
                </button>
              </Show>
            </section>
          )}
        </SourceView>
      </Show>
    </div>
  );
}

/** Amazon ES: sign in, the order history NSVX read last, and the return drafts it prepares (never sent). */
export function AmazonCard(props: { ctx: Ctx }) {
  const b = props.ctx.b;
  const host = props.ctx.host;
  const status = createProviderStatus(() => props.ctx, "amazon");
  const returns = createSource(host, () =>
    businessView<{ drafts: ReturnDraft[] }>(host, "amazonReturns"),
  );
  void returns.refresh();
  const act = createAction(() => props.ctx);
  const [year, setYear] = createSignal(new Date().getFullYear());
  const [shown, setShown] = createSignal<AmazonHistory>();
  const read = (start: number) =>
    void act.run(async () => {
      setShown(
        await host.request<AmazonHistory>("nsvx.business.provider", {
          provider: "amazon",
          op: "history",
          year: year(),
          start,
        }),
      );
    });
  return (
    <SourceView source={status} t={props.ctx.t}>
      {(data) => {
        const history = () => shown() ?? (data() as ProviderStatus).history ?? undefined;
        return (
          <article class="nsvx-biz__card nsvx-biz__card--wide" data-provider="amazon">
            <header class="nsvx-biz__head">
              <Mark provider="amazon" />
              <strong class="nsvx-biz__name">{PROVIDER_NAMES.amazon}</strong>
              <Chip tone={data().configured ? "ok" : "warn"}>
                {data().configured ? b("on") : b("connect")}
              </Chip>
            </header>
            <div class="nsvx-biz__row">
              <button
                type="button"
                class="nsvx__button"
                disabled={act.busy() || !data().configured}
                onClick={() =>
                  void act.run(() => host.request("nsvx.business.provider", { provider: "amazon", op: "login" }), "checked")
                }
              >
                <Glyph name="plug" />
                {b("signIn")}
              </button>
              <select
                class="nsvx-biz__input"
                aria-label={b("year")}
                value={String(year())}
                onChange={(event) => setYear(Number(event.currentTarget.value))}
              >
                <For each={Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)} keyed={false}>
                  {(y) => <option value={String(y())}>{y()}</option>}
                </For>
              </select>
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                disabled={act.busy() || !data().configured}
                onClick={() => read(0)}
              >
                <Glyph name="refresh" />
                {b("orders")}
              </button>
            </div>
            <NoteLine note={act.note()} />
            <Show when={history()} fallback={<p class="nsvx-biz__muted">{b("noOrders")}</p>}>
              {(h) => (
                <>
                  <p class="nsvx-biz__muted">
                    {h().year} · {h().orders.length} · {when(props.ctx.locale, h().observed_at)}
                  </p>
                  <ul class="nsvx-biz__items">
                    <For each={h().orders.filter((o) => matches(props.ctx.query, o.id, o.text))} keyed={(o) => o.id}>
                      {(order) => (
                        <li class="nsvx-biz__item">
                          <Glyph name="orders" />
                          <span class="nsvx-biz__item-text">
                            {order().id}
                            <span class="nsvx-biz__muted nsvx-biz__clip">{order().text}</span>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <div class="nsvx-biz__row">
                    <button type="button" class="nsvx__button" aria-label={b("back")} disabled={act.busy() || h().start === 0} onClick={() => read(Math.max(0, h().start - 10))}>
                      <Glyph name="back" />
                    </button>
                    <button type="button" class="nsvx__button" aria-label={b("more")} disabled={act.busy() || !h().next} onClick={() => read(h().start + 10)}>
                      {b("more")}
                    </button>
                  </div>
                </>
              )}
            </Show>
            <Show when={(returns.state().data?.drafts ?? []).length > 0}>
              <h3 class="nsvx__heading">{b("returns")}</h3>
              <ul class="nsvx-biz__items">
                <For each={returns.state().data?.drafts ?? []} keyed={(d) => d.id}>
                  {(draft) => (
                    <li class="nsvx-biz__item">
                      <span class="nsvx-biz__item-text">
                        {draft().order_id}
                        <span class="nsvx-biz__muted">{when(props.ctx.locale, draft().updated_at)}</span>
                      </span>
                      <Chip tone={draft().confirmation === "confirmed" ? "ok" : draft().state === "cancelled" ? "off" : "warn"}>
                        {draft().confirmation === "confirmed" ? b("confirmed") : runLabel(b, draft().state)}
                      </Chip>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </article>
        );
      }}
    </SourceView>
  );
}
