"use client";

import Link from "next/link";
import { History } from "lucide-react";

import { usePermission } from "@/hooks/use-permission";

import { Button } from "@/components/ui/button";

// There's no shared settings tab-nav in this app yet — this is the minimal
// discoverability fix for the audit log page, not a new nav component.
// Hidden entirely for anyone without audit:read, same hide-not-disable
// convention as every other permission gate in this app.
export function AuditLogLink({ workspaceSlug }: { workspaceSlug: string }) {
  const canRead = usePermission("audit:read");
  if (!canRead) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      render={<Link href={`/${workspaceSlug}/settings/audit-log`} />}
      nativeButton={false}
    >
      <History />
      Audit log
    </Button>
  );
}
