/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Tiles } from "./owner-tabs.js";
import type { Skill, SkillAlert, SkillDetail } from "./skills.js";
import { age, createSource, errorMessage, Icon, matches, SourceView, type T } from "./ui-kit.js";

type Filter = "on" | "off" | "review" | "failing";

const CHECK_ICON = { confirmed: "done", failed: "alert", unverified: "ask" } as const;

function failing(skill: Skill, alerts: Set<string>) {
  return alerts.has(skill.id) || skill.latest_verification?.verified === "failed";
}

function SkillDetailView(props: { host: ControlUiHost; t: T; id: string; onClose: () => void }) {
  const detail = createSource(props.host, () =>
    props.host.request<SkillDetail>("nsvx.view", { view: "skill", params: { id: props.id } }),
  );
  void detail.refresh();
  return (
    <section class="nsvx-panel nsvx-skill-detail" aria-label={props.t("steps")}>
      <SourceView source={detail} t={props.t}>
        {(skill) => (
          <>
            <header class="nsvx-panel__title">
              <Icon name="skills" />
              <strong>{skill().name}</strong>
              <button
                type="button"
                class="nsvx__button nsvx__button--icon nsvx-skill-detail__close"
                aria-label={props.t("close")}
                onClick={() => props.onClose()}
              >
                <Icon name="close" />
              </button>
            </header>
            <Show when={skill().when_to_use}>
              <p class="nsvx-skill__when">{skill().when_to_use}</p>
            </Show>
            <Show when={skill().steps.length > 0}>
              <h4 class="nsvx-toolgroup__title">{props.t("steps")}</h4>
              <ol class="nsvx-skill__steps">
                <For each={skill().steps} keyed={(step) => step.n}>
                  {(step) => <li value={step().n}>{step().text}</li>}
                </For>
              </ol>
            </Show>
            <h4 class="nsvx-toolgroup__title">{props.t("runs")}</h4>
            <Show
              when={skill().runs.length > 0}
              fallback={<p class="nsvx__empty">{props.t("neverRun")}</p>}
            >
              <ul class="nsvx-list">
                <For each={skill().runs.slice(0, 10)} keyed={(run) => run.id}>
                  {(run) => (
                    <li class="nsvx-row">
                      <Icon
                        name={
                          run().verified
                            ? CHECK_ICON[run().verified as keyof typeof CHECK_ICON]
                            : run().outcome === "failed"
                              ? "alert"
                              : "done"
                        }
                        class={[
                          "nsvx-row__icon",
                          run().outcome === "failed" || run().verified === "failed"
                            ? "nsvx-row__icon--bad"
                            : "nsvx-row__icon--ok",
                        ]}
                      />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{run().app ?? "—"}</span>
                        <Show when={run().detail}>
                          <span class="nsvx-row__detail">{run().detail}</span>
                        </Show>
                      </span>
                      <span class="nsvx-row__age">{age(run().ts)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </>
        )}
      </SourceView>
    </section>
  );
}

/** NSVX Skills (`/apps` Competências): what clone knows how to do; turn each on or off and review learned ones. */
export function SkillsTab(props: {
  host: ControlUiHost;
  t: T;
  query: string;
  open: string | undefined;
  onOpen: (id: string | undefined) => void;
}) {
  const list = createSource(props.host, async () => {
    const [skills, alerts] = await Promise.all([
      props.host.request<{ items: Skill[] }>("nsvx.view", { view: "skills" }),
      props.host
        .request<{ alerts: SkillAlert[] }>("nsvx.view", { view: "skillAlerts" })
        .catch(() => ({ alerts: [] as SkillAlert[] })),
    ]);
    return { skills: skills.items, alerts: new Set(alerts.alerts.map((alert) => alert.skill_id)) };
  });
  void list.refresh();
  const [filter, setFilter] = createSignal<Filter>();
  const [busy, setBusy] = createSignal<string>();
  const [note, setNote] = createSignal<{ id: string; message: string }>();

  const change = async (skill: Skill, method: string, params: Record<string, unknown>) => {
    setBusy(skill.id);
    setNote(undefined);
    try {
      await props.host.request(method, { skillId: skill.id, ...params });
    } catch (cause) {
      setNote({ id: skill.id, message: errorMessage(props.host, cause) });
    } finally {
      setBusy(undefined);
      await list.refresh();
    }
  };

  return (
    <SourceView source={list} t={props.t}>
      {(data) => {
        const counts = createMemo(() => {
          const skills = data().skills;
          return {
            on: skills.filter((skill) => skill.enabled).length,
            off: skills.filter((skill) => !skill.enabled).length,
            review: skills.filter((skill) => skill.review_state === "pending").length,
            failing: skills.filter((skill) => failing(skill, data().alerts)).length,
          };
        });
        const rows = createMemo(() =>
          data().skills.filter((skill) => {
            const kept =
              filter() === "on"
                ? skill.enabled
                : filter() === "off"
                  ? !skill.enabled
                  : filter() === "review"
                    ? skill.review_state === "pending"
                    : filter() === "failing"
                      ? failing(skill, data().alerts)
                      : true;
            return kept && matches(props.query, skill.name, skill.slug, skill.when_to_use);
          }),
        );
        return (
          <div class="nsvx-skills">
            <Tiles
              items={[
                { id: "on", icon: "done", label: props.t("on"), count: counts().on },
                { id: "off", icon: "pause", label: props.t("offState"), count: counts().off },
                {
                  id: "review",
                  icon: "decide",
                  label: props.t("toReview"),
                  count: counts().review,
                  tone: "warn",
                },
                {
                  id: "failing",
                  icon: "alert",
                  label: props.t("failing"),
                  count: counts().failing,
                  tone: "bad",
                },
              ]}
              selected={filter()}
              onSelect={(id: Filter) => setFilter(filter() === id ? undefined : id)}
            />
            <Show when={props.open}>
              {(id) => (
                <For each={[id()]} keyed={(entry) => entry}>
                  {(entry) => (
                    <SkillDetailView
                      host={props.host}
                      t={props.t}
                      id={entry()}
                      onClose={() => props.onOpen(undefined)}
                    />
                  )}
                </For>
              )}
            </Show>
            <Show
              when={rows().length > 0}
              fallback={
                <p class="nsvx__empty">
                  {props.t(data().skills.length === 0 ? "noSkills" : "noResults")}
                </p>
              }
            >
              <ul class="nsvx-list">
                <For each={rows()} keyed={(skill) => skill.id}>
                  {(skill) => (
                    <li class="nsvx-skill">
                      <button
                        type="button"
                        role="switch"
                        class={["nsvx-switch", { "nsvx-switch--on": skill().enabled }]}
                        aria-checked={skill().enabled ? "true" : "false"}
                        aria-label={skill().name}
                        disabled={
                          busy() !== undefined ||
                          !props.host.connection.canWrite ||
                          (!skill().enabled && skill().review_state === "pending")
                        }
                        onClick={() =>
                          void change(skill(), "nsvx.skills.state", { enabled: !skill().enabled })
                        }
                      >
                        <span class="nsvx-switch__track" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        class="nsvx-skill__main"
                        onClick={() => props.onOpen(skill().slug)}
                      >
                        <span class="nsvx-row__title">{skill().name}</span>
                        <Show when={skill().when_to_use}>
                          <span class="nsvx-row__detail">{skill().when_to_use}</span>
                        </Show>
                        <Show when={note()?.id === skill().id}>
                          <span class="nsvx-row__detail nsvx-row__detail--bad" role="alert">
                            {note()?.message}
                          </span>
                        </Show>
                      </button>
                      <Show
                        when={skill().review_state === "pending"}
                        fallback={
                          <span class="nsvx-skill__meta">
                            <Show when={skill().latest_verification}>
                              {(check) => (
                                <Icon
                                  name={CHECK_ICON[check().verified]}
                                  class={[
                                    "nsvx-row__icon",
                                    check().verified === "failed"
                                      ? "nsvx-row__icon--bad"
                                      : check().verified === "confirmed"
                                        ? "nsvx-row__icon--ok"
                                        : "nsvx-row__icon--warn",
                                  ]}
                                />
                              )}
                            </Show>
                            <span class="nsvx-row__age">
                              {skill().last_run_ts ? age(skill().last_run_ts) : "—"}
                            </span>
                          </span>
                        }
                      >
                        <span class="nsvx-action__buttons">
                          <button
                            type="button"
                            class="nsvx__button"
                            disabled={busy() !== undefined || !props.host.connection.canWrite}
                            onClick={() =>
                              void change(skill(), "nsvx.skills.review", {
                                decision: "reject",
                                reviewVersion: skill().review_version,
                              })
                            }
                          >
                            {props.t("reject")}
                          </button>
                          <button
                            type="button"
                            class="nsvx__button nsvx__button--primary"
                            disabled={busy() !== undefined || !props.host.connection.canWrite}
                            onClick={() =>
                              void change(skill(), "nsvx.skills.review", {
                                decision: "approve",
                                reviewVersion: skill().review_version,
                              })
                            }
                          >
                            {props.t("approve")}
                          </button>
                        </span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        );
      }}
    </SourceView>
  );
}
