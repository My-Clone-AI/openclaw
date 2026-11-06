/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { ConfirmButton, createAction, Note, view } from "./device-kit.js";
import {
  SIGN_STATES,
  type Company,
  type SignConfig,
  type SignDoc,
  type SignProfile,
} from "./docs-data.js";
import type { DocsKey } from "./docs-i18n.js";
import { SignViewer } from "./docs-sign-view.js";
import { filesIn, PickFiles, SignPill, signChange, type DocsCtx } from "./docs-ui.js";
import { every } from "./messages-ui.js";
import { Field, Panel, Reveal } from "./office-kit.js";
import { age, createSource, Icon, SourceView } from "./ui-kit.js";

const PAGE = 50;

/** Autenticação.gov: whether the installed official app can sign here, and the encrypted CMD vault. */
function Cmd(props: {
  ctx: DocsCtx;
  config?: SignConfig;
  profile?: SignProfile;
  onSaved: () => void;
}) {
  const kt = () => props.ctx.kt;
  const action = createAction(() => props.ctx);
  const [phone, setPhone] = createSignal("");
  const [pin, setPin] = createSignal("");
  const [name, setName] = createSignal(props.profile?.expected_name ?? "");
  const [serial, setSerial] = createSignal(props.profile?.expected_serial ?? "");
  const ready = () =>
    /^(\+351)?9\d{8}$/.test(phone().replace(/[\s()-]/g, "")) &&
    /^\d{4,8}$/.test(pin()) &&
    name().trim().length >= 3 &&
    serial().trim().length >= 3;
  return (
    <div class="nsvx-docs__cmd">
      <span class="nsvx-docs__gov" aria-hidden="true">
        <Icon name="shield" />
      </span>
      <span class="nsvx-of__main">
        <strong>Autenticação.gov</strong>
        <span class="nsvx-of__sub" role="status">
          {!props.config?.desktop.available
            ? kt()("cmdManual")
            : props.profile?.configured
              ? `${kt()("cmdReady")} · ${props.profile.phone_masked ?? ""}`
              : kt()("cmdSetup")}
        </span>
      </span>
      <Reveal label={kt()("cmdVault")} icon="key">
        {(close) => (
          <form
            class="nsvx-of__form"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(async () => {
                await props.ctx.host.request("nsvx.sign.profile", {
                  action: "save",
                  phone: phone(),
                  pin: pin(),
                  name: name(),
                  serial: serial(),
                });
                setPin("");
                setPhone("");
                close();
                props.onSaved();
              }, kt()("saved"));
              // The PIN never stays in the form, whatever NSVX answers.
              setPin("");
            }}
          >
            <Field
              label={kt()("cmdPhone")}
              type="tel"
              value={phone()}
              max={16}
              placeholder="9xx xxx xxx"
              onInput={setPhone}
            />
            <label class="nsvx-of__field">
              <span>{kt()("cmdPin")}</span>
              <input
                type="password"
                autocomplete="off"
                inputmode="numeric"
                maxlength={8}
                value={pin()}
                onInput={(event) => setPin(event.currentTarget.value)}
              />
            </label>
            <Field label={kt()("certName")} value={name()} max={200} onInput={setName} />
            <Field label={kt()("certId")} value={serial()} max={100} onInput={setSerial} />
            <p class="nsvx-of__muted nsvx-of__wide">
              <Icon name="lock" /> {kt()("cmdNote")}
            </p>
            <div class="nsvx-docs__actions nsvx-of__wide">
              <button
                type="submit"
                class="nsvx__button nsvx__button--primary"
                disabled={action.busy() || !ready()}
              >
                <Icon name="lock" />
                <span>{kt()("save")}</span>
              </button>
              <Show when={props.profile?.configured}>
                <ConfirmButton
                  label={kt()("forget")}
                  confirm={kt()("forgetNow")}
                  cancel={props.ctx.dt("cancel")}
                  icon="trash"
                  danger
                  onConfirm={() =>
                    void action.run(async () => {
                      await props.ctx.host.request("nsvx.sign.profile", { action: "forget" });
                      close();
                      props.onSaved();
                    })
                  }
                />
              </Show>
            </div>
            <Note note={action.note()} />
          </form>
        )}
      </Reveal>
    </div>
  );
}

