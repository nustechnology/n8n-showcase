import type { WorkspaceRole, PermissionAction } from "@n8n-showcase/shared-types";

export type { WorkspaceRole, PermissionAction };

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
};

const ACTION_MIN_ROLE: Record<PermissionAction, WorkspaceRole> = {
  "integration:test": "operator",
  "workflow:retry": "operator",
  "order:override": "operator",
  "integration:manage": "admin",
  "member:manage": "admin",
  "audit:read": "admin",
  "workspace:delete": "owner",
  "tenant:manage": "owner",
  "billing:manage": "owner",
};

export function canPerform(role: WorkspaceRole | undefined, action: PermissionAction): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[ACTION_MIN_ROLE[action]];
}

/**
 * Clerk custom org roles are configured in the Clerk Dashboard as "org:owner",
 * "org:admin", "org:operator", "org:viewer" (see .env.example). This just strips
 * the "org:" prefix Clerk always adds.
 */
export function toWorkspaceRole(clerkRole: string | null | undefined): WorkspaceRole | undefined {
  const stripped = clerkRole?.replace(/^org:/, "");
  return stripped && stripped in ROLE_RANK ? (stripped as WorkspaceRole) : undefined;
}
