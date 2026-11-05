/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import {
  COVERAGE_TONE,
  eur,
  shortDay,
  splitSuggestions,
  type BankCoverage,
  type Suggestion,
} from "./legal-data.js";
import { changeCaseRequest, type LegalCtx } from "./legal-kit.js";
import { every } from "./messages-ui.js";
import { Field, Pill, Reveal } from "./office-kit.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

function SuggestionCard(props: {
  ctx: LegalCtx;
  row: Suggestion;
  onChange: () => void;
  onOpen: (ref: string) => void;
}) {
  const ctx = () => props.ctx;
  const row = () => props.row;
  const [open, setOpen] = createSignal(row().status === "reviewing");
  const [why, setWhy] = createSignal("");
  const action = createAction(ctx);
  const setStatus = (status: string, reason?: string) =>
    void action.run(async () => {
      await changeCaseRequest(ctx(), {
        action: "suggestionStatus",
        id: row().id,
        status,
        reason: reason || null,
      });
      props.onChange();
    });
  const canWrite = () => ctx().host.connection.canWrite;
  const metric = () => row().metrics ?? {};
  return (
    <li class="nsvx-of__panel">
      <header class="nsvx-of__head">
        <strong class="nsvx-of__grow">{row().title}</strong>
        <Pill tone={COVERAGE_TONE[row().coverage]}>{ctx().lt(`coverage_${row().coverage}`)}</Pill>
        <Pill>{ctx().lt(`sugg_${row().status}`)}</Pill>
      </header>
      <Show when={row().counterparty || row().context}>
        <p class="nsvx-of__muted">
          {[row().counterparty, row().context].filter(Boolean).join(" · ")}
        </p>
      </Show>
      <Show when={metric().formal_signals?.length}>
        <p class="nsvx-of__warn">{ctx().lt("maybeFormal")}</p>
      </Show>
      <dl class="nsvx-of__dl">
        <dt>{ctx().lt("lastPayment")}</dt>
        <dd>
          {metric().last_payment
            ? shortDay(metric().last_payment?.date, ctx().locale)
            : ctx().lt("notConfirmed")}
        </dd>
        <Show when={metric().outstanding}>
          {(owed) => (
            <>
              <dt>{ctx().lt(owed().estimate ? "estimate" : "owed")}</dt>
              <dd>{eur(owed().amount, ctx().locale)}</dd>
            </>
          )}
        </Show>
        <Show when={metric().oldest_unpaid}>
          {(oldest) => (
            <>
              <dt>{ctx().lt("unpaidSince")}</dt>
              <dd>
                {shortDay(oldest().date, ctx().locale)} · {oldest().days}
              </dd>
            </>
          )}
        </Show>
        <dt>{ctx().lt("evidence")}</dt>
        <dd>{row().evidence.length}</dd>
      </dl>
      <Show when={open()}>
        <h4 class="nsvx-of__sub">{ctx().lt("why")}</h4>
        <ul class="nsvx-of__list">
          <For each={row().reasons} keyed={false}>
            {(reason) => <li class="nsvx-of__body">{reason().text}</li>}
          </For>
        </ul>
        <Show when={row().missing.length}>
          <h4 class="nsvx-of__sub">{ctx().lt("missing")}</h4>
          <ul class="nsvx-of__list">
            <For each={row().missing} keyed={false}>
              {(item) => <li class="nsvx-of__body">{item()}</li>}
            </For>
          </ul>
        </Show>
        <ul class="nsvx-of__list">
          <For each={row().evidence} keyed={(item) => item.drive_file_id}>
            {(item) => (
              <li class="nsvx-of__row">
                <Icon name="doc" />
                <span class="nsvx-of__main">{item().name}</span>
                <Pill tone={item().read === "not_read" ? "warn" : "ok"}>{item().read}</Pill>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show
        when={row().status === "converted" && row().case_id}
        fallback={
          <div class="nsvx-of__bar">
            <button
              type="button"
              class="nsvx__button"
              aria-expanded={open() ? "true" : "false"}
              onClick={() => {
                setOpen(!open());
                if (!open() && row().status === "new") {
                  setStatus("reviewing");
                }
              }}
            >
              <Icon name="find" />
              <span>{ctx().lt(open() ? "close" : "look")}</span>
            </button>
            <Show when={row().status !== "rejected"}>
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy() || !canWrite() || row().status === "confirmed"}
                onClick={() => setStatus("confirmed")}
              >
                <Icon name="done" />
                <span>{ctx().lt("confirmData")}</span>
              </button>
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                disabled={action.busy() || !canWrite()}
                onClick={() =>
                  void action.run(async () => {
                    const made = await changeCaseRequest<{ ref: string }>(ctx(), {
                      action: "suggestionConvert",
                      id: row().id,
                    });
                    props.onChange();
                    props.onOpen(made.ref);
                  })
                }
              >
                <Icon name="plus" />
                <span>{ctx().lt("createCase")}</span>
              </button>
              <Reveal label={ctx().lt("ignore")} icon="close">
                {(close) => (
                  <div class="nsvx-of__form">
                    <Field
                      label={ctx().lt("reasonOptional")}
                      value={why()}
                      max={300}
                      onInput={setWhy}
                    />
                    <div class="nsvx-dev__bar">
                      <button
                        type="button"
                        class="nsvx__button nsvx__button--danger"
                        disabled={action.busy() || !canWrite()}
                        onClick={() => {
                          setStatus("rejected", why().trim());
                          close();
                        }}
                      >
                        {ctx().lt("ignore")}
                      </button>
                    </div>
                  </div>
                )}
              </Reveal>
            </Show>
            <Show when={row().status === "rejected"}>
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy() || !canWrite()}
                onClick={() => setStatus("new")}
              >
                {ctx().lt("reopen")}
              </button>
            </Show>
          </div>
        }
      >
        <button
          type="button"
          class="nsvx__button"
          onClick={() => props.onOpen(row().case_id as string)}
        >
          <Icon name="legal" />
          <span>{ctx().lt("openCase")}</span>
        </button>
      </Show>
      <Note note={action.note()} />
    </li>
  );
}

