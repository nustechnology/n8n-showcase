"use client";

import { useState } from "react";

import Link from "next/link";
import { AlertTriangle, Workflow } from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";

import { useBulkRetryWorkflowRuns, useWorkflowRuns, WORKFLOW_RUNS_PAGE_SIZE } from "@/features/workflows/hooks";

import { usePermission } from "@/hooks/use-permission";

import { mapRunStatus, runStatusSchema } from "@/lib/status";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/patterns/status-badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { PaginationControls } from "@/components/patterns/pagination-controls";
import { WorkflowRunFailureDialog } from "@/components/domain/workflow-run-failure-dialog";

// "ALL" is a UI-only sentinel — never sent to the backend.
const STATUS_FILTER_VALUES = ["ALL", ...runStatusSchema.options] as const;
type StatusFilterValue = (typeof STATUS_FILTER_VALUES)[number];

export function WorkflowRunsList({ workspaceSlug }: { workspaceSlug: string }) {
  const canRetry = usePermission("workflow:retry");
  const bulkRetry = useBulkRetryWorkflowRuns();

  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsStringLiteral(STATUS_FILTER_VALUES).withDefault("ALL")
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isPending, isError, error } = useWorkflowRuns({
    page,
    status: statusFilter === "ALL" ? undefined : statusFilter,
  });

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-11 rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-status-failed/30 bg-status-failed-bg px-4 py-3 text-status-failed">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Couldn&apos;t load workflow runs</p>
          <p className="text-status-failed/80">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  const runs = data.items;
  // Only FAILED runs are retryable — checkboxes exist for them alone, not a
  // disabled checkbox on every row (mirrors the existing row-conditional
  // WorkflowRunFailureDialog render just below).
  const failedVisible = runs.filter((run) => run.status === "FAILED");

  function handleStatusFilterChange(value: StatusFilterValue) {
    setStatusFilter(value);
    setPage(1);
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === failedVisible.length ? new Set() : new Set(failedVisible.map((r) => r.id))));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulkRetry() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    bulkRetry.mutate(ids, {
      onSuccess: ({ succeeded, failed }) => {
        if (failed === 0) {
          toast.success(`Retrying ${succeeded} run${succeeded === 1 ? "" : "s"}.`);
        } else {
          toast.error(`Retried ${succeeded} of ${succeeded + failed} runs — ${failed} failed to start.`);
        }
        setSelected(new Set());
      },
      onError: () => toast.error("Couldn't retry the selected runs — try again."),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(value) => handleStatusFilterChange(value as StatusFilterValue)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {runStatusSchema.options.map((status) => (
              <SelectItem
                key={status}
                value={status}
              >
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canRetry && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <span className="font-medium">{selected.size} selected</span>
          <Button
            size="sm"
            disabled={bulkRetry.isPending}
            onClick={applyBulkRetry}
          >
            {bulkRetry.isPending ? "Retrying…" : `Retry ${selected.size} run${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}

      {runs.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title={statusFilter === "ALL" ? "No workflow runs yet" : "No matching runs"}
          description={
            statusFilter === "ALL"
              ? "Nothing has triggered the automation pipeline yet — this is the real current state, not a placeholder. Runs will show up here once orders start flowing through it."
              : "Try a different status filter."
          }
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {canRetry && (
                    <TableHead className="w-10">
                      {failedVisible.length > 0 && (
                        <Checkbox
                          checked={selected.size > 0 && selected.size === failedVisible.length}
                          indeterminate={selected.size > 0 && selected.size < failedVisible.length}
                          onCheckedChange={toggleAll}
                          aria-label="Select all failed runs"
                        />
                      )}
                    </TableHead>
                  )}
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const { tone, label } = mapRunStatus(run.status);
                  return (
                    <TableRow key={run.id}>
                      {canRetry && (
                        <TableCell>
                          {run.status === "FAILED" && (
                            <Checkbox
                              checked={selected.has(run.id)}
                              onCheckedChange={() => toggleOne(run.id)}
                              aria-label={`Select run ${run.workflowName}`}
                            />
                          )}
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        <Link
                          href={`/${workspaceSlug}/workflows/runs/${run.id}`}
                          className="block hover:underline"
                        >
                          {run.workflowName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <StatusBadge
                            tone={tone}
                            label={label}
                          />
                          {run.status === "FAILED" && (
                            <WorkflowRunFailureDialog
                              workspaceSlug={workspaceSlug}
                              run={run}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{new Date(run.startedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            page={page}
            pageSize={WORKFLOW_RUNS_PAGE_SIZE}
            total={data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
