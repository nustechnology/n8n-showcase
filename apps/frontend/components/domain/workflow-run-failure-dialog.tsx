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
 * Shown on a FAILED workflow-run row. n8n doesn't currently send
 * `errorMessage` when it PATCHes a run to failed (confirmed against real
 * rows — `error` is always null in practice), so this points at the
 * associated order's diagnostic dialog (where applicable) or shows the
 * workflow-level error when available.
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
            This workflow run failed during execution. The most likely cause is a failed step within the pipeline —
            check the steps section above for the specific node that failed.
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
