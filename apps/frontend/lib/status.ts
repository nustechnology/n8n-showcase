import { z } from "zod";

export type StatusTone = "success" | "running" | "failed" | "pending" | "degraded" | "connecting";

/** Backend's WorkflowRun.status enum, verbatim — never reuse these for integration health (see integrationStatusSchema). */
export const runStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export function mapRunStatus(status: RunStatus): { tone: StatusTone; label: string } {
  switch (status) {
    case "SUCCEEDED":
      return { tone: "success", label: "Done" };
    case "RUNNING":
      return { tone: "running", label: "Running" };
    case "FAILED":
      return { tone: "failed", label: "Failed" };
    case "CANCELED":
      return { tone: "pending", label: "Canceled" };
    case "PENDING":
    default:
      return { tone: "pending", label: "Waiting" };
  }
}

/** Backend's WorkflowRunStep.status enum, verbatim — distinct from RunStatus: a step can be SKIPPED, a run is CANCELED, never the other's value. */
export const workflowStepStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"]);
export type WorkflowStepStatus = z.infer<typeof workflowStepStatusSchema>;

export function mapWorkflowStepStatus(status: WorkflowStepStatus): { tone: StatusTone; label: string } {
  switch (status) {
    case "SUCCEEDED":
      return { tone: "success", label: "Done" };
    case "RUNNING":
      return { tone: "running", label: "Running" };
    case "FAILED":
      return { tone: "failed", label: "Failed" };
    case "SKIPPED":
      return { tone: "pending", label: "Skipped" };
    case "PENDING":
    default:
      return { tone: "pending", label: "Waiting" };
  }
}

/** Backend's Integration.status enum, verbatim (backend API contract §2) — distinct from RunStatus. */
export const integrationStatusSchema = z.enum(["DISCONNECTED", "CONNECTING", "ACTIVE", "DEGRADED", "ERROR"]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export function mapIntegrationStatus(status: IntegrationStatus): { tone: StatusTone; label: string } {
  switch (status) {
    case "ACTIVE":
      return { tone: "success", label: "Connected" };
    case "CONNECTING":
      return { tone: "connecting", label: "Connecting…" };
    case "DEGRADED":
      return { tone: "degraded", label: "Needs attention" };
    case "ERROR":
      return { tone: "failed", label: "Error" };
    case "DISCONNECTED":
    default:
      return { tone: "pending", label: "Not connected" };
  }
}
