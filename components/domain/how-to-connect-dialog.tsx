import { HelpCircle } from "lucide-react";

import type { ConnectGuideStep } from "@/components/domain/integration-catalog";

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

interface HowToConnectDialogProps {
  providerName: string;
  steps: ConnectGuideStep[];
}

/** Same step-list pattern as ShopifyProtectedDataDialog, generalized across every provider in the catalog. */
export function HowToConnectDialog({ providerName, steps }: HowToConnectDialogProps) {
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
        How to connect
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connecting {providerName}</DialogTitle>
          <DialogDescription>Follow these steps to get {providerName} connected.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {steps.map((step, i) => (
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
