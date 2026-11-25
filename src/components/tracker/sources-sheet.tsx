"use client";

import { CircleAlert, CircleCheck, CircleMinus, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CHANNEL_LABELS, type Channel, type StatusResponse } from "@/lib/types";
import { fullDateTime } from "./format";

export function SourcesSheet({ status }: { status: StatusResponse | null }) {
  const run = status?.running ?? status?.lastRun ?? null;
  const results = run?.sourceResults ?? [];
  const groups = (["government", "social", "media"] as Channel[]).map((c) => ({
    channel: c,
    rows: results.filter((r) => r.channel === c).sort((a, b) => a.name.localeCompare(b.name)),
  }));
  const failing = results.filter((r) => !r.ok).length;

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" className="bg-background/10 text-white border-white/20 hover:bg-white/15 hover:text-white" />}>
        <Database data-icon="inline-start" />
        Sources
        {failing > 0 && <span className="ml-0.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold text-amber-950">{failing}</span>}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Sources</SheetTitle>
          <SheetDescription>
            {run
              ? `Results from the ${run.status === "running" ? "update in progress" : "last update"}, started ${fullDateTime(run.startedAt)}.`
              : "No update has run yet."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {groups.map(({ channel, rows }) =>
            rows.length === 0 ? null : (
              <section key={channel} className="mb-5">
                <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {CHANNEL_LABELS[channel]}
                </h3>
                <ul className="divide-y rounded-lg border">
                  {rows.map((r) => (
                    <li key={r.id} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                      {!r.ok ? (
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      ) : r.skipped ? (
                        <CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {!r.ok
                            ? `Could not be reached (${r.error ?? "error"}). Will retry on the next update.`
                            : r.skipped
                              ? r.skipped
                              : `${r.matched} relevant of ${r.fetched} checked · ${r.added} new`}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Agencies that block feed readers (State, Treasury, Commerce, DHS, FBI and others) are covered through searches limited to
            their official websites. Officials&apos; X accounts need an X API token; Truth Social posts are read from a public archive.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
