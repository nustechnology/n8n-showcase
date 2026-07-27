// DI tokens for the JWKS key resolver and issuer, so tests can substitute a
// local key pair instead of AuthModule's default `createRemoteJWKSet`
// factory (see clerk-tenant.guard.spec.ts).
export const CLERK_JWKS = Symbol('CLERK_JWKS');
export const CLERK_ISSUER = Symbol('CLERK_ISSUER');
