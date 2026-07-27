import { CheckIcon, HelpCircle, XIcon } from "lucide-react";

import type { Order } from "@/features/orders/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Mirrors AiValidationService.validateOrder exactly (mocked pending a real
// OpenAI key — see backend CLAUDE.md "Orchestrator callbacks"): valid =
// hasEmail && positiveTotal. Derived here from the already-fetched Order
// rather than re-fetched, so this can't drift from what's on screen.
function checks(order: Order) {
  const hasEmail = Boolean(order.customerEmail);
  const positiveTotal = order.totalAmount != null && Number(order.totalAmount) > 0;
  return { hasEmail, positiveTotal };
}

function CheckRow({ pass, label }: { pass: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {pass ? <CheckIcon className="size-4 text-status-success" /> : <XIcon className="size-4 text-status-failed" />}
      <span className={pass ? undefined : "text-status-failed"}>{label}</span>
    </li>
  );
}

/** Shown on a VALIDATION_FAILED order row — explains which of the two mocked AI-validation checks didn't pass, live from the order's own data. */
export function OrderValidationFailureDialog({ order }: { order: Order }) {
  const { hasEmail, positiveTotal } = checks(order);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
          />
        }
      >
        <HelpCircle />
        Why
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Why validation failed</DialogTitle>
          <DialogDescription>
            AI validation is currently mocked (no OpenAI key wired in yet) and just checks two things:
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          <CheckRow
            pass={hasEmail}
            label="Order has a customer email"
          />
          <CheckRow
            pass={positiveTotal}
            label="Order total is greater than zero"
          />
        </ul>
        {!hasEmail && (
          <div className="rounded-lg border bg-muted/50 p-3 text-muted-foreground">
            <p className="font-medium text-foreground">Most likely cause</p>
            <p>
              Either this order genuinely has no customer attached in Shopify, or Shopify redacted the customer&apos;s
              PII from the webhook because this app hasn&apos;t individually requested the <strong>Name</strong>{" "}
              and <strong>Email</strong> protected-data fields — requesting the reason alone isn&apos;t enough. Fix
              in Partner Dashboard: <strong>API access requests → Protected customer data access</strong>, past the
              reason picker, check Name and Email.
            </p>
          </div>
        )}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
