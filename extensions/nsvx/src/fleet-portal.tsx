/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { money, shortDate } from "./finance-data.js";
import {
  lastQuarter,
  stateTone,
  uberDocuments,
  type Access,
  type Announcement,
  type Driver,
  type DriverRequest,
  type Trip,
  type UberStatus,
  ACCESS_ROLES,
} from "./fleet-data.js";
import { stateLabel, type FleetKey } from "./fleet-i18n.js";
import {
  Block,
  ChangeNote,
  Chip,
  ConfirmButton,
  createFleetChange,
  Empty,
  fleetView,
  Glyph,
  PlatformMark,
  Seg,
  type Ctx,
  type GlyphName,
} from "./fleet-ui.js";
import { age, createSource, matches, SourceView } from "./ui-kit.js";

const ROLE_ICON: Record<Access["role"], GlyphName> = {
  driver: "drivers",
  accountant: "money",
  auditor: "docs",
};
const DAYS = ["7", "30", "90"] as const;

function NewLink(props: { ctx: Ctx; onMade: () => Promise<void> }) {
  const ft = props.ctx.ft;
  const [role, setRole] = createSignal<Access["role"]>("driver");
  const [driver, setDriver] = createSignal("");
  const [days, setDays] = createSignal<(typeof DAYS)[number]>("30");
  const [made, setMade] = createSignal<{ url: string; expiresAt: string }>();
  const [copied, setCopied] = createSignal(false);
  const drivers = createSource(props.ctx.host, () =>
    fleetView<{ drivers: Driver[] }>(props.ctx.host, "fleetDrivers"),
  );
  void drivers.refresh();
  const change = createFleetChange(props.ctx, props.onMade);
  const create = async () => {
    setCopied(false);
    const answer = await change.run<{ url: string; expiresAt: string }>("link", {
      action: "accessCreate",
      role: role(),
      ...(role() === "driver" ? { driverId: driver() } : {}),
      days: Number(days()),
    });
    if (answer) {
      setMade(answer);
    }
  };
  return (
    <Block icon="plus" title={ft("newLink")}>
      <div class="nsvx-fleet-form">
        <Seg
          compact
          name={ft("newLink")}
          items={ACCESS_ROLES}
          value={role()}
          label={(key) => ft(key)}
          icon={(key) => ROLE_ICON[key]}
          onChange={setRole}
        />
        <Show when={role() === "driver"}>
          <select
            aria-label={ft("driver")}
            onChange={(event) => setDriver(event.currentTarget.value)}
          >
            <option value="">{ft("driver")}</option>
            <For each={drivers.state().data?.drivers ?? []} keyed={(d) => d.id}>
              {(d) => (
                <option value={d().id} selected={driver() === d().id}>
                  {d().full_name}
                </option>
              )}
            </For>
          </select>
        </Show>
        <Seg
          compact
          name={ft("expires")}
          items={DAYS}
          value={days()}
          label={(key) => `${key} ${ft("days")}`}
          onChange={setDays}
        />
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={
            (role() === "driver" && !driver()) ||
            Boolean(change.busy()) ||
            !props.ctx.host.connection.canWrite
          }
          onClick={() => void create()}
        >
          <Glyph name="link" />
          <span>{ft("create")}</span>
        </button>
      </div>
      <Show when={made()}>
        {(link) => (
          <div class="nsvx-fleet-link-made" role="status">
            <code>{link().url}</code>
            <button
              type="button"
              class="nsvx__button"
              onClick={() =>
                void navigator.clipboard?.writeText(link().url).then(() => setCopied(true))
              }
            >
              <Glyph name={copied() ? "check" : "copy"} />
              <span>{copied() ? ft("copied") : ft("copy")}</span>
            </button>
            <span class="nsvx-row__detail">{ft("linkOnce")}</span>
          </div>
        )}
      </Show>
      <ChangeNote change={change} />
    </Block>
  );
}

