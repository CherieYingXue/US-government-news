import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { detectCategories, detectTopics, mentionsUsActor, stripHtml, truncate, decodeEntities } from "./classify";
import type { FederalRegisterSource, GoogleNewsSource, RssSource, SourceDef, XSource } from "./sources";
import type { Category, Channel, Topic } from "./types";

export type Candidate = {
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
  publishedAt: Date;
};

export type FetchContext = {
  /** How many days back to look, derived from the last successful update. */
  windowDays: number;
  xBearerToken?: string;
};

export type FetchOutcome = { fetched: number; candidates: Candidate[]; skipped?: string };

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 USChinaActionTracker/1.0";
const MAX_AGE_DAYS = 120;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true,
});

export async function fetchSource(source: SourceDef, ctx: FetchContext): Promise<FetchOutcome> {
  switch (source.kind) {
    case "rss":
      return fetchRss(source);
    case "google-news":
      return fetchGoogleNews(source, ctx);
    case "federal-register":
      return fetchFederalRegister(source, ctx);
    case "x":
      return fetchX(source, ctx);
  }
}

async function httpGet(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...(init.headers ?? {}) },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function hashId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("#text" in o) return text(o["#text"]);
    if ("@_href" in o) return text(o["@_href"]);
  }
  return "";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseDate(value: string): Date {
  const d = new Date(value);
  const now = Date.now();
  if (Number.isNaN(d.getTime())) return new Date(now);
  return d.getTime() > now + 6 * 3600 * 1000 ? new Date(now) : d;
}

function tooOld(d: Date): boolean {
  return Date.now() - d.getTime() > MAX_AGE_DAYS * 86400 * 1000;
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

type XmlRecord = Record<string, unknown>;

function at(node: unknown, ...path: string[]): unknown {
  let cur = node;
  for (const key of path) {
    if (cur == null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as XmlRecord)[key];
  }
  return cur;
}

type FeedEntry = { title: string; link: string; body: string; date: string; extra: Record<string, unknown> };

function parseFeed(xml: string): FeedEntry[] {
  const doc: unknown = parser.parse(xml);
  const rssItems = asArray((at(doc, "rss", "channel", "item") ?? at(doc, "rdf:RDF", "item")) as XmlRecord | XmlRecord[] | undefined);
  if (rssItems.length > 0) {
    return rssItems.map((it) => ({
      title: text(it.title),
      link: text(it.link) || text(it.guid),
      body: text(it["content:encoded"]) || text(it.description),
      date: text(it.pubDate) || text(it["dc:date"]),
      extra: it,
    }));
  }
  const entries = asArray(at(doc, "feed", "entry") as XmlRecord | XmlRecord[] | undefined);
  return entries.map((it) => {
    const links = asArray(it.link) as Record<string, string>[];
    const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
    return {
      title: text(it.title),
      link: alt?.["@_href"] ?? text(it.id),
      body: text(it.content) || text(it.summary),
      date: text(it.published) || text(it.updated),
      extra: it,
    };
  });
}

async function fetchRss(source: RssSource): Promise<FetchOutcome> {
  const xml = await (await httpGet(source.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } })).text();
  const entries = parseFeed(xml);
  const candidates: Candidate[] = [];
  for (const e of entries) {
    const body = stripHtml(e.body);
    let title = decodeEntities(stripHtml(e.title));
    const originalUrl = text(e.extra["truth:originalUrl"]);
    const url = isHttpUrl(originalUrl) ? originalUrl : e.link;
    if (!isHttpUrl(url)) continue;
    if (source.titleFromBody) {
      if (!body) continue;
      title = truncate(body, 160);
    }
    const titleTopics = detectTopics(title);
    const topics = detectTopics(`${title} ${body}`);
    if (topics.length === 0) continue;
    if (source.requireTitleMatch && titleTopics.length === 0) continue;
    const publishedAt = parseDate(e.date);
    if (tooOld(publishedAt)) continue;
    candidates.push({
      id: hashId(source.id, url),
      title,
      summary: source.titleFromBody ? truncate(body, 1200) : truncate(body, 600),
      url,
      sourceId: source.id,
      sourceName: source.name,
      channel: source.channel,
      agency: source.agency ?? null,
      author: source.author ?? null,
      publisher: null,
      topics,
      categories: detectCategories(`${title} ${body.slice(0, 2000)}`),
      matchInTitle: source.titleFromBody ? true : titleTopics.length > 0,
      publishedAt,
    });
  }
  return { fetched: entries.length, candidates };
}

