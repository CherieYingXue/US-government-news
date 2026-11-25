# US–China Action Tracker

A web dashboard that tracks U.S. federal government actions involving **China, Chinese, Taiwan and Taiwanese** subjects. It collects them from agency websites, the Federal Register, Congress, officials' social media accounts and press coverage, classifies each item, and keeps a searchable history.

- **Update now** button checks every source on demand.
- **Automatic update every day at 22:00 GMT.**
- Filter by topic (China / Taiwan), source type (government, officials' social media, media reports), time period, agency or office, and type of action (sanctions, export controls, trade and tariffs, legislation, defense, law enforcement, visas, investment, tech, diplomacy, rules and notices…), plus full-text search.
- A **Sources** panel shows what each source returned in the last update and flags any that could not be reached.

## Sources

| Type | Sources |
| --- | --- |
| Government (direct) | Federal Register API (all agencies: Commerce/BIS, Treasury/OFAC, USTR, State, ITC…), White House presidential actions, news and briefings, Department of War (Defense), Justice, USTR, SEC, Energy, House Select Committee on the CCP, new bills from GovInfo |
| Government (site-scoped search) | State Department, Treasury and OFAC, Commerce and BIS, DHS and CBP, FBI, FCC, USDA, Senate, House, Congress.gov, American Institute in Taiwan, U.S. Mission China, USCC. These sites block feed readers, so they are searched through Google News restricted to their official domains. |
| Officials' social media | Donald Trump's Truth Social posts (via the public trumpstruth.org archive), X posts from about 30 officials and agency accounts (needs an X API token), and news reports quoting officials' posts |
| Media | Google News searches on trade, sanctions, defense, diplomacy, Congress, law enforcement, tech and Taiwan policy, kept only when the headline names both China/Taiwan and a U.S. actor |

The source list lives in `src/lib/sources.ts`; keyword and category rules are in `src/lib/classify.ts`.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:4317. On first load the tracker runs an initial update covering the past 30 days, which takes under a minute.

Locally the app stores data in an embedded Postgres (PGlite) under `.data/pglite`. Delete that folder to start fresh. When `DATABASE_URL` is set, it uses that Postgres database instead, and `npm run build` applies the SQL in `migrations/`.

## Deploy on Render

The repo includes a `render.yaml` Blueprint that creates a Node web service and a Postgres database.

1. In Render, choose **New → Blueprint** and connect this repository (branch `main`).
2. Render reads `render.yaml` and creates `us-government-news` (web) and `us-government-news-db` (Postgres). It generates `CRON_SECRET` and asks for `X_BEARER_TOKEN`, which you can leave empty.
3. Click **Apply**. Database migrations run when the server starts, and the first update runs automatically.

Both use Render's free plans. On free plans, the web service sleeps after about 15 minutes without visitors, so the 22:00 GMT timer can't fire while it's asleep. The missed update runs on the next visit. To get exactly 22:00 GMT, either uncomment the cron job in `render.yaml` (a paid Render feature) or point a free external scheduler (for example cron-job.org) at `https://<your-app>.onrender.com/api/cron` daily at 22:00 GMT, with the header `Authorization: Bearer <CRON_SECRET>`. Render's free Postgres expires after 30 days unless you upgrade it.

## How the daily update works

The update is designed to happen at 22:00 GMT even on hosts that pause idle servers:

1. **In-process timer.** A long-running server (`npm start`) schedules itself for the next 22:00 GMT (`src/lib/scheduler.ts`).
2. **Catch-up on visit.** If the 22:00 GMT update was missed (for example, the server was asleep), the next page load starts it automatically.
3. **External cron (optional).** `GET /api/cron` with `Authorization: Bearer $CRON_SECRET` runs an update. `vercel.json` already schedules it at `0 22 * * *` for Vercel; any other cron service can call the same URL.

Only one update runs at a time, and the manual button has a one-minute cooldown.

## Optional settings

| Variable | Purpose |
| --- | --- |
| `X_BEARER_TOKEN` | X API bearer token. Enables reading officials' X accounts (recent search endpoint). Without it that source is skipped. |
| `CRON_SECRET` | Enables the `/api/cron` endpoint for an external scheduler. |
| `DATABASE_URL` | Postgres connection string. If unset, the embedded local database is used. |

## Scripts

- `npm run dev`: development server on port 4317
- `npm run build`: production build plus database migrations
- `npm start`: production server (port `$PORT` or 4317)
- `npm run lint`, `npm run typecheck`

## Limitations

- Classification is keyword-based. Items where China or Taiwan only appears in the body are labeled, and the "Headline mentions only" filter hides them.
- Site-scoped and news searches depend on Google News indexing, so a few official pages can appear hours after publication.
- Google News links go through a news.google.com redirect to the original article.
