/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show, untrack } from "solid-js";
import {
  validGroupName,
  type Group,
  type GroupPage,
  type GroupSummary,
  type PersonSummary,
} from "./people-data.js";
import type { Panel } from "./people-groups.js";
import type { PT } from "./people-i18n.js";
import { ConfirmBar, type Change } from "./people-ui.js";
import { createSource, Icon, matches, SourceView, type T } from "./ui-kit.js";

type PanelProps = {
  host: ControlUiHost;
  t: T;
  pt: PT;
  g: Group;
  change: Change;
  onGroup: (id: string) => void;
  onBack: () => void;
  onDone: () => void;
};

/** The open tool: add a person, rename, merge into another group, split some members out, or delete. */
export function GroupPanel(props: PanelProps & { panel: Panel | undefined }) {
  return (
    <Show when={props.panel} keyed>
      {(panel) => (
        <div class="nsvx-ppl-picker">
          {panel === "add" ? (
            <AddPanel {...props} />
          ) : panel === "rename" ? (
            <RenamePanel {...props} />
          ) : panel === "merge" ? (
            <MergePanel {...props} />
          ) : panel === "split" ? (
            <SplitPanel {...props} />
          ) : (
            <ConfirmBar
              pt={props.pt}
              text={props.pt("sure")}
              label={props.pt("erase")}
              busy={props.change.busy() !== undefined}
              onCancel={props.onDone}
              onConfirm={() =>
                void props.change.run(
                  "delete",
                  "nsvx.groups.change",
                  { action: "delete", groupId: props.g.id, revision: props.g.revision },
                  props.onBack,
                )
              }
            />
          )}
        </div>
      )}
    </Show>
  );
}

function AddPanel(props: PanelProps) {
  const [search, setSearch] = createSignal("");
  const people = createSource(props.host, () =>
    props.host.request<PersonSummary[]>("nsvx.view", { view: "people" }),
  );
  void people.refresh();
  const inGroup = createMemo(
    () => new Set(props.g.members.filter((m) => m.state === "active").map((m) => m.person_id)),
  );
  const addable = createMemo(
    () =>
      people
        .state()
        .data?.filter((p) => !inGroup().has(p.id) && matches(search(), p.display_name))
        .slice(0, 50) ?? [],
  );
  return (
    <>
      <input
        class="nsvx__search"
        type="search"
        placeholder={props.t("search")}
        aria-label={props.t("search")}
        value={search()}
        onInput={(event) => setSearch(event.currentTarget.value)}
      />
      <SourceView source={people} t={props.t}>
        {() => (
          <ul class="nsvx-list">
            <For each={addable()}>
              {(p) => (
                <li>
                  <button
                    type="button"
                    class="nsvx-row nsvx-row--link"
                    disabled={props.change.busy() !== undefined}
                    onClick={() =>
                      void props.change.run(
                        "add",
                        "nsvx.groups.change",
                        {
                          action: "member",
                          groupId: props.g.id,
                          revision: props.g.revision,
                          personId: p.id,
                          state: "active",
                        },
                        props.onDone,
                      )
                    }
                  >
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{p.display_name}</span>
                    </span>
                    <Icon name="plus" />
                  </button>
                </li>
              )}
            </For>
          </ul>
        )}
      </SourceView>
    </>
  );
}

function RenamePanel(props: PanelProps) {
  const [name, setName] = createSignal(untrack(() => props.g.display_name));
  return (
    <form
      class="nsvx-ppl-inline"
      onSubmit={(event) => {
        event.preventDefault();
        void props.change.run(
          "rename",
          "nsvx.groups.change",
          { action: "rename", groupId: props.g.id, revision: props.g.revision, name: name() },
          props.onDone,
        );
      }}
    >
      <input
        class="nsvx__search"
        aria-label={props.pt("name")}
        maxlength={60}
        value={name()}
        onInput={(event) => setName(event.currentTarget.value)}
      />
      <button
        type="submit"
        class="nsvx__button nsvx__button--primary"
        disabled={
          props.change.busy() !== undefined ||
          !validGroupName(name()) ||
          name().trim() === props.g.display_name
        }
      >
        {props.pt("save")}
      </button>
    </form>
  );
}

function MergePanel(props: PanelProps) {
  const [into, setInto] = createSignal<GroupSummary>();
  const groups = createSource(props.host, () =>
    props.host.request<GroupPage>("nsvx.view", { view: "socialGroups", params: { limit: "200" } }),
  );
  void groups.refresh();
  return (
    <>
      <p class="nsvx-ppl__hint">
        <Icon name="merge" />
        {props.pt("into")}
      </p>
      <SourceView source={groups} t={props.t}>
        {(page) => (
          <ul class="nsvx-list" role="radiogroup" aria-label={props.pt("into")}>
            <For each={page().items.filter((x) => x.id !== props.g.id)}>
              {(x) => (
                <li>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={into()?.id === x.id ? "true" : "false"}
                    class={[
                      "nsvx-row",
                      "nsvx-row--link",
                      { "nsvx-conv--current": into()?.id === x.id },
                    ]}
                    onClick={() => setInto(x)}
                  >
                    <Icon name={into()?.id === x.id ? "done" : "people"} />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{x.display_name}</span>
                    </span>
                    <span class="nsvx-row__age">{x.members}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        )}
      </SourceView>
      <Show when={into()}>
        {(target) => (
          <ConfirmBar
            pt={props.pt}
            text={`${props.g.display_name} → ${target().display_name}`}
            label={props.pt("merge")}
            busy={props.change.busy() !== undefined}
            onCancel={() => setInto(undefined)}
            onConfirm={() =>
              void props.change.run(
                "merge",
                "nsvx.groups.change",
                {
                  action: "merge",
                  groupId: props.g.id,
                  revision: props.g.revision,
                  intoId: target().id,
                  intoRevision: target().revision,
                },
                () => props.onGroup(target().id),
              )
            }
          />
        )}
      </Show>
    </>
  );
}

function SplitPanel(props: PanelProps) {
  const [name, setName] = createSignal("");
  const [pick, setPick] = createSignal<string[]>([]);
  return (
    <form
      class="nsvx-ppl-form"
      onSubmit={(event) => {
        event.preventDefault();
        void props.change.run<{ new_group_id: string }>(
          "split",
          "nsvx.groups.change",
          {
            action: "split",
            groupId: props.g.id,
            revision: props.g.revision,
            name: name(),
            personIds: pick(),
          },
          (result) => props.onGroup(result.new_group_id),
        );
      }}
    >
      <input
        class="nsvx__search"
        placeholder={props.pt("name")}
        aria-label={props.pt("name")}
        maxlength={60}
        value={name()}
        onInput={(event) => setName(event.currentTarget.value)}
      />
      <fieldset class="nsvx-ppl-checks">
        <legend>{props.pt("who")}</legend>
        <For each={props.g.members.filter((m) => m.state === "active" || m.state === "proposed")}>
          {(m) => (
            <label>
              <input
                type="checkbox"
                checked={pick().includes(m.person_id)}
                onChange={(event) =>
                  setPick(
                    event.currentTarget.checked
                      ? [...pick(), m.person_id]
                      : pick().filter((id) => id !== m.person_id),
                  )
                }
              />
              {m.display_name}
            </label>
          )}
        </For>
      </fieldset>
      <button
        type="submit"
        class="nsvx__button nsvx__button--primary"
        disabled={
          props.change.busy() !== undefined || !validGroupName(name()) || pick().length === 0
        }
      >
        <Icon name="split" />
        {props.pt("split")}
      </button>
    </form>
  );
}
