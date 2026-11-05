/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  bytes,
  isAdult,
  serverTone,
  serverUsage,
  usageTone,
  type Server,
  type ServerVerb,
  type Service,
} from "./group-data.js";
import { Glyph, view, AppMark, Dot, StatusChip, isUncertain, type Ctx } from "./group-ui.js";
import { createSource, errorMessage, matches, SourceView } from "./ui-kit.js";

function Gauge(props: { label: string; value: number | null; detail?: string }) {
  return (
    <div class="nsvx-grp__gauge" title={props.detail}>
      <span>{props.label}</span>
      <span class="nsvx-grp__bar-track" aria-hidden="true">
        <span
          class={["nsvx-grp__bar-fill", `nsvx-grp__bar-fill--${usageTone(props.value)}`]}
          style={{ width: `${Math.min(100, props.value ?? 0)}%` }}
        />
      </span>
      <strong>{props.value === null ? "—" : `${props.value}%`}</strong>
    </div>
  );
}

function ServerAction(props: {
  ctx: Ctx;
  server: Server;
  verb: ServerVerb;
  input?: Record<string, unknown>;
  label?: string;
  onDone: () => void;
}) {
  const g = props.ctx.g;
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<{ text: string; bad: boolean }>();
  const run = async () => {
    setBusy(true);
    try {
      await props.ctx.host.request("nsvx.group.serverAction", {
        sid: props.server.id,
        verb: props.verb,
        ...props.input,
        ...(props.verb === "reboot" ? { serverName: name() } : {}),
      });
      setNote({ text: g("done"), bad: false });
      setOpen(false);
      props.onDone();
    } catch (cause) {
      setNote({
        text: isUncertain(cause) ? g("uncertain") : errorMessage(props.ctx.host, cause),
        bad: true,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <span class="nsvx-grp__act">
      <Show
        when={open()}
        fallback={
          <button
            type="button"
            class={[
              "nsvx__button",
              { "nsvx__button--danger": props.verb === "reboot" || props.verb === "kill" },
            ]}
            onClick={() => setOpen(true)}
          >
            {props.label ?? g(props.verb)}
          </button>
        }
      >
        <span class="nsvx-grp__confirm" role="group" aria-label={g(props.verb)}>
          <Show when={props.verb === "reboot"}>
            <input
              class="nsvx-grp__input"
              aria-label={g("typeServer")}
              placeholder={props.server.label}
              autocomplete="off"
              value={name()}
              onInput={(event) => setName(event.currentTarget.value)}
            />
          </Show>
          <button
            type="button"
            class="nsvx__button nsvx__button--primary"
            disabled={busy() || (props.verb === "reboot" && name() !== props.server.label)}
            onClick={() => void run()}
          >
            {g("confirm")} · {props.label ?? g(props.verb)}
          </button>
          <button
            type="button"
            class="nsvx__button"
            disabled={busy()}
            onClick={() => setOpen(false)}
          >
            {g("cancel")}
          </button>
        </span>
      </Show>
      <Show when={note()}>
        {(n) => (
          <span class={["nsvx-grp__note", { "nsvx-grp__note--bad": n().bad }]} role="status">
            {n().text}
          </span>
        )}
      </Show>
    </span>
  );
}

function ServerDetail(props: { ctx: Ctx; server: Server; onDone: () => void }) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  const services = createSource(host, () =>
    view<{ services: Service[] }>(host, "groupServerServices", { sid: props.server.id }),
  );
  const ask = { unit: "" };
  const [unit, setUnit] = createSignal<string>();
  const logs = createSource(host, () =>
    view<{ lines?: string[]; text?: string }>(host, "groupServerLogs", {
      sid: props.server.id,
      unit: ask.unit,
      n: "100",
    }),
  );
  if (props.server.configured && !props.server.probeOnly) {
    void services.refresh();
  }
  const top = () => props.server.metrics?.processes?.cpu.slice(0, 5) ?? [];
  return (
    <div class="nsvx-grp__detail">
      <Show when={top().length > 0}>
        <h3 class="nsvx__heading">{g("topCpu")}</h3>
        <ul class="nsvx-list">
          <For each={top()} keyed={(p) => p.pid}>
            {(p) => (
              <li class="nsvx-row">
                <span class="nsvx-row__main">
                  <span class="nsvx-row__title">{p().name}</span>
                  <span class="nsvx-row__detail">
                    {p().user} · {p().pid} · {Math.round(p().mem)}% {g("ram")}
                  </span>
                </span>
                <strong>{Math.round(p().cpu)}%</strong>
                <ServerAction
                  ctx={props.ctx}
                  server={props.server}
                  verb="kill"
                  input={{ pid: p().pid, signal: "TERM" }}
                  onDone={props.onDone}
                />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.server.configured && !props.server.probeOnly}>
        <h3 class="nsvx__heading">{g("services")}</h3>
        <SourceView source={services} t={props.ctx.t}>
          {(data) => (
            <ul class="nsvx-list">
              <For
                each={data().services.filter((s) => matches(props.ctx.query, s.unit))}
                keyed={(s) => s.unit}
              >
                {(s) => (
                  <li class="nsvx-row nsvx-grp__service">
                    <Dot
                      tone={
                        s().ActiveState === "active"
                          ? "ok"
                          : s().ActiveState === "failed"
                            ? "bad"
                            : "off"
                      }
                    />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{s().unit}</span>
                      <span class="nsvx-row__detail">
                        {s().SubState}
                        {s().MemoryCurrent && /^\d+$/.test(s().MemoryCurrent ?? "")
                          ? ` · ${bytes(Number(s().MemoryCurrent))}`
                          : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      class="nsvx__button"
                      onClick={() => {
                        ask.unit = s().unit;
                        setUnit(ask.unit);
                        void logs.refresh();
                      }}
                    >
                      {g("log")}
                    </button>
                    <ServerAction
                      ctx={props.ctx}
                      server={props.server}
                      verb="restart"
                      input={{ unit: s().unit }}
                      onDone={() => void services.refresh()}
                    />
                  </li>
                )}
              </For>
            </ul>
          )}
        </SourceView>
        <Show when={unit()}>
          <h3 class="nsvx__heading">
            {g("log")} · {unit()}
          </h3>
          <SourceView source={logs} t={props.ctx.t}>
            {(data) => (
              <pre class="nsvx-grp__log">{data().lines?.join("\n") ?? data().text ?? ""}</pre>
            )}
          </SourceView>
        </Show>
        <div class="nsvx-grp__acts">
          <For each={["tmp", "apt", "journal"]} keyed={false}>
            {(target) => (
              <ServerAction
                ctx={props.ctx}
                server={props.server}
                verb="clean"
                input={{ target: target() }}
                label={`${g("clean")} ${target()}`}
                onDone={props.onDone}
              />
            )}
          </For>
          <Show
            when={props.server.metrics?.scheduledRebootAt}
            fallback={
              <ServerAction
                ctx={props.ctx}
                server={props.server}
                verb="reboot"
                onDone={props.onDone}
              />
            }
          >
            <ServerAction
              ctx={props.ctx}
              server={props.server}
              verb="cancel-reboot"
              onDone={props.onDone}
            />
          </Show>
        </div>
      </Show>
    </div>
  );
}

export function Servers(props: { ctx: Ctx }) {
  const g = props.ctx.g;
  const host = props.ctx.host;
  const servers = createSource(host, () => view<{ servers: Server[] }>(host, "groupServers"));
  void servers.refresh();
  const [open, setOpen] = createSignal<string>();
  return (
    <SourceView source={servers} t={props.ctx.t}>
      {(data) => (
        <div class="nsvx-grp__grid">
          <For
            each={data().servers.filter((s) =>
              matches(props.ctx.query, s.label, s.id, s.host, ...s.apps),
            )}
            keyed={(s) => s.id}
          >
            {(s) => {
              const usage = createMemo(() => serverUsage(s().metrics));
              return (
                <article
                  class={[
                    "nsvx-grp__card",
                    `nsvx-grp__card--${serverTone(s())}`,
                    { "nsvx-grp__card--wide": open() === s().id },
                  ]}
                  data-server={s().id}
                >
                  <header class="nsvx-grp__card-head">
                    <button
                      type="button"
                      class="nsvx-grp__open"
                      aria-expanded={open() === s().id ? "true" : "false"}
                      onClick={() => setOpen(open() === s().id ? undefined : s().id)}
                    >
                      <Glyph name="servers" class="nsvx-grp__server-icon" />
                      <span class="nsvx-grp__id">
                        <strong>{s().label}</strong>
                        <span>{s().id}</span>
                      </span>
                    </button>
                    <StatusChip g={g} tone={serverTone(s())} />
                  </header>
                  <Show
                    when={usage()}
                    fallback={<p class="nsvx-grp__muted">{s().error ?? g("noMetrics")}</p>}
                  >
                    {(u) => (
                      <>
                        <Gauge label={g("cpu")} value={u().cpu} />
                        <Gauge
                          label={g("ram")}
                          value={u().ram}
                          detail={
                            s().metrics
                              ? `${bytes(s().metrics!.memory.used)} / ${bytes(s().metrics!.memory.total)}`
                              : undefined
                          }
                        />
                        <Gauge label={g("disk")} value={u().disk} />
                        <p class="nsvx-grp__muted">
                          {g("up")} {u().uptimeDays}d · {g("load")}{" "}
                          {s()
                            .metrics?.load.map((n) => n.toFixed(1))
                            .join(" ")}
                        </p>
                      </>
                    )}
                  </Show>
                  <Show when={s().metrics?.scheduledRebootAt}>
                    <p class="nsvx-grp__note nsvx-grp__note--bad">
                      {g("rebootAt")} {s().metrics?.scheduledRebootAt}
                    </p>
                  </Show>
                  <div class="nsvx-grp__chips">
                    <For each={s().apps.filter((a) => !isAdult({ id: a }))} keyed={false}>
                      {(a) => (
                        <span class="nsvx-grp__chip">
                          <AppMark id={a()} name={a()} size="sm" />
                          {a()}
                        </span>
                      )}
                    </For>
                  </div>
                  <Show when={open() === s().id}>
                    <ServerDetail
                      ctx={props.ctx}
                      server={s()}
                      onDone={() => void servers.refresh()}
                    />
                  </Show>
                </article>
              );
            }}
          </For>
        </div>
      )}
    </SourceView>
  );
}
