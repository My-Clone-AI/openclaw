/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { ConfirmButton, createAction, Note, view } from "./device-kit.js";
import {
  DESKTOP_STEPS,
  SIGN_MODES,
  canRequest,
  placementBox,
  type Company,
  type SignConfig,
  type SignDetail,
  type SignDoc,
  type SignMode,
  type SignProfile,
  type SignRequest,
} from "./docs-data.js";
import type { DocsKey } from "./docs-i18n.js";
import {
  filesIn,
  PageImage,
  PickFiles,
  saveDocFile,
  SignPill,
  signChange,
  type DocsCtx,
} from "./docs-ui.js";
import { every } from "./messages-ui.js";
import { Choice, Field, Panel, Pill } from "./office-kit.js";
import { age, createSource, Icon, SourceView } from "./ui-kit.js";

/** Live steps while the installed official app signs; the owner types the code the phone receives. */
function Desktop(props: { ctx: DocsCtx; request: SignRequest; onDone: () => void }) {
  const kt = () => props.ctx.kt;
  const progress = createSource(props.ctx.host, () =>
    view<{ state: string }>(props.ctx.host, "signatureDesktop", { id: props.request.id }),
  );
  void progress.refresh();
  every(2_000, () => {
    const state = progress.state().data?.state;
    if (state && !(DESKTOP_STEPS as readonly string[]).includes(state)) {
      props.onDone();
      return;
    }
    void progress.refresh();
  });
  const action = createAction(() => props.ctx);
  const [otp, setOtp] = createSignal("");
  const step = () => progress.state().data?.state ?? "";
  const at = () => DESKTOP_STEPS.indexOf(step() as (typeof DESKTOP_STEPS)[number]);
  return (
    <Panel title={kt()("cmdSign")} icon="shield">
      <ol class="nsvx-docs__steps" aria-label={kt()("cmdSign")}>
        <For each={DESKTOP_STEPS} keyed={false}>
          {(item, index) => (
            <li
              class={{
                "nsvx-docs__step--done": index < at(),
                "nsvx-docs__step--now": index === at(),
              }}
            >
              {kt()(`dk_${item()}` as DocsKey)}
            </li>
          )}
        </For>
      </ol>
      <Show when={step() === "awaiting_otp"}>
        <form
          class="nsvx-of__form"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await signChange(props.ctx.host, { action: "otp", id: props.request.id, otp: otp() });
              setOtp("");
              void progress.refresh();
            });
          }}
        >
          <label class="nsvx-of__field">
            <span>{kt()("otp")}</span>
            <input
              class="nsvx-docs__otp"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength={6}
              value={otp()}
              onInput={(event) => setOtp(event.currentTarget.value.replace(/\D/g, ""))}
            />
          </label>
          <button
            type="submit"
            class="nsvx__button nsvx__button--primary"
            disabled={action.busy() || otp().length !== 6}
          >
            <Icon name="done" />
            <span>{kt()("signNow")}</span>
          </button>
        </form>
      </Show>
      <div class="nsvx-docs__actions">
        <ConfirmButton
          label={kt()("cancelSign")}
          confirm={kt()("cancelSign")}
          cancel={props.ctx.dt("cancel")}
          icon="stop"
          danger
          onConfirm={() =>
            void action.run(async () => {
              await signChange(props.ctx.host, { action: "cancel", id: props.request.id });
              props.onDone();
            })
          }
        />
      </div>
      <Note note={action.note()} />
    </Panel>
  );
}

