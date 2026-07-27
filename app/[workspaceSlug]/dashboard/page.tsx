import { PageHeader } from "@/components/patterns/page-header";
import { DashboardOverview } from "@/components/domain/dashboard-overview";

type Params = Promise<{ workspaceSlug: string }>;

export default async function DashboardPage(props: { params: Params }) {
  const { workspaceSlug } = await props.params;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything moving through your automation pipeline right now."
      />
      <div className="p-6 sm:p-8">
        <DashboardOverview workspaceSlug={workspaceSlug} />
      </div>
    </>
  );
}
