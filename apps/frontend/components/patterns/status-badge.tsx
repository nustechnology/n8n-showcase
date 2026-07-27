import type { StatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-status-success-bg text-status-success",
  running: "bg-status-running-bg text-status-running",
  failed: "bg-status-failed-bg text-status-failed",
  pending: "bg-status-pending-bg text-status-pending",
  degraded: "bg-status-degraded-bg text-status-degraded",
  connecting: "bg-status-pending-bg text-status-pending",
};

export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium",
        TONE_CLASSES[tone]
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          tone === "connecting" && "motion-safe:animate-pulse"
        )}
      />
      {label}
    </span>
  );
}
