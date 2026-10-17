import { z } from 'zod';
import { hash } from 'bcryptjs';
import { db } from '../../lib/db';
import { assert } from '../../lib/errors';
import { requirePermission, type Principal } from './policy';
import { passwordSchema } from './password';
export const userSchema = z.strictObject({
  name: z.string().min(2).max(100),
  email: z.email(),
  password: passwordSchema,
  roleId: z.uuid(),
  businessUnitId: z.uuid().nullable(),
  employeeId: z.uuid().optional(),
  clientId: z.uuid().optional(),
});
export async function createUser(body: unknown, p: Principal, requestId: string) {
  requirePermission(p, 'users:manage');
  assert(p.scope === 'ORGANIZATION', 403, 'Organization administrators manage users');
  const data = userSchema.parse(body);
  const role = await db.role.findFirst({
    where: { id: data.roleId, organizationId: p.organizationId, deletedAt: null },
  });
  assert(role, 422, 'Role not found');
  if (role.scope !== 'ORGANIZATION')
    assert(data.businessUnitId, 422, 'Scoped roles require a business unit');
  if (data.businessUnitId)
    assert(
      await db.businessUnit.findFirst({
        where: { id: data.businessUnitId, organizationId: p.organizationId, deletedAt: null },
      }),
      422,
      'Business unit not found',
    );
  if (data.employeeId)
    assert(
      await db.employee.findFirst({
        where: {
          id: data.employeeId,
          organizationId: p.organizationId,
          businessUnitId: data.businessUnitId || undefined,
          userId: null,
          deletedAt: null,
        },
      }),
      422,
      'Employee is unavailable or already linked to a user',
    );
  if (role.name === 'Customer') {
    assert(
      data.clientId && !data.employeeId,
      422,
      'Customers require a client profile, without an employee profile',
    );
    assert(
      await db.client.findFirst({
        where: {
          id: data.clientId,
          organizationId: p.organizationId,
          businessUnitId: data.businessUnitId || undefined,
          deletedAt: null,
          status: 'ACTIVE',
        },
      }),
      422,
      'Client is unavailable in this business unit',
    );
  } else assert(!data.clientId, 422, 'Only customer accounts may link a client');
  if (role.scope === 'ASSIGNED' && role.name !== 'Customer')
    assert(data.employeeId, 422, 'Assigned roles require an employee profile');
  const passwordHash = await hash(data.password, 12);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: p.organizationId,
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        roleId: role.id,
        businessUnitId: data.businessUnitId,
        clientId: data.clientId,
        createdBy: p.userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        status: true,
        businessUnitId: true,
      },
    });
    if (data.employeeId) {
      const linked = await tx.employee.updateMany({
        where: {
          id: data.employeeId,
          organizationId: p.organizationId,
          businessUnitId: data.businessUnitId || undefined,
          userId: null,
          deletedAt: null,
        },
        data: { userId: user.id, updatedBy: p.userId },
      });
      assert(linked.count === 1, 409, 'Employee is unavailable or already linked to a user');
    }
    await tx.auditLog.create({
      data: {
        organizationId: p.organizationId,
        actorId: p.userId,
        action: 'CREATE_USER',
        entity: 'user',
        entityId: user.id,
        newValue: user,
        requestId,
      },
    });
    return user;
  });
}
