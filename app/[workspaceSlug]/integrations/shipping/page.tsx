"use client";

import { useState } from "react";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { usePermission } from "@/hooks/use-permission";
import { useApiClient } from "@/hooks/use-api-client";

import { useIntegrations, useTestIntegration, useDisconnectIntegration, integrationsKey, useConnectEasyPost } from "@/features/integrations/hooks";
import type { Provider } from "@/features/integrations/types";

import { ApiError, isTransientError } from "@/lib/api-error";

import { AddressAutocompleteInput, type AddressSuggestion } from "@/components/patterns/address-autocomplete-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { HowToConnectDialog } from "@/components/domain/how-to-connect-dialog";
import { IntegrationIcon } from "@/components/domain/integration-icon";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";

const SHIPPING_PROVIDERS: Provider[] = ["EASYPOST", "SHIPPO"];

const shippingSchema = z.object({
  apiKey: z.string().min(1, "Enter your API key"),
  fromAddress: z.object({
    name: z.string().min(1, "Enter a name"),
    company: z.string().optional(),
    street1: z.string().min(1, "Enter a street address"),
    street2: z.string().optional(),
    city: z.string().min(1, "Enter a city"),
    state: z.string().min(1, "Enter a state"),
    zip: z.string().min(1, "Enter a ZIP/postal code"),
    country: z.string().min(1, "Enter a country"),
    phone: z.string().optional(),
  }),
});

type ShippingFormValues = z.infer<typeof shippingSchema>;

interface ShippingMeta {
  provider: Provider;
  name: string;
  description: string;
  connectGuide: { title: string; detail: React.ReactNode }[];
  apiKeyPlaceholder: string;
  apiKeyHelp: string;
}

const SHIPPING_CATALOG: ShippingMeta[] = [
  {
    provider: "EASYPOST",
    name: "EasyPost",
    description: "Modern shipping API with multi-carrier rate shopping and label generation.",
    apiKeyPlaceholder: "EZAK••••••••",
    apiKeyHelp: "Test keys start with 'EZTK', production keys with 'EZAK'.",
    connectGuide: [
      {
        title: "Sign in and open the API Keys tab",
        detail: <>After signing in at app.easypost.com, go to <a href="https://app.easypost.com/account/settings?tab=api-keys" target="_blank" rel="noreferrer">Account → Settings → API Keys</a>.</>,
      },
      { title: 'Click "Add Additional API Key"', detail: 'Choose "Test" or "Production" — a new key is generated immediately.' },
      { title: "Copy the key and paste it above", detail: "Test keys are free for trying this out without buying real labels." },
      { title: "Fill in your ship-from address", detail: "EasyPost needs an origin address on every shipment — collected once here." },
    ],
  },
  {
    provider: "SHIPPO",
    name: "Shippo",
    description: "Shipping API with discounted rates across 85+ carriers worldwide.",
    apiKeyPlaceholder: "shippo_test_••••••••",
    apiKeyHelp: "Test tokens start with 'shippo_test_', live tokens with 'shippo_live_'.",
    connectGuide: [
      { title: "Sign in to Shippo", detail: <>Go to <a href="https://apps.goshippo.com/settings/api" target="_blank" rel="noreferrer">apps.goshippo.com/settings/api</a>.</> },
      { title: "Generate an API token", detail: "Choose a test token for trying this out — live tokens are for production use." },
      { title: "Copy the token and paste it above", detail: 'Test tokens start with "shippo_test_", live tokens with "shippo_live_".' },
      { title: "Fill in your ship-from address", detail: "Shippo needs an origin address on every shipment — collected once here." },
    ],
  },
];

