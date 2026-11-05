/** @jsxImportSource @solidjs/web */
import { render } from "@solidjs/web";
import { defineControlUiPlugin, type ControlUiView } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import { AccessTab } from "./access-tab.js";
import { ActionsTab } from "./actions-tab.js";
import { ActivityTab, FindTab } from "./activity-tab.js";
import { AgendaTab } from "./agenda-tab.js";
import { aiTranslator, type AT } from "./ai-i18n.js";
import { AI_VIEWS, AiTab, type AiView } from "./ai-tab.js";
import { AviationTab } from "./aviation-tab.js";
import { deviceTranslator, type DT } from "./device-i18n.js";
import { DeviceTab } from "./device-tab.js";
import { FinanceTab } from "./finance-tab.js";
import { FleetTab } from "./fleet-tab.js";
import { GroupTab } from "./group-tab.js";
import { growTranslator } from "./grow-i18n.js";
import { GrowTab } from "./grow-tab.js";
import { HealthTab } from "./health-tab.js";
import { translator } from "./i18n.js";
import { legalTranslator } from "./legal-i18n.js";
import { LegalTab } from "./legal-tab.js";
import { marketingTranslator } from "./marketing-i18n.js";
import { MarketingTab } from "./marketing-tab.js";
import { messagesTranslator, type MT } from "./messages-i18n.js";
import { MessagesTab } from "./messages-tab.js";
import { TasksTab, TodayTab, WorkTab } from "./owner-tabs.js";
import { peopleTranslator, type PT } from "./people-i18n.js";
import { PeopleTab, type PeopleOpen } from "./people-tab.js";
import { ProgressTab } from "./progress-tab.js";
import { QuickReplyTab } from "./quick-reply-tab.js";
import { researchTranslator } from "./research-i18n.js";
import { ResearchTab } from "./research-tab.js";
import { SetupTab } from "./setup-tab.js";
import { SkillsTab } from "./skills-tab.js";
import { isTab, TABS, tabLabel, type Tab } from "./tabs.js";
import { TeamTab } from "./team-tab.js";
import { Icon, type T } from "./ui-kit.js";
import "./control-ui.css";
import "./messages.css";
import "./finance.css";
import "./setup.css";

