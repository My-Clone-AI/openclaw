/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import type { SyncOverview } from "./device-data.js";
import type { DeviceKey } from "./device-i18n.js";
import { createAction, Note, type Ctx } from "./device-kit.js";
import { BrandLogo } from "./messages-ui.js";
import { Tiles } from "./owner-tabs.js";
import { age, createSource, Icon, matches, SourceView } from "./ui-kit.js";

type Browse = "tasks" | "contacts" | "conversations" | "missions" | "captures";
const BROWSE_LABEL = {
  tasks: "tasks",
  contacts: "people",
  conversations: "chats",
  missions: "missions",
  captures: "captures",
} as const satisfies Record<Browse, DeviceKey>;

/** One offline save; a retry after an uncertain answer reuses its key and time, so NSVX keeps one copy. */
function createSaver(ctx: () => Ctx, onSaved: () => void) {
  const action = createAction(ctx);
  let pending = { key: crypto.randomUUID(), at: new Date().toISOString() };
  const save = async (change: Record<string, unknown>) => {
    const ok = await action.run(
      () =>
        ctx().host.request("nsvx.sync.save", {
          ...change,
          idempotencyKey: pending.key,
          createdAt: pending.at,
        }),
      ctx().dt("saved"),
    );
    if (ok || action.note()?.code !== "uncertain") {
      pending = { key: crypto.randomUUID(), at: new Date().toISOString() };
    }
    if (ok) {
      onSaved();
    }
    return ok;
  };
  return { ...action, save };
}