export default function ShippingPage() {
  const queryClient = useQueryClient();
  const apiFetch = useApiClient();
  const { data: integrations, isPending } = useIntegrations();
  const canManage = usePermission("integration:manage");
  const canTest = usePermission("integration:test");

  const shippingIntegrations = integrations?.filter(
    (i) => (SHIPPING_PROVIDERS as readonly string[]).includes(i.provider)
  ) ?? [];

  const activeShipping = shippingIntegrations.find((i) =>
    i.status === "ACTIVE" || i.status === "DEGRADED"
  );

  const easyPostConnect = useConnectEasyPost();

  const [selectedProvider, setSelectedProvider] = useState<Provider>(activeShipping?.provider as Provider ?? "EASYPOST");
  const [connecting, setConnecting] = useState(false);

  const testMutation = useTestIntegration();
  const disconnectMutation = useDisconnectIntegration();

  const selectedMeta = SHIPPING_CATALOG.find((m) => m.provider === selectedProvider)!;

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<ShippingFormValues>({ resolver: zodResolver(shippingSchema) });

  function applyAddressSuggestion(address: AddressSuggestion) {
    setValue("fromAddress.city", address.city ?? "", { shouldValidate: true });
    setValue("fromAddress.state", address.state ?? "", { shouldValidate: true });
    setValue("fromAddress.zip", address.postalCode ?? "", { shouldValidate: true });
    setValue("fromAddress.country", address.country ?? "", { shouldValidate: true });
  }

  async function connectShippo(values: ShippingFormValues) {
    await apiFetch(`/integrations/SHIPPO/connect`, {
      method: "POST",
      body: JSON.stringify(values),
    });
  }

  const onSubmit = handleSubmit(async (values) => {
    setConnecting(true);

    try {
      if (selectedProvider === "SHIPPO") {
        await connectShippo(values);
      } else {
        await easyPostConnect.mutateAsync(values);
      }

      toast.success(`${selectedMeta.name} connected.`);
      reset();
      queryClient.invalidateQueries({ queryKey: integrationsKey });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error(`Couldn't connect ${selectedMeta.name}.`);
      }
    } finally {
      setConnecting(false);
    }
  });

  function handleDisconnect() {
    if (!activeShipping) return;

    const meta = SHIPPING_CATALOG.find((m) => m.provider === activeShipping.provider);

    if (!meta) return;

    if (!window.confirm(`Disconnect ${meta.name}? Shipment creation will stop working.`)) return;

    disconnectMutation.mutate(activeShipping.provider as Provider, {
      onSuccess: () => {
        toast.success(`${meta.name} disconnected.`);
        setSelectedProvider("EASYPOST");
      },
      onError: () => toast.error("Couldn't disconnect — try again."),
    });
  }

  if (isPending) {
    return (
      <>
        <PageHeader
          title="Shipping"
          description="Choose a shipping provider for label generation."
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
        title="Shipping"
        description="Choose a shipping provider for label generation and tracking."
      />
      <div className="max-w-2xl space-y-8 p-6 sm:p-8">
        {activeShipping ? (
          <section className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
                  <IntegrationIcon
                    provider={activeShipping.provider as Provider}
                    className="size-4.5"
                  />
                </span>
                <div>
                  <p className="font-medium">
                    {SHIPPING_CATALOG.find((m) => m.provider === activeShipping.provider)?.name ?? activeShipping.provider}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {activeShipping.displayHint ? `Connected — ${activeShipping.displayHint}` : "Connected"}
                  </p>
                </div>
              </div>
              <StatusBadge
                tone={activeShipping.status === "DEGRADED" ? "degraded" : "success"}
                label={activeShipping.status === "DEGRADED" ? "Needs attention" : "Connected"}
              />
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Last checked</dt>
              <dd>{activeShipping.lastCheckedAt ? new Date(activeShipping.lastCheckedAt).toLocaleString() : "Never"}</dd>
              {activeShipping.lastErrorMessage && (
                <>
                  <dt className="text-muted-foreground">Last error</dt>
                  <dd className="text-status-failed">{activeShipping.lastErrorMessage}</dd>
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
                    testMutation.mutate(activeShipping.provider as Provider, {
                      onSuccess: () => toast.success("Connection looks good."),
                      onError: (err) => {
                        if (isTransientError(err)) {
                          toast.error("This shipping provider is temporarily unavailable — try again shortly.");
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
              <h2 className="font-semibold">Select a shipping provider</h2>
              <HowToConnectDialog
                providerName={selectedMeta.name}
                steps={selectedMeta.connectGuide}
              />
            </div>

            <div className="space-y-2">
              {SHIPPING_CATALOG.map((shipper) => {
                const isSelected = selectedProvider === shipper.provider;
                return (
                  <button
                    key={shipper.provider}
                    type="button"
                    onClick={() => setSelectedProvider(shipper.provider)}
                    className={`flex items-start gap-3 w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    }`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-border">
                      <IntegrationIcon
                        provider={shipper.provider}
                        className="size-4.5"
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{shipper.name}</p>
                      <p className="text-sm text-muted-foreground">{shipper.description}</p>
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
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder={selectedMeta.apiKeyPlaceholder}
                    {...register("apiKey")}
                  />
                  {errors.apiKey && <p className="text-sm text-status-failed">{errors.apiKey.message}</p>}
                  <p className="text-sm text-muted-foreground">{selectedMeta.apiKeyHelp}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="font-medium">Ship-from address</p>
                    <p className="text-sm text-muted-foreground">This origin address is used on every shipment — collected once here.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="fromAddress.name">Contact name</Label>
                      <Input id="fromAddress.name" placeholder="Acme Fulfillment" {...register("fromAddress.name")} />
                      {errors.fromAddress?.name && <p className="text-sm text-status-failed">{errors.fromAddress.name.message}</p>}
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="fromAddress.company">Company (optional)</Label>
                      <Input id="fromAddress.company" {...register("fromAddress.company")} />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="fromAddress.street1">Street address</Label>
                      <Controller
                        name="fromAddress.street1"
                        control={control}
                        render={({ field }) => (
                          <AddressAutocompleteInput
                            id="fromAddress.street1"
                            placeholder="123 Main St"
                            value={field.value}
                            onValueChange={field.onChange}
                            onSelectAddress={applyAddressSuggestion}
                          />
                        )}
                      />
                      {errors.fromAddress?.street1 && <p className="text-sm text-status-failed">{errors.fromAddress.street1.message}</p>}
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="fromAddress.street2">Apt, suite, etc. (optional)</Label>
                      <Input id="fromAddress.street2" {...register("fromAddress.street2")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fromAddress.city">City</Label>
                      <Input id="fromAddress.city" placeholder="Austin" {...register("fromAddress.city")} />
                      {errors.fromAddress?.city && <p className="text-sm text-status-failed">{errors.fromAddress.city.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fromAddress.state">State</Label>
                      <Input id="fromAddress.state" placeholder="TX" {...register("fromAddress.state")} />
                      {errors.fromAddress?.state && <p className="text-sm text-status-failed">{errors.fromAddress.state.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fromAddress.zip">ZIP / Postal code</Label>
                      <Input id="fromAddress.zip" placeholder="78701" {...register("fromAddress.zip")} />
                      {errors.fromAddress?.zip && <p className="text-sm text-status-failed">{errors.fromAddress.zip.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fromAddress.country">Country</Label>
                      <Input id="fromAddress.country" placeholder="US" {...register("fromAddress.country")} />
                      {errors.fromAddress?.country && <p className="text-sm text-status-failed">{errors.fromAddress.country.message}</p>}
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="fromAddress.phone">Phone (optional)</Label>
                      <Input id="fromAddress.phone" type="tel" {...register("fromAddress.phone")} />
                    </div>
                  </div>
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
