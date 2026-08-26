"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { useRetryWorkflowRun, useWorkflowRun } from "@/features/workflows/hooks";

import { useEventStream } from "@/hooks/use-event-stream";
import { usePermission } from "@/hooks/use-permission";

import { ApiError } from "@/lib/api-error";
import { mapRunStatus, mapWorkflowStepStatus } from "@/lib/status";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Stepper } from "@/components/patterns/stepper";
import { WorkflowRunFailureDialog } from "@/components/domain/workflow-run-failure-dialog";

export function WorkflowRunDetail({ workspaceSlug, runId }: { workspaceSlug: string; runId: string }) {
  const run = useWorkflowRun(runId);
  const retry = useRetryWorkflowRun(runId);
  const canRetry = usePermission("workflow:retry");
  const queryClient = useQueryClient();
  const [isRetrying, setIsRetrying] = useState(false);

  // Backend API contract §7 — status-change events on this run. Invalidating
  // just this run's query key (rather than reloading the page) is what keeps
  // the update "in place": React Query swaps the data in without dropping
  // back to the pending/skeleton state, since it already has cached data.
  useEventStream(`/workflow-runs/${runId}/stream`, () => {
    queryClient.invalidateQueries({ queryKey: ["workflow-runs", runId] });
    setIsRetrying(false);
  });

  if (run.error instanceof ApiError && run.error.statusCode === 404) {
    notFound();
  }

  if (run.isPending) {
    return (
      <div className="space-y-4 p-6 sm:p-8">
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  if (run.isError) {
    return (
      <div className="m-6 flex items-start gap-3 rounded-lg border border-status-failed/30 bg-status-failed-bg px-4 py-3 text-status-failed sm:m-8">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>Couldn&apos;t load this run — {run.error instanceof Error ? run.error.message : "unknown error"}.</p>
      </div>
    );
  }

  const data = run.data;
  const { tone, label } = mapRunStatus(data.status);

  function handleRetry() {
    setIsRetrying(true);
    retry.mutate(undefined, {
      onError: () => {
        setIsRetrying(false);
        toast.error("Couldn't retry this run — try again.");
      },
    });
  }

  const descriptionByWorkflow: Record<string, string> = {
    "order-validation": "Shopify Order → AI Validation → Inventory Check → Shipment → Notification.",
    "cart-reminder": "Shopify Add to Cart → Wait → Check Recent Orders → Email Reminder.",
  };

  return (
    <>
      <PageHeader
        title={data.workflowName}
        description={descriptionByWorkflow[data.workflowName] ?? "Automation pipeline run."}
        action={
          <StatusBadge
            tone={isRetrying ? "running" : tone}
            label={isRetrying ? "Retrying…" : label}
          />
        }
      />
      <div className="max-w-2xl space-y-6 p-6 sm:p-8">
        <section className="rounded-lg border bg-card p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">Started</dt>
            <dd>{new Date(data.startedAt).toLocaleString()}</dd>
            <dt className="text-muted-foreground">Finished</dt>
            <dd>{data.finishedAt ? new Date(data.finishedAt).toLocaleString() : "—"}</dd>
            {data.orderId && (
              <>
                <dt className="text-muted-foreground">Order</dt>
                <dd>
                  <Link
                    href={`/${workspaceSlug}/orders/${data.orderId}`}
                    className="hover:underline"
                  >
                    View order
                  </Link>
                </dd>
              </>
            )}
          </dl>
        </section>

        {data.steps.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-semibold">Steps</h2>
            <Stepper
              steps={data.steps.map((step) => ({
                id: step.id,
                label: step.label,
                tone: mapWorkflowStepStatus(step.status).tone,
              }))}
            />
          </section>
        )}

        {data.status === "FAILED" && (
          <section className="flex items-center gap-2">
            <WorkflowRunFailureDialog
              workspaceSlug={workspaceSlug}
              run={data}
            />
            {canRetry && (
              <Button
                variant="outline"
                size="sm"
                disabled={isRetrying || retry.isPending}
                onClick={handleRetry}
              >
                {isRetrying || retry.isPending ? "Retrying…" : "Retry run"}
              </Button>
            )}
          </section>
        )}
      </div>
    </>
  );
}
