/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  MEMORY_KINDS,
  type DesktopBot,
  type MemoryItem,
  type MemoryKind,
  type Skill,
  type SkillDetail,
} from "./device-data.js";
import { ConfirmButton, createAction, Note, Segs, view, type Ctx } from "./device-kit.js";
import { age, createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

const MEMORY_VIEW: Record<MemoryKind, string> = {
  recall: "memoryRecall",
  profile: "memoryProfile",
  journal: "memoryJournal",
  facts: "memoryFacts",
};
const MEMORY_ICON: Record<MemoryKind, IconName> = {
  recall: "find",
  profile: "bot",
  journal: "doc",
  facts: "done",
};

function MemoryRow(props: { ctx: Ctx; bot: string; item: MemoryItem; onChanged: () => void }) {
  const ctx = () => props.ctx;
  const [fixing, setFixing] = createSignal(false);
  const [draft, setDraft] = createSignal(props.item.snippet);
  const action = createAction(ctx);
  return (
    <li class="nsvx-dev__memory">
      <div class="nsvx-dev__memory-head">
        <span class="nsvx__chip">{props.item.level}</span>
        <span
          class="nsvx-dev__meter"
          role="meter"
          aria-label={ctx().dt("match")}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={String(Math.round(props.item.confidence * 100))}
        >
          <span style={{ width: `${Math.round(props.item.confidence * 100)}%` }} />
        </span>
        <span class="nsvx-dev__spacer" />
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={ctx().dt("fix")}
          title={ctx().dt("fix")}
          disabled={!ctx().host.connection.canWrite}
          onClick={() => setFixing(!fixing())}
        >
          <Icon name="edit" />
        </button>
        <ConfirmButton
          label={ctx().dt("forget")}
          confirm={ctx().dt("forget")}
          cancel={ctx().dt("cancel")}
          icon="trash"
          danger
          disabled={action.busy() || !ctx().host.connection.canWrite}
          onConfirm={() =>
            void action
              .run(() =>
                ctx().host.request("nsvx.desktop.memory.forget", {
                  botId: props.bot,
                  recordId: props.item.id,
                }),
              )
              .then((ok) => ok && props.onChanged())
          }
        />
      </div>
      <Show when={fixing()} fallback={<p class="nsvx-dev__snippet">{props.item.snippet}</p>}>
        <form
          class="nsvx-dev__fix"
          onSubmit={(event) => {
            event.preventDefault();
            void action
              .run(
                () =>
                  ctx().host.request("nsvx.desktop.memory.correct", {
                    botId: props.bot,
                    recordId: props.item.id,
                    text: draft(),
                  }),
                ctx().dt("saved"),
              )
              .then((ok) => ok && setFixing(false));
          }}
        >
          <textarea
            aria-label={ctx().dt("fix")}
            rows={4}
            maxlength={2000}
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
          />
          <div class="nsvx-dev__buttons">
            <button type="button" class="nsvx__button" onClick={() => setFixing(false)}>
              {ctx().dt("cancel")}
            </button>
            <button
              type="submit"
              class="nsvx__button nsvx__button--primary"
              disabled={action.busy() || !draft().trim()}
            >
              {ctx().dt("save")}
            </button>
          </div>
        </form>
      </Show>
      <Note note={action.note()} />
    </li>
  );
}

export function Memory(props: { ctx: Ctx }) {
  const ctx = () => props.ctx;
  const bots = createSource(ctx().host, () =>
    view<{ bots: DesktopBot[] }>(ctx().host, "desktopBots"),
  );
  // Request inputs live in plain variables: a signal written in a handler reads stale until the next flush.
  const request = { bot: "", kind: "recall" as MemoryKind, q: "" };
  const [kind, setKind] = createSignal<MemoryKind>("recall");
  const [bot, setBot] = createSignal("");
  const [q, setQ] = createSignal("");
  const items = createSource(ctx().host, () =>
    view<{ items: MemoryItem[] }>(ctx().host, MEMORY_VIEW[request.kind], {
      bot: request.bot,
      ...(request.kind === "recall" && request.q ? { q: request.q } : {}),
    }),
  );
  const load = () => {
    if (request.bot) {
      void items.refresh();
    }
  };
  void bots.refresh().then(() => {
    const first = bots.state().data?.bots.find((b) => b.definition)?.id ?? "";
    request.bot = first;
    setBot(first);
    load();
  });
  return (
    <SourceView source={bots} t={ctx().t}>
      {(data) => (
        <div class="nsvx-dev__stack">
          <Segs
            name={ctx().dt("memory")}
            items={MEMORY_KINDS}
            value={kind()}
            label={(key) => ctx().dt(key)}
            icon={(key) => MEMORY_ICON[key]}
            onChange={(next) => {
              request.kind = next;
              setKind(next);
              load();
            }}
          />
          <form
            class="nsvx-dev__bar"
            onSubmit={(event) => {
              event.preventDefault();
              load();
            }}
          >
            <label class="nsvx-field">
              <span>{ctx().dt("bot")}</span>
              <input
                list="nsvx-dev-bot-ids"
                value={bot()}
                maxlength={64}
                onChange={(event) => {
                  request.bot = event.currentTarget.value.trim();
                  setBot(request.bot);
                  load();
                }}
              />
              <datalist id="nsvx-dev-bot-ids">
                <For each={data().bots.filter((b) => b.definition)} keyed={(b) => b.id}>
                  {(b) => <option value={b().id}>{b().definition?.name}</option>}
                </For>
              </datalist>
            </label>
            <Show when={kind() === "recall"}>
              <input
                class="nsvx__search nsvx-dev__grow"
                type="search"
                maxlength={500}
                placeholder={ctx().dt("memoryHint")}
                aria-label={ctx().dt("memoryHint")}
                value={q()}
                onInput={(event) => {
                  request.q = event.currentTarget.value;
                  setQ(request.q);
                }}
              />
              <button
                type="submit"
                class="nsvx__button nsvx__button--icon"
                aria-label={ctx().dt("recall")}
              >
                <Icon name="find" />
              </button>
            </Show>
          </form>
          <Show when={bot()} fallback={<p class="nsvx__empty">{ctx().dt("noBots")}</p>}>
            <SourceView source={items} t={ctx().t}>
              {(found) => (
                <>
                  <ul class="nsvx-list nsvx-dev__memories">
                    <For
                      each={found().items.filter((item) => matches(ctx().query, item.snippet))}
                      keyed={(item) => item.id}
                    >
                      {(item) => (
                        <MemoryRow
                          ctx={ctx()}
                          bot={request.bot}
                          item={item()}
                          onChanged={() => void items.refresh()}
                        />
                      )}
                    </For>
                  </ul>
                  <Show when={found().items.length === 0}>
                    <p class="nsvx__empty">{ctx().dt("noMemory")}</p>
                  </Show>
                </>
              )}
            </SourceView>
          </Show>
        </div>
      )}
    </SourceView>
  );
}

function stepText(step: unknown): string {
  if (typeof step === "string") {
    return step;
  }
  const row = (step ?? {}) as Record<string, unknown>;
  const label = [row.title, row.text, row.name, row.description].find(
    (value): value is string => typeof value === "string",
  );
  return label ?? JSON.stringify(step);
}

function SkillBody(props: { ctx: Ctx; slug: string }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, async () => {
    const { items } = await view<{ items: { version: string }[] }>(ctx().host, "skillVersions", {
      slug: props.slug,
    });
    return view<SkillDetail>(ctx().host, "skill", {
      slug: props.slug,
      version: items[0]?.version ?? "",
    });
  });
  void source.refresh();
  return (
    <div class="nsvx-dev__skill-body">
      <SourceView source={source} t={ctx().t}>
        {(skill) => (
          <>
            <span class="nsvx__chip">v {skill().version}</span>
            <Show when={Array.isArray(skill().steps) && (skill().steps as unknown[]).length > 0}>
              <h3 class="nsvx__heading">{ctx().dt("steps")}</h3>
              <ol class="nsvx-dev__steps">
                <For each={skill().steps as unknown[]} keyed={false}>
                  {(step) => <li>{stepText(step())}</li>}
                </For>
              </ol>
            </Show>
            <Show when={skill().body}>
              <p class="nsvx-dev__snippet">{skill().body}</p>
            </Show>
          </>
        )}
      </SourceView>
    </div>
  );
}

