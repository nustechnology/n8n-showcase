"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { useConnectEasyPost } from "@/features/integrations/hooks";
import { easyPostConnectSchema, type EasyPostConnectFormValues } from "@/features/integrations/schemas";

import { ApiError } from "@/lib/api-error";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocompleteInput, type AddressSuggestion } from "@/components/patterns/address-autocomplete-input";

// Dedicated form, not ApiKeyConnectForm — EasyPost's connect body isn't flat
// like Resend/Slack's (a nested fromAddress is required alongside the key,
// since EasyPost has no account-level default warehouse the way ShipStation
// did), so it doesn't fit the shared component's one-string-per-field model.
export function EasyPostConnectForm() {
  const connect = useConnectEasyPost();

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<EasyPostConnectFormValues>({ resolver: zodResolver(easyPostConnectSchema) });

  // Fills the rest of the address from a selected autocomplete suggestion —
  // street1 itself is set by AddressAutocompleteInput's own onValueChange,
  // since that's also how manually-typed text stays in sync.
  function applyAddressSuggestion(address: AddressSuggestion) {
    setValue("fromAddress.city", address.city ?? "", { shouldValidate: true });
    setValue("fromAddress.state", address.state ?? "", { shouldValidate: true });
    setValue("fromAddress.zip", address.postalCode ?? "", { shouldValidate: true });
    setValue("fromAddress.country", address.country ?? "", { shouldValidate: true });
  }

  const onSubmit = handleSubmit((values) => {
    connect.mutate(values, {
      onSuccess: () => {
        toast.success("EasyPost connected.");
        reset();
      },
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Couldn't connect EasyPost.");
      },
    });
  });

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="apiKey">API Key</Label>
        <Input
          id="apiKey"
          type="password"
          placeholder="EZAK••••••••"
          {...register("apiKey")}
        />
        {errors.apiKey && <p className="text-sm text-status-failed">{errors.apiKey.message}</p>}
      </div>

      <div className="space-y-3">
        <div>
          <p className="font-medium">Ship-from address</p>
          <p className="text-sm text-muted-foreground">
            EasyPost requires an origin address on every shipment — collected once here, not re-asked per order.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="fromAddress.name">Name</Label>
            <Input
              id="fromAddress.name"
              placeholder="Warehouse or contact name"
              {...register("fromAddress.name")}
            />
            {errors.fromAddress?.name && (
              <p className="text-sm text-status-failed">{errors.fromAddress.name.message}</p>
            )}
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="fromAddress.company">Company (optional)</Label>
            <Input
              id="fromAddress.company"
              {...register("fromAddress.company")}
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="fromAddress.street1">Street address</Label>
            <Controller
              control={control}
              name="fromAddress.street1"
              render={({ field }) => (
                <AddressAutocompleteInput
                  id="fromAddress.street1"
                  placeholder="Start typing an address…"
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  onSelectAddress={applyAddressSuggestion}
                />
              )}
            />
            {errors.fromAddress?.street1 && (
              <p className="text-sm text-status-failed">{errors.fromAddress.street1.message}</p>
            )}
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="fromAddress.street2">Street address 2 (optional)</Label>
            <Input
              id="fromAddress.street2"
              {...register("fromAddress.street2")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fromAddress.city">City</Label>
            <Input
              id="fromAddress.city"
              {...register("fromAddress.city")}
            />
            {errors.fromAddress?.city && (
              <p className="text-sm text-status-failed">{errors.fromAddress.city.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fromAddress.state">State</Label>
            <Input
              id="fromAddress.state"
              {...register("fromAddress.state")}
            />
            {errors.fromAddress?.state && (
              <p className="text-sm text-status-failed">{errors.fromAddress.state.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fromAddress.zip">ZIP / postal code</Label>
            <Input
              id="fromAddress.zip"
              {...register("fromAddress.zip")}
            />
            {errors.fromAddress?.zip && (
              <p className="text-sm text-status-failed">{errors.fromAddress.zip.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fromAddress.country">Country</Label>
            <Input
              id="fromAddress.country"
              placeholder="US"
              {...register("fromAddress.country")}
            />
            {errors.fromAddress?.country && (
              <p className="text-sm text-status-failed">{errors.fromAddress.country.message}</p>
            )}
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="fromAddress.phone">Phone (optional)</Label>
            <Input
              id="fromAddress.phone"
              {...register("fromAddress.phone")}
            />
          </div>
        </div>
      </div>

      <Button
        type="submit"
        disabled={connect.isPending}
      >
        {connect.isPending ? "Connecting…" : "Connect EasyPost"}
      </Button>
    </form>
  );
}
