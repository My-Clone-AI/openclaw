import { accessTranslator } from "./access-i18n.js";
import { agendaTranslator } from "./agenda-i18n.js";
import { aiTranslator } from "./ai-i18n.js";
import { aviationTranslator } from "./aviation-i18n.js";
import { businessTranslator } from "./business-i18n.js";
import { callsTranslator } from "./calls-i18n.js";
import { deviceTranslator } from "./device-i18n.js";
import { fleetTranslator } from "./fleet-i18n.js";
import { groupTranslator } from "./group-i18n.js";
import { growTranslator } from "./grow-i18n.js";
import { homesTranslator } from "./homes-i18n.js";
import { translator } from "./i18n.js";
import { legalTranslator } from "./legal-i18n.js";
import { marketingTranslator } from "./marketing-i18n.js";
import { messagesTranslator } from "./messages-i18n.js";
import { peopleTranslator } from "./people-i18n.js";
import { researchTranslator } from "./research-i18n.js";

/** The NSVX page's tabs, in bar order; each label comes from the catalog of the tab that owns it. */
export const TABS = [
  "today",
  "find",
  "tasks",
  "work",
  "grow",
  "activity",
  "messages",
  "reply",
  "calls",
  "agenda",
  "people",
  "money",
  "ai",
  "group",
  "homes",
  "business",
  "fleet",
  "aviation",
  "access",
  "legal",
  "research",
  "marketing",
  "team",
  "setup",
  "skills",
  "actions",
  "progress",
  "device",
  "health",
] as const;

export type Tab = (typeof TABS)[number];

export function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

export function tabLabel(locale: string, id: Tab): string {
  switch (id) {
    case "access":
      return accessTranslator(locale)(id);
    case "ai":
      return aiTranslator(locale)(id);
    case "agenda":
      return agendaTranslator(locale)(id);
    case "aviation":
      return aviationTranslator(locale)(id);
    case "business":
      return businessTranslator(locale)("business");
    case "calls":
      return callsTranslator(locale)(id);
    case "fleet":
      return fleetTranslator(locale)(id);
    case "homes":
      return homesTranslator(locale)("homesTab");
    case "grow":
      return growTranslator(locale)(id);
    case "group":
      return groupTranslator(locale)("group");
    case "messages":
    case "reply":
      return messagesTranslator(locale)(id);
    case "people":
      return peopleTranslator(locale)(id);
    case "legal":
      return legalTranslator(locale)("legal");
    case "research":
      return researchTranslator(locale)("research");
    case "marketing":
      return marketingTranslator(locale)("marketing");
    case "device":
    case "health":
      return deviceTranslator(locale)(id);
    default:
      return translator(locale)(id);
  }
}
