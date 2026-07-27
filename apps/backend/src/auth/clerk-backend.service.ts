import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const CLERK_API_BASE = 'https://api.clerk.com/v1';

export type ClerkOrgRole = 'org:admin' | 'org:member';

/**
 * Outbound calls to Clerk's Backend API — the mirror image of
 * ClerkVerifierService, which only ever verifies inbound tokens/webhooks.
 * Nothing in this app called *out* to Clerk before member management: every
 * membership write used to flow one direction (Clerk fires a webhook, we
 * update our DB). This is what lets member management drive Clerk instead
 * of only ever reacting to it.
 */
@Injectable()
export class ClerkBackendService {
  private readonly secretKey: string;

  constructor(config: ConfigService) {
    this.secretKey = config.getOrThrow<string>('CLERK_SECRET_KEY');
  }

  async createInvitation(params: {
    clerkOrgId: string;
    inviterClerkUserId: string;
    email: string;
    clerkRole: ClerkOrgRole;
    appRole: string;
  }): Promise<void> {
    await this.request(`/organizations/${params.clerkOrgId}/invitations`, {
      method: 'POST',
      body: {
        email_address: params.email,
        role: params.clerkRole,
        inviter_user_id: params.inviterClerkUserId,
        // Round-trips onto OrganizationMembership.publicMetadata once the
        // invitee accepts — see ClerkWebhookService.resolveRoleName, which
        // is the only way to recover "invited as Viewer" vs "invited as
        // Operator" (Clerk's own role param is the coarse org:admin/
        // org:member split, confirmed against Clerk's current API docs).
        public_metadata: { appRole: params.appRole },
      },
    });
  }

  async updateMembershipRole(params: {
    clerkOrgId: string;
    clerkUserId: string;
    clerkRole: ClerkOrgRole;
  }): Promise<void> {
    await this.request(`/organizations/${params.clerkOrgId}/memberships/${params.clerkUserId}`, {
      method: 'PATCH',
      body: { role: params.clerkRole },
    });
  }

  async updateMembershipMetadata(params: {
    clerkOrgId: string;
    clerkUserId: string;
    appRole: string;
  }): Promise<void> {
    await this.request(
      `/organizations/${params.clerkOrgId}/memberships/${params.clerkUserId}/metadata`,
      { method: 'PATCH', body: { public_metadata: { appRole: params.appRole } } },
    );
  }

  async removeMembership(params: { clerkOrgId: string; clerkUserId: string }): Promise<void> {
    await this.request(`/organizations/${params.clerkOrgId}/memberships/${params.clerkUserId}`, {
      method: 'DELETE',
    });
  }

  private async request(path: string, init: { method: string; body?: unknown }): Promise<void> {
    const res = await fetch(`${CLERK_API_BASE}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new BadGatewayException(`Clerk API call failed: ${res.status} ${detail}`);
    }
  }
}