function Rename(props: { ctx: Ctx; value: string; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = createSignal(false);
  const [value, setValue] = createSignal(props.value);
  return (
    <Show
      when={editing()}
      fallback={
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={`${props.ctx.dt("rename")}: ${props.value}`}
          title={props.ctx.dt("rename")}
          disabled={!props.ctx.host.connection.canWrite}
          onClick={() => setEditing(true)}
        >
          <Icon name="edit" />
        </button>
      }
    >
      <form
        class="nsvx-dev__rename"
        onSubmit={(event) => {
          event.preventDefault();
          void props.onSave(value().trim()).then((ok) => ok && setEditing(false));
        }}
      >
        <input
          aria-label={props.ctx.dt("rename")}
          maxlength={200}
          required
          value={value()}
          onInput={(event) => setValue(event.currentTarget.value)}
        />
        <button type="submit" class="nsvx__button nsvx__button--primary">
          {props.ctx.dt("save")}
        </button>
      </form>
    </Show>
  );
}

export function SyncView(props: { ctx: Ctx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    ctx().host.request<SyncOverview>("nsvx.sync.overview"),
  );
  void source.refresh();
  const reload = () => void source.refresh();
  const [browse, setBrowse] = createSignal<Browse>("tasks");
  const [reviewing, setReviewing] = createSignal<string>();
  const [title, setTitle] = createSignal("");
  const [chat, setChat] = createSignal("");
  const [message, setMessage] = createSignal("");
  const taskSaver = createSaver(ctx, reload);
  const draftSaver = createSaver(ctx, reload);
  const renameSaver = createSaver(ctx, reload);
  const action = createAction(ctx);
  // Promote keys per held task, kept across an uncertain answer.
  const promoteKeys = new Map<string, string>();
  const promote = (taskId: string) => {
    const key = promoteKeys.get(taskId) ?? crypto.randomUUID();
    promoteKeys.set(taskId, key);
    void action
      .run(
        () => ctx().host.request("nsvx.sync.promote", { taskId, idempotencyKey: key }),
        ctx().dt("done"),
      )
      .then((ok) => {
        if (ok || action.note()?.code !== "uncertain") {
          promoteKeys.delete(taskId);
        }
        reload();
      });
  };
  const write = (method: string, params: Record<string, unknown>, done: string) =>
    void action.run(() => ctx().host.request(method, params), done).then(reload);
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => (
        <div class="nsvx-dev__stack">
          <Tiles
            items={[
              { id: "tasks", icon: "tasks", label: ctx().dt("tasks"), count: data().counts.tasks },
              {
                id: "contacts",
                icon: "team",
                label: ctx().dt("people"),
                count: data().counts.contacts,
              },
              {
                id: "conversations",
                icon: "messages",
                label: ctx().dt("chats"),
                count: data().counts.conversations,
              },
              {
                id: "missions",
                icon: "flow",
                label: ctx().dt("missions"),
                count: data().counts.missions,
              },
              {
                id: "captures",
                icon: "doc",
                label: ctx().dt("captures"),
                count: data().counts.captures,
              },
            ]}
            selected={browse()}
            onSelect={setBrowse}
          />
          <Note note={action.note()} />
          <Show when={data().held.length > 0}>
            <h2 class="nsvx__heading">
              {ctx().dt("held")} · {data().held.length}
            </h2>
            <p class="nsvx-row__detail">{ctx().dt("heldHelp")}</p>
            <ul class="nsvx-list" aria-label={ctx().dt("held")}>
              <For each={data().held} keyed={(task) => task.id}>
                {(task) => (
                  <li class="nsvx-row nsvx-dev__held">
                    <Icon name="pause" class="nsvx-row__icon nsvx-row__icon--warn" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{task().title}</span>
                      <Show when={task().description}>
                        <span class="nsvx-row__detail">{task().description}</span>
                      </Show>
                    </span>
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={action.busy() || !ctx().host.connection.canWrite}
                      onClick={() =>
                        write("nsvx.sync.discard", { taskId: task().id }, ctx().dt("discard"))
                      }
                    >
                      {ctx().dt("discard")}
                    </button>
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--primary"
                      disabled={action.busy() || !ctx().host.connection.canWrite}
                      onClick={() => promote(task().id)}
                    >
                      {ctx().dt("createTask")}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={data().drafts.length > 0}>
            <h2 class="nsvx__heading">
              {ctx().dt("drafts")} · {data().drafts.length}
            </h2>
            <ul class="nsvx-list" aria-label={ctx().dt("drafts")}>
              <For each={data().drafts} keyed={(draft) => draft.id}>
                {(draft) => (
                  <li class="nsvx-dev__draft">
                    <div class="nsvx-row">
                      <Show
                        when={draft().channel}
                        fallback={<Icon name="messages" class="nsvx-row__icon" />}
                      >
                        {(channel) => <BrandLogo channel={channel()} size={18} />}
                      </Show>
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{draft().conversation ?? "—"}</span>
                        <span class="nsvx-row__detail">{draft().text}</span>
                      </span>
                      <span class="nsvx-row__age">{age(draft().created_at)}</span>
                      <Show when={reviewing() !== draft().id}>
                        <button
                          type="button"
                          class="nsvx__button"
                          onClick={() => setReviewing(draft().id)}
                        >
                          {ctx().dt("review")}
                        </button>
                      </Show>
                    </div>
                    <Show when={reviewing() === draft().id}>
                      <div class="nsvx-dev__review" role="group" aria-label={ctx().dt("review")}>
                        <p class="nsvx-dev__snippet">{draft().text}</p>
                        <div class="nsvx-dev__buttons">
                          <button
                            type="button"
                            class="nsvx__button"
                            onClick={() => setReviewing(undefined)}
                          >
                            {ctx().dt("cancel")}
                          </button>
                          <button
                            type="button"
                            class="nsvx__button nsvx__button--primary"
                            disabled={action.busy() || !ctx().host.connection.canWrite}
                            onClick={() => {
                              setReviewing(undefined);
                              write("nsvx.sync.confirm", { draftId: draft().id }, ctx().dt("sent"));
                            }}
                          >
                            <Icon name="send" />
                            <span>{ctx().dt("send")}</span>
                          </button>
                        </div>
                      </div>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <div class="nsvx-dev__forms">
            <form
              class="nsvx-dev__card"
              onSubmit={(event) => {
                event.preventDefault();
                void taskSaver.save({ kind: "task", title: title().trim() }).then((ok) => {
                  if (ok) {
                    setTitle("");
                  }
                });
              }}
            >
              <h3 class="nsvx-dev__card-title">
                <Icon name="tasks" />
                {ctx().dt("newTask")}
              </h3>
              <input
                aria-label={ctx().dt("newTask")}
                maxlength={200}
                required
                value={title()}
                onInput={(event) => setTitle(event.currentTarget.value)}
              />
              <Note note={taskSaver.note()} />
              <button
                type="submit"
                class="nsvx__button nsvx__button--primary"
                disabled={taskSaver.busy() || !title().trim() || !ctx().host.connection.canWrite}
              >
                {ctx().dt("save")}
              </button>
            </form>
            <form
              class="nsvx-dev__card"
              onSubmit={(event) => {
                event.preventDefault();
                void draftSaver
                  .save({ kind: "draft", conversationId: chat(), text: message() })
                  .then((ok) => {
                    if (ok) {
                      setMessage("");
                    }
                  });
              }}
            >
              <h3 class="nsvx-dev__card-title">
                <Icon name="messages" />
                {ctx().dt("newDraft")}
              </h3>
              <select
                aria-label={ctx().dt("pickChat")}
                required
                onChange={(event) => setChat(event.currentTarget.value)}
              >
                <option value="">{ctx().dt("pickChat")}</option>
                <For each={data().conversations} keyed={(c) => c.id}>
                  {(c) => (
                    <option value={c().id} selected={chat() === c().id}>
                      {c().title ?? c().id.slice(0, 8)}
                      {c().channel ? ` · ${c().channel}` : ""}
                    </option>
                  )}
                </For>
              </select>
              <textarea
                aria-label={ctx().dt("message")}
                rows={3}
                maxlength={8000}
                required
                value={message()}
                onInput={(event) => setMessage(event.currentTarget.value)}
              />
              <span class="nsvx-row__detail">{ctx().dt("sendNeedsYou")}</span>
              <Note note={draftSaver.note()} />
              <button
                type="submit"
                class="nsvx__button nsvx__button--primary"
                disabled={
                  draftSaver.busy() ||
                  !chat() ||
                  !message().trim() ||
                  !ctx().host.connection.canWrite
                }
              >
                {ctx().dt("save")}
              </button>
            </form>
          </div>
          <Note note={renameSaver.note()} />
          <ul class="nsvx-list" aria-label={ctx().dt(BROWSE_LABEL[browse()])}>
            <Show when={browse() === "tasks"}>
              <For
                each={data().tasks.filter((task) => matches(ctx().query, task.title))}
                keyed={(task) => task.id}
              >
                {(task) => (
                  <li class="nsvx-row">
                    <Icon name="tasks" class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{task().title}</span>
                    </span>
                    <span class="nsvx__chip">{task().status}</span>
                    <Rename
                      ctx={ctx()}
                      value={task().title}
                      onSave={(name) =>
                        renameSaver.save({
                          kind: "renameTask",
                          id: task().id,
                          name,
                          baseVersion: task().version,
                        })
                      }
                    />
                  </li>
                )}
              </For>
            </Show>
            <Show when={browse() === "contacts"}>
              <For
                each={data().contacts.filter((person) => matches(ctx().query, person.name))}
                keyed={(person) => person.id}
              >
                {(person) => (
                  <li class="nsvx-row">
                    <span class="nsvx-dev__initial" aria-hidden="true">
                      {(person().name.trim()[0] ?? "?").toUpperCase()}
                    </span>
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{person().name}</span>
                    </span>
                    <Rename
                      ctx={ctx()}
                      value={person().name}
                      onSave={(name) =>
                        renameSaver.save({
                          kind: "renameContact",
                          id: person().id,
                          name,
                          baseVersion: person().version,
                        })
                      }
                    />
                  </li>
                )}
              </For>
            </Show>
            <Show when={browse() === "conversations"}>
              <For
                each={data().conversations.filter((c) => matches(ctx().query, c.title))}
                keyed={(c) => c.id}
              >
                {(c) => (
                  <li class="nsvx-row">
                    <Show
                      when={c().channel}
                      fallback={<Icon name="messages" class="nsvx-row__icon" />}
                    >
                      {(channel) => <BrandLogo channel={channel()} size={18} />}
                    </Show>
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{c().title ?? "—"}</span>
                    </span>
                  </li>
                )}
              </For>
            </Show>
            <Show when={browse() === "missions"}>
              <For
                each={data().missions.filter((m) => matches(ctx().query, m.title, m.next_step))}
                keyed={(m) => m.id}
              >
                {(m) => (
                  <li class="nsvx-row">
                    <Icon name="flow" class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{m().title}</span>
                      <Show when={m().next_step}>
                        <span class="nsvx-row__detail">{m().next_step}</span>
                      </Show>
                    </span>
                    <span class="nsvx__chip">{m().status}</span>
                  </li>
                )}
              </For>
            </Show>
            <Show when={browse() === "captures"}>
              <For each={data().captures} keyed={(c) => c.id}>
                {(c) => (
                  <li class="nsvx-row">
                    <Icon name="doc" class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{c().context ?? "—"}</span>
                    </span>
                    <span class="nsvx__chip">{c().status}</span>
                    <span class="nsvx-row__age">{age(c().created_at)}</span>
                  </li>
                )}
              </For>
            </Show>
          </ul>
        </div>
      )}
    </SourceView>
  );
}
