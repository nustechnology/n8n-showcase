"use client";

import { useState } from "react";

import { Check } from "lucide-react";
import { toast } from "sonner";

import { usePermission } from "@/hooks/use-permission";

import { useIntegrations, useTestIntegration, useDisconnectIntegration } from "@/features/integrations/hooks";
import type { Provider } from "@/features/integrations/types";

import { ApiError, isTransientError } from "@/lib/api-error";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiKeyConnectForm, type ApiKeyField } from "@/components/domain/api-key-connect-form";
import { HowToConnectDialog } from "@/components/domain/how-to-connect-dialog";
import { IntegrationIcon } from "@/components/domain/integration-icon";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";

const MAILER_PROVIDERS: Provider[] = ["RESEND", "SENDGRID", "MAILGUN"];

interface MailerMeta {
  provider: Provider;
  name: string;
  description: string;
  apiKeyFields: ApiKeyField[];
  connectGuide: { title: string; detail: React.ReactNode }[];
}

const MAILER_CATALOG: MailerMeta[] = [
  {
    provider: "RESEND",
    name: "Resend",
    description: "Modern email API with excellent deliverability for transactional email.",
    apiKeyFields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        placeholder: "re_••••••••",
        helpText: "Must have Full access — a Sending-access-only key can send email but can't be verified at connect time.",
      },
    ],
    connectGuide: [
      { title: "Open your Resend dashboard", detail: "Sign in at resend.com/api-keys." },
      { title: "Create a new API key", detail: 'Give it Full access. Copy the key — it starts with "re_" and is only shown once.' },
      { title: "Verify a sending domain", detail: "Resend won't deliver mail until at least one domain is verified — do this once in Resend's dashboard." },
    ],
  },
  {
    provider: "SENDGRID",
    name: "SendGrid",
    description: "Twilio's email platform with powerful analytics and a generous free tier.",
    apiKeyFields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        placeholder: "SG.••••••••",
        helpText: "Create an API key in Settings → API Keys with Mail Send access.",
      },
    ],
    connectGuide: [
      { title: "Open your SendGrid dashboard", detail: "Sign in at app.sendgrid.com." },
      { title: "Create an API key", detail: "Go to Settings → API Keys → Create API Key. Give it 'Mail Send' permission at minimum." },
      { title: "Copy the key and paste it above", detail: 'It starts with "SG." and is only shown once.' },
    ],
  },
  {
    provider: "MAILGUN",
    name: "Mailgun",
    description: "Developer-friendly email API with flexible routing and detailed logs.",
    apiKeyFields: [
      {
        name: "domain",
        label: "Sending domain",
        type: "text",
        placeholder: "mg.example.com",
        helpText: "The domain you verified in Mailgun (e.g. mg.example.com).",
      },
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        placeholder: "key-••••••••",
        helpText: "Found in Mailgun dashboard → Domain settings → SMTP credentials.",
      },
    ],
    connectGuide: [
      { title: "Open your Mailgun dashboard", detail: "Sign in at app.mailgun.com." },
      { title: "Verify a sending domain", detail: "Go to Sending → Domains → Add Domain. Follow the verification steps (DNS records)." },
      { title: "Get your API key", detail: 'In Domain settings → SMTP credentials, copy the API key (starts with "key-").' },
      { title: "Enter your domain and API key above", detail: "The domain is the one you verified (e.g. mg.example.com)." },
    ],
  },
];

function mapResendError(error: ApiError): string | undefined {
  if (error.statusCode !== 401) return undefined;
  return /sending/i.test(error.message)
    ? "That key only has sending access. Use a Full access key instead."
    : "That API key was rejected — check it's correct and try again.";
}

export default function MailerPage() {
  const { data: integrations, isPending } = useIntegrations();
  const canManage = usePermission("integration:manage");
  const canTest = usePermission("integration:test");

  const mailerIntegrations = integrations?.filter(
    (i) => (MAILER_PROVIDERS as readonly string[]).includes(i.provider)
  ) ?? [];

  const activeMailer = mailerIntegrations.find((i) =>
    i.status === "ACTIVE" || i.status === "DEGRADED"
  );

  const [selectedProvider, setSelectedProvider] = useState<Provider>(activeMailer?.provider as Provider ?? "RESEND");

  const testMutation = useTestIntegration();
  const disconnectMutation = useDisconnectIntegration();

  const selectedMeta = MAILER_CATALOG.find((m) => m.provider === selectedProvider)!;

  function handleDisconnect() {
    if (!activeMailer) return;

    const meta = MAILER_CATALOG.find((m) => m.provider === activeMailer.provider);

    if (!meta) return;

    if (!window.confirm(`Disconnect ${meta.name}? Automations relying on it will stop working.`)) return;

    disconnectMutation.mutate(activeMailer.provider as Provider, {
      onSuccess: () => {
        toast.success(`${meta.name} disconnected.`);
        setSelectedProvider("RESEND");
      },
      onError: () => toast.error("Couldn't disconnect — try again."),
    });
  }

  if (isPending) {
    return (
      <>
        <PageHeader
          title="Mailer"
          description="Choose an email provider for order notifications."
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
        title="Mailer"
        description="Choose an email provider for customer order and shipment notifications."
      />
      <div className="max-w-2xl space-y-8 p-6 sm:p-8">
        {activeMailer ? (
          <section className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
                  <IntegrationIcon
                    provider={activeMailer.provider as Provider}
                    className="size-4.5"
                  />
                </span>
                <div>
                  <p className="font-medium">
                    {MAILER_CATALOG.find((m) => m.provider === activeMailer.provider)?.name ?? activeMailer.provider}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {activeMailer.displayHint ? `Connected — ${activeMailer.displayHint}` : "Connected"}
                  </p>
                </div>
              </div>
              <StatusBadge
                tone={activeMailer.status === "DEGRADED" ? "degraded" : "success"}
                label={activeMailer.status === "DEGRADED" ? "Needs attention" : "Connected"}
              />
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Last checked</dt>
              <dd>{activeMailer.lastCheckedAt ? new Date(activeMailer.lastCheckedAt).toLocaleString() : "Never"}</dd>
              {activeMailer.lastErrorMessage && (
                <>
                  <dt className="text-muted-foreground">Last error</dt>
                  <dd className="text-status-failed">{activeMailer.lastErrorMessage}</dd>
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
                    testMutation.mutate(activeMailer.provider as Provider, {
                      onSuccess: () => toast.success("Connection looks good."),
                      onError: (err) => {
                        if (isTransientError(err)) {
                          toast.error("This mailer is temporarily unavailable — try again shortly.");
                          return;
                        }
                        toast.error("Connection check failed.");
                      },
                    })
                  }
                >
                  {testMutation.isPending ? "Testing…" : "Test connection"}
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
              <h2 className="font-semibold">Select an email provider</h2>
              <HowToConnectDialog
                providerName={selectedMeta.name}
                steps={selectedMeta.connectGuide}
              />
            </div>

            <div className="space-y-2">
              {MAILER_CATALOG.map((mailer) => {
                const isSelected = selectedProvider === mailer.provider;
                return (
                  <button
                    key={mailer.provider}
                    type="button"
                    onClick={() => setSelectedProvider(mailer.provider)}
                    className={`flex items-start gap-3 w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    }`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
                      <IntegrationIcon
                        provider={mailer.provider}
                        className="size-4.5"
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{mailer.name}</p>
                      <p className="text-sm text-muted-foreground">{mailer.description}</p>
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
                mapError={selectedProvider === "RESEND" ? mapResendError : undefined}
              />
            )}
          </section>
        )}
      </div>
    </>
  );
}
