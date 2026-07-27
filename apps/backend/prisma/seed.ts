import { join } from 'path';

import { config } from 'dotenv';

import { PrismaClient } from '@prisma/client';

// Unlike the app (ConfigModule), nothing loads .env into this standalone
// script automatically — do it ourselves. Resolved from this file's own
// location so it works regardless of the directory `npm run prisma:seed`
// is invoked from.
config({ path: join(__dirname, '..', '.env') });

// Connects using DATABASE_URL, same as the app.
const prisma = new PrismaClient();

// Keys follow the resource:action shape used throughout the backend plan
// (see the @RequirePermission('orders:write') example in §3).
const PERMISSIONS = [
  { key: 'tenant:read', description: 'View tenant profile and settings' },
  { key: 'tenant:manage', description: 'Rename tenant, change plan, delete tenant' },
  { key: 'members:read', description: 'View the list of tenant members' },
  { key: 'members:manage', description: 'Invite, remove, and change the role of members' },
  { key: 'integrations:read', description: 'View connected integrations and their status' },
  { key: 'integrations:test', description: 'Fire a live test call against a connected integration' },
  { key: 'integrations:manage', description: 'Connect, configure, and disconnect integrations' },
  { key: 'orders:read', description: 'View orders and their workflow timeline' },
  { key: 'orders:write', description: 'Retry workflows and override order status' },
  { key: 'billing:read', description: 'View the current plan and billing history' },
  { key: 'billing:manage', description: 'Change plan and payment details' },
  { key: 'audit:read', description: 'View the tenant audit log' },
] as const;

// Mirrors the role/permission matrix in the backend plan §3.
const SYSTEM_ROLES: {
  name: string;
  description: string;
  permissionKeys: (typeof PERMISSIONS)[number]['key'][];
}[] = [
  {
    name: 'Owner',
    description: 'Full control, including billing and tenant deletion',
    permissionKeys: [
      'tenant:read',
      'tenant:manage',
      'members:read',
      'members:manage',
      'integrations:read',
      'integrations:test',
      'integrations:manage',
      'orders:read',
      'orders:write',
      'billing:read',
      'billing:manage',
      'audit:read',
    ],
  },
  {
    name: 'Admin',
    description: 'Manages members and integrations; no billing or tenant deletion',
    permissionKeys: [
      'tenant:read',
      'members:read',
      'members:manage',
      'integrations:read',
      'integrations:test',
      'integrations:manage',
      'orders:read',
      'orders:write',
      'billing:read',
      'audit:read',
    ],
  },
  {
    name: 'Operator',
    description: 'Runs day-to-day order operations; no member or integration management',
    permissionKeys: [
      'members:read',
      'integrations:read',
      'integrations:test',
      'orders:read',
      'orders:write',
    ],
  },
  {
    name: 'Viewer',
    description: 'Read-only access to integrations and orders',
    permissionKeys: ['members:read', 'integrations:read', 'orders:read'],
  },
];

async function main() {
  const permissionsByKey = new Map<string, string>();

  for (const permission of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { description: permission.description },
    });
    permissionsByKey.set(row.key, row.id);
  }

  for (const role of SYSTEM_ROLES) {
    // System roles are the only rows in `roles` with tenant_id IS NULL;
    // @@unique([tenantId, name]) doesn't accept a bare null in a `where`,
    // so system roles are looked up by name among tenantId-null rows
    // instead of going through the compound unique.
    const existing = await prisma.role.findFirst({
      where: { tenantId: null, name: role.name },
    });

    const roleRow = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { description: role.description, isSystem: true },
        })
      : await prisma.role.create({
          data: {
            name: role.name,
            description: role.description,
            isSystem: true,
            tenantId: null,
          },
        });

    const permissionIds = role.permissionKeys.map((key) => {
      const id = permissionsByKey.get(key);
      if (!id) throw new Error(`Unknown permission key "${key}" on role "${role.name}"`);
      return id;
    });

    // Declarative sync: this role's permission set is exactly
    // `permissionIds`, so drop anything no longer listed and add anything
    // new, rather than only ever appending.
    await prisma.rolePermission.deleteMany({
      where: { roleId: roleRow.id, permissionId: { notIn: permissionIds } },
    });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: roleRow.id, permissionId })),
      skipDuplicates: true,
    });

    console.log(`Seeded role "${role.name}" with ${permissionIds.length} permissions`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
