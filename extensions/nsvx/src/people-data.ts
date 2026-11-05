/** NSVX People shapes (web/src/types.ts at the pinned commit) and pure helpers for the People tab and chat tool. */

export type Handling = "auto" | "review" | "paused" | "excluded";
export const HANDLINGS: readonly Handling[] = ["auto", "review", "paused", "excluded"];

export type PersonSummary = {
  id: string;
  display_name: string;
  handling: Handling;
  channels: string[];
  last_message_at: string | null;
  active_missions: number;
  sent_message_count?: number;
  reply_as_voice?: boolean;
  has_avatar?: boolean | null;
};

export type Identity = {
  id: string;
  external_id: string;
  handle: string | null;
  display_name: string | null;
  link_status: "unlinked" | "proposed" | "verified" | "rejected";
  link_evidence?: { by?: string; evidence?: string } | null;
  channel: string;
  label: string;
  mode: string;
  last_at?: string | null;
};

export type Fact = {
  id: string;
  subject: string | null;
  assertion: string;
  author: string;
  source_kind: string;
  source_ref: string;
  source_at: string | null;
  confidence: number | null;
  sensitivity: "normal" | "private" | "sensitive" | "restricted";
  state: string;
  verification: string;
  superseded_by: string | null;
  source_conversation_id?: string | null;
  permitted?: boolean;
};

export type PersonGroup = {
  id: string;
  display_name: string;
  state: "proposed" | "active" | "excluded" | "expired";
  member_origin: "automatic" | "owner";
  rationale: string | null;
  last_evidence_at: string | null;
};

export type Mention = {
  id: string;
  conversation_id: string;
  sent_at: string;
  status: string;
  author_is_owner: boolean;
  channel: string;
};

export type Person = {
  id: string;
  display_name: string;
  handling: Handling;
  quiet_hours: { start?: string; end?: string; tz?: string } | null;
  social_followup_allowed: boolean;
  voice_pref?: "any" | "text_only";
  reply_as_voice?: boolean;
  created_at: string;
  updated_at: string;
  identities: Identity[];
  facts: Fact[];
  missions: { id: string; title: string; status: string }[];
  recent: {
    id: string;
    body: string | null;
    direction: "inbound" | "outbound";
    origin: string;
    sent_at: string;
    channel: string;
    conversation_id: string;
  }[];
  rules: { id: string; meaning: string; class: string }[];
  groups?: PersonGroup[];
  aliases?: { alias: string; origin: string }[];
  automation_stop?: { kind: "stop" | "human_only"; created_at: string } | null;
  mentioned_in?: Mention[];
};

export type ContactEntry = {
  id?: string;
  kind: "email" | "phone" | "iban" | "account";
  value: string;
  label: string;
  source?: string;
};
export type ContactDetails = {
  revision: number;
  entries: ContactEntry[];
  linked: ContactEntry[];
  suggestions: (ContactEntry & { id: string })[];
};

export type InterestMode = "off" | "observe_only" | "bounded_learning";
export type Willingness = "unknown" | "open" | "avoid" | "defer";
export type InterestTopic = {
  topic_id: string;
  canonical_label: string;
  context_scope: string;
  affinity: number | null;
  confidence: number;
  willingness: Willingness;
  observation_count: number;
  last_confirmed_at: string | null;
};
export type InterestStyle = {
  learning?: boolean;
  brevity?: "default" | "brief" | "detailed";
  emoji?: "default" | "off" | "on";
  language?: "current" | "pt" | "en";
};
export type InterestView = {
  revision: number;
  mode: InterestMode;
  permitted: boolean;
  sync: { memory: string; drive: string };
  style: InterestStyle;
  topics: InterestTopic[];
  open_loops?: {
    id: string;
    topic_id: string;
    claim: string;
    event_at: string | null;
    observed_at: string;
    conversation_id: string;
  }[];
};
export type InterestHistoryItem = {
  id: string;
  observed_at: string;
  conversation_id: string;
  deleted_at: string | null;
  superseded_by?: string | null;
  kind?: string;
  claim?: string;
  basis?: string;
  confidence?: number;
  engagement?: string;
  satisfaction?: string;
  affect?: string;
  emoji?: string | null;
  attribution_method?: string;
  owner_corrected?: boolean;
};
export type InterestHistory = {
  items: InterestHistoryItem[];
  next: string | null;
  revision: number;
};

