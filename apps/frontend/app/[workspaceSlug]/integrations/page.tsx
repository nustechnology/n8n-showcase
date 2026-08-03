import { PageHeader } from "@/components/patterns/page-header";
import { IntegrationsList } from "@/components/domain/integrations-list";
import { WorkflowTabSwitcher } from "@/components/domain/workflow-tab-switcher";

type Params = Promise<{ workspaceSlug: string }>;
type SearchParams = Promise<{ workflow?: string }>;

export default async function IntegrationsPage(props: { params: Params; searchParams: SearchParams }) {
  const { workspaceSlug } = await props.params;
  const { workflow } = await props.searchParams;

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect the services your automation pipeline runs on."
        action={<WorkflowTabSwitcher />}
      />
      <div className="p-6 sm:p-8">
        <IntegrationsList workspaceSlug={workspaceSlug} workflow={workflow ?? "order-validation"} />
      </div>
    </>
  );
}