function Requests(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ requests: DriverRequest[] }>(props.ctx.host, "fleetRequests", { status: "open" }),
  );
  void list.refresh();
  const change = createFleetChange(props.ctx, list.refresh);
  const [answers, setAnswers] = createSignal<Record<string, string>>({});
  const answer = (id: string, status: "done" | "declined") =>
    void change.run(`request:${id}`, {
      action: "request",
      requestId: id,
      status,
      answer: answers()[id]?.trim() || undefined,
    });
  return (
    <Block icon="inbox" title={ft("requests")} count={list.state().data?.requests.length}>
      <SourceView source={list} t={props.ctx.t}>
        {(data) => (
          <>
            <ul class="nsvx-list">
              <For
                each={data().requests.filter((r) =>
                  matches(props.ctx.query, r.driver_name, r.message),
                )}
                keyed={(r) => r.id}
              >
                {(request) => (
                  <li class="nsvx-fleet-request">
                    <div class="nsvx-row">
                      <Glyph name="drivers" class="nsvx-row__icon" />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{request().driver_name}</span>
                        <span class="nsvx-row__detail">
                          {props.ctx.host.redact(request().message)}
                        </span>
                      </span>
                      <span class="nsvx-row__age">{age(request().created_at)}</span>
                    </div>
                    <div class="nsvx-fleet-request__reply">
                      <input
                        type="text"
                        maxlength={1000}
                        placeholder={ft("answer")}
                        aria-label={ft("answer")}
                        value={answers()[request().id] ?? ""}
                        onInput={(event) =>
                          setAnswers({ ...answers(), [request().id]: event.currentTarget.value })
                        }
                      />
                      <button
                        type="button"
                        class="nsvx__button"
                        disabled={Boolean(change.busy()) || !props.ctx.host.connection.canWrite}
                        onClick={() => answer(request().id, "declined")}
                      >
                        <Glyph name="close" />
                        <span>{ft("decline")}</span>
                      </button>
                      <button
                        type="button"
                        class="nsvx__button nsvx__button--primary"
                        disabled={Boolean(change.busy()) || !props.ctx.host.connection.canWrite}
                        onClick={() => answer(request().id, "done")}
                      >
                        <Glyph name="check" />
                        <span>{ft("done")}</span>
                      </button>
                    </div>
                  </li>
                )}
              </For>
            </ul>
            <Show when={data().requests.length === 0}>
              <Empty icon="inbox" text={ft("allGood")} />
            </Show>
            <ChangeNote change={change} />
          </>
        )}
      </SourceView>
    </Block>
  );
}

function News(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ announcements: Announcement[] }>(props.ctx.host, "fleetAnnouncements"),
  );
  void list.refresh();
  const change = createFleetChange(props.ctx, list.refresh);
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const publish = async () => {
    const done = await change.run("announce", {
      action: "announce",
      title: title().trim(),
      body: body().trim() || undefined,
    });
    if (done) {
      setTitle("");
      setBody("");
    }
  };
  return (
    <Block icon="news" title={ft("news")}>
      <div class="nsvx-fleet-form nsvx-fleet-form--stack">
        <input
          type="text"
          maxlength={160}
          placeholder={ft("title")}
          aria-label={ft("title")}
          value={title()}
          onInput={(event) => setTitle(event.currentTarget.value)}
        />
        <textarea
          rows={2}
          maxlength={4000}
          placeholder={ft("text")}
          aria-label={ft("text")}
          value={body()}
          onInput={(event) => setBody(event.currentTarget.value)}
        />
        <ConfirmButton
          ft={ft}
          label={ft("publish")}
          hint={ft("publishHint")}
          icon="news"
          primary
          busy={change.busy() === "announce"}
          disabled={!title().trim() || !props.ctx.host.connection.canWrite}
          onConfirm={() => void publish()}
        />
      </div>
      <ChangeNote change={change} />
      <SourceView source={list} t={props.ctx.t}>
        {(data) => (
          <ul class="nsvx-list">
            <For each={data().announcements} keyed={(a) => a.id}>
              {(item) => (
                <li class="nsvx-row">
                  <Glyph name="news" class="nsvx-row__icon" />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">{item().title}</span>
                    <Show when={item().body}>
                      <span class="nsvx-row__detail">{item().body}</span>
                    </Show>
                  </span>
                  <span class="nsvx-row__age">{age(item().published_at)}</span>
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--icon"
                    aria-label={ft("archive")}
                    title={ft("archive")}
                    disabled={Boolean(change.busy()) || !props.ctx.host.connection.canWrite}
                    onClick={() =>
                      void change.run(`archive:${item().id}`, {
                        action: "announceArchive",
                        announcementId: item().id,
                      })
                    }
                  >
                    <Glyph name="close" />
                  </button>
                </li>
              )}
            </For>
          </ul>
        )}
      </SourceView>
    </Block>
  );
}

