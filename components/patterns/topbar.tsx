"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Menu, Bell } from "lucide-react";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { useNotifications } from "@/features/notifications/hooks";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

import { ThemeToggle } from "@/components/patterns/theme-toggle";
import { WORKSPACE_NAV_ITEMS } from "@/components/domain/workspace-nav";

export function Topbar({ slug }: { slug: string }) {
  const pathname = usePathname();
  const { data: notifications } = useNotifications();
  const unreadCount = notifications?.unreadCount ?? 0;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
      <Sheet>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
          }
        />
        <SheetContent
          side="left"
          className="w-64 p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="border-b p-3">
            <OrganizationSwitcher
              afterSelectOrganizationUrl="/:slug/dashboard"
              hidePersonal
            />
          </div>
          <nav className="space-y-0.5 p-3">
            {WORKSPACE_NAV_ITEMS.map((item) => {
              const href = `/${slug}/${item.segment}`;
              const active = pathname.startsWith(`/${slug}/${item.segment.split("/")[0]}`);
              return (
                <Link
                  key={item.segment}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-base font-medium",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        nativeButton={false}
        render={
          <Link
            href={`/${slug}/notifications`}
            className="relative"
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
          </Link>
        }
      />
      <ThemeToggle />
      <div className="md:hidden">
        <UserButton />
      </div>
    </header>
  );
}
