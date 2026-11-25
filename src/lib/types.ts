export type Topic = "china" | "taiwan";
export type Channel = "government" | "social" | "media";

export type Category =
  | "executive"
  | "sanctions"
  | "export_controls"
  | "trade"
  | "legislation"
  | "defense"
  | "law_enforcement"
  | "immigration"
  | "investment"
  | "technology"
  | "diplomacy"
  | "health_agri"
  | "regulation"
  | "other";

export const CATEGORY_LABELS: Record<Category, string> = {
  executive: "Executive action",
  sanctions: "Sanctions",
  export_controls: "Export controls",
  trade: "Trade & tariffs",
  legislation: "Congress & legislation",
  defense: "Defense & military",
  law_enforcement: "Law enforcement",
  immigration: "Visas & immigration",
  investment: "Investment & finance",
  technology: "Tech & telecom",
  diplomacy: "Diplomacy & statements",
  health_agri: "Health & agriculture",
  regulation: "Rules & notices",
  other: "Other",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  government: "Government sources",
  social: "Officials' social media",
  media: "Media reports",
};

export const TOPIC_LABELS: Record<Topic, string> = {
  china: "China",
  taiwan: "Taiwan",
};

export type Item = {
  id: string;
  title: string;
  summary: string;
  url: string;
  sourceId: string;
  sourceName: string;
  channel: Channel;
  agency: string | null;
  author: string | null;
  publisher: string | null;
  topics: Topic[];
  categories: Category[];
  matchInTitle: boolean;
  publishedAt: string;
  firstSeenAt: string;
};

export type SourceResult = {
  id: string;
  name: string;
  channel: Channel;
  ok: boolean;
  fetched: number;
  matched: number;
  added: number;
  error?: string;
  skipped?: string;
};

export type UpdateRun = {
  id: number;
  trigger: "manual" | "scheduled" | "catch-up" | "cron";
  status: "running" | "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string | null;
  itemsSeen: number;
  itemsNew: number;
  sourceResults: SourceResult[];
  error: string | null;
};

export type StatusResponse = {
  running: UpdateRun | null;
  lastRun: UpdateRun | null;
  lastSuccessAt: string | null;
  nextScheduledAt: string;
  scheduleLabel: string;
  counts: {
    total: number;
    last24h: number;
    last7d: number;
    china7d: number;
    taiwan7d: number;
  };
  agencies: { name: string; count: number }[];
  categories: { category: Category; count: number }[];
  xConfigured: boolean;
};

export type ItemsResponse = {
  items: Item[];
  total: number;
  nextOffset: number | null;
};
