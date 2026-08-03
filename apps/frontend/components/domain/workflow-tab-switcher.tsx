"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { key: "order-validation", label: "Order Validation" },
  { key: "cart-reminder", label: "Cart Reminder" },
] as const;

export function WorkflowTabSwitcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("workflow") ?? "order-validation";

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted p-0.5">
      {TABS.map((tab) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("workflow", tab.key);
        const active = selected === tab.key;

        return (
          <Link
            key={tab.key}
            href={`${pathname}?${params.toString()}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