export function Suggestions(props: {
  ctx: LegalCtx;
  onOpen: (ref: string) => void;
  onChange: () => void;
}) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{
      suggestions: Suggestion[];
      last_run: { at: string; stats?: { files_considered?: number } } | null;
      bank_coverage: BankCoverage;
    }>(ctx().host, "caseSuggestions"),
  );
  void source.refresh();
  every(30_000, () => void source.refresh());
  const action = createAction(ctx);
  const [showClosed, setShowClosed] = createSignal(false);
  const changed = () => {
    void source.refresh();
    props.onChange();
  };
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => {
        const split = () => splitSuggestions(data().suggestions);
        return (
          <div class="nsvx-of">
            <div class="nsvx-of__bar">
              <span class="nsvx-of__muted nsvx-of__grow">
                {data().last_run
                  ? `${ctx().lt("lastRun")} ${shortDay(data().last_run?.at, ctx().locale)}`
                  : ctx().lt("neverRun")}
              </span>
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy() || !ctx().host.connection.canWrite}
                onClick={() =>
                  void action.run(
                    () => changeCaseRequest(ctx(), { action: "discovery" }),
                    ctx().lt("discoveryAsked"),
                  )
                }
              >
                <Icon name="refresh" />
                <span>{ctx().lt("lookNow")}</span>
              </button>
            </div>
            <Note note={action.note()} />
            <p class="nsvx-of__muted">
              {ctx().lt("notAccusations")} {data().bank_coverage.note}
            </p>
            <ul class="nsvx-of__list">
              <For
                each={split().open}
                keyed={(row) => row.id}
                fallback={<p class="nsvx__empty">{ctx().lt("noSuggestions")}</p>}
              >
                {(row) => (
                  <SuggestionCard
                    ctx={ctx()}
                    row={row()}
                    onChange={changed}
                    onOpen={props.onOpen}
                  />
                )}
              </For>
            </ul>
            <Show when={split().closed.length}>
              <button
                type="button"
                class="nsvx__button"
                onClick={() => setShowClosed(!showClosed())}
              >
                {ctx().lt(showClosed() ? "hide" : "show")} · {split().closed.length}
              </button>
              <Show when={showClosed()}>
                <ul class="nsvx-of__list">
                  <For each={split().closed} keyed={(row) => row.id}>
                    {(row) => (
                      <SuggestionCard
                        ctx={ctx()}
                        row={row()}
                        onChange={changed}
                        onOpen={props.onOpen}
                      />
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </div>
        );
      }}
    </SourceView>
  );
}
