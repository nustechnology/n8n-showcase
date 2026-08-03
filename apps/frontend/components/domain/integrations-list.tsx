"use client";

import { AlertTriangle } from "lucide-react";

import { useIntegrations } from "@/features/integrations/hooks";

import type { IntegrationStatus } from "@/lib/status";

import { Skeleton } from "@/components/ui/skeleton";
import { IntegrationCard } from "@/components/domain/integration-card";
import { PROVIDER_CATALOG } from "@/components/domain/integration-catalog";

const MAILER_PROVIDERS = ["RESEND", "SENDGRID", "MAILGUN"] as const;
const ALERT_PROVIDERS = ["SLACK", "DISCORD"] as const;

interface GroupDef {
  providers: readonly string[];
  catalogKey: string;
}

const GROUPS: GroupDef[] = [
  { providers: MAILER_PROVIDERS, catalogKey: "MAILER" },
  { providers: ALERT_PROVIDERS, catalogKey: "ALERTS" },
  { providers: ["EASYPOST", "SHIPPO"] as const, catalogKey: "SHIPPING" },
  { providers: ["ZOHO_INVENTORY", "ODOO"] as const, catalogKey: "INVENTORY" },
];

const ACTIVE_STATUSES: IntegrationStatus[] = ["ACTIVE", "DEGRADED"];
const ERROR_STATUSES: IntegrationStatus[] = ["ERROR"];

function aggregateGroupStatus(statuses: IntegrationStatus[]): IntegrationStatus | undefined {
  if (statuses.some((s) => ACTIVE_STATUSES.includes(s))) return "ACTIVE";
  if (statuses.some((s) => ERROR_STATUSES.includes(s))) return "ERROR";
  if (statuses.length > 0) return statuses[0];
  return undefined;
}

export function IntegrationsList({ workspaceSlug, workflow }: { workspaceSlug: string; workflow: string }) {
  const { data: integrations, isPending, isError, error } = useIntegrations();

  const filteredCatalog = PROVIDER_CATALOG.filter(
    (meta) => !meta.workflows || meta.workflows.includes(workflow),
  );

  const groupIntegrations = new Map(GROUPS.map((g) => {
    const matching = integrations?.filter((i) => (g.providers as readonly string[]).includes(i.provider)) ?? [];
    const status = aggregateGroupStatus(matching.map((i) => i.status));
    return [g.catalogKey, status ? { ...matching[0], status } : undefined] as const;
  }));

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredCatalog.map((meta) => (
          <Skeleton key={meta.provider} className="h-26 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-status-failed/30 bg-status-failed-bg px-4 py-3 text-status-failed">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Couldn&apos;t load integrations</p>
          <p className="text-status-failed/80">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filteredCatalog.map((meta) => {
        const groupIntegration = groupIntegrations.get(meta.provider);
        return (
          <IntegrationCard
            key={meta.provider}
            workspaceSlug={workspaceSlug}
            meta={meta}
            integration={groupIntegration ?? integrations?.find((i) => i.provider === meta.provider)}
          />
        );
      })}
    </div>
  );
}
