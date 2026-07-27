import { JWTPayload } from 'jose';

// Normalized shape ClerkTenantGuard reads. Clerk session tokens carry the
// active organization in one of two claim shapes depending on token version:
// the legacy flat org_id/org_slug/org_role claims, or (current default,
// "v": 2) a compact `o: { id, slg, rol }` object. normalizeClerkSessionClaims
// below resolves either raw shape into this one, so nothing downstream of
// ClerkVerifierService needs to know which format a given token used.
export interface ClerkSessionClaims extends JWTPayload {
  sub: string;
  org_id?: string;
  org_slug?: string;
  org_role?: string;
}

interface RawClerkSessionPayload extends JWTPayload {
  sub: string;
  org_id?: string;
  org_slug?: string;
  org_role?: string;
  // Compact org claim used by "v": 2 session tokens.
  o?: {
    id?: string;
    slg?: string;
    rol?: string;
  };
}

export function normalizeClerkSessionClaims(payload: JWTPayload): ClerkSessionClaims {
  const raw = payload as RawClerkSessionPayload;
  const compactOrg = raw.o;

  return {
    ...raw,
    org_id: compactOrg?.id ?? raw.org_id,
    org_slug: compactOrg?.slg ?? raw.org_slug,
    org_role: compactOrg?.rol ? `org:${compactOrg.rol}` : raw.org_role,
  };
}
