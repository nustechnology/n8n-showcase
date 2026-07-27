import Link from "next/link";
import { HelpCircle } from "lucide-react";

import type { WorkflowRun } from "@/features/workflows/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Shown on a FAILED workflow-run row. The order-validation workflow has
 * exactly one failure-capable step today (AI Validation, mocked — see
 * backend CLAUDE.md "Orchestrator callbacks"); inventory-check and
 * shipment-creation nodes aren't built yet, so a FAILED run always traces
 * back to that one node. n8n doesn't currently send `errorMessage` when it
 * PATCHes a run to failed (confirmed against real rows — `error` is always
 * null in practice), so this points at the order's own diagnostic dialog
 * (OrderValidationFailureDialog) instead of re-deriving the reason here.
 */
export function WorkflowRunFailureDialog({ workspaceSlug, run }: { workspaceSlug: string; run: WorkflowRun }) {
  const errorMessage = typeof run.error?.message === "string" ? run.error.message : null;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
          />
        }
      >
        <HelpCircle />
        Why
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Why this run failed</DialogTitle>
          <DialogDescription>
            This workflow (Shopify Order → AI Validation → Inventory Check → Shipment → Notification) only has one
            step capable of failing today: <strong>AI Validation</strong>. Inventory check and shipment creation
            aren&apos;t built yet, so a failed run always traces back to that node rejecting the order.
          </DialogDescription>
        </DialogHeader>
        {errorMessage && <p className="rounded-lg border bg-muted/50 p-3 text-status-failed">{errorMessage}</p>}
        <DialogFooter showCloseButton>
          {run.orderId && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/${workspaceSlug}/orders/${run.orderId}`}>View order</Link>}
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
