"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CalendarClock, Loader2, RefreshCw, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, ItemsResponse, StatusResponse } from "@/lib/types";
import { DEFAULT_FILTERS, FiltersPanel, type Filters } from "./filters";
import { dayKey, dayLabel, gmtDateTime, localTime, relativeTime } from "./format";
import { ItemCard } from "./item-card";
import { SourcesSheet } from "./sources-sheet";

const CLOCK_TICK_MS = 30000;

function subscribeClock(onTick: () => void) {
  const t = setInterval(onTick, CLOCK_TICK_MS);
  return () => clearInterval(t);
}

/** Wall clock rounded to the tick, so snapshots stay stable between renders; 0 during server rendering. */
function useNow() {
  return useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / CLOCK_TICK_MS) * CLOCK_TICK_MS,
    () => 0,
  );
}

function buildQuery(filters: Filters, q: string, offset: number) {
  const p = new URLSearchParams();
  if (q.trim()) p.set("q", q.trim());
  if (filters.topic !== "all") p.set("topic", filters.topic);
  if (filters.channel !== "all") p.set("channel", filters.channel);
  if (filters.category !== "all") p.set("category", filters.category);
  if (filters.agency !== "all") p.set("agency", filters.agency);
  p.set("range", filters.range);
  if (filters.headlineOnly) p.set("headline", "1");
  if (offset) p.set("offset", String(offset));
  return p.toString();
}

