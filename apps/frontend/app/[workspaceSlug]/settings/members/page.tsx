import { redirect } from "next/navigation";

// Clerk's <OrganizationProfile /> bundles members management into the same
// component mounted at /settings/workspace (it has its own internal tab for
// this) — no separate page to build, just point here at that tab.
export default async function MembersSettingsRedirect({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  redirect(`/${workspaceSlug}/settings/workspace#/organization-members`);
}
