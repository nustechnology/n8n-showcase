import { WorkflowRunDetail } from "@/components/domain/workflow-run-detail";

type Params = Promise<{ workspaceSlug: string; runId: string }>;

// Flat route (workflows/runs/[runId], not nested under a workflow) because
// WorkflowRun.id is the only real, fetchable identity here — there's no
// separate "Workflow" entity backing it.
// components/domain/workflow-runs-list.tsx links into this from the
// Workflows list.
export default async function WorkflowRunDetailPage(props: { params: Params }) {
  const { workspaceSlug, runId } = await props.params;

  return (
    <WorkflowRunDetail
      workspaceSlug={workspaceSlug}
      runId={runId}
    />
  );
}
