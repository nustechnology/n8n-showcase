import { OrganizationProfile } from "@clerk/nextjs";

import { PageHeader } from "@/components/patterns/page-header";
import { AuditLogLink } from "@/components/domain/audit-log-link";

type Params = Promise<{ workspaceSlug: string }>;

export default async function WorkspaceSettingsPage(props: { params: Params }) {
  const { workspaceSlug } = await props.params;

  return (
    <>
      <PageHeader
        title="Workspace settings"
        description="Branding, members, and danger zone."
        action={<AuditLogLink workspaceSlug={workspaceSlug} />}
      />
      <div className="p-6 sm:p-8">
        <OrganizationProfile routing="hash" />
      </div>
    </>
  );
}
