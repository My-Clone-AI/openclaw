import { agendaTranslator } from "./agenda-i18n.js";
import { deviceTranslator } from "./device-i18n.js";
import { fleetTranslator } from "./fleet-i18n.js";
import { translator } from "./i18n.js";
import { messagesTranslator } from "./messages-i18n.js";
import { peopleTranslator } from "./people-i18n.js";

/** The NSVX page's tabs, in bar order; each label comes from the catalog of the tab that owns it. */
export const TABS = [
  "today",
  "find",
  "tasks",
  "work",
  "activity",
  "messages",
  "reply",
  "agenda",
  "people",
  "money",
  "fleet",
  "team",
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
    case "agenda":
      return agendaTranslator(locale)(id);
    case "fleet":
      return fleetTranslator(locale)(id);
    case "messages":
    case "reply":
      return messagesTranslator(locale)(id);
    case "people":
      return peopleTranslator(locale)(id);
    case "device":
    case "health":
      return deviceTranslator(locale)(id);
    default:
      return translator(locale)(id);
  }
}
