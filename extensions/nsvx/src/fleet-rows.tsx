/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";
import { shortDate } from "./finance-data.js";
import { severityTone, type Alert, type FleetTask } from "./fleet-data.js";
import { Chip, createFleetChange, Dot, Empty, Glyph, type Ctx } from "./fleet-ui.js";

export function AlertRow(props: {
  alert: Alert;
  ctx: Ctx;
  busy: boolean;
  onSeen: () => void;
  onOpen?: () => void;
}) {
  return (
    <li class={["nsvx-row", { "nsvx-fleet-seen": Boolean(props.alert.acknowledged_at) }]}>
      <Dot tone={severityTone(props.alert.severity)} />
      <button type="button" class="nsvx-row__main nsvx-fleet-link" onClick={() => props.onOpen?.()}>
        <span class="nsvx-row__title">{props.alert.title}</span>
        <Show when={props.alert.due_on}>
          <span class="nsvx-row__detail">
            {shortDate(props.alert.due_on, props.ctx.host.locale)}
          </span>
        </Show>
      </button>
      <Show when={!props.alert.acknowledged_at}>
        <button
          type="button"
          class="nsvx__button"
          disabled={props.busy || !props.ctx.host.connection.canWrite}
          onClick={() => props.onSeen()}
        >
          <Glyph name="check" />
          <span>{props.ctx.ft("seen")}</span>
        </button>
      </Show>
    </li>
  );
}

export function TaskList(props: {
  ctx: Ctx;
  tasks: FleetTask[];
  change: ReturnType<typeof createFleetChange>;
}) {
  const ft = props.ctx.ft;
  return (
    <>
      <ul class="nsvx-list">
        <For each={props.tasks} keyed={(task) => task.id}>
          {(task) => {
            const late = () =>
              Boolean(task().due_on) && task().due_on! < new Date().toISOString().slice(0, 10);
            const done = () => task().status !== "open";
            return (
              <li class={["nsvx-row", { "nsvx-fleet-seen": done() }]}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done() ? "true" : "false"}
                  aria-label={done() ? ft("reopen") : ft("done")}
                  title={done() ? ft("reopen") : ft("done")}
                  class="nsvx-fleet-check"
                  disabled={Boolean(props.change.busy()) || !props.ctx.host.connection.canWrite}
                  onClick={() =>
                    void props.change.run(`task:${task().id}`, {
                      action: "task",
                      taskId: task().id,
                      status: done() ? "open" : "done",
                    })
                  }
                >
                  <Show when={done()}>
                    <Glyph name="check" />
                  </Show>
                </button>
                <span class="nsvx-row__main">
                  <span class="nsvx-row__title">{task().title}</span>
                  <span class="nsvx-row__detail">
                    {[task().driver_name, task().plate].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Show when={task().priority === "high"}>
                  <Dot tone="bad" />
                </Show>
                <Show when={task().due_on}>
                  <Chip tone={late() ? "bad" : "off"}>
                    {shortDate(task().due_on, props.ctx.host.locale)}
                  </Chip>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
      <Show when={props.tasks.length === 0}>
        <Empty icon="check" text={ft("allGood")} />
      </Show>
    </>
  );
}
