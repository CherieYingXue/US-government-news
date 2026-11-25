import { ArrowUpRight, Building2, MessageSquareQuote, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, type Channel, type Item } from "@/lib/types";
import { fullDateTime, hostOf, relativeTime } from "./format";

export const CHANNEL_STYLE: Record<Channel, { bar: string; icon: typeof Building2; label: string; chip: string }> = {
  government: {
    bar: "bg-blue-700",
    icon: Building2,
    label: "Government",
    chip: "bg-blue-50 text-blue-800 ring-blue-200",
  },
  social: {
    bar: "bg-amber-500",
    icon: MessageSquareQuote,
    label: "Official's post",
    chip: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  media: {
    bar: "bg-slate-400",
    icon: Newspaper,
    label: "Media report",
    chip: "bg-slate-100 text-slate-700 ring-slate-200",
  },
};

export function TopicBadge({ topic }: { topic: "china" | "taiwan" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold tracking-wide uppercase ring-1 ring-inset",
        topic === "china" ? "bg-red-50 text-red-700 ring-red-200" : "bg-teal-50 text-teal-700 ring-teal-200",
      )}
    >
      {topic === "china" ? "China" : "Taiwan"}
    </span>
  );
}

export function ItemCard({ item, now, isNew }: { item: Item; now: number; isNew: boolean }) {
  const style = CHANNEL_STYLE[item.channel];
  const Icon = style.icon;
  const origin = item.publisher ?? hostOf(item.url);
  const who = item.channel === "social" ? (item.author ?? item.sourceName) : (item.agency ?? item.sourceName);

  return (
    <article className="group relative overflow-hidden rounded-xl border bg-card shadow-xs transition hover:border-primary/30 hover:shadow-sm">
      <span className={cn("absolute inset-y-0 left-0 w-1", style.bar)} aria-hidden />
      <div className="flex flex-col gap-2 py-3.5 pr-4 pl-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ring-1 ring-inset", style.chip)}>
            <Icon className="size-3" />
            {style.label}
          </span>
          <span className="font-medium text-foreground/80">{who}</span>
          {origin && origin !== who && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{origin}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <time dateTime={item.publishedAt} title={fullDateTime(item.publishedAt)}>
            {relativeTime(item.publishedAt, now)}
          </time>
          {isNew && <Badge className="h-4 bg-emerald-600 px-1.5 text-[10px] uppercase">New</Badge>}
        </div>

        <h3 className="text-[15px] leading-snug font-semibold text-balance">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="decoration-primary/40 underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {item.title}
            <ArrowUpRight className="ml-0.5 inline size-3.5 -translate-y-px text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </a>
        </h3>

        {item.summary && item.summary !== item.title && (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {item.topics.map((t) => (
            <TopicBadge key={t} topic={t} />
          ))}
          {item.categories
            .filter((c) => c !== "other")
            .map((c) => (
              <Badge key={c} variant="outline" className="font-normal text-muted-foreground">
                {CATEGORY_LABELS[c]}
              </Badge>
            ))}
          {!item.matchInTitle && (
            <span className="text-[11px] text-muted-foreground italic">China/Taiwan mentioned in body</span>
          )}
          {item.channel === "government" && item.sourceName && item.sourceName !== who && (
            <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">via {item.sourceName}</span>
          )}
        </div>
      </div>
    </article>
  );
}
