import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { WorkspaceShell } from "@/components/domain/workspace-shell";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  // Resource-based auth check (Clerk deprecated middleware path-matching in
  // favor of this — see proxy.ts). Redirects to sign-in if unauthenticated.
  const { orgSlug } = await auth.protect();
  if (!orgSlug) redirect("/create-workspace");

  return <WorkspaceShell slug={workspaceSlug}>{children}</WorkspaceShell>;
}
