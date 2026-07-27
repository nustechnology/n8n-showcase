"use client";

import { useEffect, type ReactNode } from "react";

import { useRouter, notFound } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { usePermission } from "@/hooks/use-permission";
import {
  useIntegrations,
  useTestIntegration,
  useDisconnectIntegration,
  integrationsKey,
} from "@/features/integrations/hooks";
import type { Provider } from "@/features/integrations/types";

import { ApiError, isTransientError } from "@/lib/api-error";
import { mapIntegrationStatus } from "@/lib/status";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { ShopifyConnectForm } from "@/components/domain/shopify-connect-form";
import { ZohoConnectForm } from "@/components/domain/zoho-connect-form";
import { EasyPostConnectForm } from "@/components/domain/easypost-connect-form";
import { ApiKeyConnectForm } from "@/components/domain/api-key-connect-form";
import { ShopifyProtectedDataDialog } from "@/components/domain/shopify-protected-data-dialog";
import { HowToConnectDialog } from "@/components/domain/how-to-connect-dialog";
import { getProviderMeta, type ProviderMeta } from "@/components/domain/integration-catalog";

const CALLBACK_STATUS_COPY: Record<string, { title: string; tone: "running" | "success" | "failed" }> = {
  connecting: { title: "Finishing connection…", tone: "running" },
  success: { title: "Connected — confirming the details below.", tone: "success" },
  error: { title: "Something went wrong connecting this integration.", tone: "failed" },
};

// Statuses where there's a real, resolved integration to act on. Excludes
// DISCONNECTED (nothing to test/disconnect) and CONNECTING (an in-flight
// OAuth round trip — nothing to test yet, and "Disconnect" here would just
// race the callback). The backend cleans up a CONNECTING row that never
// completes; this covers the brief legitimate window before that.
const ACTIONABLE_INTEGRATION_STATUSES = ["ACTIVE", "DEGRADED", "ERROR"];

// A key that's valid but scoped "Sending access" gets a distinct message from
// the backend — this app can only verify Full access keys (no domain
// verification built yet). Worth telling apart from "wrong key" rather than
// showing one generic error (backend API contract §2).
function mapResendError(error: ApiError): string | undefined {
  if (error.statusCode !== 401) return undefined;
  return /sending/i.test(error.message)
    ? "That key only has sending access. Use a Full access key instead."
    : "That API key was rejected — check it's correct and try again.";
}

// Real per-provider dispatch — Record<Provider, ...> keeps this exhaustive as
// new providers join the catalog, instead of a ternary that only works
// because exactly two auth methods happen to exist today.
const CONNECT_FORM: Record<Provider, (meta: ProviderMeta) => ReactNode> = {
  SHOPIFY: () => <ShopifyConnectForm />,
  ZOHO_INVENTORY: () => <ZohoConnectForm />,
  ODOO: (meta) => (
    <ApiKeyConnectForm
      provider={meta.provider as Provider}
      providerName={meta.name}
      fields={meta.apiKeyFields ?? []}
    />
  ),
  RESEND: (meta) => (
    <ApiKeyConnectForm
      provider={meta.provider as Provider}
      providerName={meta.name}
      fields={meta.apiKeyFields ?? []}
      mapError={mapResendError}
    />
  ),
  SENDGRID: (meta) => (
    <ApiKeyConnectForm
      provider={meta.provider as Provider}
      providerName={meta.name}
      fields={meta.apiKeyFields ?? []}
    />
  ),
  MAILGUN: (meta) => (
    <ApiKeyConnectForm
      provider={meta.provider as Provider}
      providerName={meta.name}
      fields={meta.apiKeyFields ?? []}
    />
  ),
  EASYPOST: () => <EasyPostConnectForm />,
  SHIPPO: () => <EasyPostConnectForm />,
  SLACK: (meta) => (
    <ApiKeyConnectForm
      provider={meta.provider as Provider}
      providerName={meta.name}
      fields={meta.apiKeyFields ?? []}
    />
  ),
  DISCORD: (meta) => (
    <ApiKeyConnectForm
      provider={meta.provider as Provider}
      providerName={meta.name}
      fields={meta.apiKeyFields ?? []}
    />
  ),
};

