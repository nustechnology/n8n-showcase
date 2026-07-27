import nock from 'nock';

import { ConfigService } from '@nestjs/config';

import { BadGatewayException } from '@nestjs/common';

import { ClerkBackendService } from './clerk-backend.service';

describe('ClerkBackendService', () => {
  let service: ClerkBackendService;
  const config = {
    getOrThrow: (key: string) => ({ CLERK_SECRET_KEY: 'sk_test_123' })[key],
  } as unknown as ConfigService;

  beforeEach(() => {
    service = new ClerkBackendService(config);
    nock.cleanAll();
  });

  afterAll(() => nock.restore());

  it('creates an invitation with the role and appRole metadata', async () => {
    nock('https://api.clerk.com')
      .post('/v1/organizations/org_1/invitations', {
        email_address: 'new@example.com',
        role: 'org:member',
        inviter_user_id: 'user_1',
        public_metadata: { appRole: 'Viewer' },
      })
      .matchHeader('authorization', 'Bearer sk_test_123')
      .reply(200, { id: 'orginv_1' });

    await expect(
      service.createInvitation({
        clerkOrgId: 'org_1',
        inviterClerkUserId: 'user_1',
        email: 'new@example.com',
        clerkRole: 'org:member',
        appRole: 'Viewer',
      }),
    ).resolves.toBeUndefined();
  });

  it('throws BadGatewayException when invitation creation fails', async () => {
    nock('https://api.clerk.com').post('/v1/organizations/org_1/invitations').reply(422, {
      errors: [{ message: 'already a member' }],
    });

    await expect(
      service.createInvitation({
        clerkOrgId: 'org_1',
        inviterClerkUserId: 'user_1',
        email: 'new@example.com',
        clerkRole: 'org:member',
        appRole: 'Viewer',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('updates a membership role', async () => {
    nock('https://api.clerk.com')
      .patch('/v1/organizations/org_1/memberships/user_2', { role: 'org:admin' })
      .reply(200, {});

    await expect(
      service.updateMembershipRole({ clerkOrgId: 'org_1', clerkUserId: 'user_2', clerkRole: 'org:admin' }),
    ).resolves.toBeUndefined();
  });

  it('updates membership metadata', async () => {
    nock('https://api.clerk.com')
      .patch('/v1/organizations/org_1/memberships/user_2/metadata', {
        public_metadata: { appRole: 'Admin' },
      })
      .reply(200, {});

    await expect(
      service.updateMembershipMetadata({ clerkOrgId: 'org_1', clerkUserId: 'user_2', appRole: 'Admin' }),
    ).resolves.toBeUndefined();
  });

  it('removes a membership', async () => {
    nock('https://api.clerk.com').delete('/v1/organizations/org_1/memberships/user_2').reply(200, {});

    await expect(
      service.removeMembership({ clerkOrgId: 'org_1', clerkUserId: 'user_2' }),
    ).resolves.toBeUndefined();
  });

  it('throws BadGatewayException when removal fails', async () => {
    nock('https://api.clerk.com').delete('/v1/organizations/org_1/memberships/user_2').reply(404);

    await expect(
      service.removeMembership({ clerkOrgId: 'org_1', clerkUserId: 'user_2' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
