import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { permissionKeys } from '../../../apps/api/src/modules/resources/catalog';
const db = new PrismaClient();
async function main() {
  const env = z
    .object({
      BOOTSTRAP_ORGANIZATION: z.string().min(2),
      BOOTSTRAP_SLUG: z.string().regex(/^[a-z0-9-]+$/),
      BOOTSTRAP_ADMIN_NAME: z.string().min(2),
      BOOTSTRAP_ADMIN_EMAIL: z.email(),
      BOOTSTRAP_ADMIN_PASSWORD: z.string().min(14).max(128),
    })
    .parse(process.env);
  const passwordHash = await hash(env.BOOTSTRAP_ADMIN_PASSWORD, 12);
  await db.$transaction(
    async (tx) => {
      if (await tx.organization.findUnique({ where: { slug: env.BOOTSTRAP_SLUG } }))
        throw new Error('Organization already exists; provision never overwrites existing access');
      const org = await tx.organization.create({
        data: { name: env.BOOTSTRAP_ORGANIZATION, slug: env.BOOTSTRAP_SLUG },
      });
      const role = await tx.role.create({
        data: { organizationId: org.id, name: 'Super Admin', scope: 'ORGANIZATION' },
      });
      await tx.permission.createMany({
        skipDuplicates: true,
        data: permissionKeys.map((key) => ({ key, description: key.replace(':', ' ') })),
      });
      const permissions = await tx.permission.findMany({ where: { key: { in: permissionKeys } } });
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({
          organizationId: org.id,
          roleId: role.id,
          permissionId: p.id,
        })),
      });
      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          name: env.BOOTSTRAP_ADMIN_NAME,
          email: env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase(),
          passwordHash,
          roleId: role.id,
        },
      });
      await tx.businessUnit.createMany({
        data: [
          { organizationId: org.id, name: 'Viagreen', code: 'VIAGREEN', createdBy: user.id },
          { organizationId: org.id, name: 'Anthrasite', code: 'ANTHRASITE', createdBy: user.id },
        ],
      });
      for (const [name, scope] of [
        ['Business Manager', 'BUSINESS_UNIT'],
        ['Operations Manager', 'ASSIGNED'],
        ['Site Supervisor', 'ASSIGNED'],
        ['Worker', 'ASSIGNED'],
        ['Finance/Admin', 'BUSINESS_UNIT'],
      ])
        await tx.role.create({ data: { organizationId: org.id, name, scope, createdBy: user.id } });
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          actorId: user.id,
          entity: 'organization',
          entityId: org.id,
          action: 'PROVISION',
          createdBy: user.id,
          newValue: { name: org.name },
        },
      });
    },
    { timeout: 30000 },
  );
  console.log(
    'Organization provisioned. Sign in with the supplied administrator identity. Configure other role permissions before assigning users.',
  );
}
main()
  .catch((e) => {
    console.error(
      e instanceof z.ZodError
        ? 'Set all BOOTSTRAP_* variables with a valid email and 14+ character password.'
        : e.message,
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
