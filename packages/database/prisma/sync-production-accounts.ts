// Targeted credential synchronization. Does not insert demo operational data.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { passwordSchema } from '../../../apps/api/src/modules/auth/password';
const db = new PrismaClient();
const accounts = [
  ['ADMIN', 'Super Admin'],
  ['MANAGER', 'Operations Manager'],
  ['CUSTOMER', 'Customer'],
  ['ACCOUNTANT', 'Accountant'],
  ['SUPERVISOR', 'Site Supervisor'],
] as const;
async function main() {
  const prepared = [];
  for (const [key, role] of accounts) {
    const email = process.env[`SEED_${key}_EMAIL`]?.trim().toLowerCase();
    const password = passwordSchema.parse(process.env[`SEED_${key}_PASSWORD`]);
    if (!email) throw new Error(`SEED_${key}_EMAIL is required`);
    const user = await db.user.findUnique({ where: { email }, include: { role: true } });
    if (!user || user.role.name !== role || user.deletedAt)
      throw new Error(`Expected existing ${key} account with correct role`);
    prepared.push({ user, password, passwordHash: await hash(password, 12) });
  }
  const org = prepared[0].user.organizationId;
  if (prepared.some((x) => x.user.organizationId !== org))
    throw new Error('Accounts belong to different organizations');
  const supervisor = await db.employee.findFirstOrThrow({
    where: { userId: prepared[4].user.id, organizationId: org, deletedAt: null },
  });
  const now = new Date();
  const sites = await db.site.findMany({
    where: {
      organizationId: org,
      deletedAt: null,
      OR: [
        { supervisorId: supervisor.id },
        {
          siteAssignment_site: {
            some: {
              deletedAt: null,
              startDate: { lte: now },
              OR: [{ endDate: null }, { endDate: { gte: now } }],
              AND: [
                {
                  OR: [
                    { supervisorId: supervisor.id },
                    { employee: { supervisorId: supervisor.id } },
                    { employeeId: supervisor.id },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
  });
  const assignments = await db.siteAssignment.findMany({
    where: {
      organizationId: org,
      deletedAt: null,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      siteId: { in: sites.map((s) => s.id) },
      employee: { position: 'WORKER', deletedAt: null, status: 'ACTIVE' },
      AND: [
        { OR: [{ supervisorId: supervisor.id }, { employee: { supervisorId: supervisor.id } }] },
      ],
    },
  });
  if (
    supervisor.name !== 'Diya Patil' ||
    sites.length !== 2 ||
    new Set(assignments.map((a) => a.employeeId)).size !== 8
  )
    throw new Error(
      'Supervisor must be Diya Patil with exactly 2 sites and 8 workers; no changes applied',
    );
  await db.$transaction(
    async (tx) => {
      for (const entry of prepared) {
        await tx.user.update({
          where: { id: entry.user.id },
          data: { passwordHash: entry.passwordHash, status: 'ACTIVE' },
        });
        await tx.session.deleteMany({ where: { userId: entry.user.id, organizationId: org } });
        await tx.auditLog.create({
          data: {
            organizationId: org,
            actorId: prepared[0].user.id,
            action: 'REQUESTED_CREDENTIAL_SYNC',
            entity: 'user',
            entityId: entry.user.id,
          },
        });
      }
    },
    { timeout: 30000 },
  );
  for (const entry of prepared) {
    const user = await db.user.findUniqueOrThrow({ where: { id: entry.user.id } });
    if (!(await compare(entry.password, user.passwordHash)))
      throw new Error('Credential verification failed');
  }
  console.log(
    JSON.stringify({
      accountsVerified: prepared.length,
      supervisor: supervisor.name,
      sites: sites.length,
      workers: new Set(assignments.map((a) => a.employeeId)).size,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e.name === 'ZodError' ? 'Invalid account password configuration' : e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
