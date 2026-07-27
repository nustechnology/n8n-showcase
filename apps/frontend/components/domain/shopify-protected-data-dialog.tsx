import { HelpCircle } from "lucide-react";

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

const STEPS = [
  {
    title: "Open the app in Partner Dashboard",
    detail: (
      <>
        Go to{" "}
        <a
          href="https://partners.shopify.com/"
          target="_blank"
          rel="noreferrer"
        >
          partners.shopify.com
        </a>
        , then in the sidebar: <strong>App distribution → All apps</strong> → select this app.
      </>
    ),
  },
  {
    title: "Request protected customer data access",
    detail: (
      <>
        In the sidebar: <strong>API access requests → Protected customer data access → Request access</strong>.
      </>
    ),
  },
  {
    title: 'Select "Store management" as the reason',
    detail: "This app tracks orders and inventory, not customer service, marketing, or personalization — Store management is the only accurate reason to select.",
  },
  {
    title: "Reconnect",
    detail: 'Come back here and disconnect + reconnect Shopify — access takes effect immediately on a development store, no Shopify review needed.',
  },
];

/** orders/create webhook registration 403s with "This topic contains protected customer data" until this is granted — see README/CLAUDE.md Troubleshooting for the full writeup. */
export function ShopifyProtectedDataDialog() {
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
        How to fix
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fix: webhook registration failed</DialogTitle>
          <DialogDescription>
            Shopify rejects the <code>orders/create</code> webhook subscription with a 403 until this app is
            granted Protected Customer Data access — a separate approval from the OAuth scopes granted at
            connect time.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex gap-3"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
