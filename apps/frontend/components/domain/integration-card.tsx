import Link from "next/link";

import { mapIntegrationStatus } from "@/lib/status";
import type { IntegrationStatus } from "@/lib/status";

import { StatusBadge } from "@/components/patterns/status-badge";
import { IntegrationIcon } from "@/components/domain/integration-icon";
import type { ProviderMeta } from "@/components/domain/integration-catalog";

interface CardIntegration {
  provider: string;
  supported?: boolean;
  status: IntegrationStatus;
  displayHint?: string | null;
  lastCheckedAt?: string | null;
  lastErrorMessage?: string | null;
}

interface IntegrationCardProps {
  workspaceSlug: string;
  meta: ProviderMeta;
  integration: CardIntegration | undefined;
}

export function IntegrationCard({
  workspaceSlug,
  meta,
  integration,
}: IntegrationCardProps) {
  const hrefSuffix = meta.provider === "MAILER" ? "mailer" : meta.provider.toLowerCase();

  const { tone, label } = integration
    ? mapIntegrationStatus(integration.status)
    : mapIntegrationStatus("DISCONNECTED");

  return (
    <Link
      href={`/${workspaceSlug}/integrations/${hrefSuffix}`}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
            <IntegrationIcon
              provider={meta.provider}
              className="size-4.5"
            />
          </span>
          <p className="font-medium">{meta.name}</p>
        </div>
        {integration?.supported === false ? (
          <StatusBadge
            tone="pending"
            label="Coming soon"
          />
        ) : (
          <StatusBadge
            tone={tone}
            label={label}
          />
        )}
      </div>
      <p className="text-muted-foreground">{meta.description}</p>
    </Link>
  );
}