const mountNsvx: ControlUiView = (container, context) => {
  const host = context.host;
  const [locale, setLocale] = createSignal(host.locale);
  const unsubscribe = host.subscribe(() => setLocale(host.locale));
  const t: T = (key) => translator(locale())(key);
  const mt: MT = (key) => messagesTranslator(locale())(key);
  const pt: PT = (key) => peopleTranslator(locale())(key);
  const dt: DT = (key) => deviceTranslator(locale())(key);
  const at: AT = (key) => aiTranslator(locale())(key);
  const label = (id: Tab) => tabLabel(locale(), id);
  const search = new URLSearchParams(location.search);
  const initial = search.get("tab") ?? "today";
  const [tab, setTab] = createSignal<Tab>(isTab(initial) ? initial : "today");
  const [mission, setMission] = createSignal(search.get("mission") ?? undefined);
  const [conversation, setConversation] = createSignal(search.get("conversation") ?? undefined);
  const [draft, setDraft] = createSignal(search.get("draft") ?? undefined);
  const [eventId, setEventId] = createSignal(search.get("event") ?? undefined);
  const personParam = search.get("person");
  const groupParam = search.get("group");
  const [personOpen, setPersonOpen] = createSignal<PeopleOpen>(
    personParam
      ? { kind: "person", id: personParam }
      : groupParam
        ? { kind: "group", id: groupParam }
        : undefined,
  );
  const [agent, setAgent] = createSignal(search.get("agent") ?? undefined);
  const [skill, setSkill] = createSignal(search.get("skill") ?? undefined);
  const aiParam = search.get("ai") as AiView | null;
  const [aiView, setAiView] = createSignal<AiView>(
    aiParam && AI_VIEWS.includes(aiParam) ? aiParam : "routes",
  );
  const [query, setQuery] = createSignal("");
  const [revision, setRevision] = createSignal(0);
  // Deep links: reloading or sharing the address returns to the same tab and open item.
  // Values are passed in (signal writes are not readable until the next flush).
  const remember = (
    nextTab: Tab,
    open: {
      mission?: string;
      conversation?: string;
      draft?: string;
      people?: PeopleOpen;
      agent?: string;
      skill?: string;
      event?: string;
      ai?: AiView;
    } = {},
  ) => {
    const url = new URL(location.href);
    url.searchParams.set("tab", nextTab);
    const missionId = open.mission;
    const conversationId = open.conversation;
    const draftId = open.draft;
    if (nextTab === "tasks" && missionId) {
      url.searchParams.set("mission", missionId);
    } else {
      url.searchParams.delete("mission");
    }
    if (nextTab === "messages" && conversationId) {
      url.searchParams.set("conversation", conversationId);
    } else {
      url.searchParams.delete("conversation");
    }
    if (nextTab === "reply" && draftId) {
      url.searchParams.set("draft", draftId);
    } else {
      url.searchParams.delete("draft");
    }
    if (nextTab === "agenda" && open.event) {
      url.searchParams.set("event", open.event);
    } else {
      url.searchParams.delete("event");
    }
    for (const kind of ["person", "group"] as const) {
      if (nextTab === "people" && open.people?.kind === kind) {
        url.searchParams.set(kind, open.people.id);
      } else {
        url.searchParams.delete(kind);
      }
    }
    for (const [name, value, owner] of [
      ["agent", open.agent, "setup"],
      ["skill", open.skill, "skills"],
    ] as const) {
      if (nextTab === owner && value) {
        url.searchParams.set(name, value);
      } else {
        url.searchParams.delete(name);
      }
    }
    if (nextTab === "ai" && open.ai) {
      url.searchParams.set("ai", open.ai);
    } else {
      url.searchParams.delete("ai");
    }
    history.replaceState(history.state, "", url);
  };
  const select = (next: Tab) => {
    setTab(next);
    setQuery("");
    remember(next, {
      mission: mission(),
      conversation: conversation(),
      draft: draft(),
      event: eventId(),
      people: personOpen(),
      agent: agent(),
      skill: skill(),
      ai: aiView(),
    });
  };
  const openAi = (view: AiView) => {
    setAiView(view);
    remember("ai", { ai: view });
  };
  const showMission = (id: string) => {
    setMission(id);
    setTab("tasks");
    setQuery("");
    remember("tasks", { mission: id, conversation: conversation(), draft: draft() });
  };
  const openMission = (id: string | undefined) => {
    setMission(id);
    remember(tab(), {
      mission: id,
      conversation: conversation(),
      draft: draft(),
      event: eventId(),
    });
  };
  const openConversation = (id: string | undefined) => {
    setConversation(id);
    remember(tab(), { mission: mission(), conversation: id, draft: draft(), event: eventId() });
  };
  const openDraft = (id: string | undefined) => {
    setDraft(id);
    remember(tab(), {
      mission: mission(),
      conversation: conversation(),
      draft: id,
      event: eventId(),
    });
  };
  const openEvent = (id: string | undefined) => {
    setEventId(id);
    remember(tab(), {
      mission: mission(),
      conversation: conversation(),
      draft: draft(),
      event: id,
    });
  };
  const openPeople = (open: PeopleOpen) => {
    setPersonOpen(open);
    remember(tab(), {
      mission: mission(),
      conversation: conversation(),
      draft: draft(),
      people: open,
    });
  };
  const openAgent = (id: string) => {
    setAgent(id);
    remember(tab(), { agent: id, skill: skill() });
  };
  const openSkill = (id: string | undefined) => {
    setSkill(id);
    remember(tab(), { agent: agent(), skill: id });
  };
  const Page = () => (
    <section class="nsvx">
      <header class="nsvx__header">
        <nav class="nsvx__tabs" role="tablist" aria-label={t("title")}>
          <For each={TABS}>
            {(id) => (
              <button
                type="button"
                role="tab"
                aria-label={label(id)}
                title={label(id)}
                aria-selected={tab() === id ? "true" : "false"}
                class={["nsvx__tab", { "nsvx__tab--active": tab() === id }]}
                onClick={() => select(id)}
              >
                <Icon name={id} />
                <span class="nsvx__tab-label">{label(id)}</span>
              </button>
            )}
          </For>
        </nav>
        <input
          class="nsvx__search"
          type="search"
          placeholder={t(tab() === "find" ? "findHint" : "search")}
          aria-label={t("search")}
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={t("refresh")}
          title={t("refresh")}
          onClick={() => setRevision(revision() + 1)}
        >
          <Icon name="refresh" />
        </button>
      </header>
      <Show when={!host.connection.connected}>
        <p class="nsvx__error" role="alert">
          {t("offlineGateway")}
        </p>
      </Show>
      <For each={[`${tab()}:${revision()}`]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={tab() === "today"}>
              <TodayTab host={host} t={t} query={query()} onMission={showMission} />
            </Show>
            <Show when={tab() === "find"}>
              <FindTab host={host} t={t} query={query()} onMission={showMission} />
            </Show>

            <Show when={tab() === "tasks"}>
              <TasksTab host={host} t={t} query={query()} open={mission()} onOpen={openMission} />
            </Show>
            <Show when={tab() === "work"}>
              <WorkTab host={host} t={t} query={query()} />
            </Show>
            <Show when={tab() === "grow"}>
              <GrowTab
                host={host}
                t={t}
                dt={dt}
                gt={growTranslator(locale())}
                locale={locale()}
                query={query()}
              />
            </Show>
            <Show when={tab() === "activity"}>
              <ActivityTab host={host} t={t} query={query()} />
            </Show>
            <Show when={tab() === "messages"}>
              <MessagesTab
                host={host}
                t={t}
                mt={mt}
                locale={locale()}
                query={query()}
                open={conversation()}
                onOpen={openConversation}
              />
            </Show>
            <Show when={tab() === "reply"}>
              <QuickReplyTab
                host={host}
                t={t}
                mt={mt}
                locale={locale()}
                query={query()}
                open={draft()}
                onOpen={openDraft}
              />
            </Show>
            <Show when={tab() === "agenda"}>
              <AgendaTab
                host={host}
                t={t}
                locale={locale()}
                query={query()}
                open={eventId()}
                onOpen={openEvent}
                onMission={showMission}
              />
            </Show>
            <Show when={tab() === "people"}>
              <PeopleTab
                host={host}
                t={t}
                pt={pt}
                locale={locale()}
                query={query()}
                open={personOpen()}
                onOpen={openPeople}
                onConversation={(id) => {
                  setConversation(id);
                  setTab("messages");
                  setQuery("");
                  remember("messages", { mission: mission(), conversation: id, draft: draft() });
                }}
                onMission={showMission}
              />
            </Show>
            <Show when={tab() === "money"}>
              <FinanceTab host={host} t={t} query={query()} />
            </Show>
            <Show when={tab() === "aviation"}>
              <AviationTab
                host={host}
                t={t}
                locale={locale()}
                query={query()}
                onMission={showMission}
              />
            </Show>
            <Show when={tab() === "device"}>
              <DeviceTab host={host} t={t} dt={dt} query={query()} />
            </Show>
            <Show when={tab() === "health"}>
              <HealthTab host={host} t={t} dt={dt} query={query()} />
            </Show>
            <Show when={tab() === "legal"}>
              <LegalTab
                host={host}
                t={t}
                dt={dt}
                lt={legalTranslator(locale())}
                locale={locale()}
                query={query()}
              />
            </Show>
            <Show when={tab() === "research"}>
              <ResearchTab
                host={host}
                t={t}
                dt={dt}
                rt={researchTranslator(locale())}
                locale={locale()}
                query={query()}
              />
            </Show>
            <Show when={tab() === "marketing"}>
              <MarketingTab
                host={host}
                t={t}
                dt={dt}
                kt={marketingTranslator(locale())}
                locale={locale()}
                query={query()}
              />
            </Show>
            <Show when={tab() === "fleet"}>
              <FleetTab host={host} t={t} locale={locale()} query={query()} />
            </Show>

            <Show when={tab() === "group"}>
              <GroupTab host={host} t={t} query={query()} locale={locale()} />
            </Show>
            <Show when={tab() === "access"}>
              <AccessTab host={host} t={t} query={query()} locale={locale()} />
            </Show>
            <Show when={tab() === "ai"}>
              <AiTab host={host} t={t} at={at} query={query()} view={aiView()} onView={openAi} />
            </Show>
            <Show when={tab() === "team"}>
              <TeamTab host={host} t={t} query={query()} />
            </Show>
            <Show when={tab() === "setup"}>
              <SetupTab
                host={host}
                t={t}
                mt={mt}
                locale={locale()}
                query={query()}
                agent={agent()}
                onAgent={openAgent}
              />
            </Show>
            <Show when={tab() === "skills"}>
              <SkillsTab host={host} t={t} query={query()} open={skill()} onOpen={openSkill} />
            </Show>
            <Show when={tab() === "actions"}>
              <ActionsTab host={host} t={t} query={query()} />
            </Show>
            <Show when={tab() === "progress"}>
              <ProgressTab host={host} t={t} query={query()} />
            </Show>
          </>
        )}
      </For>
    </section>
  );
  const disposeRoot = render(() => <Page />, container);
  return {
    dispose() {
      unsubscribe();
      disposeRoot();
    },
  };
};

export default defineControlUiPlugin({
  id: "nsvx",
  activate(host) {
    const disposePage = host.ui.registerPage({ id: "nsvx", label: "NSVX", mount: mountNsvx });
    const disposeNavigation = host.ui.registerNavigation({
      id: "nsvx",
      label: "NSVX",
      page: { id: "nsvx" },
      icon: "layers",
      order: 20,
    });
    return () => {
      disposeNavigation();
      disposePage();
    };
  },
});
