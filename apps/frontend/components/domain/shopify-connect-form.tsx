"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { useConnectShopify } from "@/features/integrations/hooks";

import { shopifyConnectSchema, type ShopifyConnectFormValues } from "@/features/integrations/schemas";
import { ApiError } from "@/lib/api-error";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ShopifyConnectForm() {
  const connect = useConnectShopify();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ShopifyConnectFormValues>({ resolver: zodResolver(shopifyConnectSchema) });

  const onSubmit = handleSubmit(({ shop }) => {
    connect.mutate(
      { shop },
      {
        onSuccess: ({ authorizeUrl }) => {
          // Full-page redirect, not client-side navigation — this hands off
          // to Shopify's real OAuth consent screen (backend API contract §2).
          window.location.href = authorizeUrl;
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : "Couldn't start the Shopify connection.");
        },
      }
    );
  });

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="shop">Shop domain</Label>
        <Input
          id="shop"
          placeholder="your-store.myshopify.com"
          {...register("shop")}
        />
        {errors.shop && <p className="text-sm text-status-failed">{errors.shop.message}</p>}
      </div>
      <Button
        type="submit"
        disabled={connect.isPending}
      >
        {connect.isPending ? "Redirecting…" : "Connect Shopify"}
      </Button>
    </form>
  );
}
