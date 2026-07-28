import { join } from 'path';

import { config } from 'dotenv';

import { PrismaClient } from '@prisma/client';

config({ path: join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY!;
const CLERK_API = 'https://api.clerk.com/v1';

async function clerkFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${CLERK_API}${path}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Clerk API ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res.json() as Promise<T>;
}

async function clerkList<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  const limit = 500;
  let offset = 0;
  while (true) {
    const res = await clerkFetch<{ data?: T[]; total_count?: number } | T[]>(
      `${path}${path.includes('?') ? '&' : '?'}limit=${limit}&offset=${offset}`,
    );
    const data = Array.isArray(res) ? res : res.data;
    if (!data) {
      throw new Error(`Unexpected Clerk API response format for ${path}`);
    }
    all.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

interface ClerkOrg {
  id: string;
  name: string;
  slug: string;
  created_by: string;
}

interface ClerkUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string }[];
}

interface ClerkMembership {
  role: 'org:admin' | 'org:member';
  public_metadata: Record<string, unknown>;
  organization: { id: string };
  public_user_data: { user_id: string };
}

async function syncOrganizations() {
  const orgs = await clerkList<ClerkOrg>('/organizations');
  for (const org of orgs) {
    await prisma.tenant.upsert({
      where: { clerkOrgId: org.id },
      create: {
        clerkOrgId: org.id,
        slug: org.slug || org.id,
        name: org.name,
        plan: 'TRIAL',
        status: 'ACTIVE',
      },
      update: { name: org.name, slug: org.slug || org.id },
    });
    console.log(`  Synced org: ${org.name} (${org.id})`);
  }
  return orgs;
}

async function syncUsers() {
  const users = await clerkList<ClerkUser>('/users');
  for (const u of users) {
    const email =
      u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ??
      u.email_addresses[0]?.email_address;
    if (!email) {
      console.log(`  Skipping user ${u.id} (no email)`);
      continue;
    }
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
    await prisma.user.upsert({
      where: { clerkUserId: u.id },
      create: { clerkUserId: u.id, email, name },
      update: { email, name },
    });
    console.log(`  Synced user: ${email}`);
  }
  return users;
}

async function syncMemberships(orgs: ClerkOrg[]) {
  for (const org of orgs) {
    const memberships = await clerkList<ClerkMembership>(
      `/organizations/${org.id}/memberships`,
    );

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: org.id },
    });
    if (!tenant) {
      console.log(`  Skipping memberships for unknown org ${org.id}`);
      continue;
    }

    for (const m of memberships) {
      // The org creator gets Owner via created_by at the end — skip them
      // here to avoid a redundant upsert just to overwrite it.
      if (m.public_user_data.user_id === org.created_by) continue;

      const user = await prisma.user.findUnique({
        where: { clerkUserId: m.public_user_data.user_id },
      });
      if (!user) {
        console.log(`  Skipping membership — user ${m.public_user_data.user_id} not in DB`);
        continue;
      }

      const appRoleHint =
        typeof m.public_metadata?.appRole === 'string'
          ? (m.public_metadata.appRole as string)
          : undefined;
      const roleName = resolveRoleName(m.role, appRoleHint);
      if (!roleName) continue;

      const role = await prisma.role.findFirst({
        where: { tenantId: null, name: roleName },
      });
      if (!role) {
        console.log(`  Skipping membership — system role "${roleName}" not found`);
        continue;
      }

      await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        create: {
          tenantId: tenant.id,
          userId: user.id,
          roleId: role.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        update: { roleId: role.id, status: 'ACTIVE', joinedAt: new Date() },
      });
      console.log(
        `  Synced membership: ${user.email} → ${org.name} as ${roleName}`,
      );
    }

    // The org creator is not returned in the memberships list, so create
    // the Owner membership from the org's created_by field.
    const creatorUser = await prisma.user.findUnique({
      where: { clerkUserId: org.created_by },
    });
    if (creatorUser) {
      const ownerRole = await prisma.role.findFirst({
        where: { tenantId: null, name: 'Owner' },
      });
      if (ownerRole) {
        await prisma.tenantMembership.upsert({
          where: { tenantId_userId: { tenantId: tenant.id, userId: creatorUser.id } },
          create: {
            tenantId: tenant.id,
            userId: creatorUser.id,
            roleId: ownerRole.id,
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
          update: { roleId: ownerRole.id, status: 'ACTIVE', joinedAt: new Date() },
        });
        console.log(`  Synced Owner: ${creatorUser.email} → ${org.name}`);
      }
    }
  }
}

const APP_ROLES = ['Owner', 'Admin', 'Operator', 'Viewer'];

function resolveRoleName(
  clerkOrgRole: string,
  appRoleHint?: string,
): string | null {
  if (appRoleHint && APP_ROLES.includes(appRoleHint)) {
    return appRoleHint;
  }
  if (clerkOrgRole === 'org:admin') {
    return 'Admin';
  }
  return 'Operator';
}

async function main() {
  console.log('Syncing organizations from Clerk...');
  const orgs = await syncOrganizations();

  console.log('Syncing users from Clerk...');
  await syncUsers();

  console.log('Syncing memberships from Clerk...');
  await syncMemberships(orgs);

  console.log('Clerk sync complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
