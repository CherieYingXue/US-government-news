import { titleKey } from "./classify";
import { sql } from "./db";
import { fetchSource, type Candidate, type FetchContext } from "./fetchers";
import { lastScheduledRun } from "./schedule";
import { SOURCES } from "./sources";
import type { SourceResult, UpdateRun } from "./types";

const STALE_MINUTES = 15;
const MANUAL_COOLDOWN_SECONDS = 60;
const RETRY_FAILED_MINUTES = 30;
const CONCURRENCY = 4;

type Trigger = UpdateRun["trigger"];
export type StartResult =
  | { started: true; runId: number; done: Promise<void> }
  | { started: false; reason: "running" | "cooldown"; runId?: number };

async function expireStaleRuns(): Promise<void> {
  await sql(
    `update update_runs set status = 'failed', finished_at = now(), error = 'Timed out'
     where status = 'running' and started_at < now() - ($1::int * interval '1 minute')`,
    [STALE_MINUTES],
  );
}

export async function startUpdate(trigger: Trigger): Promise<StartResult> {
  await expireStaleRuns();
  const [running] = await sql<{ id: number }>(`select id from update_runs where status = 'running' limit 1`);
  if (running) return { started: false, reason: "running", runId: Number(running.id) };

  if (trigger === "manual") {
    const [recent] = await sql<{ id: number }>(
      `select id from update_runs where started_at > now() - ($1::int * interval '1 second') limit 1`,
      [MANUAL_COOLDOWN_SECONDS],
    );
    if (recent) return { started: false, reason: "cooldown" };
  }

  let runId: number;
  try {
    const [row] = await sql<{ id: number }>(
      `insert into update_runs (trigger, status) values ($1, 'running') returning id`,
      [trigger],
    );
    runId = Number(row.id);
  } catch {
    return { started: false, reason: "running" };
  }
  return { started: true, runId, done: executeRun(runId) };
}

/** True when no update has completed since the most recent 22:00 GMT slot. */
export async function isUpdateDue(now = new Date()): Promise<boolean> {
  const [last] = await sql<{ started_at: Date }>(
    `select started_at from update_runs where status in ('success', 'partial') order by started_at desc limit 1`,
  );
  if (last && new Date(last.started_at) >= lastScheduledRun(now)) return false;
  const [attempt] = await sql<{ id: number }>(
    `select id from update_runs where started_at > now() - ($1::int * interval '1 minute') limit 1`,
    [RETRY_FAILED_MINUTES],
  );
  return !attempt;
}

async function windowDays(): Promise<number> {
  const [last] = await sql<{ started_at: Date }>(
    `select started_at from update_runs where status in ('success', 'partial') order by started_at desc limit 1`,
  );
  if (!last) return 30;
  const days = (Date.now() - new Date(last.started_at).getTime()) / 86400000;
  return Math.min(30, Math.max(1, Math.ceil(days + 1)));
}

async function insertCandidates(candidates: Candidate[]): Promise<number> {
  let added = 0;
  for (const c of candidates) {
    const rows = await sql(
      `insert into items (id, title, summary, url, source_id, source_name, channel, agency, author, publisher,
                          topics, categories, match_in_title, published_at, title_key)
       select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12::text[], $13, $14::timestamptz, $15
       where not exists (select 1 from items where title_key = $15)
       on conflict (id) do nothing
       returning id`,
      [
        c.id,
        c.title,
        c.summary,
        c.url,
        c.sourceId,
        c.sourceName,
        c.channel,
        c.agency,
        c.author,
        c.publisher,
        c.topics,
        c.categories,
        c.matchInTitle,
        c.publishedAt.toISOString(),
        titleKey(c.title),
      ],
    );
    added += rows.length;
  }
  return added;
}

async function executeRun(runId: number): Promise<void> {
  const results: SourceResult[] = [];
  try {
    const ctx: FetchContext = { windowDays: await windowDays(), xBearerToken: process.env.X_BEARER_TOKEN?.trim() || undefined };
    const queue = [...SOURCES];
    const worker = async () => {
      for (let source = queue.shift(); source; source = queue.shift()) {
        const result: SourceResult = { id: source.id, name: source.name, channel: source.channel, ok: true, fetched: 0, matched: 0, added: 0 };
        try {
          const outcome = await fetchSource(source, ctx);
          result.fetched = outcome.fetched;
          result.matched = outcome.candidates.length;
          result.skipped = outcome.skipped;
          result.added = await insertCandidates(outcome.candidates);
        } catch (error) {
          result.ok = false;
          result.error = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
        }
        results.push(result);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const failed = results.filter((r) => !r.ok).length;
    const status = failed === 0 ? "success" : failed === results.length ? "failed" : "partial";
    await sql(
      `update update_runs set status = $2, finished_at = now(), items_seen = $3, items_new = $4, source_results = $5::jsonb
       where id = $1`,
      [
        runId,
        status,
        results.reduce((n, r) => n + r.matched, 0),
        results.reduce((n, r) => n + r.added, 0),
        JSON.stringify(results),
      ],
    );
  } catch (error) {
    await sql(
      `update update_runs set status = 'failed', finished_at = now(), source_results = $2::jsonb, error = $3 where id = $1`,
      [runId, JSON.stringify(results), error instanceof Error ? error.message.slice(0, 300) : "Unknown error"],
    ).catch(() => {});
  }
}
