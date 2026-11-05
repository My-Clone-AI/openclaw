/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import type { MessageKey } from "./i18n.js";
import type { NsvxAction, NsvxApproval, NsvxRunResult, NsvxStatus, NsvxTask } from "./types.js";
import { ConnectCard, createSource, errorMessage, matches, SourceView, type T } from "./ui-kit.js";

const STATUS_COPY: Record<
  Exclude<NsvxStatus["state"], "connected">,
  { title: MessageKey; help: MessageKey }
> = {
  unconfigured: { title: "unconfigured", help: "unconfiguredHelp" },
  "signed-out": { title: "signedOut", help: "signedOutHelp" },
  off: { title: "off", help: "offHelp" },
  offline: { title: "offline", help: "offlineHelp" },
  failed: { title: "failed", help: "failedHelp" },
};

type Field = { name: string; type: string; required: boolean; options: string[] | undefined };

function fieldsOf(contract: Record<string, unknown>): Field[] {
  const input = contract.input as
    | { properties?: Record<string, { type?: string; enum?: string[] }>; required?: string[] }
    | undefined;
  return Object.entries(input?.properties ?? {}).map(([name, schema]) => ({
    name,
    type: schema.type ?? "string",
    required: input?.required?.includes(name) ?? false,
    options: schema.enum,
  }));
}

function coerce(field: Field, raw: string): unknown {
  if (field.type === "integer" || field.type === "number") {
    return Number(raw);
  }
  return field.type === "boolean" ? raw === "true" : raw;
}

