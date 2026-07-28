"use client";

import { useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { usePermission } from "@/hooks/use-permission";
import { useApiClient } from "@/hooks/use-api-client";

import { useIntegrations, useConnectZoho, useTestIntegration, useDisconnectIntegration, integrationsKey } from "@/features/integrations/hooks";
import type { Provider } from "@/features/integrations/types";

import { ApiError, isTransientError } from "@/lib/api-error";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { HowToConnectDialog } from "@/components/domain/how-to-connect-dialog";
import { IntegrationIcon } from "@/components/domain/integration-icon";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";

const INVENTORY_PROVIDERS: Provider[] = ["ZOHO_INVENTORY", "ODOO"];

const odooConnectSchema = z.object({
  url: z.string().url("Enter a valid Odoo instance URL"),
  db: z.string().min(1, "Database name is required"),
  username: z.string().min(1, "Username is required"),
  apiKey: z.string().min(1, "API key is required"),
});

type OdooFormValues = z.infer<typeof odooConnectSchema>;

interface InventoryMeta {
  provider: Provider;
  name: string;
  description: string;
  authMethod: "oauth" | "form";
  connectGuide: { title: string; detail: React.ReactNode }[];
}

const INVENTORY_CATALOG: InventoryMeta[] = [
  {
    provider: "ZOHO_INVENTORY",
    name: "Zoho Inventory",
    description: "Cloud inventory management with stock tracking and order fulfillment.",
    authMethod: "oauth",
    connectGuide: [
      { title: "Have a Zoho Inventory account ready", detail: "Any active organization works — free trial or paid." },
      { title: "Click \"Connect Zoho Inventory\" above", detail: "You'll be redirected to Zoho to log in and approve access." },
      { title: "Approve the requested scopes", detail: "You'll land back here once Zoho hands back authorization." },
      { title: "Multiple organizations?", detail: "This app connects the first Zoho Inventory organization on your account." },
    ],
  },
  {
    provider: "ODOO",
    name: "Odoo",
    description: "Open-source ERP with integrated inventory and warehouse management.",
    authMethod: "form",
    connectGuide: [
      { title: "Have an Odoo instance ready", detail: "Odoo Online (odoo.com) or self-hosted — any instance with API access works." },
      { title: "Enable API access", detail: "In Odoo, go to Settings → Users → your user → API Keys. Create a new key." },
      { title: "Find your database name", detail: "The database name is shown in the Odoo login screen or your Odoo.sh dashboard." },
      { title: "Enter your instance URL, database, username, and API key above", detail: "The URL is your full Odoo instance URL (e.g. https://mycompany.odoo.com)." },
    ],
  },
];

export default function InventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackStatus = searchParams.get("status");

  const queryClient = useQueryClient();
  const apiFetch = useApiClient();
  const { data: integrations, isPending } = useIntegrations();
  const canManage = usePermission("integration:manage");
  const canTest = usePermission("integration:test");

  useEffect(() => {
    if (!callbackStatus) return;

    queryClient.invalidateQueries({ queryKey: integrationsKey });
    if (callbackStatus === "success") {
      toast.success("Zoho Inventory connected — confirming the details below.");
    } else {
      toast.error("Something went wrong connecting Zoho Inventory.");
    }
    router.replace(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inventoryIntegrations = integrations?.filter(
    (i) => (INVENTORY_PROVIDERS as readonly string[]).includes(i.provider)
  ) ?? [];

  const activeInventory = inventoryIntegrations.find((i) =>
    i.status === "ACTIVE" || i.status === "DEGRADED"
  );

  const zohoConnect = useConnectZoho();
  const [selectedProvider, setSelectedProvider] = useState<Provider>(activeInventory?.provider as Provider ?? "ZOHO_INVENTORY");
  const [connecting, setConnecting] = useState(false);

  const testMutation = useTestIntegration();
  const disconnectMutation = useDisconnectIntegration();

  const selectedMeta = INVENTORY_CATALOG.find((m) => m.provider === selectedProvider)!;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OdooFormValues>({ resolver: zodResolver(odooConnectSchema) });

  async function handleZohoConnect() {
    try {
      const result = await zohoConnect.mutateAsync(undefined as never);

      window.location.href = result.authorizeUrl;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the Zoho connection.");
    }
  }

  const onSubmitOdoo = handleSubmit(async (values) => {
    setConnecting(true);

    try {
      await apiFetch(`/integrations/ODOO/connect`, {
        method: "POST",
        body: JSON.stringify(values),
      });

      toast.success("Odoo connected.");
      reset();
      queryClient.invalidateQueries({ queryKey: integrationsKey });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Couldn't connect Odoo.");
      }
    } finally {
      setConnecting(false);
    }
  });

  function handleDisconnect() {
    if (!activeInventory) return;

    const meta = INVENTORY_CATALOG.find((m) => m.provider === activeInventory.provider);

    if (!meta) return;

    if (!window.confirm(`Disconnect ${meta.name}? Inventory checks will stop working.`)) return;

    disconnectMutation.mutate(activeInventory.provider as Provider, {
      onSuccess: () => {
        toast.success(`${meta.name} disconnected.`);
        setSelectedProvider("ZOHO_INVENTORY");
      },
      onError: () => toast.error("Couldn't disconnect — try again."),
    });
  }

  if (isPending) {
    return (
      <>
        <PageHeader
          title="Inventory"
          description="Choose an inventory provider for stock level checks."
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
        title="Inventory"
        description="Choose an inventory provider for real-time stock level checks during fulfillment."
      />
      <div className="max-w-2xl space-y-8 p-6 sm:p-8">
        {activeInventory ? (
          <section className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
                  <IntegrationIcon
                    provider={activeInventory.provider as Provider}
                    className="size-4.5"
                  />
                </span>
                <div>
                  <p className="font-medium">
                    {INVENTORY_CATALOG.find((m) => m.provider === activeInventory.provider)?.name ?? activeInventory.provider}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {activeInventory.displayHint ? `Connected — ${activeInventory.displayHint}` : "Connected"}
                  </p>
                </div>
              </div>
              <StatusBadge
                tone={activeInventory.status === "DEGRADED" ? "degraded" : "success"}
                label={activeInventory.status === "DEGRADED" ? "Needs attention" : "Connected"}
              />
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Last checked</dt>
              <dd>{activeInventory.lastCheckedAt ? new Date(activeInventory.lastCheckedAt).toLocaleString() : "Never"}</dd>
              {activeInventory.lastErrorMessage && (
                <>
                  <dt className="text-muted-foreground">Last error</dt>
                  <dd className="text-status-failed">{activeInventory.lastErrorMessage}</dd>
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
                    testMutation.mutate(activeInventory.provider as Provider, {
                      onSuccess: () => toast.success("Connection looks good."),
                      onError: (err) => {
                        if (isTransientError(err)) {
                          toast.error("This inventory provider is temporarily unavailable.");
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
              <h2 className="font-semibold">Select an inventory provider</h2>
              <HowToConnectDialog
                providerName={selectedMeta.name}
                steps={selectedMeta.connectGuide}
              />
            </div>

            <div className="space-y-2">
              {INVENTORY_CATALOG.map((inv) => {
                const isSelected = selectedProvider === inv.provider;
                return (
                  <button
                    key={inv.provider}
                    type="button"
                    onClick={() => setSelectedProvider(inv.provider)}
                    className={`flex items-start gap-3 w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    }`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
                      <IntegrationIcon
                        provider={inv.provider}
                        className="size-4.5"
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{inv.name}</p>
                      <p className="text-sm text-muted-foreground">{inv.description}</p>
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
            ) : selectedMeta.authMethod === "oauth" ? (
              <Button onClick={handleZohoConnect} disabled={zohoConnect.isPending}>
                {zohoConnect.isPending ? "Redirecting…" : `Connect ${selectedMeta.name}`}
              </Button>
            ) : (
              <form onSubmit={onSubmitOdoo} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="url">Instance URL</Label>
                  <Input id="url" placeholder="https://mycompany.odoo.com" {...register("url")} />
                  {errors.url && <p className="text-sm text-status-failed">{errors.url.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db">Database name</Label>
                  <Input id="db" placeholder="mycompany" {...register("db")} />
                  {errors.db && <p className="text-sm text-status-failed">{errors.db.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username (email)</Label>
                  <Input id="username" type="email" placeholder="admin@example.com" {...register("username")} />
                  {errors.username && <p className="text-sm text-status-failed">{errors.username.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="apiKey">API key</Label>
                  <Input id="apiKey" type="password" placeholder="••••••••" {...register("apiKey")} />
                  {errors.apiKey && <p className="text-sm text-status-failed">{errors.apiKey.message}</p>}
                </div>
                <Button type="submit" disabled={connecting}>
                  {connecting ? "Connecting…" : `Connect ${selectedMeta.name}`}
                </Button>
              </form>
            )}
          </section>
        )}
      </div>
    </>
  );
}