/** Owner side of the driver portal: who has a link, what drivers ask, and what they read. */
export function FleetPortal(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const access = createSource(props.ctx.host, () =>
    fleetView<{ access: Access[]; location_sharing: boolean }>(props.ctx.host, "fleetAccess"),
  );
  void access.refresh();
  const change = createFleetChange(props.ctx, access.refresh);
  return (
    <div class="nsvx-fleet-home">
      <div class="nsvx-fleet-cols">
        <Block
          icon="portal"
          title={ft("links")}
          count={access.state().data?.access.filter((a) => !a.revoked_at).length}
          action={
            <Show when={access.state().data}>
              {(data) => (
                <Chip tone={data().location_sharing ? "ok" : "off"}>
                  <Glyph name="pin" />{" "}
                  {data().location_sharing ? ft("locationOn") : ft("locationOff")}
                </Chip>
              )}
            </Show>
          }
        >
          <SourceView source={access} t={props.ctx.t}>
            {(data) => (
              <>
                <ul class="nsvx-list">
                  <For
                    each={data().access.filter((a) =>
                      matches(props.ctx.query, a.driver_name, a.label, a.role),
                    )}
                    keyed={(a) => a.id}
                  >
                    {(link) => (
                      <li class={["nsvx-row", { "nsvx-fleet-seen": Boolean(link().revoked_at) }]}>
                        <Glyph name={ROLE_ICON[link().role]} class="nsvx-row__icon" />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">
                            {link().driver_name ?? link().label ?? ft(link().role as FleetKey)}
                          </span>
                          <span class="nsvx-row__detail">
                            {link().revoked_at
                              ? ft("revoked")
                              : `${ft("expires")} ${shortDate(link().expires_at, props.ctx.host.locale)} · ${link().sessions} ${ft("sessions")}`}
                          </span>
                        </span>
                        <Show when={link().last_used_at}>
                          <span class="nsvx-row__age">{age(link().last_used_at)}</span>
                        </Show>
                        <Show when={!link().revoked_at}>
                          <ConfirmButton
                            ft={ft}
                            label={ft("revoke")}
                            busy={change.busy() === `revoke:${link().id}`}
                            disabled={!props.ctx.host.connection.canWrite}
                            onConfirm={() =>
                              void change.run(`revoke:${link().id}`, {
                                action: "accessRevoke",
                                accessId: link().id,
                              })
                            }
                          />
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={data().access.length === 0}>
                  <Empty icon="portal" text={ft("noneYet")} />
                </Show>
                <ChangeNote change={change} />
              </>
            )}
          </SourceView>
        </Block>
        <NewLink ctx={props.ctx} onMade={access.refresh} />
      </div>
      <div class="nsvx-fleet-cols">
        <Requests ctx={props.ctx} />
        <News ctx={props.ctx} />
      </div>
    </div>
  );
}

const ACCOUNTS = ["personal", "business"] as const;

function UberAccount(props: { ctx: Ctx; account: (typeof ACCOUNTS)[number] }) {
  const ft = props.ctx.ft;
  const status = createSource(props.ctx.host, () =>
    fleetView<UberStatus>(
      props.ctx.host,
      props.account === "personal" ? "uberPersonal" : "uberBusiness",
    ),
  );
  void status.refresh();
  const change = createFleetChange(props.ctx, status.refresh);
  const last = lastQuarter(new Date());
  const [year, setYear] = createSignal(last.year);
  const [quarter, setQuarter] = createSignal(last.quarter);
  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);
  return (
    <article class="nsvx-fleet-uber">
      <header class="nsvx-fleet-uber__head">
        <PlatformMark code="uber" large />
        <span class="nsvx-row__main">
          <strong>Uber {props.account === "personal" ? ft("personal") : ft("business")}</strong>
        </span>
        <Show when={status.state().data}>
          {(s) => (
            <Chip tone={s().configured ? "ok" : "off"}>
              {s().configured ? ft("connected") : ft("notConnected")}
            </Chip>
          )}
        </Show>
      </header>
      <SourceView source={status} t={props.ctx.t}>
        {(s) => {
          const running = () => ["queued", "running"].includes(s().run?.state ?? "");
          const docs = () => uberDocuments(s());
          return (
            <>
              <Show when={!s().configured}>
                <Empty icon="portal" text={ft("accessInNsvx")} />
              </Show>
              <div class="nsvx-fleet-form">
                <select
                  aria-label={ft("year")}
                  onChange={(event) => setYear(Number(event.currentTarget.value))}
                >
                  <For each={years} keyed={false}>
                    {(y) => (
                      <option value={y()} selected={y() === year()}>
                        {y()}
                      </option>
                    )}
                  </For>
                </select>
                <Seg
                  compact
                  name={ft("quarter")}
                  items={["1", "2", "3", "4"] as const}
                  value={String(quarter()) as "1"}
                  label={(key) => `T${key}`}
                  onChange={(key) => setQuarter(Number(key))}
                />
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={
                    !s().configured || Boolean(change.busy()) || !props.ctx.host.connection.canWrite
                  }
                  onClick={() =>
                    void change.run("check", {
                      action: "uberCheck",
                      account: props.account,
                      year: year(),
                      quarter: quarter(),
                    })
                  }
                >
                  <Glyph name="check" />
                  <span>{ft("check")}</span>
                </button>
                <ConfirmButton
                  ft={ft}
                  label={ft("collect")}
                  hint={ft("collectHint")}
                  icon="download"
                  primary
                  busy={change.busy() === "collect"}
                  disabled={!s().configured || running() || !props.ctx.host.connection.canWrite}
                  onConfirm={() =>
                    void change.run("collect", {
                      action: "uberCollect",
                      account: props.account,
                      year: year(),
                      quarter: quarter(),
                    })
                  }
                />
              </div>
              <ChangeNote change={change} />
              <Show when={s().run}>
                {(run) => (
                  <p
                    class={[
                      "nsvx-fleet-run",
                      `nsvx-fleet-run--${stateTone(run().state === "completed" ? "done" : run().state)}`,
                    ]}
                    role="status"
                  >
                    <strong>
                      {ft(
                        (["queued", "running", "completed", "partial", "blocked"].includes(
                          run().state,
                        )
                          ? run().state
                          : "blocked") as FleetKey,
                      )}
                    </strong>
                    <span>
                      T{run().quarter} {run().year}
                    </span>
                    <Show when={run().detail}>
                      <span class="nsvx-row__detail">{run().detail}</span>
                    </Show>
                  </p>
                )}
              </Show>
              <ul class="nsvx-list">
                <For each={docs()} keyed={(doc) => doc.drive_file_id}>
                  {(doc) => (
                    <li class="nsvx-row">
                      <Glyph
                        name={doc().kind === "invoice" ? "docs" : "receipt"}
                        class="nsvx-row__icon"
                      />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">
                          {doc().kind === "invoice" ? ft("invoice") : ft("receipt")}
                        </span>
                        <span class="nsvx-row__detail">
                          {shortDate(doc().issued_on, props.ctx.host.locale)} ·{" "}
                          {doc().entity === "fortune_comet"
                            ? "Fortune Comet"
                            : doc().entity === "owner"
                              ? "ENI"
                              : ft("unsorted")}
                        </span>
                      </span>
                      <PlatformMark code="drive" />
                    </li>
                  )}
                </For>
              </ul>
            </>
          );
        }}
      </SourceView>
    </article>
  );
}

function FleetPlatformTrips(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const [code, setCode] = createSignal<"uber" | "bolt">("uber");
  return (
    <Block
      icon="trips"
      title={ft("fleetTrips")}
      action={
        <Seg
          compact
          name={ft("platforms")}
          items={["uber", "bolt"] as const}
          value={code()}
          label={(key) => (key === "uber" ? "Uber" : "Bolt")}
          onChange={setCode}
        />
      }
    >
      <For each={[code()]} keyed={(key) => key}>
        {(platform) => <PlatformTrips ctx={props.ctx} code={platform()} />}
      </For>
    </Block>
  );
}

function PlatformTrips(props: { ctx: Ctx; code: string }) {
  const trips = createSource(props.ctx.host, () =>
    fleetView<{ trips: Trip[] }>(props.ctx.host, "fleetPlatform", {
      code: props.code,
      limit: "100",
    }),
  );
  void trips.refresh();
  return (
    <SourceView source={trips} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().trips.filter((trip) =>
            matches(props.ctx.query, trip.full_name, trip.driver_name, trip.plate),
          );
        return (
          <>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(trip) => trip.ext_id}>
                {(trip) => (
                  <li class="nsvx-row">
                    <PlatformMark code={props.code} />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">
                        {trip().full_name ?? trip().driver_name ?? "—"}
                      </span>
                      <span class="nsvx-row__detail">
                        {[
                          trip().at
                            ? new Date(trip().at!).toLocaleString(props.ctx.host.locale, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : null,
                          trip().plate,
                          trip().distance_km !== null ? `${trip().distance_km} km` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Show when={trip().status}>
                      <Chip
                        tone={stateTone(trip().status === "completed" ? "done" : trip().status!)}
                      >
                        {stateLabel(props.ctx.ft, "st_", trip().status)}
                      </Chip>
                    </Show>
                    <span class="nsvx-fin__money">
                      {money(trip().net, trip().currency ?? "EUR", props.ctx.host.locale)}
                    </span>
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty icon="trips" text={props.ctx.ft("noneYet")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

/** Transports: Uber personal and business receipts by quarter, plus trips the fleet platforms synced. */
export function FleetTrips(props: { ctx: Ctx }) {
  return (
    <div class="nsvx-fleet-home">
      <div class="nsvx-fleet-cols">
        <For each={ACCOUNTS} keyed={false}>
          {(account) => <UberAccount ctx={props.ctx} account={account()} />}
        </For>
      </div>
      <FleetPlatformTrips ctx={props.ctx} />
    </div>
  );
}
