export type WorkspaceRole = "owner" | "admin" | "operator" | "viewer";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
};

// Matches the backend's seeded permission matrix exactly (backend API contract
// §6): Owner -> everything, Admin -> everything except billing/tenant
// deletion, Operator -> orders:read + integration read/test, Viewer ->
// read-only. The backend enforces this regardless of what the UI shows —
// these gates are for hiding actions a role can't take, not security.
export type PermissionAction =
  | "workflow:retry"
  | "order:override"
  | "integration:manage"
  | "integration:test"
  | "member:manage"
  | "workspace:delete"
  | "tenant:manage"
  | "billing:manage"
  | "audit:read";

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
