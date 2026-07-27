"use client";

import { useAuth } from "@clerk/nextjs";

import { canPerform, toWorkspaceRole, type PermissionAction } from "@/lib/roles";

/**
 * UI-only gate — hides/disables actions the user's role can't perform. NestJS
 * guards are the actual enforcement; this hook exists so a Viewer never even
 * sees a "Retry" button, not so the app is secure without the backend check.
 */
export function usePermission(action: PermissionAction): boolean {
  const { orgRole } = useAuth();
  return canPerform(toWorkspaceRole(orgRole), action);
}
