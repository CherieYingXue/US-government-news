"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, CHANNEL_LABELS, type Category, type StatusResponse } from "@/lib/types";

export type Filters = {
  topic: "all" | "china" | "taiwan";
  channel: "all" | "government" | "social" | "media";
  range: "24h" | "7d" | "30d" | "90d" | "all";
  category: Category | "all";
  agency: string;
  headlineOnly: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  topic: "all",
  channel: "all",
  range: "30d",
  category: "all",
  agency: "all",
  headlineOnly: false,
};

const RANGE_ITEMS = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </div>
  );
}

export function FiltersPanel({
  filters,
  onChange,
  status,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
  status: StatusResponse | null;
}) {
  const agencyItems = [
    { value: "all", label: "All agencies & offices" },
    ...(status?.agencies ?? []).map((a) => ({ value: a.name, label: `${a.name} (${a.count})` })),
  ];
  const counts = new Map((status?.categories ?? []).map((c) => [c.category, c.count]));
  const categories = (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => c !== "other" || counts.has(c));
  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="flex flex-col gap-5">
      <Section title="Topic">
        <ToggleGroup
          variant="outline"
          className="w-full"
          value={[filters.topic]}
          onValueChange={(v) => v[0] && onChange({ topic: v[0] as Filters["topic"] })}
        >
          <ToggleGroupItem value="all" className="flex-1">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="china" className="flex-1">
            China
          </ToggleGroupItem>
          <ToggleGroupItem value="taiwan" className="flex-1">
            Taiwan
          </ToggleGroupItem>
        </ToggleGroup>
      </Section>

      <Section title="Source type">
        <div className="flex flex-col gap-1">
          {(["all", "government", "social", "media"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ channel: c })}
              className={cn(
                "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition hover:bg-muted",
                filters.channel === c && "bg-primary/8 font-medium text-primary",
              )}
            >
              {c === "all" ? "All sources" : CHANNEL_LABELS[c]}
              {filters.channel === c && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Time period">
        <Select
          items={RANGE_ITEMS}
          value={filters.range}
          onValueChange={(v) => v && onChange({ range: v as Filters["range"] })}
        >
          <SelectTrigger className="w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_ITEMS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section title="Agency or office">
        <Select items={agencyItems} value={filters.agency} onValueChange={(v) => onChange({ agency: (v as string) ?? "all" })}>
          <SelectTrigger className="w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agencyItems.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section title="Type of action">
        <div className="flex flex-wrap gap-1.5">
          <CategoryChip active={filters.category === "all"} onClick={() => onChange({ category: "all" })}>
            All types
          </CategoryChip>
          {categories.map((c) => (
            <CategoryChip key={c} active={filters.category === c} onClick={() => onChange({ category: c })}>
              {CATEGORY_LABELS[c]}
              {counts.has(c) && <span className="ml-1 tabular-nums opacity-60">{counts.get(c)}</span>}
            </CategoryChip>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Counts cover the last 30 days.</p>
      </Section>

      <Separator />

      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--primary)]"
          checked={filters.headlineOnly}
          onChange={(e) => onChange({ headlineOnly: e.target.checked })}
        />
        <span>
          Headline mentions only
          <span className="block text-xs text-muted-foreground">Hide items where China or Taiwan only appears in the body text.</span>
        </span>
      </label>

      {!isDefault && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange(DEFAULT_FILTERS)}>
          Reset filters
        </Button>
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/40 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
