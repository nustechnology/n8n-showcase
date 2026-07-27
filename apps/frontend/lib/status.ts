import {
  workflowRunStatusSchema,
  workflowStepStatusSchema,
  integrationStatusSchema,
  type WorkflowRunStatus,
  type WorkflowStepStatus,
  type IntegrationStatus,
} from "@n8n-showcase/shared-schemas";

export type StatusTone = "success" | "running" | "failed" | "pending" | "degraded" | "connecting";

export const runStatusSchema = workflowRunStatusSchema;
export type RunStatus = WorkflowRunStatus;

export { workflowStepStatusSchema, type WorkflowStepStatus, integrationStatusSchema, type IntegrationStatus };

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