export function Skills(props: { ctx: Ctx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () => view<{ items: Skill[] }>(ctx().host, "skills"));
  void source.refresh();
  const [open, setOpen] = createSignal<string>();
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => (
        <>
          <ul class="nsvx-list" aria-label={ctx().dt("skills")}>
            <For
              each={data().items.filter((skill) =>
                matches(ctx().query, skill.name, skill.slug, skill.when_to_use),
              )}
              keyed={(skill) => skill.slug}
            >
              {(skill) => (
                <li>
                  <button
                    type="button"
                    class="nsvx-row nsvx-row--link"
                    aria-expanded={open() === skill().slug ? "true" : "false"}
                    onClick={() => setOpen(open() === skill().slug ? undefined : skill().slug)}
                  >
                    <Icon name="skill" class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{skill().name}</span>
                      <span class="nsvx-row__detail">{skill().when_to_use ?? skill().slug}</span>
                    </span>
                    <span class="nsvx-row__age">{age(skill().updated_at)}</span>
                  </button>
                  <Show when={open() === skill().slug}>
                    <SkillBody ctx={ctx()} slug={skill().slug} />
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={data().items.length === 0}>
            <p class="nsvx__empty">{ctx().dt("noSkills")}</p>
          </Show>
        </>
      )}
    </SourceView>
  );
}