export type ConsentCategory = "profile" | "history" | "photos" | "followup";
export const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  "profile",
  "history",
  "photos",
  "followup",
];
export type DatePrecision = "day" | "month" | "year" | "unknown";
export type Visit = {
  id: string;
  place_label: string;
  city: string | null;
  venue_kind: "city" | "restaurant" | "public_venue";
  event_date: string | null;
  event_date_precision: DatePrecision;
  state: "proposed" | "confirmed" | "hidden" | "declined";
  source_kind: string;
  geo_precision: "city" | "venue" | "none";
};
export type GeoFeature = {
  type: "Feature";
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] };
  properties: {
    id?: string;
    label?: string;
    date?: string | null;
    precision?: DatePrecision;
    kind?: "sequence";
    from?: string;
    to?: string;
  };
};
export type Places = {
  grants: Record<ConsentCategory, { granted: boolean }>;
  erasure: { status: "running" | "done" | "partial"; created_at: string } | null;
  fields: Record<string, { value: string | null; state: "shared" | "declined" }> | null;
  photos: { id: string; width: number; height: number }[] | null;
  summary: {
    last: { visit: Visit | null; ambiguous: boolean };
    geojson: { features: GeoFeature[] };
    count: number;
  } | null;
  visits: { items: Visit[]; next: string | null } | null;
};

export type GroupSummary = {
  id: string;
  display_name: string;
  description: string | null;
  origin: "automatic" | "owner";
  state: "proposed" | "active" | "archived" | "deleted";
  owner_locked: boolean;
  owner_criteria_only: boolean;
  revision: number;
  members: number;
  proposed: number;
};
export type GroupMember = {
  person_id: string;
  display_name: string;
  state: "proposed" | "active" | "excluded" | "expired";
  origin: "automatic" | "owner";
  rationale: string | null;
};
export type Group = Omit<GroupSummary, "members" | "proposed"> & {
  members: GroupMember[];
  events: { id: number; actor: string; action: string; at: string; undone_at: string | null }[];
  can_undo: boolean;
};
export type GroupPage = { items: GroupSummary[]; next: string | null };

export type ConversationContext = {
  mentions: {
    id: string;
    span: string;
    status: string;
    subject_person_id: string | null;
    subject: string | null;
    sent_at: string;
    candidate_names?: { id: string; display_name: string }[];
  }[];
};

/** NSVX's "Frequentes": the eight people the owner writes to most. */
export function frequent(people: PersonSummary[]): PersonSummary[] {
  return people
    .filter((p) => (p.sent_message_count ?? 0) > 0)
    .toSorted(
      (a, b) =>
        (b.sent_message_count ?? 0) - (a.sent_message_count ?? 0) ||
        (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "") ||
        a.display_name.localeCompare(b.display_name) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 8);
}

/** Same rule as NSVX's people list: a task is active until completed or cancelled. */
export const isActiveMission = (status: string) => status !== "completed" && status !== "cancelled";

/** Facts NSVX no longer uses in messages: obsolete, corrected, removed, or restricted. */
export const isPastFact = (f: Fact) =>
  f.state === "superseded" || f.state === "removed" || f.sensitivity === "restricted";

/** Linked channels, once each, from verified accounts. */
export const verifiedChannels = (p: Pick<Person, "identities">) => [
  ...new Set(p.identities.filter((i) => i.link_status === "verified").map((i) => i.channel)),
];

