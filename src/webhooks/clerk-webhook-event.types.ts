// Minimal shapes for the Clerk event types this app actually handles — not
// the full @clerk/backend event catalog, just the fields we read. Clerk
// sends many other event types; anything not listed here is ignored.

export interface ClerkWebhookEvent<T = unknown> {
  type: string;
  data: T;
}

export interface ClerkOrganizationData {
  id: string;
  name: string;
  slug: string | null;
}

export interface ClerkUserData {
  id: string;
  email_addresses: { id: string; email_address: string }[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface ClerkOrganizationMembershipData {
  organization: { id: string };
  public_user_data: { user_id: string };
  // Clerk's built-in roles, e.g. "org:admin" | "org:member" — custom roles
  // aren't handled (see ClerkWebhookService.resolveRoleName).
  role: string;
  // Set by MembersService via Clerk's invitation/membership metadata APIs —
  // the only way to recover our 4-tier app role (Owner/Admin/Operator/
  // Viewer) from Clerk's coarse 2-tier role. Absent on memberships that
  // never went through our invite/role-change flow (e.g. the org creator).
  public_metadata?: { appRole?: string };
}
