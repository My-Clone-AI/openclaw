/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import type { DocSettings, DriveDetail, DriveFile } from "./docs-data.js";
import { docsChange, DriveLogo, type DocsCtx } from "./docs-ui.js";
import { Choice, Panel, Toggle } from "./office-kit.js";
import { age, createSource, Icon, SourceView } from "./ui-kit.js";

const KINDS: Record<string, string> = {
  "application/vnd.google-apps.document": "Docs",
  "application/vnd.google-apps.spreadsheet": "Sheets",
  "application/vnd.google-apps.presentation": "Slides",
  "application/pdf": "PDF",
  "text/plain": "TXT",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
};

function kind(file: DriveFile) {
  return (
    (file.mime_type && KINDS[file.mime_type]) ||
    /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1]?.toUpperCase() ||
    ""
  );
}

/** "/Pessoas/Arquivo/x.txt" → "Pessoas › Arquivo" */
function folderOf(path: string | null) {
  const parts = (path ?? "").split("/").filter(Boolean);
  parts.pop();
  return parts.join(" › ") || "Drive";
}

/** Finds files by name in the index NSVX keeps of the owner's Drive; Google is never asked from here. */
function Find(props: { ctx: DocsCtx }) {
  const kt = () => props.ctx.kt;
  const [q, setQ] = createSignal("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const files = createSource(props.ctx.host, () =>
    view<DriveFile[]>(props.ctx.host, "driveFiles", { q: q().trim() }),
  );
  return (
    <Panel title={kt()("driveFind")} icon="find">
      <input
        class="nsvx-docs__find"
        type="search"
        placeholder={kt()("driveFindHint")}
        aria-label={kt()("driveFind")}
        value={q()}
        onInput={(event) => {
          const value = event.currentTarget.value;
          setQ(value);
          clearTimeout(timer);
          if (value.trim()) {
            timer = setTimeout(() => void files.refresh(), 300);
          }
        }}
      />
      <Show when={q().trim()}>
        <SourceView source={files} t={props.ctx.t}>
          {(data) => (
            <ul class="nsvx-of__list" aria-label={kt()("driveFind")}>
              <For
                each={data()}
                keyed={(file) => file.file_id}
                fallback={<li class="nsvx__empty">{kt()("none")}</li>}
              >
                {(file) => (
                  <li class="nsvx-of__row nsvx-docs__file" data-file={file().file_id}>
                    <DriveLogo size={22} />
                    <span class="nsvx-of__main">
                      <strong>{file().name}</strong>
                      <span class="nsvx-of__sub">
                        <Icon name="folder" /> {folderOf(file().path)}
                        {kind(file()) ? ` · ${kind(file())}` : ""}
                        {file().modified_time ? ` · ${age(file().modified_time)}` : ""}
                      </span>
                    </span>
                  </li>
                )}
              </For>
            </ul>
          )}
        </SourceView>
      </Show>
    </Panel>
  );
}