/** NSVX Assinaturas (`/documentos/assinaturas`), natively: add, review, request, sign in the official app, verify. */
export function SignDesk(props: { ctx: DocsCtx; open: string; onOpen: (id: string) => void }) {
  const kt = () => props.ctx.kt;
  const [state, setState] = createSignal("");
  const [offset, setOffset] = createSignal(0);
  const list = createSource(props.ctx.host, () =>
    view<{ documents: SignDoc[] }>(props.ctx.host, "signatures", {
      offset: String(offset()),
      ...(state() ? { state: state() } : {}),
      ...(props.ctx.query.trim() ? { q: props.ctx.query.trim() } : {}),
    }),
  );
  const companies = createSource(props.ctx.host, () =>
    view<{ companies: Company[] }>(props.ctx.host, "signatureCompanies"),
  );
  const config = createSource(props.ctx.host, () =>
    view<SignConfig>(props.ctx.host, "signatureConfig"),
  );
  const profile = createSource(props.ctx.host, () =>
    view<SignProfile>(props.ctx.host, "signatureProfile"),
  );
  const reload = () => {
    void list.refresh();
    void companies.refresh();
    void config.refresh();
    void profile.refresh();
  };
  reload();
  every(10_000, () => !props.open && void list.refresh());
  const action = createAction(() => props.ctx);
  const open = (id: string) => {
    props.onOpen(id);
    const url = new URL(location.href);
    if (id) {
      url.searchParams.set("sig", id);
    } else {
      url.searchParams.delete("sig");
    }
    history.replaceState(history.state, "", url);
  };
  const add = (files: File[], photo = false) =>
    void action.run(async () => {
      let last = "";
      // NSVX takes one PDF per call; each becomes its own reviewed snapshot.
      for (const file of files.slice(0, 20)) {
        const [encoded] = await filesIn([file]);
        last = (
          await props.ctx.host.request<{ id: string }>("nsvx.sign.upload", { file: encoded, photo })
        ).id;
      }
      void list.refresh();
      if (files.length === 1 && last) {
        open(last);
      }
    }, kt()("added"));
  return (
    <Show
      when={!props.open}
      fallback={
        <For each={[props.open]} keyed={(id) => id}>
          {(id) => (
            <SignViewer
              ctx={props.ctx}
              id={id()}
              companies={companies.state().data?.companies ?? []}
              config={config.state().data}
              profile={profile.state().data}
              onBack={() => {
                open("");
                void list.refresh();
              }}
            />
          )}
        </For>
      }
    >
      {/* Desk controls wait for the list, so a missing sign-in shows one card, not a dead desk. */}
      <Show when={list.state().data}>
        <div class="nsvx-docs__hero">
          <Cmd
            ctx={props.ctx}
            config={config.state().data}
            profile={profile.state().data}
            onSaved={() => void profile.refresh()}
          />
          <div class="nsvx-docs__actions">
            <PickFiles
              label={kt()("addPdf")}
              icon="plus"
              primary
              multiple
              accept="application/pdf,.pdf"
              disabled={action.busy()}
              onFiles={(files) => add(files)}
            />
            <PickFiles
              label={kt()("photo")}
              icon="image"
              capture
              accept="image/jpeg,image/png,image/webp"
              disabled={action.busy()}
              onFiles={(files) => add(files.slice(0, 1), true)}
            />
          </div>
        </div>
        <Note note={action.note()} />
        <div class="nsvx-docs__chips" role="radiogroup" aria-label={kt()("state")}>
          <For each={["", ...SIGN_STATES.filter((item) => item !== "processing")]} keyed={false}>
            {(item) => (
              <button
                type="button"
                role="radio"
                aria-checked={state() === item() ? "true" : "false"}
                class={["nsvx-of__pick", { "nsvx-of__pick--on": state() === item() }]}
                onClick={() => {
                  setState(item());
                  setOffset(0);
                  void list.refresh();
                }}
              >
                {item() ? kt()(`sign_${item()}` as DocsKey) : kt()("all")}
              </button>
            )}
          </For>
        </div>
      </Show>
      <SourceView source={list} t={props.ctx.t}>
        {(data) => (
          <>
            <ul class="nsvx-of__list" aria-label={kt()("sign")}>
              <For
                each={data().documents}
                keyed={(doc) => doc.id}
                fallback={
                  <li class="nsvx-docs__empty">
                    <Icon name="edit" />
                    <strong>
                      {state() || props.ctx.query.trim() ? kt()("none") : kt()("noSign")}
                    </strong>
                    <span class="nsvx-of__sub">{kt()("signHint")}</span>
                  </li>
                }
              >
                {(doc) => (
                  <li data-sig={doc().id}>
                    <button
                      type="button"
                      class="nsvx-of__row nsvx-docs__row"
                      onClick={() => open(doc().id)}
                    >
                      <span class="nsvx-docs__icon">
                        <Icon name="doc" />
                      </span>
                      <span class="nsvx-of__main">
                        <strong>{doc().name}</strong>
                        <span class="nsvx-of__sub">
                          {doc().pages} {kt()("pages")} · {age(doc().created_at)}
                        </span>
                      </span>
                      <span class="nsvx-docs__meta">
                        <SignPill
                          state={doc().state ?? "ready_review"}
                          desktop={doc().transport === "desktop"}
                          kt={kt()}
                        />
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <Show when={offset() > 0 || data().documents.length >= PAGE}>
              <div class="nsvx-docs__pager">
                <button
                  type="button"
                  class="nsvx__button nsvx__button--icon"
                  aria-label={kt()("prev")}
                  disabled={offset() === 0}
                  onClick={() => {
                    setOffset(Math.max(0, offset() - PAGE));
                    void list.refresh();
                  }}
                >
                  <Icon name="back" />
                </button>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--icon"
                  aria-label={kt()("next")}
                  disabled={data().documents.length < PAGE}
                  onClick={() => {
                    setOffset(offset() + PAGE);
                    void list.refresh();
                  }}
                >
                  <Icon name="forward" />
                </button>
              </div>
            </Show>
          </>
        )}
      </SourceView>
      <Show when={list.state().data}>
        <Companies
          ctx={props.ctx}
          companies={companies.state().data?.companies ?? []}
          onSaved={() => void companies.refresh()}
        />
      </Show>
    </Show>
  );
}

/** Companies the owner signs for as manager; NSVX notes the manager attribute still needs official checking. */
function Companies(props: { ctx: DocsCtx; companies: Company[]; onSaved: () => void }) {
  const kt = () => props.ctx.kt;
  const action = createAction(() => props.ctx);
  const [name, setName] = createSignal("");
  const [nipc, setNipc] = createSignal("");
  return (
    <Panel
      title={kt()("companies")}
      icon="group"
      count={props.companies.length}
      action={
        <Reveal label={kt()("add")} icon="plus">
          {(close) => (
            <form
              class="nsvx-of__form"
              onSubmit={(event) => {
                event.preventDefault();
                void action.run(async () => {
                  await signChange(props.ctx.host, {
                    action: "company",
                    name: name(),
                    nipc: nipc(),
                  });
                  setName("");
                  setNipc("");
                  close();
                  props.onSaved();
                }, kt()("saved"));
              }}
            >
              <Field label={kt()("companyName")} value={name()} max={200} onInput={setName} />
              <Field label="NIPC" value={nipc()} max={9} mode="numeric" onInput={setNipc} />
              <button
                type="submit"
                class="nsvx__button nsvx__button--primary"
                disabled={action.busy() || name().trim().length < 2 || !/^\d{9}$/.test(nipc())}
              >
                <Icon name="done" />
                <span>{kt()("save")}</span>
              </button>
            </form>
          )}
        </Reveal>
      }
    >
      <ul class="nsvx-of__list">
        <For each={props.companies} keyed={(item) => item.id}>
          {(item) => (
            <li class="nsvx-of__row">
              <Icon name="group" />
              <span class="nsvx-of__main">
                <strong>{item().name}</strong>
                <span class="nsvx-of__sub">NIPC {item().nipc}</span>
              </span>
            </li>
          )}
        </For>
      </ul>
      <Note note={action.note()} />
    </Panel>
  );
}