/** Name people recognise: display name, then @handle; the provider id only when there is nothing else. */
export function identityName(i: Pick<Identity, "display_name" | "handle" | "external_id">) {
  const handle = i.handle && i.handle !== i.display_name ? `@${i.handle.replace(/^@/, "")}` : null;
  return [i.display_name, handle].filter(Boolean).join(" · ") || i.external_id;
}

/** The conversation a fact came from, when it is one the owner can open. */
export function factConversation(f: Fact, recent: Person["recent"]): string | null {
  if (f.source_kind !== "message") {
    return null;
  }
  return (
    f.source_conversation_id ?? recent.find((m) => m.id === f.source_ref)?.conversation_id ?? null
  );
}

/** NSVX's group name rule (logic/social.ts): 1 to 60 characters after trimming. */
export const validGroupName = (name: string) => name.trim().length > 0 && name.trim().length <= 60;

/** Locale-aware event date: day, month, or year as the person declared it. */
export function eventDate(date: string | null, precision: DatePrecision, locale: string): string {
  if (!date || precision === "unknown") {
    return "";
  }
  const [y, m, d] = date.split("-").map(Number);
  if (precision === "year" || !m) {
    return String(y);
  }
  const at = new Date(Date.UTC(y ?? 1970, m - 1, d || 1, 12));
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    ...(precision === "day" && d ? { day: "numeric" } : {}),
    timeZone: "UTC",
  }).format(at);
}

/** The year a visit belongs to on the timeline; undated visits go last, never guessed. */
export function byYear(visits: Visit[]): { year: string | null; items: Visit[] }[] {
  const groups = new Map<string | null, Visit[]>();
  for (const v of visits) {
    const key =
      v.event_date && v.event_date_precision !== "unknown" ? v.event_date.slice(0, 4) : null;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return [...groups.entries()]
    .toSorted(([a], [b]) => (a === null ? 1 : b === null ? -1 : b.localeCompare(a)))
    .map(([year, items]) => ({ year, items }));
}

export type MapPoint = { id: string; x: number; y: number; label: string };
export type MapLine = { x1: number; y1: number; x2: number; y2: number };

/**
 * Schematic map like NSVX's: an equirectangular fit of the declared city points, with date-order lines between
 * them (not a route). No tiles and no live location.
 */
export function mapLayout(features: GeoFeature[], width: number, height: number, pad: number) {
  const points = features.flatMap((f) =>
    f.geometry.type === "Point" && f.properties.id
      ? [{ id: f.properties.id, label: f.properties.label ?? "", at: f.geometry.coordinates }]
      : [],
  );
  if (points.length === 0) {
    return { points: [] as MapPoint[], lines: [] as MapLine[] };
  }
  const lons = points.map((p) => p.at[0]);
  const lats = points.map((p) => p.at[1]);
  const span = Math.max(
    Math.max(...lons) - Math.min(...lons),
    Math.max(...lats) - Math.min(...lats),
    1,
  );
  const cx = (Math.min(...lons) + Math.max(...lons)) / 2;
  const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
  const scale = Math.min((width - 2 * pad) / span, (height - 2 * pad) / span);
  const project = ([lon, lat]: [number, number]) => ({
    x: width / 2 + (lon - cx) * scale,
    y: height / 2 - (lat - cy) * scale,
  });
  const placed = new Map<string, { x: number; y: number }>();
  const mapped = points.map((p) => {
    const at = project(p.at);
    placed.set(p.id, at);
    return { id: p.id, label: p.label, x: at.x, y: at.y };
  });
  const lines = features.flatMap((f) => {
    const from = f.properties.from ? placed.get(f.properties.from) : undefined;
    const to = f.properties.to ? placed.get(f.properties.to) : undefined;
    return f.properties.kind === "sequence" && from && to
      ? [{ x1: from.x, y1: from.y, x2: to.x, y2: to.y }]
      : [];
  });
  return { points: mapped, lines };
}
