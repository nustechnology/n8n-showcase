import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning";
}

export function StatTile({ label, value, hint, tone = "neutral" }: StatTileProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-3xl font-semibold tabular-nums",
          tone === "warning" && "text-status-degraded"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