function googleNewsUrl(query: string): string {
  const params = new URLSearchParams({ q: query, hl: "en-US", gl: "US", ceid: "US:en" });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

async function fetchGoogleNews(source: GoogleNewsSource, ctx: FetchContext): Promise<FetchOutcome> {
  const days = source.mode === "site" ? Math.max(7, ctx.windowDays) : Math.max(2, ctx.windowDays);
  const xml = await (await httpGet(googleNewsUrl(`${source.query} when:${Math.min(days, 30)}d`))).text();
  const items = asArray(at(parser.parse(xml), "rss", "channel", "item") as XmlRecord | XmlRecord[] | undefined);
  const candidates: Candidate[] = [];
  for (const it of items) {
    const sourceNode = it.source as Record<string, string> | string | undefined;
    const publisher = decodeEntities(text(sourceNode)) || null;
    let title = decodeEntities(text(it.title));
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    else title = title.replace(/\s+-\s+[^-]{2,80}$/, "");
    const url = text(it.link);
    if (!title || !isHttpUrl(url)) continue;
    const topics = detectTopics(title);
    if (topics.length === 0) continue;
    if (source.mode === "news" && !mentionsUsActor(title)) continue;
    if (source.titleMustMatch && !source.titleMustMatch.test(title)) continue;
    const publishedAt = parseDate(text(it.pubDate));
    if (tooOld(publishedAt)) continue;
    const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    candidates.push({
      id: hashId("gn", source.mode === "site" ? source.id : source.channel, normalized),
      title,
      summary: "",
      url,
      sourceId: source.id,
      sourceName: source.name,
      channel: source.channel,
      agency: source.agency ?? null,
      author: null,
      publisher,
      topics,
      categories: detectCategories(title),
      matchInTitle: true,
      publishedAt,
    });
  }
  return { fetched: items.length, candidates };
}

const FR_AGENCY_NAMES: Record<string, string> = {
  "Commerce Department": "Department of Commerce",
  "Treasury Department": "Department of the Treasury",
  "State Department": "Department of State",
  "Defense Department": "Department of War (Defense)",
  "Justice Department": "Department of Justice",
  "Homeland Security Department": "Department of Homeland Security",
  "Agriculture Department": "Department of Agriculture",
  "Energy Department": "Department of Energy",
  "Transportation Department": "Department of Transportation",
  "Health and Human Services Department": "Department of Health and Human Services",
  "Executive Office of the President": "White House",
  "Trade Representative, Office of United States": "U.S. Trade Representative",
  "Federal Communications Commission": "Federal Communications Commission",
  "Securities and Exchange Commission": "Securities and Exchange Commission",
  "International Trade Commission": "U.S. International Trade Commission",
};

type FrDoc = {
  title: string;
  type: string;
  abstract: string | null;
  html_url: string;
  publication_date: string;
  document_number: string;
  excerpts: string | null;
  agencies: { name?: string; raw_name?: string; parent_id: number | null }[];
};

async function fetchFederalRegister(source: FederalRegisterSource, ctx: FetchContext): Promise<FetchOutcome> {
  const since = new Date(Date.now() - Math.max(3, ctx.windowDays) * 86400 * 1000).toISOString().slice(0, 10);
  const docs: FrDoc[] = [];
  for (let page = 1; page <= 5; page++) {
    const params = new URLSearchParams({
      "conditions[term]": "China | Chinese | Taiwan | Taiwanese",
      "conditions[publication_date][gte]": since,
      order: "newest",
      per_page: "100",
      page: String(page),
    });
    for (const f of ["title", "type", "abstract", "html_url", "publication_date", "document_number", "excerpts", "agencies"]) {
      params.append("fields[]", f);
    }
    const res = await httpGet(`https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`);
    const json = (await res.json()) as { results?: FrDoc[]; total_pages?: number };
    docs.push(...(json.results ?? []));
    if (!json.total_pages || page >= json.total_pages) break;
  }
  const candidates: Candidate[] = [];
  for (const d of docs) {
    const abstract = stripHtml(d.abstract ?? "");
    const excerpt = stripHtml(d.excerpts ?? "");
    const topics = detectTopics(`${d.title} ${abstract} ${excerpt}`);
    if (topics.length === 0 || !isHttpUrl(d.html_url)) continue;
    const top = d.agencies.find((a) => a.parent_id == null) ?? d.agencies[0];
    const topName = top?.name ?? top?.raw_name ?? "Federal Register";
    const sub = d.agencies.find((a) => a !== top && a.name)?.name;
    const extra: Category[] = d.type === "Presidential Document" ? ["executive"] : ["regulation"];
    candidates.push({
      id: hashId(source.id, d.document_number),
      title: d.title,
      summary: truncate(abstract || excerpt, 600),
      url: d.html_url,
      sourceId: source.id,
      sourceName: `Federal Register – ${d.type}`,
      channel: source.channel,
      agency: FR_AGENCY_NAMES[topName] ?? topName,
      author: sub ?? null,
      publisher: null,
      topics,
      categories: detectCategories(`${d.title} ${abstract}`, extra),
      matchInTitle: detectTopics(d.title).length > 0,
      // Publication dates are U.S. Eastern calendar days; midnight ET keeps today's issue from looking future-dated.
      publishedAt: parseDate(`${d.publication_date}T05:00:00Z`),
    });
  }
  return { fetched: docs.length, candidates };
}

type XResponse = {
  data?: { id: string; text: string; created_at: string; author_id: string }[];
  includes?: { users?: { id: string; username: string; name: string }[] };
};

async function fetchX(source: XSource, ctx: FetchContext): Promise<FetchOutcome> {
  if (!ctx.xBearerToken) return { fetched: 0, candidates: [], skipped: "Add an X_BEARER_TOKEN secret to read officials' X accounts." };
  const keywords = "(China OR Chinese OR Taiwan OR Taiwanese OR CCP OR Beijing OR PRC OR Taipei)";
  const groups: string[][] = [];
  let current: string[] = [];
  for (const h of source.handles) {
    const trial = [...current, h];
    if (`(${trial.map((x) => `from:${x}`).join(" OR ")}) ${keywords} -is:retweet`.length > 500) {
      groups.push(current);
      current = [h];
    } else current = trial;
  }
  if (current.length) groups.push(current);

  const startTime = new Date(Date.now() - Math.min(6.9, Math.max(1, ctx.windowDays)) * 86400 * 1000).toISOString();
  const candidates: Candidate[] = [];
  let fetched = 0;
  for (const group of groups) {
    const params = new URLSearchParams({
      query: `(${group.map((x) => `from:${x}`).join(" OR ")}) ${keywords} -is:retweet`,
      max_results: "100",
      start_time: startTime,
      "tweet.fields": "created_at,author_id",
      expansions: "author_id",
      "user.fields": "username,name",
    });
    const res = await httpGet(`https://api.x.com/2/tweets/search/recent?${params.toString()}`, {
      headers: { Authorization: `Bearer ${ctx.xBearerToken}` },
    });
    const json = (await res.json()) as XResponse;
    const users = new Map((json.includes?.users ?? []).map((u) => [u.id, u]));
    for (const t of json.data ?? []) {
      fetched++;
      const body = decodeEntities(t.text);
      const topics = detectTopics(body);
      if (topics.length === 0) continue;
      const user = users.get(t.author_id);
      const handle = user?.username ?? "unknown";
      candidates.push({
        id: hashId("x", t.id),
        title: truncate(body, 160),
        summary: body,
        url: `https://x.com/${handle}/status/${t.id}`,
        sourceId: source.id,
        sourceName: `X – @${handle}`,
        channel: "social",
        agency: null,
        author: user ? `${user.name} (@${handle})` : `@${handle}`,
        publisher: null,
        topics,
        categories: detectCategories(body),
        matchInTitle: true,
        publishedAt: parseDate(t.created_at),
      });
    }
  }
  return { fetched, candidates };
}
