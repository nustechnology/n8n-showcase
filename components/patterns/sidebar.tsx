"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { cn } from "@/lib/utils";

import { WORKSPACE_NAV_ITEMS } from "@/components/domain/workspace-nav";

export function Sidebar({ slug }: { slug: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="border-b p-3">
        <OrganizationSwitcher
          afterSelectOrganizationUrl="/:slug/dashboard"
          hidePersonal
          appearance={{ elements: { rootBox: "w-full", organizationSwitcherTrigger: "w-full justify-between" } }}
        />
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {WORKSPACE_NAV_ITEMS.map((item) => {
          const href = `/${slug}/${item.segment}`;
          const active = pathname.startsWith(`/${slug}/${item.segment.split("/")[0]}`);
          return (
            <Link
              key={item.segment}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-base font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 border-t p-3">
        <UserButton />
        <span className="text-base text-muted-foreground">Account</span>
      </div>
    </aside>
  );
}
