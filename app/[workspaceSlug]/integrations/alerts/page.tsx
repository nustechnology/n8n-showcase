"use client";

import { useState } from "react";

import { Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { usePermission } from "@/hooks/use-permission";

import { useIntegrations, useTestIntegration, useDisconnectIntegration, integrationsKey } from "@/features/integrations/hooks";
import type { Provider } from "@/features/integrations/types";

import { ApiError, isTransientError } from "@/lib/api-error";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiKeyConnectForm, type ApiKeyField } from "@/components/domain/api-key-connect-form";
import { HowToConnectDialog } from "@/components/domain/how-to-connect-dialog";
import { IntegrationIcon } from "@/components/domain/integration-icon";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";

const ALERT_PROVIDERS: Provider[] = ["SLACK", "DISCORD"];

interface AlertMeta {
  provider: Provider;
  name: string;
  description: string;
  apiKeyFields: ApiKeyField[];
  connectGuide: { title: string; detail: React.ReactNode }[];
}

const ALERT_CATALOG: AlertMeta[] = [
  {
    provider: "SLACK",
    name: "Slack",
    description: "Posts alerts to a Slack channel via incoming webhooks.",
    apiKeyFields: [
      {
        name: "webhookUrl",
        label: "Incoming Webhook URL",
        type: "text",
        placeholder: "https://hooks.slack.com/services/…",
      },
    ],
    connectGuide: [
      {
        title: "Create a Slack app",
        detail: <>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer">api.slack.com/apps</a> → Create New App → From scratch, and pick your workspace.</>,
      },
      {
        title: "Turn on Incoming Webhooks",
        detail: 'Under Features → Incoming Webhooks, toggle it on, then click "Add New Webhook to Workspace".',
      },
      {
        title: "Choose a channel",
        detail: 'Pick the channel that should receive run alerts, then click "Allow".',
      },
      {
        title: "Copy the webhook URL and paste it above",
        detail: 'It looks like "https://hooks.slack.com/services/…".',
      },
    ],
  },
  {
    provider: "DISCORD",
    name: "Discord",
    description: "Posts alerts to a Discord channel via webhooks.",
    apiKeyFields: [
      {
        name: "webhookUrl",
        label: "Webhook URL",
        type: "text",
        placeholder: "https://discord.com/api/webhooks/…",
      },
    ],
    connectGuide: [
      {
        title: "Open your Discord server",
        detail: "Go to the channel where you want alerts to appear.",
      },
      {
        title: "Create a webhook",
        detail: 'Channel settings → Integrations → Webhooks → New Webhook. Give it a name and copy the URL.',
      },
      {
        title: "Paste the webhook URL above",
        detail: 'It looks like "https://discord.com/api/webhooks/…".',
      },
    ],
  },
];

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { data: integrations, isPending } = useIntegrations();
  const canManage = usePermission("integration:manage");
  const canTest = usePermission("integration:test");

  const alertIntegrations = integrations?.filter(
    (i) => (ALERT_PROVIDERS as readonly string[]).includes(i.provider)
  ) ?? [];

  const activeAlert = alertIntegrations.find((i) =>
    i.status === "ACTIVE" || i.status === "DEGRADED"
  );

  const [selectedProvider, setSelectedProvider] = useState<Provider>(activeAlert?.provider as Provider ?? "SLACK");

  const testMutation = useTestIntegration();
  const disconnectMutation = useDisconnectIntegration();

  const selectedMeta = ALERT_CATALOG.find((m) => m.provider === selectedProvider)!;

  function handleDisconnect() {
    if (!activeAlert) return;

    const meta = ALERT_CATALOG.find((m) => m.provider === activeAlert.provider);

    if (!meta) return;

    if (!window.confirm(`Disconnect ${meta.name}? Run alerts will stop until another service is connected.`)) return;

    disconnectMutation.mutate(activeAlert.provider as Provider, {
      onSuccess: () => {
        toast.success(`${meta.name} disconnected.`);
        setSelectedProvider("SLACK");
      },
      onError: () => toast.error("Couldn't disconnect — try again."),
    });
  }

  if (isPending) {
    return (
      <>
        <PageHeader
          title="Alerts"
          description="Choose a team alert service for run notifications."
        />
        <div className="max-w-2xl space-y-8 p-6 sm:p-8">
          <Skeleton className="h-60 rounded-lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Choose a team alert service for workflow run notifications."
      />
      <div className="max-w-2xl space-y-8 p-6 sm:p-8">
        {activeAlert ? (
          <section className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
                  <IntegrationIcon
                    provider={activeAlert.provider as Provider}
                    className="size-4.5"
                  />
                </span>
                <div>
                  <p className="font-medium">
                    {ALERT_CATALOG.find((m) => m.provider === activeAlert.provider)?.name ?? activeAlert.provider}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {activeAlert.displayHint ? `Connected — ${activeAlert.displayHint}` : "Connected"}
                  </p>
                </div>
              </div>
              <StatusBadge
                tone={activeAlert.status === "DEGRADED" ? "degraded" : "success"}
                label={activeAlert.status === "DEGRADED" ? "Needs attention" : "Connected"}
              />
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Last checked</dt>
              <dd>{activeAlert.lastCheckedAt ? new Date(activeAlert.lastCheckedAt).toLocaleString() : "Never"}</dd>
              {activeAlert.lastErrorMessage && (
                <>
                  <dt className="text-muted-foreground">Last error</dt>
                  <dd className="text-status-failed">{activeAlert.lastErrorMessage}</dd>
                </>
              )}
            </dl>

            <div className="flex gap-2">
              {canTest && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testMutation.isPending}
                  onClick={() =>
                    testMutation.mutate(activeAlert.provider as Provider, {
                      onSuccess: () => toast.success("Test message sent."),
                      onError: (err) => {
                        if (isTransientError(err)) {
                          toast.error("This alert service is temporarily unavailable — try again shortly.");
                          return;
                        }
                        toast.error("Connection check failed.");
                      },
                    })
                  }
                >
                  {testMutation.isPending ? "Sending…" : "Send test message"}
                </Button>
              )}
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disconnectMutation.isPending}
                  onClick={handleDisconnect}
                >
                  {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
                </Button>
              )}
            </div>
          </section>
        ) : (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Select an alert service</h2>
              <HowToConnectDialog
                providerName={selectedMeta.name}
                steps={selectedMeta.connectGuide}
              />
            </div>

            <div className="space-y-2">
              {ALERT_CATALOG.map((alert) => {
                const isSelected = selectedProvider === alert.provider;
                return (
                  <button
                    key={alert.provider}
                    type="button"
                    onClick={() => setSelectedProvider(alert.provider)}
                    className={`flex items-start gap-3 w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    }`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
                      <IntegrationIcon
                        provider={alert.provider}
                        className="size-4.5"
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{alert.name}</p>
                      <p className="text-sm text-muted-foreground">{alert.description}</p>
                    </div>
                    {isSelected && (
                      <Check className="size-5 shrink-0 text-primary mt-1" />
                    )}
                  </button>
                );
              })}
            </div>

            {!canManage ? (
              <p className="text-muted-foreground">Only Admins and the workspace Owner can connect integrations.</p>
            ) : (
              <ApiKeyConnectForm
                provider={selectedProvider}
                providerName={selectedMeta.name}
                fields={selectedMeta.apiKeyFields}
              />
            )}
          </section>
        )}
      </div>
    </>
  );
}
