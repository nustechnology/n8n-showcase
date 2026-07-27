import { IntegrationDetail } from "@/components/domain/integration-detail";

type Params = Promise<{ workspaceSlug: string; provider: string }>;
type SearchParams = Promise<{ status?: string }>;

export default async function IntegrationSetupPage(props: { params: Params; searchParams: SearchParams }) {
  const { workspaceSlug, provider } = await props.params;
  const { status } = await props.searchParams;

  return (
    <IntegrationDetail
      workspaceSlug={workspaceSlug}
      provider={provider}
      callbackStatus={status}
    />
  );
}
