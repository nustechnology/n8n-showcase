import { Bell, LayoutDashboard, Package, Plug, Settings, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  segment: string;
  icon: LucideIcon;
}

export const WORKSPACE_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", segment: "dashboard", icon: LayoutDashboard },
  { label: "Integrations", segment: "integrations", icon: Plug },
  { label: "Workflows", segment: "workflows", icon: Workflow },
  { label: "Orders", segment: "orders", icon: Package },
  { label: "Notifications", segment: "notifications", icon: Bell },
  { label: "Settings", segment: "settings/workspace", icon: Settings },
];
