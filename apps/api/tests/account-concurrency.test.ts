import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { createUser } from '../src/modules/auth/admin';
import type { Principal } from '../src/modules/auth/policy';

const marker = randomUUID();
let organizationId: string | undefined;
afterAll(async () => {
  if (organizationId) {
    for (const model of ['auditLog', 'employee', 'user', 'role', 'businessUnit'] as const)
      await (db[model] as any).deleteMany({ where: { organizationId } });
    await db.organization.delete({ where: { id: organizationId } });
  }
  await db.$disconnect();
});

describe('Account linking against PostgreSQL', () => {
  it('allows only one concurrent account claim and rolls back the losing user', async () => {
    const org = await db.organization.create({
      data: { name: 'Concurrency fixture', slug: `claim-${marker}` },
    });
    organizationId = org.id;
    const unit = await db.businessUnit.create({
      data: { organizationId, name: 'Unit', code: 'VIAGREEN' },
    });
    const role = await db.role.create({
      data: { organizationId, name: 'Worker', scope: 'ASSIGNED' },
    });
    const employee = await db.employee.create({
      data: {
        organizationId,
        businessUnitId: unit.id,
        employeeCode: 'CLAIM',
        name: 'Synthetic employee',
        position: 'WORKER',
      },
    });
    const admin = await db.user.create({
      data: {
        organizationId,
        roleId: role.id,
        name: 'Synthetic administrator',
        email: `admin-${marker}@example.invalid`,
        passwordHash: 'unused-session-test',
      },
    });
    const p: Principal = {
      userId: admin.id,
      organizationId,
      businessUnitId: unit.id,
      role: 'Super Admin',
      scope: 'ORGANIZATION',
      permissions: ['users:manage'],
      employeeId: null,
      siteIds: [],
    };
    const body = {
      name: 'Synthetic account',
      password: 'synthetic-password-1234',
      roleId: role.id,
      businessUnitId: unit.id,
      employeeId: employee.id,
    };
    const results = await Promise.allSettled(
      [0, 1].map((index) =>
        createUser({ ...body, email: `claim-${index}-${marker}@example.invalid` }, p, randomUUID()),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const users = await db.user.findMany({ where: { organizationId, id: { not: admin.id } } });
    expect(users).toHaveLength(1);
    expect((await db.employee.findUniqueOrThrow({ where: { id: employee.id } })).userId).toBe(
      users[0].id,
    );
    expect(await db.auditLog.count({ where: { organizationId, action: 'CREATE_USER' } })).toBe(1);
  });
});
