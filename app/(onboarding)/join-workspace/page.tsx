import Link from "next/link";

import { auth } from "@clerk/nextjs/server";
import { OrganizationList } from "@clerk/nextjs";

export default async function JoinWorkspacePage() {
  await auth.protect();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Join a workspace</h1>
        <p className="text-muted-foreground">
          Accept a pending invitation, or{" "}
          <Link
            href="/create-workspace"
            className="underline"
          >
            create a new workspace
          </Link>{" "}
          instead.
        </p>
      </div>
      <OrganizationList
        hidePersonal
        afterSelectOrganizationUrl="/:slug/dashboard"
      />
    </div>
  );
}
