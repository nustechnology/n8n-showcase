import { PageHeader } from "@/components/patterns/page-header";
import { WorkflowDiagram } from "@/components/patterns/workflow-diagram";

import { n8nWorkflowSchema, n8nWorkflowToFlow } from "@/lib/n8n-workflow";

import exampleWorkflow from "@/lib/fixtures/example-n8n-workflow.json";

export default async function WorkflowDiagramPage() {
  const workflow = n8nWorkflowSchema.parse(exampleWorkflow);
  const { nodes, edges } = n8nWorkflowToFlow(workflow);

  return (
    <>
      <PageHeader
        title="Workflow diagram"
        description="Read-only preview of the order-validation n8n workflow — edit it in n8n, not here."
      />
      <div className="p-6 sm:p-8">
        <WorkflowDiagram
          nodes={nodes}
          edges={edges}
        />
      </div>
    </>
  );
}
