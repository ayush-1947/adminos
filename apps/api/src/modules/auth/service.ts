import { createHmac, randomBytes } from 'node:crypto';
import { compare } from 'bcryptjs';
import { db } from '../../lib/db';
import { config } from '../../config';
import { assert } from '../../lib/errors';
import type { Principal } from './policy';
export const digest = (token: string) =>
  createHmac('sha256', config.SESSION_SECRET).update(token).digest('hex');
export const newToken = () => randomBytes(48).toString('base64url');
export async function authenticate(token: string): Promise<Principal | null> {
  const session = await db.session.findFirst({
    where: { tokenHash: digest(token), expiresAt: { gt: new Date() }, deletedAt: null },
    include: {
      user: {
        include: { role: { include: { rolePermission_role: { include: { permission: true } } } } },
      },
    },
  });
  if (
    !session ||
    session.user.status !== 'ACTIVE' ||
    session.user.deletedAt ||
    session.user.role.deletedAt
  )
    return null;
  const u = session.user;
  const e = await db.employee.findFirst({
    where: { userId: u.id, organizationId: u.organizationId, deletedAt: null, status: 'ACTIVE' },
  });
  const now = new Date();
  const customer = u.role.name === 'Customer';
  const linkedClient =
    customer && u.clientId
      ? await db.client.findFirst({
          where: {
            id: u.clientId,
            organizationId: u.organizationId,
            deletedAt: null,
            status: 'ACTIVE',
          },
        })
      : null;
  const sites = customer
    ? linkedClient
      ? await db.site.findMany({
          where: { organizationId: u.organizationId, clientId: linkedClient.id, deletedAt: null },
          select: { id: true },
        })
      : []
    : e
      ? await db.site.findMany({
          where: {
            organizationId: u.organizationId,
            deletedAt: null,
            OR: [
              { managerId: e.id },
              { supervisorId: e.id },
              {
                siteAssignment_site: {
                  some: {
                    deletedAt: null,
                    startDate: { lte: now },
                    AND: [
                      { OR: [{ endDate: null }, { endDate: { gte: now } }] },
                      {
                        OR: [
                          { employeeId: e.id },
                          ...(u.role.name === 'Site Supervisor'
                            ? [{ supervisorId: e.id }, { employee: { supervisorId: e.id } }]
                            : []),
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
          select: { id: true },
        })
      : [];
  return {
    userId: u.id,
    organizationId: u.organizationId,
    businessUnitId: u.businessUnitId,
    role: u.role.name,
    scope: u.role.scope,
    permissions: u.role.rolePermission_role
      .filter((x) => !x.deletedAt)
      .map((x) => x.permission.key),
    employeeId: customer ? null : e?.id || null,
    clientId: linkedClient?.id || null,
    siteIds: sites.map((x) => x.id),
  };
}
// A constant valid hash gives nonexistent accounts the same expensive comparison path.
const dummyHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5VnKpOQpF4QDzHTU9jQZ4gLcRWkIGnK';
export async function login(email: string, password: string, requestId: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  const valid = await compare(password, user?.passwordHash || dummyHash);
  assert(
    valid && user && user.status === 'ACTIVE' && !user.deletedAt,
    401,
    'Invalid email or password',
  );
  const token = newToken();
  await db.$transaction(async (tx) => {
    await tx.session.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 8 * 3600_000),
        createdBy: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: 'LOGIN',
        entity: 'user',
        entityId: user.id,
        requestId,
      },
    });
  });
  return token;
}
