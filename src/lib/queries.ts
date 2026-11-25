import { sql } from "./db";
import { SCHEDULE_LABEL, nextScheduledRun } from "./schedule";
import {
  CATEGORY_LABELS,
  type Category,
  type Channel,
  type Item,
  type ItemsResponse,
  type StatusResponse,
  type Topic,
  type UpdateRun,
} from "./types";

export const PAGE_SIZE = 40;

const RANGES: Record<string, number | null> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90, all: null };
const CHANNELS = new Set<Channel>(["government", "social", "media"]);
const TOPICS = new Set<Topic>(["china", "taiwan"]);

export type ItemFilters = {
  q?: string;
  topic?: string;
  channel?: string;
  category?: string;
  agency?: string;
  range?: string;
  headlineOnly?: boolean;
  offset?: number;
};

type ItemRow = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source_id: string;
  source_name: string;
  channel: Channel;
  agency: string | null;
  author: string | null;
  publisher: string | null;
  topics: Topic[];
  categories: Category[];
  match_in_title: boolean;
  published_at: Date | string;
  first_seen_at: Date | string;
};

const iso = (d: Date | string) => new Date(d).toISOString();

function toItem(r: ItemRow): Item {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    url: r.url,
    sourceId: r.source_id,
    sourceName: r.source_name,
    channel: r.channel,
    agency: r.agency,
    author: r.author,
    publisher: r.publisher,
    topics: r.topics ?? [],
    categories: r.categories ?? [],
    matchInTitle: r.match_in_title,
    publishedAt: iso(r.published_at),
    firstSeenAt: iso(r.first_seen_at),
  };
}

export async function listItems(f: ItemFilters): Promise<ItemsResponse> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(clause(`$${params.length}`));
  };

  const q = f.q?.trim().slice(0, 120);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    add(
      (p) =>
        `(title ilike ${p} or summary ilike ${p} or coalesce(agency,'') ilike ${p} or source_name ilike ${p} or coalesce(publisher,'') ilike ${p} or coalesce(author,'') ilike ${p})`,
      like,
    );
  }
  if (f.topic && TOPICS.has(f.topic as Topic)) add((p) => `${p} = any(topics)`, f.topic);
  if (f.channel && CHANNELS.has(f.channel as Channel)) add((p) => `channel = ${p}`, f.channel);
  if (f.category && f.category in CATEGORY_LABELS) add((p) => `${p} = any(categories)`, f.category);
  if (f.agency) add((p) => `agency = ${p}`, f.agency.slice(0, 200));
  const days = f.range && f.range in RANGES ? RANGES[f.range] : RANGES["30d"];
  if (days != null) add((p) => `published_at > now() - (${p}::int * interval '1 day')`, days);
  if (f.headlineOnly) where.push("match_in_title");

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const offset = Math.max(0, Math.min(10000, Math.floor(f.offset ?? 0)));

  const [{ count }] = await sql<{ count: number }>(`select count(*)::int as count from items ${whereSql}`, params);
  const rows = await sql<ItemRow>(
    `select * from items ${whereSql} order by published_at desc, first_seen_at desc limit ${PAGE_SIZE} offset ${offset}`,
    params,
  );
  const total = Number(count);
  return { items: rows.map(toItem), total, nextOffset: offset + rows.length < total ? offset + rows.length : null };
}

type RunRow = {
  id: number;
  trigger: UpdateRun["trigger"];
  status: UpdateRun["status"];
  started_at: Date | string;
  finished_at: Date | string | null;
  items_seen: number;
  items_new: number;
  source_results: UpdateRun["sourceResults"] | string;
  error: string | null;
};

function toRun(r: RunRow): UpdateRun {
  return {
    id: Number(r.id),
    trigger: r.trigger,
    status: r.status,
    startedAt: iso(r.started_at),
    finishedAt: r.finished_at ? iso(r.finished_at) : null,
    itemsSeen: r.items_seen,
    itemsNew: r.items_new,
    sourceResults: typeof r.source_results === "string" ? JSON.parse(r.source_results) : r.source_results,
    error: r.error,
  };
}

export async function getStatus(): Promise<StatusResponse> {
  const [running] = await sql<RunRow>(`select * from update_runs where status = 'running' order by started_at desc limit 1`);
  const [lastRun] = await sql<RunRow>(`select * from update_runs where status <> 'running' order by started_at desc limit 1`);
  const [lastSuccess] = await sql<{ finished_at: Date }>(
    `select finished_at from update_runs where status in ('success','partial') order by started_at desc limit 1`,
  );
  const [counts] = await sql<Record<string, number>>(
    `select count(*)::int as total,
            count(*) filter (where published_at > now() - interval '1 day')::int as last24h,
            count(*) filter (where published_at > now() - interval '7 days')::int as last7d,
            count(*) filter (where published_at > now() - interval '7 days' and 'china' = any(topics))::int as china7d,
            count(*) filter (where published_at > now() - interval '7 days' and 'taiwan' = any(topics))::int as taiwan7d
     from items`,
  );
  const agencies = await sql<{ name: string; count: number }>(
    `select agency as name, count(*)::int as count from items where agency is not null
     group by agency order by count desc, agency limit 40`,
  );
  const categories = await sql<{ category: Category; count: number }>(
    `select c as category, count(*)::int as count from items, unnest(categories) as c
     where published_at > now() - interval '30 days'
     group by c order by count desc`,
  );
  return {
    running: running ? toRun(running) : null,
    lastRun: lastRun ? toRun(lastRun) : null,
    lastSuccessAt: lastSuccess?.finished_at ? iso(lastSuccess.finished_at) : null,
    nextScheduledAt: nextScheduledRun().toISOString(),
    scheduleLabel: SCHEDULE_LABEL,
    counts: {
      total: Number(counts.total),
      last24h: Number(counts.last24h),
      last7d: Number(counts.last7d),
      china7d: Number(counts.china7d),
      taiwan7d: Number(counts.taiwan7d),
    },
    agencies: agencies.map((a) => ({ name: a.name, count: Number(a.count) })),
    categories: categories.map((c) => ({ category: c.category, count: Number(c.count) })),
    xConfigured: Boolean(process.env.X_BEARER_TOKEN?.trim()),
  };
}
