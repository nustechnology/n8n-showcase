"use client";

import { toast } from "sonner";

import { useConnectZoho } from "@/features/integrations/hooks";

import { ApiError } from "@/lib/api-error";

import { Button } from "@/components/ui/button";

export function ZohoConnectForm() {
  const connect = useConnectZoho();

  function handleClick() {
    connect.mutate(undefined, {
      onSuccess: ({ authorizeUrl }) => {
        // Full-page redirect, not client-side navigation — same OAuth
        // handoff as Shopify (backend API contract §2). No pre-redirect
        // field needed, unlike Shopify's shop-domain input.
        window.location.href = authorizeUrl;
      },
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Couldn't start the Zoho Inventory connection.");
      },
    });
  }

  return (
    <Button
      onClick={handleClick}
      disabled={connect.isPending}
    >
      {connect.isPending ? "Redirecting…" : "Connect Zoho Inventory"}
    </Button>
  );
}
