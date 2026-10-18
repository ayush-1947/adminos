import 'dotenv/config';
import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const sites = [
  {
    key: 'railwaymen-apna-ghar-jogeshwari',
    name: "Railwaymen's Apna Ghar Society, Jogeshwari",
    address: 'Shivaji Nagar, Shankarwadi, Jogeshwari East, Mumbai, Maharashtra 400060',
    latitude: 19.1289586,
    longitude: 72.8572207,
    source: 'https://yappe.in/maharashtra/mumbai/railwaymen-s-apna-ghar-chs-a-group/2305594',
  },
  {
    key: 'ismail-yusuf-college',
    name: 'Ismail Yusuf College',
    address: 'Ismail College Campus, Natwar Nagar, Jogeshwari East, Mumbai, Maharashtra 400060',
    latitude: 19.1335208,
    longitude: 72.8540501,
    source: 'https://www.ismailyusufcollege.ac.in/UserPanel/DisplayPage.aspx?page=ii',
  },
] as const;
function stableId(organizationId: string, key: string) {
  const h = createHash('sha256')
    .update(`attendance-verification:${organizationId}:${key}`)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function main() {
  const apply = process.argv.includes('--apply');
  const email = (process.env.SITE_SUPERVISOR_EMAIL || 'supervisor@example.com')
    .trim()
    .toLowerCase();
  const result = await db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { email }, include: { role: true } });
      if (
        !user ||
        user.deletedAt ||
        user.status !== 'ACTIVE' ||
        user.role.name !== 'Site Supervisor' ||
        user.role.deletedAt
      )
        throw new Error('Expected an active Site Supervisor account');
      const supervisor = await tx.employee.findFirst({
        where: {
          userId: user.id,
          organizationId: user.organizationId,
          name: 'Diya Patil',
          position: 'SUPERVISOR',
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      if (!supervisor || !supervisor.managerId)
        throw new Error('Diya Patil must have an active employee profile and reporting manager');
      const organizationId = user.organizationId,
        businessUnitId = supervisor.businessUnitId;
      const actor = await tx.user.findFirst({
        where: {
          organizationId,
          email: (process.env.SITE_ADMIN_EMAIL || 'admin@useless.example').trim().toLowerCase(),
          status: 'ACTIVE',
          deletedAt: null,
          role: { name: 'Super Admin', scope: 'ORGANIZATION', deletedAt: null },
        },
      });
      if (!actor) throw new Error('Expected an active Super Admin in the same organization');
      const manager = await tx.employee.findFirst({
        where: {
          id: supervisor.managerId,
          organizationId,
          businessUnitId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      if (!manager) throw new Error('Reporting manager is unavailable');
      const common = { organizationId, businessUnitId, createdBy: actor.id, updatedBy: actor.id };
      const clientId = stableId(organizationId, 'internal-client');
      const client = await tx.client.findUnique({ where: { id: clientId } });
      if (
        client &&
        (client.organizationId !== organizationId ||
          client.businessUnitId !== businessUnitId ||
          client.deletedAt ||
          client.status !== 'ACTIVE')
      )
        throw new Error('Internal test client is unavailable; no records changed');
      if (!client && apply)
        await tx.client.create({
          data: {
            ...common,
            id: clientId,
            name: 'Geolocation verification sites',
            company: 'Internal attendance testing',
            managerId: manager.id,
          },
        });
      const results = [];
      for (const site of sites) {
        const id = stableId(organizationId, site.key);
        const matches = await tx.site.findMany({
          where: {
            organizationId,
            OR: [{ id }, { name: { equals: site.name, mode: 'insensitive' } }],
          },
        });
        if (matches.length > 1)
          throw new Error(`Multiple records match ${site.name}; no records changed`);
        const existing = matches[0];
        if (
          existing &&
          (existing.businessUnitId !== businessUnitId ||
            existing.deletedAt ||
            existing.status !== 'ACTIVE' ||
            (existing.supervisorId && existing.supervisorId !== supervisor.id) ||
            (existing.managerId && existing.managerId !== manager.id))
        )
          throw new Error(`Existing site has conflicting ownership or status: ${site.name}`);
        if (existing && (existing.latitude === null) !== (existing.longitude === null))
          throw new Error(`Configure both coordinates for ${site.name}`);
        // Preserve subsequent admin corrections to a site's GPS pin on reruns.
        const latitude = existing?.latitude ?? site.latitude,
          longitude = existing?.longitude ?? site.longitude;
        const changed =
          !existing ||
          existing.supervisorId !== supervisor.id ||
          existing.managerId !== manager.id ||
          existing.latitude === null;
        if (apply && changed) {
          const saved = existing
            ? await tx.site.update({
                where: { id: existing.id },
                data: {
                  supervisorId: supervisor.id,
                  managerId: manager.id,
                  latitude,
                  longitude,
                  updatedBy: actor.id,
                },
              })
            : await tx.site.create({
                data: {
                  ...common,
                  id,
                  name: site.name,
                  address: site.address,
                  latitude,
                  longitude,
                  clientId,
                  supervisorId: supervisor.id,
                  managerId: manager.id,
                },
              });
          await tx.auditLog.create({
            data: {
              organizationId,
              businessUnitId,
              siteId: saved.id,
              actorId: actor.id,
              entity: 'site',
              entityId: saved.id,
              action: 'PROVISION_GEO_TEST_SITE',
              newValue: {
                name: saved.name,
                supervisorId: supervisor.id,
                latitude,
                longitude,
                purpose: 'Administrator-requested geolocation attendance verification',
                coordinateSource: site.source,
              },
            },
          });
        }
        results.push({
          id: existing?.id || id,
          name: site.name,
          latitude,
          longitude,
          operation: changed ? (existing ? 'ASSIGN' : 'CREATE') : 'UNCHANGED',
        });
      }
      return {
        apply,
        supervisor: supervisor.name,
        sites: results,
        totalAssignedSites: await tx.site.count({
          where: { organizationId, supervisorId: supervisor.id, deletedAt: null, status: 'ACTIVE' },
        }),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
  );
  console.log(JSON.stringify(result, null, 2));
  if (!apply) console.log('Dry run only. Pass --apply to create or assign the two sites.');
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
