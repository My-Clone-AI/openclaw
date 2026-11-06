/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import { categoryLabel, type Category, type DocSettings, type Rule } from "./docs-data.js";
import { docsChange, saveDocFile, type DocsCtx } from "./docs-ui.js";
import { Choice, Field, Panel, Reveal, Toggle } from "./office-kit.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

const NAME_PARTS =
  "{date} {month} {year} {issuer} {bank} {account} {type} {number} {entity} {description} {tax}";

/** A slider that saves once, when the owner lets go. */
function Level(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onSave: (value: number) => void;
}) {
  const [shown, setShown] = createSignal(props.value);
  return (
    <label class="nsvx-of__field nsvx-docs__level">
      <span>
        {props.label} <strong>{shown()}%</strong>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={1}
        value={props.value}
        onInput={(event) => setShown(Number(event.currentTarget.value))}
        onChange={(event) => props.onSave(Number(event.currentTarget.value))}
      />
    </label>
  );
}

/** One category's name and file name pattern, or a new one inside a group. */
function CategoryForm(props: {
  ctx: DocsCtx;
  category?: Category;
  tops: Category[];
  onDone: () => void;
}) {
  const kt = () => props.ctx.kt;
  const action = createAction(() => props.ctx);
  const [label, setLabel] = createSignal(props.category?.label ?? "");
  const [parent, setParent] = createSignal(props.tops[0]?.code ?? "");
  const [template, setTemplate] = createSignal(
    props.category?.template ?? "{date}__{issuer}__{type}",
  );
  const [active, setActive] = createSignal(props.category?.active ?? true);
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await docsChange(
            props.ctx.host,
            props.category
              ? {
                  action: "categoryEdit",
                  code: props.category.code,
                  label: label(),
                  template: template(),
                  active: active(),
                }
              : {
                  action: "categoryAdd",
                  parent: parent() || undefined,
                  label: label(),
                  template: template(),
                },
          );
          props.onDone();
        }, kt()("saved"));
      }}
    >
      <Show when={!props.category}>
        <Choice
          label={kt()("inside")}
          value={parent()}
          options={[
            ...props.tops.map((top) => [top.code, categoryLabel(top, props.ctx.locale)] as const),
            ["", kt()("newGroup")],
          ]}
          onChange={setParent}
        />
      </Show>
      <Field label={kt()("name")} value={label()} max={60} onInput={setLabel} />
      <Field
        label={kt()("fileName")}
        value={template()}
        max={160}
        placeholder={NAME_PARTS}
        onInput={setTemplate}
      />
      <Show when={props.category}>
        <Toggle label={kt()("on")} checked={active()} onChange={setActive} />
      </Show>
      <button
        type="submit"
        class="nsvx__button nsvx__button--primary"
        disabled={action.busy() || label().trim().length < 2}
      >
        <Icon name="done" />
        <span>{kt()("save")}</span>
      </button>
      <Note note={action.note()} />
    </form>
  );
}

