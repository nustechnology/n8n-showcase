import { PageHeader } from "@/components/patterns/page-header";
import { WorkflowRunsList } from "@/components/domain/workflow-runs-list";

type Params = Promise<{ workspaceSlug: string }>;

export default async function WorkflowsPage(props: { params: Params }) {
  const { workspaceSlug } = await props.params;

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Every automation pipeline run, from order to notification."
      />
      <div className="p-6 sm:p-8">
        <WorkflowRunsList workspaceSlug={workspaceSlug} />
      </div>
    </>
  );
}
