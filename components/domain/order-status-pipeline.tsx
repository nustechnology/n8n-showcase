import type { OrderStatus } from "@/features/orders/types";

import { Stepper, type StepperStep } from "@/components/patterns/stepper";

// Order.status is a strict progression (backend API contract §3) — ranking
// each non-terminal value lets us derive "which of the 5 UI stages have
// been reached" without the backend needing to expose stage data itself.
const NON_TERMINAL_RANK: Record<string, number> = {
  RECEIVED: 0,
  VALIDATING: 1,
  // No dedicated stage, same reasoning as FULFILLED below — validation
  // having passed keeps "Validating" as the current stage until the
  // inventory check actually begins.
  VALIDATED: 1,
  INVENTORY_CHECKED: 2,
  SHIPMENT_CREATED: 3,
  FULFILLED: 4,
  NOTIFIED: 5,
  COMPLETED: 6,
};

// FULFILLED has no dedicated stage — it sits between "Shipment" and
// "Notified" with no UI stage of its own, so it keeps "Shipment" active
// until NOTIFIED formally begins. Matches the 5-stage list from the
// architecture plan §07/§08.
const STAGES: { id: string; label: string; minRank: number }[] = [
  { id: "received", label: "Received", minRank: 0 },
  { id: "validating", label: "Validating", minRank: 1 },
  { id: "inventory", label: "Inventory check", minRank: 2 },
  { id: "shipment", label: "Shipment", minRank: 3 },
  { id: "notified", label: "Notified", minRank: 5 },
];

/**
 * Maps Order.status — already-fetched, real data — onto the 5-stage
 * pipeline. There is no per-step backend data yet, so for FAILED/CANCELED
 * this never guesses which stage broke: only "Received" (guaranteed true —
 * the order exists) shows done, followed by one terminal badge.
 */
export function buildOrderPipelineSteps(status: OrderStatus): StepperStep[] {
  if (status === "FAILED" || status === "CANCELED" || status === "VALIDATION_FAILED") {
    const label = status === "FAILED" ? "Failed" : status === "VALIDATION_FAILED" ? "Validation failed" : "Canceled";
    return [
      { id: "received", label: "Received", tone: "success" },
      { id: "terminal", label, tone: "failed" },
    ];
  }

  const currentRank = NON_TERMINAL_RANK[status];
  const currentStageIndex = STAGES.reduce((acc, stage, index) => (stage.minRank <= currentRank ? index : acc), 0);

  return STAGES.map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    tone:
      index < currentStageIndex
        ? "success"
        : index === currentStageIndex
          ? status === "COMPLETED"
            ? "success"
            : "running"
          : "pending",
  }));
}

export function OrderStatusPipeline({ status }: { status: OrderStatus }) {
  return <Stepper steps={buildOrderPipelineSteps(status)} />;
}
