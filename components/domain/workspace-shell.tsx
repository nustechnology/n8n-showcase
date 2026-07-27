"use client";

import { useEffect, type ReactNode } from "react";

import { notFound } from "next/navigation";

import { useOrganization, useOrganizationList } from "@clerk/nextjs";

import { Skeleton } from "@/components/ui/skeleton";

import { Sidebar } from "@/components/patterns/sidebar";
import { Topbar } from "@/components/patterns/topbar";

/**
 * proxy.ts only does an optimistic "is this user signed in at all" check
 * (Next's Proxy guidance is to avoid DB/membership lookups there). The real
 * "does this user belong to the org behind :workspaceSlug" check — and
 * switching Clerk's active org to match the URL — happens here, client-side,
 * because it needs Clerk's own setActive() session mutation.
 *
 * Readiness is derived from Clerk's own loaded state on every render rather
 * than mirrored into local state — the effect below exists only to fire the
 * one genuine side effect (setActive), not to duplicate data React already
 * has.
 */
export function WorkspaceShell({ slug, children }: { slug: string; children: ReactNode }) {
  const { isLoaded: orgLoaded, organization } = useOrganization();
  const { isLoaded: listLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { pageSize: 100 },
  });

  const loaded = orgLoaded && listLoaded;
  const isActiveOrg = loaded && organization?.slug === slug;
  const membership = loaded ? userMemberships.data?.find((m) => m.organization.slug === slug) : undefined;
  const notAMember = loaded && !isActiveOrg && !membership;

  useEffect(() => {
    if (!loaded || isActiveOrg || !membership) return;

    setActive?.({ organization: membership.organization.id });
  }, [loaded, isActiveOrg, membership, setActive]);

  if (notAMember) notFound();

  if (!isActiveOrg) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Skeleton className="size-8 rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar slug={slug} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar slug={slug} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