export function IntegrationDetail({
  workspaceSlug,
  provider,
  callbackStatus,
}: {
  workspaceSlug: string;
  provider: string;
  callbackStatus?: string;
}) {
  // All hooks run unconditionally, in the same order, every render — the
  // `!meta` bail-out (which throws via notFound()) happens after every hook
  // below, never before, so this component never skips a hook call.
  const router = useRouter();
  const queryClient = useQueryClient();
  const meta = getProviderMeta(provider);

  const { data: integrations, isPending } = useIntegrations();
  const integration = integrations?.find((i) => i.provider === meta?.provider);
  const testMutation = useTestIntegration();
  const disconnectMutation = useDisconnectIntegration();
  const canManage = usePermission("integration:manage");
  const canTest = usePermission("integration:test");

  useEffect(() => {
    if (!callbackStatus) return;

    // The redirect's ?status= is not the source of truth — a DEGRADED
    // outcome (e.g. Shopify webhook registration failed) still arrives as
    // status=success, since the OAuth exchange itself succeeded. Force a
    // refetch and let the real GET /integrations status decide what's shown
    // (backend API contract §2).
    queryClient.invalidateQueries({ queryKey: integrationsKey });
    router.replace(`/${workspaceSlug}/integrations/${provider}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!meta) notFound();

  // MAILER is a FE-only synthetic catalog entry — redirect to the dedicated
  // mailer selection page instead of rendering a per-provider detail.
  if (meta.provider === "MAILER") {
    router.replace(`/${workspaceSlug}/integrations/mailer`);
    return null;
  }

  if (meta.provider === "ALERTS") {
    router.replace(`/${workspaceSlug}/integrations/alerts`);
    return null;
  }

  if (meta.provider === "SHIPPING") {
    router.replace(`/${workspaceSlug}/integrations/shipping`);
    return null;
  }

  if (meta.provider === "INVENTORY") {
    router.replace(`/${workspaceSlug}/integrations/inventory`);
    return null;
  }

  const { tone, label } = integration ? mapIntegrationStatus(integration.status) : mapIntegrationStatus("DISCONNECTED");
  const callbackNotice = callbackStatus ? CALLBACK_STATUS_COPY[callbackStatus] : undefined;
  const isSupported = integration?.supported ?? true;

  return (
    <>
      <PageHeader
        title={meta.name}
        description={meta.description}
        action={
          !isPending && (
            <StatusBadge
              tone={tone}
              label={label}
            />
          )
        }
      />
      <div className="max-w-2xl space-y-8 p-6 sm:p-8">
        {callbackNotice && (
          <div className="flex items-center gap-2 rounded-lg border px-4 py-3">
            <StatusBadge
              tone={callbackNotice.tone}
              label={callbackNotice.title}
            />
          </div>
        )}

        {isPending ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : !isSupported ? (
          <section className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground">
            {meta.name} isn&apos;t available to connect yet.
          </section>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Connect</h2>
                <HowToConnectDialog
                  providerName={meta.name}
                  steps={meta.connectGuide}
                />
              </div>
              {!canManage ? (
                <p className="text-muted-foreground">Only Admins and the workspace Owner can connect integrations.</p>
              ) : integration?.status === "ACTIVE" ? (
                <p className="text-muted-foreground">Already connected{integration.displayHint ? ` — ${integration.displayHint}` : ""}.</p>
              ) : (
                CONNECT_FORM[meta.provider as Provider](meta)
              )}
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold">Health</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted-foreground">Last checked</dt>
                <dd>{integration?.lastCheckedAt ? new Date(integration.lastCheckedAt).toLocaleString() : "Never"}</dd>
                {integration?.lastErrorMessage && (
                  <>
                    <dt className="text-muted-foreground">Last error</dt>
                    <dd className="flex items-center gap-2 text-status-failed">
                      {integration.lastErrorMessage}
                      {meta.provider === "SHOPIFY" && integration.status === "DEGRADED" && <ShopifyProtectedDataDialog />}
                    </dd>
                  </>
                )}
              </dl>
              <div className="flex gap-2">
                {canTest && integration?.status && ACTIONABLE_INTEGRATION_STATUSES.includes(integration.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testMutation.isPending}
                    onClick={() =>
                      testMutation.mutate(meta.provider as Provider, {
                        // Slack's "test" visibly posts a real message to the
                        // channel, unlike the other providers' silent
                        // connectivity check — worth distinct copy.
                        onSuccess: () => toast.success(meta.provider === "SLACK" ? "Test message sent to Slack." : "Connection looks good."),
                        onError: (err) => {
                          // A circuit trip isn't this integration's fault and isn't
                          // permanent — distinct copy, and IntegrationsService.test()
                          // doesn't persist a status change for it either, so this
                          // shouldn't visually imply "Needs attention" like a real failure.
                          if (isTransientError(err)) {
                            toast.error(`${meta.name} is temporarily unavailable — this usually clears within a minute, try again shortly.`);
                            return;
                          }

                          toast.error(
                            meta.provider === "SLACK" ? "Couldn't send the test message." : "Connection check failed — marked as needing attention."
                          );
                        },
                      })
                    }
                  >
                    {testMutation.isPending
                      ? meta.provider === "SLACK"
                        ? "Sending…"
                        : "Testing…"
                      : meta.provider === "SLACK"
                        ? "Send test message"
                        : "Test connection"}
                  </Button>
                )}
                {canManage && integration?.status && ACTIONABLE_INTEGRATION_STATUSES.includes(integration.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disconnectMutation.isPending}
                    onClick={() => {
                      if (!window.confirm(`Disconnect ${meta.name}? Automations relying on it will stop working.`)) return;

                      disconnectMutation.mutate(meta.provider as Provider, {
                        onSuccess: () => toast.success(`${meta.name} disconnected.`),
                        onError: () => toast.error("Couldn't disconnect — try again."),
                      });
                    }}
                  >
                    {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
                  </Button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
