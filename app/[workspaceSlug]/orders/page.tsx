import { PageHeader } from "@/components/patterns/page-header";
import { OrdersList } from "@/components/domain/orders-list";

type Params = Promise<{ workspaceSlug: string }>;

export default async function OrdersPage(props: { params: Params }) {
  const { workspaceSlug } = await props.params;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order and where it stands in fulfillment."
      />
      <div className="p-6 sm:p-8">
        <OrdersList workspaceSlug={workspaceSlug} />
      </div>
    </>
  );
}
