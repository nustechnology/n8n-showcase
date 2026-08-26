import { PageHeader } from "@/components/patterns/page-header";
import { IntegrationsList } from "@/components/domain/integrations-list";

type Params = Promise<{ workspaceSlug: string }>;

export default async function IntegrationsPage(props: { params: Params }) {
  const { workspaceSlug } = await props.params;

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect the services your automation pipeline runs on."
      />
      <div className="p-6 sm:p-8">
        <IntegrationsList workspaceSlug={workspaceSlug} workflow="order-validation" />
      </div>
    </>
  );
}
