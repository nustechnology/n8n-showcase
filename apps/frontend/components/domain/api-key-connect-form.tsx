"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { useConnectApiKeyProvider } from "@/features/integrations/hooks";
import type { Provider } from "@/features/integrations/types";

import { ApiError } from "@/lib/api-error";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ApiKeyField {
  name: string;
  label: string;
  type?: "text" | "password";
  placeholder?: string;
  helpText?: string;
}

interface ApiKeyConnectFormProps {
  provider: Provider;
  providerName: string;
  fields: ApiKeyField[];
  /** Returns a provider-specific message for a given error, or undefined to fall through to the generic one — see Resend's sending-only-key case. */
  mapError?: (error: ApiError) => string | undefined;
}

/**
 * Shared by every apiKey-auth provider (Resend, EasyPost, Slack) — they're
 * structurally identical, differing only in field count and copy. A
 * dedicated per-provider component isn't warranted; provider-specific
 * behavior (like Resend's error mapping) is passed in rather than forked.
 */
export function ApiKeyConnectForm({ provider, providerName, fields, mapError }: ApiKeyConnectFormProps) {
  const connect = useConnectApiKeyProvider(provider);

  const shape: Record<string, z.ZodString> = {};
  for (const field of fields) {
    shape[field.name] = z.string().min(1, `Enter your ${field.label.toLowerCase()}`);
  }
  const schema = z.object(shape);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Record<string, string>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit((values) => {
    connect.mutate(values, {
      onSuccess: () => {
        toast.success(`${providerName} connected.`);
        reset();
      },
      onError: (err) => {
        if (err instanceof ApiError) {
          toast.error(mapError?.(err) ?? err.message);
          return;
        }

        toast.error(`Couldn't connect ${providerName}.`);
      },
    });
  });

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
    >
      {fields.map((field) => (
        <div
          key={field.name}
          className="space-y-1.5"
        >
          <Label htmlFor={field.name}>{field.label}</Label>
          <Input
            id={field.name}
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            {...register(field.name)}
          />
          {errors[field.name] && <p className="text-sm text-status-failed">{errors[field.name]?.message}</p>}
          {field.helpText && <p className="text-sm text-muted-foreground">{field.helpText}</p>}
        </div>
      ))}
      <Button
        type="submit"
        disabled={connect.isPending}
      >
        {connect.isPending ? "Connecting…" : `Connect ${providerName}`}
      </Button>
    </form>
  );
}
