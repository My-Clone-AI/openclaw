/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  filterGrants,
  grantExpiry,
  validDay,
  visibleGrants,
  type Denial,
  type Grant,
} from "./business-data.js";
import {
  businessView,
  Chip,
  createAction,
  Glyph,
  NoteLine,
  saveFile,
  when,
  type Ctx,
  type FileAnswer,
} from "./business-ui.js";
import { createSource, SourceView } from "./ui-kit.js";

type Notice = { enabled: boolean; days: number };

function ExpiryBadge(props: { ctx: Ctx; grant: Grant }) {
  const info = () => grantExpiry(props.grant.expires_at);
  return (
    <Show when={info()}>
      {(x) => (
        <Chip
          tone={x().expired ? "off" : x().warning && props.grant.state === "active" ? "warn" : "ok"}
        >
          {x().expired ? props.ctx.b("expired") : `${x().days} ${props.ctx.b("days")}`}
        </Chip>
      )}
    </Show>
  );
}

function GrantRow(props: { ctx: Ctx; grant: Grant; onChanged: () => void }) {
  const b = props.ctx.b;
  const host = props.ctx.host;
  const act = createAction(() => props.ctx);
  const [denials, setDenials] = createSignal<Denial[]>();
  const [explained, setExplained] = createSignal<string>();
  const [revoking, setRevoking] = createSignal(false);
  return (
    <li class="nsvx-biz__grant" data-grant={props.grant.id}>
      <div class="nsvx-biz__run-head">
        <Glyph name="grants" />
        <span class="nsvx-biz__item-text">
          {props.grant.app} · {props.grant.action}
          <span class="nsvx-biz__muted">
            {[props.grant.user_ref, props.grant.tenant, props.grant.single_use ? b("once") : ""]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <Chip tone={props.grant.state === "active" ? "ok" : "off"}>
          {props.grant.state === "active" ? b("active") : b("revoked")}
        </Chip>
        <ExpiryBadge ctx={props.ctx} grant={props.grant} />
      </div>
      <div class="nsvx-biz__row">
        <button
          type="button"
          class="nsvx__button"
          disabled={act.busy()}
          onClick={() =>
            void act.run(async () => {
              const answer = await host.request<{
                explanation: string | null;
                unavailable?: boolean;
              }>("nsvx.business.explain", { id: props.grant.id });
              setExplained(answer.explanation ?? b("aiOff"));
            })
          }
        >
          <Glyph name="spark" />
          {b("explain")}
        </button>
        <button
          type="button"
          class="nsvx__button"
          aria-expanded={denials() ? "true" : "false"}
          disabled={act.busy()}
          onClick={() =>
            denials()
              ? setDenials(undefined)
              : void act.run(async () =>
                  setDenials(
                    (
                      await businessView<{ denials: Denial[] }>(host, "grantDenials", {
                        id: props.grant.id,
                      })
                    ).denials,
                  ),
                )
          }
        >
          {b("denials")}
        </button>
        <Show when={props.grant.state === "active"}>
          <Show
            when={revoking()}
            fallback={
              <button
                type="button"
                class="nsvx__button nsvx__button--danger"
                onClick={() => setRevoking(true)}
              >
                {b("revoke")}
              </button>
            }
          >
            <button
              type="button"
              class="nsvx__button nsvx__button--danger"
              disabled={act.busy()}
              onClick={() =>
                void act.run(async () => {
                  await host.request("nsvx.business.grant", { op: "revoke", id: props.grant.id });
                  setRevoking(false);
                  props.onChanged();
                }, "done")
              }
            >
              {b("confirm")} · {b("revoke")}
            </button>
            <button type="button" class="nsvx__button" onClick={() => setRevoking(false)}>
              {b("cancel")}
            </button>
          </Show>
        </Show>
      </div>
      <Show when={explained()}>
        <p class="nsvx-biz__explain">
          <Glyph name="spark" /> {explained()}
        </p>
      </Show>
      <Show when={denials()}>
        {(list) => (
          <Show when={list().length > 0} fallback={<p class="nsvx-biz__muted">{b("noDenials")}</p>}>
            <ul class="nsvx-biz__items">
              <For each={list()} keyed={false}>
                {(d) => (
                  <li class="nsvx-biz__item">
                    <span class="nsvx-biz__item-text">
                      {d().explanation}
                      <span class="nsvx-biz__muted">
                        {when(props.ctx.locale, d().at)}
                        {d().reason ? ` · ${d().reason}` : ""}
                      </span>
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        )}
      </Show>
      <NoteLine note={act.note()} />
    </li>
  );
}

function ExportBox(props: { ctx: Ctx; grants: Grant[] }) {
  const b = props.ctx.b;
  const act = createAction(() => props.ctx);
  const [grant, setGrant] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [format, setFormat] = createSignal<"csv" | "json">("csv");
  const valid = () =>
    (!from() || validDay(from())) &&
    (!to() || validDay(to())) &&
    (!from() || !to() || from() <= to());
  return (
    <details class="nsvx-biz__card nsvx-biz__card--wide">
      <summary>
        <Glyph name="download" /> {b("export")}
      </summary>
      <div class="nsvx-biz__row">
        <select
          class="nsvx-biz__input nsvx-biz__grow"
          aria-label={b("grants")}
          value={grant()}
          onChange={(event) => setGrant(event.currentTarget.value)}
        >
          <option value="">{b("all")}</option>
          <For each={props.grants} keyed={(g) => g.id}>
            {(g) => (
              <option value={g().id}>
                {g().app} · {g().action} · {g().id.slice(0, 8)}
              </option>
            )}
          </For>
        </select>
        <input
          class="nsvx-biz__input"
          type="date"
          aria-label={b("from")}
          value={from()}
          onInput={(event) => setFrom(event.currentTarget.value)}
        />
        <input
          class="nsvx-biz__input"
          type="date"
          aria-label={b("to")}
          value={to()}
          onInput={(event) => setTo(event.currentTarget.value)}
        />
        <select
          class="nsvx-biz__input"
          aria-label={b("format")}
          value={format()}
          onChange={(event) => setFormat(event.currentTarget.value === "json" ? "json" : "csv")}
        >
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
        </select>
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={act.busy() || !valid()}
          onClick={() =>
            void act.run(async () =>
              saveFile(
                await props.ctx.host.request<FileAnswer>("nsvx.business.file", {
                  name: "grantsExport",
                  ...(grant() ? { grantId: grant() } : {}),
                  ...(from() ? { from: from() } : {}),
                  ...(to() ? { to: to() } : {}),
                  format: format(),
                }),
                `business-grant-history.${format()}`,
              ),
            )
          }
        >
          <Glyph name="download" />
          {b("download")}
        </button>
      </div>
      <NoteLine note={act.note()} />
    </details>
  );
}

/** Business action grants: who may run which app action, until when, what was refused, and revoke. */
export function Grants(props: { ctx: Ctx }) {
  const b = props.ctx.b;
  const host = props.ctx.host;
  const grants = createSource(host, async () => ({
    grants: visibleGrants((await businessView<{ grants: Grant[] }>(host, "grants")).grants),
  }));
  const notice = createSource(host, () => businessView<Notice>(host, "grantNotice"));
  const expiring = createSource(host, () =>
    businessView<Notice & { grants: Grant[] }>(host, "grantsExpiring").then((data) => ({
      ...data,
      grants: visibleGrants(data.grants),
    })),
  );
  const refresh = () => {
    void grants.refresh();
    void notice.refresh();
    void expiring.refresh();
  };
  refresh();
  const act = createAction(() => props.ctx);
  const [search, setSearch] = createSignal("");
  const setNotice = (next: Notice) =>
    void act.run(async () => {
      await host.request("nsvx.business.grant", { op: "notice", ...next });
      await notice.refresh();
      await expiring.refresh();
    }, "saved");
  return (
    <div class="nsvx-biz__stack">
      <Show when={notice.state().data}>
        {(n) => (
          <section class="nsvx-biz__card nsvx-biz__card--wide" aria-label={b("warnBefore")}>
            <div class="nsvx-biz__row">
              <label class="nsvx-biz__tick">
                <input
                  type="checkbox"
                  checked={n().enabled}
                  disabled={act.busy()}
                  onChange={(event) =>
                    setNotice({ enabled: event.currentTarget.checked, days: n().days })
                  }
                />
                {b("warnBefore")}
              </label>
              <select
                class="nsvx-biz__input"
                aria-label={b("days")}
                value={String(n().days)}
                disabled={act.busy() || !n().enabled}
                onChange={(event) =>
                  setNotice({ enabled: n().enabled, days: Number(event.currentTarget.value) })
                }
              >
                <For
                  each={[...new Set([1, 3, 7, 14, 30, 60, 90, n().days])].toSorted((x, y) => x - y)}
                  keyed={false}
                >
                  {(d) => (
                    <option value={String(d())}>
                      {d()} {b("days")}
                    </option>
                  )}
                </For>
              </select>
            </div>
            <Show when={(expiring.state().data?.grants ?? []).length > 0}>
              <p class="nsvx-biz__detail" role="status">
                ⚠ {expiring.state().data!.grants.length} · {b("expiringSoon")}
              </p>
            </Show>
            <NoteLine note={act.note()} />
          </section>
        )}
      </Show>
      <SourceView source={grants} t={props.ctx.t}>
        {(data) => {
          const shown = createMemo(() =>
            filterGrants(data().grants, `${search()} ${props.ctx.query}`),
          );
          return (
            <>
              <input
                class="nsvx-biz__input"
                type="search"
                aria-label={b("findGrant")}
                placeholder={b("findGrant")}
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
              />
              <p class="nsvx-biz__muted" role="status">
                {shown().length} / {data().grants.length}
              </p>
              <Show when={shown().length > 0} fallback={<p class="nsvx__empty">{b("noGrants")}</p>}>
                <ul class="nsvx-biz__grants">
                  <For each={shown()} keyed={(g) => g.id}>
                    {(g) => <GrantRow ctx={props.ctx} grant={g()} onChanged={refresh} />}
                  </For>
                </ul>
              </Show>
              <ExportBox ctx={props.ctx} grants={data().grants} />
            </>
          );
        }}
      </SourceView>
    </div>
  );
}
