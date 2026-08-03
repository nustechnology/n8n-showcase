import { PageHeader } from "@/components/patterns/page-header";
import { WorkflowDiagram } from "@/components/patterns/workflow-diagram";
import { WorkflowTabSwitcher } from "@/components/domain/workflow-tab-switcher";

import { n8nWorkflowSchema, n8nWorkflowToFlow } from "@/lib/n8n-workflow";

import orderValidationWorkflow from "@/lib/fixtures/example-n8n-workflow.json";
import cartReminderWorkflow from "@/lib/fixtures/example-n8n-workflow-cart-reminder.json";

type SearchParams = Promise<{ workflow?: string }>;

const WORKFLOWS: Record<string, { label: string; description: string; fixture: unknown }> = {
  "order-validation": {
    label: "Order Validation",
    description: "Shopify Order → AI Validation → Inventory Check → Shipment → Discord / Email / Slack.",
    fixture: orderValidationWorkflow,
  },
  "cart-reminder": {
    label: "Cart Reminder",
    description: "Shopify Checkout → Wait → Check Order → Discord Reminder.",
    fixture: cartReminderWorkflow,
  },
};

export default async function WorkflowDiagramPage(props: { searchParams: SearchParams }) {
  const { workflow: workflowKey } = await props.searchParams;
  const current = workflowKey ?? "order-validation";
  const workflowMeta = WORKFLOWS[current] ?? WORKFLOWS["order-validation"];

  const workflow = n8nWorkflowSchema.parse(workflowMeta.fixture);
  const { nodes, edges } = n8nWorkflowToFlow(workflow);

  return (
    <>
      <PageHeader
        title="Workflow diagram"
        description={workflowMeta.description}
        action={<WorkflowTabSwitcher />}
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
