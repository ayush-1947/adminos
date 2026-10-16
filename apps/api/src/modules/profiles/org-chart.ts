import { db } from '../../lib/db';
import { requirePermission, type Principal } from '../auth/policy';
import { scopeFor } from '../resources/scope';

// Chart data deliberately excludes identity documents, pay and private profile fields.
export async function orgChart(p: Principal) {
  requirePermission(p, 'employees:read');
  const tenant = { organizationId: p.organizationId, deletedAt: null };
  const now = new Date();
  const select = {
    id: true,
    name: true,
    position: true,
    managerId: true,
    supervisorId: true,
  } as const;
  const [visible, sites] = await Promise.all([
    db.employee.findMany({ where: scopeFor('employees', p), select, orderBy: { name: 'asc' } }),
    db.site.findMany({
      where: scopeFor('sites', p),
      select: {
        id: true,
        name: true,
        address: true,
        managerId: true,
        supervisorId: true,
        client: {
          select: {
            id: true,
            name: true,
            deletedAt: true,
            contactPerson: true,
            phone: true,
            email: true,
            contact_client: {
              where: tenant,
              select: { id: true, name: true, position: true, phone: true, email: true },
            },
          },
        },
        siteAssignment_site: {
          where: {
            ...tenant,
            startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);
  const people = new Map(visible.map((person) => [person.id, person]));
  let pending = sites.flatMap((site) => [
    site.managerId,
    site.supervisorId,
    ...site.siteAssignment_site.flatMap((a) => [a.employeeId, a.supervisorId]),
  ]);
  const visited = new Set<string>();
  while (true) {
    const ids = [
      ...new Set([
        ...pending,
        ...Array.from(people.values()).flatMap((e) => [e.supervisorId, e.managerId]),
      ]),
    ].filter((id): id is string => !!id && !people.has(id) && !visited.has(id));
    if (!ids.length) break;
    ids.forEach((id) => visited.add(id));
    const ancestors = await db.employee.findMany({ where: { ...tenant, id: { in: ids } }, select });
    ancestors.forEach((person) => people.set(person.id, person));
    pending = [];
  }
  return {
    people: Array.from(people.values()),
    sites: sites.map(({ client, siteAssignment_site, ...site }) => ({
      ...site,
      client: client.deletedAt
        ? null
        : {
            id: client.id,
            name: client.name,
            contactPerson: client.contactPerson,
            phone: client.phone,
            email: client.email,
            contacts: client.contact_client,
          },
      assignments: siteAssignment_site.map((a) => ({
        employeeId: a.employeeId,
        supervisorId: a.supervisorId,
      })),
    })),
    collapseManagers: p.role === 'Super Admin',
  };
}