/** Google Drive in NSVX's archive: sync state, sync now, what is watched, renames, and where uploads are copied. */
export function DocsDrive(props: { ctx: DocsCtx; onAccess: () => void }) {
  const kt = () => props.ctx.kt;
  const drive = createSource(props.ctx.host, () =>
    view<DriveDetail>(props.ctx.host, "archiveDrive"),
  );
  const settings = createSource(props.ctx.host, () =>
    view<{ settings: DocSettings; rename_available: boolean }>(props.ctx.host, "archiveSettings"),
  );
  void drive.refresh();
  void settings.refresh();
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
  return (
    <SourceView source={drive} t={props.ctx.t}>
      {(loaded) => {
        const on = () => loaded().connected && loaded().state === "ready";
        return (
          <>
            <div class={["nsvx-docs__drivecard", { "nsvx-docs__drivecard--off": !on() }]}>
              <DriveLogo size={40} />
              <span class="nsvx-of__main">
                <strong>{on() ? kt()("driveOn") : kt()("driveOff")}</strong>
                <span class="nsvx-of__sub">
                  {on()
                    ? [
                        loaded().push.active ? kt()("live") : kt()("every5"),
                        loaded().last_delta_at
                          ? `${kt()("checked")} ${age(loaded().last_delta_at)}`
                          : "",
                        `${loaded().documents} ${kt()("docsWord")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : kt()("driveOffHint")}
                </span>
              </span>
              <Show
                when={on()}
                fallback={
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--primary"
                    onClick={() => props.onAccess()}
                  >
                    <Icon name="link" />
                    <span>{kt()("connect")}</span>
                  </button>
                }
              >
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={action.busy()}
                  onClick={() =>
                    void action.run(async () => {
                      await docsChange(props.ctx.host, { action: "resync" });
                      void drive.refresh();
                    }, kt()("syncing"))
                  }
                >
                  <Icon name="sync" />
                  <span>{kt()("syncNow")}</span>
                </button>
              </Show>
            </div>
            <Note note={action.note()} />
            <Find ctx={props.ctx} />
            <SourceView source={settings} t={props.ctx.t}>
              {(current) => {
                const cfg = () => current().settings;
                const folders = () => loaded().folders;
                return (
                  <Panel title={kt()("driveSettings")} icon="setup">
                    <div class="nsvx-docs__switches">
                      <Toggle
                        label={kt()("renameDrive")}
                        checked={cfg().rename_drive}
                        onChange={(value) => set({ renameDrive: value })}
                      />
                      <Show when={cfg().rename_drive && !current().rename_available}>
                        <p class="nsvx-of__warn">
                          <Icon name="key" /> {kt()("renameNeedsAccess")}
                        </p>
                      </Show>
                      <Toggle
                        label={kt()("backfill")}
                        checked={cfg().drive_backfill}
                        onChange={(value) => set({ driveBackfill: value })}
                      />
                    </div>
                    <div class="nsvx-seg" role="radiogroup" aria-label={kt()("watch")}>
                      <For each={["all", "folders"] as const} keyed={false}>
                        {(item) => (
                          <button
                            type="button"
                            role="radio"
                            aria-checked={cfg().drive_scope === item() ? "true" : "false"}
                            class={[
                              "nsvx-seg__item",
                              { "nsvx-seg__item--on": cfg().drive_scope === item() },
                            ]}
                            onClick={() => set({ driveScope: item() })}
                          >
                            <Icon name={item() === "all" ? "globe" : "folder"} />
                            <span>{kt()(item() === "all" ? "wholeDrive" : "someFolders")}</span>
                          </button>
                        )}
                      </For>
                    </div>
                    <Show when={cfg().drive_scope === "folders"}>
                      <ul class="nsvx-docs__folders" aria-label={kt()("watch")}>
                        <For
                          each={folders()}
                          keyed={(item) => item.id}
                          fallback={<li class="nsvx__empty">{kt()("none")}</li>}
                        >
                          {(item) => {
                            const picked = () =>
                              cfg().drive_folders.some((folder) => folder.id === item().id);
                            return (
                              <li>
                                <label class="nsvx-of__toggle">
                                  <input
                                    type="checkbox"
                                    checked={picked()}
                                    onChange={() =>
                                      set({
                                        driveFolders: picked()
                                          ? cfg().drive_folders.filter(
                                              (folder) => folder.id !== item().id,
                                            )
                                          : [...cfg().drive_folders, item()],
                                      })
                                    }
                                  />
                                  <Icon name="folder" />
                                  <span>{item().path}</span>
                                </label>
                              </li>
                            );
                          }}
                        </For>
                      </ul>
                    </Show>
                    <Choice
                      label={kt()("copyUploads")}
                      value={cfg().upload_drive_folder?.id ?? ""}
                      options={[
                        ["", kt()("dontCopy")],
                        ...folders().map((item) => [item.id, item.path] as const),
                      ]}
                      onChange={(value) =>
                        set({ uploadFolder: folders().find((item) => item.id === value) ?? null })
                      }
                    />
                  </Panel>
                );
              }}
            </SourceView>
          </>
        );
      }}
    </SourceView>
  );
}