/** NSVX Documentos, Ajustes: automation, notices, categories and names, learned rules, and the list export. */
export function DocsSettings(props: { ctx: DocsCtx }) {
  const kt = () => props.ctx.kt;
  const settings = createSource(props.ctx.host, () =>
    view<{ settings: DocSettings; rename_available: boolean }>(props.ctx.host, "archiveSettings"),
  );
  const taxonomy = createSource(props.ctx.host, () =>
    view<{ categories: Category[] }>(props.ctx.host, "archiveTaxonomy"),
  );
  const rules = createSource(props.ctx.host, () =>
    view<{ rules: Rule[] }>(props.ctx.host, "archiveRules"),
  );
  void settings.refresh();
  void taxonomy.refresh();
  void rules.refresh();
  const action = createAction(() => props.ctx);
  const set = (change: Record<string, unknown>) =>
    void action.run(async () => {
      settings.replace(
        await docsChange<{ settings: DocSettings; rename_available: boolean }>(props.ctx.host, {
          action: "settings",
          ...change,
        }),
      );
    }, kt()("saved"));
  const all = () => taxonomy.state().data?.categories ?? [];
  const tops = createMemo(() => all().filter((item) => !item.parent));
  const [editing, setEditing] = createSignal<string>();
  const label = (code: string | null) => {
    const found = all().find((item) => item.code === code);
    return found ? categoryLabel(found, props.ctx.locale) : (code ?? "");
  };
  return (
    <SourceView source={settings} t={props.ctx.t}>
      {(loaded) => {
        const cfg = () => loaded().settings;
        return (
          <>
            <Note note={action.note()} />
            <Panel title={kt()("auto")} icon="actions">
              <div class="nsvx-docs__switches">
                <Toggle
                  label={kt()("autoClassify")}
                  checked={cfg().auto_classify}
                  onChange={(value) => set({ autoClassify: value })}
                />
                <Toggle
                  label={kt()("autoFile")}
                  checked={cfg().auto_import}
                  onChange={(value) => set({ autoImport: value })}
                />
                <Toggle
                  label={kt()("useAi")}
                  checked={cfg().ai_enabled}
                  onChange={(value) => set({ ai: value })}
                />
                <Toggle
                  label={kt()("confirmProvisional")}
                  checked={cfg().confirm_provisional}
                  onChange={(value) => set({ confirmProvisional: value })}
                />
              </div>
              <div class="nsvx-of__form">
                <Level
                  label={kt()("fileAt")}
                  value={Math.round(cfg().threshold_auto * 100)}
                  min={50}
                  max={100}
                  onSave={(value) => set({ autoAt: value })}
                />
                <Level
                  label={kt()("checkBelow")}
                  value={Math.round(cfg().threshold_review * 100)}
                  min={0}
                  max={99}
                  onSave={(value) => set({ reviewBelow: value })}
                />
              </div>
            </Panel>
            <Panel title={kt()("notices")} icon="alert">
              <div class="nsvx-docs__switches">
                <Toggle
                  label={kt()("notifyReview")}
                  checked={cfg().notify_review}
                  onChange={(value) => set({ notifyReview: value })}
                />
                <Toggle
                  label={kt()("notifyBank")}
                  checked={cfg().notify_bank}
                  onChange={(value) => set({ notifyBank: value })}
                />
                <Toggle
                  label={kt()("notifyImported")}
                  checked={cfg().notify_imported}
                  onChange={(value) => set({ notifyImported: value })}
                />
              </div>
            </Panel>
            <Panel
              title={kt()("categories")}
              icon="folder"
              action={
                <Reveal label={kt()("new")} icon="plus">
                  {(close) => (
                    <CategoryForm
                      ctx={props.ctx}
                      tops={tops()}
                      onDone={() => {
                        close();
                        void taxonomy.refresh();
                      }}
                    />
                  )}
                </Reveal>
              }
            >
              <p class="nsvx-of__muted nsvx-of__mono">2026-09__Banco__Conta-1234__Extrato.pdf</p>
              <ul class="nsvx-of__list nsvx-docs__cats">
                <For each={tops()} keyed={(top) => top.code}>
                  {(top) => (
                    <li>
                      <details>
                        <summary>
                          <Icon name="folder" /> {categoryLabel(top(), props.ctx.locale)}
                          <span class="nsvx-of__count">
                            {all().filter((item) => item.parent === top().code).length}
                          </span>
                        </summary>
                        <ul class="nsvx-of__list">
                          <For
                            each={all().filter((item) => item.parent === top().code)}
                            keyed={(item) => item.code}
                          >
                            {(item) => (
                              <li class={{ "nsvx-of__row--done": !item().active }}>
                                <Show
                                  when={editing() === item().code}
                                  fallback={
                                    <button
                                      type="button"
                                      class="nsvx-of__row"
                                      onClick={() => setEditing(item().code)}
                                    >
                                      <span class="nsvx-of__main">
                                        <strong>{categoryLabel(item(), props.ctx.locale)}</strong>
                                        <span class="nsvx-of__sub nsvx-of__mono">
                                          {item().template}
                                        </span>
                                      </span>
                                      <Icon name="edit" />
                                    </button>
                                  }
                                >
                                  <CategoryForm
                                    ctx={props.ctx}
                                    category={item()}
                                    tops={tops()}
                                    onDone={() => {
                                      setEditing(undefined);
                                      void taxonomy.refresh();
                                    }}
                                  />
                                </Show>
                              </li>
                            )}
                          </For>
                        </ul>
                      </details>
                    </li>
                  )}
                </For>
              </ul>
            </Panel>
            <Panel
              title={kt()("rules")}
              icon="done"
              count={(rules.state().data?.rules ?? []).filter((rule) => rule.active).length}
            >
              <ul class="nsvx-of__list">
                <For
                  each={(rules.state().data?.rules ?? []).filter((rule) => rule.active)}
                  keyed={(rule) => rule.id}
                  fallback={<li class="nsvx-of__muted">{kt()("noRules")}</li>}
                >
                  {(rule) => (
                    <li class="nsvx-of__row" data-rule={rule().id}>
                      <span class="nsvx-of__main">
                        <strong>{rule().pattern}</strong>
                        <span class="nsvx-of__sub">
                          {label(rule().subcategory)} · {rule().hits}×
                        </span>
                      </span>
                      <button
                        type="button"
                        class="nsvx__button nsvx__button--icon"
                        aria-label={`${kt()("remove")} ${rule().pattern}`}
                        title={kt()("remove")}
                        disabled={action.busy()}
                        onClick={() =>
                          void action.run(async () => {
                            await docsChange(props.ctx.host, { action: "ruleOff", id: rule().id });
                            void rules.refresh();
                          })
                        }
                      >
                        <Icon name="trash" />
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Panel>
            <Panel title={kt()("yourData")} icon="lock">
              <button
                type="button"
                class="nsvx__button"
                disabled={action.busy()}
                onClick={() =>
                  void action.run(() => saveDocFile(props.ctx.host, { kind: "export" }))
                }
              >
                <Icon name="download" />
                <span>{kt()("exportList")}</span>
              </button>
            </Panel>
          </>
        );
      }}
    </SourceView>
  );
}