function ActionCard(props: {
  action: NsvxAction;
  host: ControlUiHost;
  t: T;
  onSettled: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [fields, setFields] = createSignal<Field[]>([]);
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [busy, setBusy] = createSignal(false);
  const [confirming, setConfirming] = createSignal(false);
  const [result, setResult] = createSignal<{
    message: string;
    output?: unknown;
    failed: boolean;
  }>();
  // One key per intent: retrying an uncertain run replays it in NSVX instead of repeating it.
  let idempotencyKey = crypto.randomUUID();
  const isRead = () => props.action.risk_class === "read";

  const toggle = async () => {
    const next = !open();
    setOpen(next);
    if (next && fields().length === 0) {
      try {
        const detail = await props.host.request<{ contract: Record<string, unknown> }>(
          "nsvx.actions.get",
          { actionId: props.action.id },
        );
        setFields(fieldsOf(detail.contract));
      } catch (cause) {
        setResult({ message: errorMessage(props.host, cause), failed: true });
      }
    }
  };
  const run = async () => {
    if (!isRead() && !confirming()) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    setResult(undefined);
    try {
      const input = Object.fromEntries(
        fields()
          .filter((field) => values()[field.name])
          .map((field) => [field.name, coerce(field, values()[field.name] ?? "")]),
      );
      const outcome = await props.host.request<NsvxRunResult>("nsvx.actions.run", {
        actionId: props.action.id,
        idempotencyKey,
        input,
      });
      setResult({
        message: props.t(
          outcome.status === "requires_approval"
            ? "waitingApproval"
            : outcome.status === "accepted"
              ? "queued"
              : outcome.replayed
                ? "repeatedResult"
                : "done",
        ),
        output: outcome.output,
        failed: false,
      });
      idempotencyKey = crypto.randomUUID();
    } catch (cause) {
      const uncertain = (cause as { gatewayCode?: string }).gatewayCode === "uncertain";
      setResult({
        message: uncertain ? props.t("uncertain") : errorMessage(props.host, cause),
        failed: true,
      });
      if (!uncertain) {
        idempotencyKey = crypto.randomUUID();
      }
    } finally {
      setBusy(false);
      props.onSettled();
    }
  };
  return (
    <li class="nsvx-action">
      <button
        type="button"
        class="nsvx-action__head"
        aria-expanded={open() ? "true" : "false"}
        onClick={() => void toggle()}
      >
        <span class="nsvx-action__title">{props.action.title}</span>
        <span class={["nsvx__chip", { "nsvx__chip--write": !isRead() }]}>
          {props.t(isRead() ? "readOnly" : "changes")}
        </span>
      </button>
      <Show when={open()}>
        <div class="nsvx-action__body">
          <p class="nsvx-action__description">{props.action.description}</p>
          <For each={fields()} keyed={(field) => field.name}>
            {(field) => (
              <label class="nsvx-field">
                <span>
                  {field().name}
                  {field().required ? " *" : ""}
                </span>
                <Show
                  when={field().options}
                  fallback={
                    <input
                      type={
                        field().type === "number" || field().type === "integer" ? "number" : "text"
                      }
                      value={values()[field().name] ?? ""}
                      onInput={(event) =>
                        setValues({ ...values(), [field().name]: event.currentTarget.value })
                      }
                    />
                  }
                >
                  {(options) => (
                    <select
                      onChange={(event) =>
                        setValues({ ...values(), [field().name]: event.currentTarget.value })
                      }
                    >
                      <option value="" />
                      <For each={options()}>
                        {(option) => <option value={option}>{option}</option>}
                      </For>
                    </select>
                  )}
                </Show>
              </label>
            )}
          </For>
          <div class="nsvx-action__buttons">
            <Show when={confirming()}>
              <button type="button" class="nsvx__button" onClick={() => setConfirming(false)}>
                {props.t("cancel")}
              </button>
            </Show>
            <button
              type="button"
              class="nsvx__button nsvx__button--primary"
              disabled={
                busy() ||
                !props.host.connection.canWrite ||
                fields().some((field) => field.required && !values()[field.name])
              }
              onClick={() => void run()}
            >
              {props.t(confirming() ? "confirm" : "run")}
            </button>
          </div>
          <Show when={result()}>
            {(shown) => (
              <div role="status">
                <p class={shown().failed ? "nsvx__notice nsvx__notice--bad" : "nsvx__notice"}>
                  {shown().message}
                </p>
                <Show when={shown().output}>
                  <pre class="nsvx-action__output">
                    {props.host.redact(JSON.stringify(shown().output, null, 2))}
                  </pre>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </li>
  );
}

export function ActionsTab(props: { host: ControlUiHost; t: T; query: string }) {
  const status = createSource(props.host, () => props.host.request<NsvxStatus>("nsvx.status"));
  const connected = () => status.state().data?.state === "connected";
  const actions = createSource(props.host, async () => {
    const [list, approvals, tasks] = await Promise.all([
      props.host.request<{ actions: NsvxAction[] }>("nsvx.actions.list"),
      props.host.request<{ approvals: NsvxApproval[] }>("nsvx.approvals.list"),
      props.host.request<{ tasks: NsvxTask[] }>("nsvx.tasks.list"),
    ]);
    return { actions: list.actions, approvals: approvals.approvals, tasks: tasks.tasks };
  });
  const reload = async () => {
    await status.refresh();
    if (connected()) {
      await actions.refresh();
    }
  };
  void reload();
  const decide = async (approvalId: string, decision: "approve" | "deny") => {
    try {
      await props.host.request("nsvx.approvals.decide", { approvalId, decision });
    } finally {
      await actions.refresh();
    }
  };
  return (
    <SourceView source={status} t={props.t}>
      {(current) => (
        <Show
          when={current().state === "connected"}
          fallback={
            <ConnectCard
              t={props.t}
              title={STATUS_COPY[current().state as keyof typeof STATUS_COPY].title}
              help={STATUS_COPY[current().state as keyof typeof STATUS_COPY].help}
              address={current().address}
              onRetry={() => void reload()}
            />
          }
        >
          <SourceView source={actions} t={props.t}>
            {(data) => (
              <>
                <Show when={data().approvals.length > 0}>
                  <h2 class="nsvx__heading">{props.t("approvals")}</h2>
                  <ul class="nsvx-list">
                    <For each={data().approvals} keyed={(approval) => approval.id}>
                      {(approval) => (
                        <li class="nsvx-approval">
                          <span class="nsvx-action__title">{approval().action}</span>
                          <span class="nsvx-action__buttons">
                            <button
                              type="button"
                              class="nsvx__button"
                              disabled={!props.host.connection.canGrant}
                              onClick={() => void decide(approval().id, "deny")}
                            >
                              {props.t("deny")}
                            </button>
                            <button
                              type="button"
                              class="nsvx__button nsvx__button--primary"
                              disabled={!props.host.connection.canGrant}
                              onClick={() => void decide(approval().id, "approve")}
                            >
                              {props.t("approve")}
                            </button>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <ul class="nsvx-list">
                  <For
                    each={data().actions.filter((action) =>
                      matches(props.query, action.title, action.description, action.id),
                    )}
                    keyed={(action) => action.id}
                  >
                    {(action) => (
                      <ActionCard
                        action={action()}
                        host={props.host}
                        t={props.t}
                        onSettled={() => void actions.refresh()}
                      />
                    )}
                  </For>
                </ul>
                <Show when={data().actions.length === 0}>
                  <p class="nsvx__empty">{props.t("noActions")}</p>
                </Show>
                <Show when={data().tasks.length > 0}>
                  <h2 class="nsvx__heading">{props.t("recent")}</h2>
                  <ul class="nsvx-list">
                    <For each={data().tasks.slice(0, 10)} keyed={(task) => task.id}>
                      {(task) => (
                        <li class="nsvx-task">
                          <span>{task().action}</span>
                          <span class="nsvx__chip">{task().state}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </>
            )}
          </SourceView>
        </Show>
      )}
    </SourceView>
  );
}
