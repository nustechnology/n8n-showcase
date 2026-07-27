import { ArrowRight } from "lucide-react";

import type { StatusTone } from "@/lib/status";

import { StatusBadge } from "@/components/patterns/status-badge";

export interface StepperStep {
  id: string;
  label: string;
  tone: StatusTone;
}

/**
 * Pure presentational primitive — takes finished { label, tone } pairs, no
 * knowledge of orders or workflow runs. Reuses StatusBadge for each step so
 * tone-to-color stays defined in exactly one place. This is the component
 * Phase 2's real run-detail page will eventually feed with per-step backend
 * data; components/domain/order-status-pipeline.tsx is today's only adapter.
 */
export function Stepper({ steps }: { steps: StepperStep[] }) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto py-1">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className="flex shrink-0 items-center gap-1.5"
        >
          <StatusBadge
            tone={step.tone}
            label={step.label}
          />
          {index < steps.length - 1 && (
            <ArrowRight
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </li>
      ))}
    </ol>
  );
}