export function TrackerApp() {
  const now = useNow();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [settled, setSettled] = useState<{ key: string; ok: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const wasRunning = useRef<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as StatusResponse;
      setStatus(data);
      setStatusError(false);
      return data;
    } catch {
      setStatusError(true);
      return null;
    }
  }, []);

  const running = status?.running ?? null;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const data = await loadStatus();
      if (cancelled) return;
      timer = setTimeout(tick, data?.running ? 2500 : 60000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadStatus, reloadKey]);

  useEffect(() => {
    if (running) {
      wasRunning.current = running.id;
      return;
    }
    if (wasRunning.current != null && status?.lastRun?.id === wasRunning.current) {
      const run = status.lastRun;
      wasRunning.current = null;
      setReloadKey((k) => k + 1);
      if (run.status === "failed") toast.error("The update failed. Sources will be retried on the next update.");
      else
        toast.success(
          run.itemsNew > 0
            ? `Update complete: ${run.itemsNew} new action${run.itemsNew === 1 ? "" : "s"} found.`
            : "Update complete: nothing new since the last check.",
        );
    }
  }, [running, status?.lastRun]);

  const listQuery = buildQuery(filters, query, 0);
  const requestKey = `${listQuery}#${reloadKey}`;
  const itemsState = settled?.key !== requestKey ? "loading" : settled.ok ? "ready" : "error";

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/items?${listQuery}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = (await res.json()) as ItemsResponse;
        setItems(data.items);
        setTotal(data.total);
        setNextOffset(data.nextOffset);
        setSettled({ key: requestKey, ok: true });
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setSettled({ key: requestKey, ok: false });
      });
    return () => controller.abort();
  }, [listQuery, requestKey]);

  const loadMore = async () => {
    if (nextOffset == null) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/items?${buildQuery(filters, query, nextOffset)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ItemsResponse;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...data.items.filter((i) => !seen.has(i.id))];
      });
      setNextOffset(data.nextOffset);
    } catch {
      toast.error("Could not load more actions. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  const triggerUpdate = async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/update", { method: "POST", headers: { "X-Requested-With": "tracker" } });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.status === 202) toast.info("Checking all sources for new actions…");
      else toast.warning(data.message ?? data.error ?? "Could not start the update.");
      await loadStatus();
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setRequesting(false);
    }
  };

  const updateFilters = (next: Partial<Filters>) => setFilters((f) => ({ ...f, ...next }));

  const lastRunStart = status?.lastRun?.startedAt ?? null;
  // The very first update finds everything at once, so "new" only means something after that.
  const showNewBadges = Boolean(status?.lastRun && status.lastRun.itemsNew < status.counts.total);
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Item[] }[] = [];
    for (const item of items) {
      const key = dayKey(item.publishedAt);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(item);
      else out.push({ key, label: dayLabel(item.publishedAt, now), items: [item] });
    }
    return out;
  }, [items, now]);

  const busy = requesting || Boolean(running);
  const firstRun = status != null && status.counts.total === 0;
  const activeFilterCount =
    (filters.topic !== "all" ? 1 : 0) +
    (filters.channel !== "all" ? 1 : 0) +
    (filters.category !== "all" ? 1 : 0) +
    (filters.agency !== "all" ? 1 : 0) +
    (filters.range !== DEFAULT_FILTERS.range ? 1 : 0) +
    (filters.headlineOnly ? 1 : 0);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-[oklch(0.24_0.06_262)] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 pt-6 pb-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-white/60 uppercase">
                <span className="inline-block size-1.5 rounded-full bg-red-400" />
                Washington · Beijing · Taipei
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">US–China Action Tracker</h1>
              <p className="mt-1.5 text-sm text-white/70">
                Every U.S. federal government action involving China, Chinese, Taiwan or Taiwanese subjects, collected from agency
                releases, the Federal Register, Congress, officials&apos; social media and press coverage.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <SourcesSheet status={status} />
              <Button
                size="lg"
                onClick={triggerUpdate}
                disabled={busy}
                className="bg-white px-4 text-[oklch(0.24_0.06_262)] hover:bg-white/90"
              >
                {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                {running ? "Updating…" : "Update now"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Last 24 hours" value={status?.counts.last24h} />
            <Stat label="Last 7 days" value={status?.counts.last7d} />
            <Stat label="China · 7 days" value={status?.counts.china7d} accent="bg-red-400" />
            <Stat label="Taiwan · 7 days" value={status?.counts.taiwan7d} accent="bg-teal-300" />
            <div className="col-span-2 flex flex-col justify-center rounded-lg bg-white/8 px-3.5 py-2.5 ring-1 ring-white/10">
              <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                <CalendarClock className="size-3.5" />
                {running ? "Update in progress" : "Automatic update"}
              </div>
              {status ? (
                running ? (
                  <div className="text-sm font-medium">
                    Checking all sources… started {relativeTime(running.startedAt, now)}
                  </div>
                ) : (
                  <div className="text-sm">
                    <span className="font-medium">{gmtDateTime(status.nextScheduledAt)}</span>
                    <span className="text-white/60">
                      {" "}
                      · {relativeTime(status.nextScheduledAt, now)} · {localTime(status.nextScheduledAt)} your time
                    </span>
                  </div>
                )
              ) : (
                <Skeleton className="mt-1 h-4 w-48 bg-white/15" />
              )}
              <div className="text-[11px] text-white/50">
                {status?.lastSuccessAt ? `Last updated ${relativeTime(status.lastSuccessAt, now)}` : "Not updated yet"} ·{" "}
                {status?.scheduleLabel ?? "Every day at 22:00 GMT"}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-6">
            <FiltersPanel filters={filters} onChange={updateFilters} status={status} />
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actions, agencies, officials, outlets…"
                className="h-10 bg-background pr-9 pl-9"
                aria-label="Search actions"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Sheet>
              <SheetTrigger render={<Button variant="outline" className="h-10 lg:hidden" />}>
                <SlidersHorizontal data-icon="inline-start" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeFilterCount}</span>
                )}
              </SheetTrigger>
              <SheetContent side="left" className="w-[88%] max-w-sm">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto px-4 pb-6">
                  <FiltersPanel filters={filters} onChange={updateFilters} status={status} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {statusError && (
            <Alert variant="destructive" className="mb-4">
              <TriangleAlert />
              <AlertTitle>Update status unavailable</AlertTitle>
              <AlertDescription>The server could not be reached. The list below may be out of date.</AlertDescription>
            </Alert>
          )}

          {itemsState === "error" ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Could not load actions</AlertTitle>
              <AlertDescription>
                Something went wrong while loading the list.
                <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : itemsState === "loading" && items.length === 0 ? (
            <FeedSkeleton />
          ) : items.length === 0 ? (
            firstRun || (running && status?.counts.total === 0) ? (
              <EmptyState
                title="Collecting the first batch of actions"
                body="The tracker is checking agency websites, the Federal Register, officials' posts and news coverage for the past 30 days. This usually takes under a minute."
                spinner
              />
            ) : (
              <EmptyState
                title="No actions match these filters"
                body="Try a longer time period, a different topic, or clear your search."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilters(DEFAULT_FILTERS);
                      setSearch("");
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            )
          ) : (
            <div className={itemsState === "loading" ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <p className="mb-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{total.toLocaleString()}</span> action
                {total === 1 ? "" : "s"} found
              </p>
              <div className="flex flex-col gap-6">
                {groups.map((g) => (
                  <div key={g.key}>
                    <h2 className="sticky top-0 z-10 -mx-1 mb-2 bg-background/95 px-1 py-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">
                      {g.label}
                    </h2>
                    <div className="flex flex-col gap-2.5">
                      {g.items.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          now={now}
                          isNew={Boolean(lastRunStart && item.firstSeenAt >= lastRunStart && showNewBadges)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {nextOffset != null && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore && <Loader2 className="animate-spin" data-icon="inline-start" />}
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t py-5 text-center text-xs text-muted-foreground">
        Sources: whitehouse.gov, federalregister.gov, war.gov, justice.gov, ustr.gov, sec.gov, energy.gov, govinfo.gov, House and Senate
        sites, site-scoped search of other agencies, Truth Social, X (when configured) and Google News. Classification is automatic;
        follow each link for the original.
      </footer>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | undefined; accent?: string }) {
  return (
    <div className="rounded-lg bg-white/8 px-3.5 py-2.5 ring-1 ring-white/10">
      <div className="flex items-center gap-1.5 text-[11px] text-white/60">
        {accent && <span className={`size-1.5 rounded-full ${accent}`} />}
        {label}
      </div>
      {value == null ? (
        <Skeleton className="mt-1 h-6 w-10 bg-white/15" />
      ) : (
        <div className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      )}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading actions">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="mt-3 h-4 w-11/12" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
  spinner,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  spinner?: boolean;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      {spinner ? (
        <Loader2 className="mb-3 size-6 animate-spin text-primary" />
      ) : (
        <Search className="mb-3 size-6 text-muted-foreground" />
      )}
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