/** The request form: who signs and as what. Each distinct choice keeps one key, so repeating a tap never doubles it. */
function Confirm(props: {
  ctx: DocsCtx;
  doc: SignDoc;
  companies: Company[];
  config?: SignConfig;
  profile?: SignProfile;
  onDone: () => void;
}) {
  const kt = () => props.ctx.kt;
  const action = createAction(() => props.ctx);
  const [mode, setMode] = createSignal<SignMode | "">("");
  const [company, setCompany] = createSignal("");
  const [name, setName] = createSignal(
    props.profile?.configured ? props.profile.expected_name : "",
  );
  const [serial, setSerial] = createSignal(
    props.profile?.configured ? props.profile.expected_serial : "",
  );
  const [confirmed, setConfirmed] = createSignal(false);
  const keys = new Map<string, string>();
  const desktop = () =>
    Boolean(props.config?.desktop.available && props.profile?.configured && mode() !== "company");
  const ready = () =>
    mode() &&
    confirmed() &&
    name().trim().length >= 3 &&
    serial().trim().length >= 3 &&
    (mode() !== "company" || company());
  return (
    <form
      class="nsvx-of__form nsvx-docs__confirm"
      aria-label={kt()("confirmSign")}
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          const fingerprint = JSON.stringify([props.doc.id, mode(), company(), name(), serial()]);
          const key = keys.get(fingerprint) ?? crypto.randomUUID();
          keys.set(fingerprint, key);
          const request = await signChange<{ id: string }>(props.ctx.host, {
            action: "request",
            id: props.doc.id,
            mode: mode(),
            ...(mode() === "company" ? { companyId: company() } : {}),
            name: name(),
            serial: serial(),
            reviewedSha256: props.doc.reviewed_sha256,
            key,
            confirmed: true,
          });
          if (desktop()) {
            await signChange(props.ctx.host, { action: "desktop", id: request.id });
          }
          props.onDone();
        });
      }}
    >
      <div class="nsvx-seg nsvx-of__wide" role="radiogroup" aria-label={kt()("signAs")}>
        <For each={SIGN_MODES} keyed={false}>
          {(item) => (
            <button
              type="button"
              role="radio"
              aria-checked={mode() === item() ? "true" : "false"}
              class={["nsvx-seg__item", { "nsvx-seg__item--on": mode() === item() }]}
              onClick={() => {
                setMode(item());
                setConfirmed(false);
              }}
            >
              <Icon
                name={item() === "company" ? "group" : item() === "eni" ? "progress" : "user"}
              />
              <span>{kt()(`mode_${item()}`)}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={mode() === "company"}>
        <Choice
          label={kt()("company")}
          value={company()}
          options={[
            ["", "—"],
            ...props.companies.map((item) => [item.id, `${item.name} · ${item.nipc}`] as const),
          ]}
          onChange={(value) => {
            setCompany(value);
            setConfirmed(false);
          }}
        />
        <p class="nsvx-of__muted nsvx-of__wide">{kt()("companyNote")}</p>
      </Show>
      <Field
        label={kt()("certName")}
        value={name()}
        max={200}
        onInput={(value) => {
          setName(value);
          setConfirmed(false);
        }}
      />
      <Field
        label={kt()("certId")}
        value={serial()}
        max={100}
        onInput={(value) => {
          setSerial(value);
          setConfirmed(false);
        }}
      />
      <label class="nsvx-of__toggle nsvx-of__wide">
        <input
          type="checkbox"
          checked={confirmed()}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        <span>{kt()("iReviewed")}</span>
      </label>
      <button
        type="submit"
        class="nsvx__button nsvx__button--primary"
        disabled={action.busy() || !ready()}
      >
        <Icon name="shield" />
        <span>{desktop() ? kt()("signInApp") : kt()("signExternal")}</span>
      </button>
      <Note note={action.note()} />
    </form>
  );
}

