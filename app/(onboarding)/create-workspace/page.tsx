import { auth } from "@clerk/nextjs/server";
import { CreateOrganization } from "@clerk/nextjs";

export default async function CreateWorkspacePage() {
  await auth.protect();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Create your workspace</h1>
        <p className="text-muted-foreground">
          This is where your team will connect Shopify and monitor orders.
        </p>
      </div>
      <CreateOrganization afterCreateOrganizationUrl="/:slug/dashboard" />
    </div>
  );
}