/** One signature document: every page reviewed first, then the request, signing, and NSVX's validation. */
export function SignViewer(props: {
  ctx: DocsCtx;
  id: string;
  companies: Company[];
  config?: SignConfig;
  profile?: SignProfile;
  onBack: () => void;
}) {
  const kt = () => props.ctx.kt;
  const detail = createSource(props.ctx.host, () =>
    view<SignDetail>(props.ctx.host, "signature", { id: props.id }),
  );
  void detail.refresh();
  every(5_000, () => {
    const state = detail.state().data?.requests[0]?.state;
    if (state === "processing" || state === "awaiting_external") {
      void detail.refresh();
    }
  });
  const [page, setPage] = createSignal(1);
  const [seen, setSeen] = createSignal<number[]>([]);
  const [asking, setAsking] = createSignal(false);
  const action = createAction(() => props.ctx);
  return (
    <section class="nsvx-docs__viewer" aria-label={kt()("sign")}>
      <div class="nsvx-docs__top">
        <button type="button" class="nsvx__button" onClick={() => props.onBack()}>
          <Icon name="back" />
          <span>{kt()("back")}</span>
        </button>
      </div>
      <SourceView source={detail} t={props.ctx.t}>
        {(loaded) => {
          const d = () => loaded();
          const latest = () => d().requests[0];
          const reviewed = createMemo(() => new Set([...d().document.reviewed_pages, ...seen()]));
          const allSeen = () =>
            Array.from({ length: d().document.pages }, (_, index) => index + 1).every((n) =>
              reviewed().has(n),
            );
          const box = () => {
            const placement = d().document.signature_placement;
            return placement && placement.page === page() ? placementBox(placement) : undefined;
          };
          return (
            <>
              <header class="nsvx-docs__head">
                <h3>{d().document.name}</h3>
                <span class="nsvx-docs__meta">
                  <SignPill
                    state={latest()?.state ?? "ready_review"}
                    desktop={latest()?.transport === "desktop"}
                    kt={kt()}
                  />
                  <span class="nsvx-of__muted">
                    {d().document.entity ?? kt()("entityUnknown")} · {age(d().document.created_at)}
                  </span>
                </span>
              </header>
              <div class="nsvx-docs__split">
                <div class="nsvx-docs__pages">
                  <For each={[page()]} keyed={(n) => n}>
                    {(n) => (
                      <PageImage
                        ctx={props.ctx}
                        view="signaturePage"
                        params={{ id: d().document.id, page: String(n()) }}
                        alt={`${kt()("page")} ${n()}`}
                        onLoad={() => setSeen([...seen(), n()])}
                      >
                        <Show when={box()}>
                          {(at) => (
                            <span
                              class="nsvx-docs__seal"
                              aria-label={kt()("sealHere")}
                              style={{
                                left: `${at().left}%`,
                                top: `${at().top}%`,
                                width: `${at().width}%`,
                                height: `${at().height}%`,
                              }}
                            >
                              {kt()("sealHere")}
                            </span>
                          )}
                        </Show>
                      </PageImage>
                    )}
                  </For>
                  <div class="nsvx-docs__pager">
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--icon"
                      aria-label={kt()("prev")}
                      disabled={page() <= 1}
                      onClick={() => setPage(page() - 1)}
                    >
                      <Icon name="back" />
                    </button>
                    <span aria-live="polite">
                      {page()} / {d().document.pages}
                    </span>
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--icon"
                      aria-label={kt()("next")}
                      disabled={page() >= d().document.pages}
                      onClick={() => setPage(page() + 1)}
                    >
                      <Icon name="forward" />
                    </button>
                  </div>
                  <div class="nsvx-docs__dots" aria-label={kt()("reviewed")}>
                    <For
                      each={Array.from(
                        { length: Math.min(d().document.pages, 60) },
                        (_, index) => index + 1,
                      )}
                      keyed={false}
                    >
                      {(n) => (
                        <button
                          type="button"
                          class={[
                            "nsvx-docs__dot",
                            {
                              "nsvx-docs__dot--seen": reviewed().has(n()),
                              "nsvx-docs__dot--now": page() === n(),
                            },
                          ]}
                          aria-label={`${kt()("page")} ${n()}`}
                          onClick={() => setPage(n())}
                        />
                      )}
                    </For>
                  </div>
                </div>
                <div class="nsvx-docs__side">
                  <Show when={canRequest(latest())}>
                    <Show
                      when={asking()}
                      fallback={
                        <>
                          <button
                            type="button"
                            class="nsvx__button nsvx__button--primary nsvx-docs__big"
                            disabled={!allSeen()}
                            onClick={() => setAsking(true)}
                          >
                            <Icon name="edit" />
                            <span>{kt()("signIt")}</span>
                          </button>
                          <Show when={!allSeen()}>
                            <p class="nsvx-of__muted">
                              <Icon name="find" /> {kt()("seeAll")}
                            </p>
                          </Show>
                        </>
                      }
                    >
                      <Confirm
                        ctx={props.ctx}
                        doc={d().document}
                        companies={props.companies}
                        config={props.config}
                        profile={props.profile}
                        onDone={() => {
                          setAsking(false);
                          void detail.refresh();
                        }}
                      />
                    </Show>
                  </Show>
                  <Show
                    when={
                      latest()?.state === "awaiting_external" && latest()?.transport === "desktop"
                        ? latest()
                        : undefined
                    }
                  >
                    {(request) => (
                      <Desktop
                        ctx={props.ctx}
                        request={request()}
                        onDone={() => void detail.refresh()}
                      />
                    )}
                  </Show>
                  <Show
                    when={
                      latest()?.state === "awaiting_external" && latest()?.transport !== "desktop"
                        ? latest()
                        : undefined
                    }
                  >
                    {(request) => (
                      <Panel title={kt()("signOfficial")} icon="shield">
                        <ol class="nsvx-docs__steps nsvx-docs__steps--plain">
                          <li>
                            <button
                              type="button"
                              class="nsvx__button"
                              disabled={action.busy()}
                              onClick={() =>
                                void action.run(() =>
                                  saveDocFile(props.ctx.host, {
                                    kind: "reviewed",
                                    id: d().document.id,
                                  }),
                                )
                              }
                            >
                              <Icon name="download" />
                              <span>{kt()("getPdf")}</span>
                            </button>
                          </li>
                          <li>
                            {request().mode === "company"
                              ? kt()("stepCompany")
                              : kt()("stepPersonal")}
                          </li>
                          <li>
                            <PickFiles
                              label={kt()("addSigned")}
                              icon="upload"
                              primary
                              accept="application/pdf,.pdf"
                              disabled={action.busy()}
                              onFiles={(files) =>
                                void action.run(async () => {
                                  const [file] = await filesIn(files.slice(0, 1));
                                  await props.ctx.host.request("nsvx.sign.import", {
                                    id: request().id,
                                    file,
                                  });
                                  void detail.refresh();
                                }, kt()("checking"))
                              }
                            />
                          </li>
                        </ol>
                        <div class="nsvx-docs__actions">
                          <Show
                            when={
                              request().mode !== "company" &&
                              props.config?.desktop.available &&
                              props.profile?.configured
                            }
                          >
                            <button
                              type="button"
                              class="nsvx__button"
                              disabled={action.busy()}
                              onClick={() =>
                                void action.run(async () => {
                                  await signChange(props.ctx.host, {
                                    action: "desktop",
                                    id: request().id,
                                  });
                                  void detail.refresh();
                                })
                              }
                            >
                              <Icon name="laptop" />
                              <span>{kt()("useApp")}</span>
                            </button>
                          </Show>
                          <ConfirmButton
                            label={kt()("cancelSign")}
                            confirm={kt()("cancelSign")}
                            cancel={props.ctx.dt("cancel")}
                            icon="stop"
                            danger
                            onConfirm={() =>
                              void action.run(async () => {
                                await signChange(props.ctx.host, {
                                  action: "cancel",
                                  id: request().id,
                                });
                                void detail.refresh();
                              })
                            }
                          />
                        </div>
                      </Panel>
                    )}
                  </Show>
                  <Show when={latest()}>
                    {(request) => (
                      <div class="nsvx-docs__validation">
                        <Show when={request().validation.message}>
                          <p>{request().validation.message}</p>
                        </Show>
                        <For each={request().validation.issues ?? []} keyed={false}>
                          {(issue) => (
                            <p class="nsvx-of__warn">
                              <Icon name="alert" />{" "}
                              {kt()(`issue_${issue()}` as DocsKey) ?? kt()("issue_other")}
                            </p>
                          )}
                        </For>
                        <For
                          each={request().validation.signatures ?? []}
                          keyed={(signer) => signer.certificate_sha256}
                        >
                          {(signer) => (
                            <div class="nsvx-docs__signer">
                              <strong>
                                <Icon name="user" /> {signer().name}
                              </strong>
                              <span class="nsvx-docs__meta">
                                <Pill tone={signer().trusted ? "ok" : "warn"} icon="shield">
                                  {signer().trusted ? kt()("trusted") : kt()("notChecked")}
                                </Pill>
                                <Pill
                                  tone={signer().qualified === true ? "ok" : "warn"}
                                  icon="star"
                                >
                                  {signer().qualified === true
                                    ? kt()("qualified")
                                    : kt()("notChecked")}
                                </Pill>
                                <Pill
                                  tone={signer().trusted_timestamp ? "ok" : "warn"}
                                  icon="history"
                                >
                                  {signer().trusted_timestamp && signer().trusted_signed_at
                                    ? new Date(signer().trusted_signed_at ?? "").toLocaleString(
                                        props.ctx.locale,
                                      )
                                    : kt()("notChecked")}
                                </Pill>
                              </span>
                              <span class="nsvx-of__sub">{signer().issuer}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </Show>
                  <div class="nsvx-docs__actions">
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={action.busy()}
                      onClick={() =>
                        void action.run(() =>
                          saveDocFile(props.ctx.host, { kind: "original", id: d().document.id }),
                        )
                      }
                    >
                      <Icon name="download" />
                      <span>{kt()("original")}</span>
                    </button>
                    <Show when={latest()?.signed_sha256 ? latest() : undefined}>
                      {(request) => (
                        <button
                          type="button"
                          class="nsvx__button nsvx__button--primary"
                          disabled={action.busy()}
                          onClick={() =>
                            void action.run(() =>
                              saveDocFile(props.ctx.host, { kind: "signed", id: request().id }),
                            )
                          }
                        >
                          <Icon name="shield" />
                          <span>{kt()("signedPdf")}</span>
                        </button>
                      )}
                    </Show>
                  </div>
                  <Note note={action.note()} />
                  <details class="nsvx-docs__more-info">
                    <summary>{kt()("history")}</summary>
                    <ol class="nsvx-of__timeline">
                      <For each={d().history.toReversed()} keyed={(event) => event.id}>
                        {(event) => (
                          <li>
                            <span class="nsvx-of__main">
                              <strong>
                                {kt()(`sev_${event().kind}` as DocsKey) ?? event().kind}
                              </strong>
                              <span class="nsvx-of__sub">
                                {new Date(event().at).toLocaleString(props.ctx.locale)}
                              </span>
                            </span>
                          </li>
                        )}
                      </For>
                    </ol>
                  </details>
                </div>
              </div>
            </>
          );
        }}
      </SourceView>
    </section>
  );
}
