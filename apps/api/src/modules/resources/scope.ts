import type { Principal } from '../auth/policy';
import { catalog } from './catalog';
import type { Row } from '../../lib/db';
const unavailableId = '00000000-0000-0000-0000-000000000000';
export function scopeFor(key: string, p: Principal): Row {
  const r = catalog[key];
  const s: Row = { organizationId: p.organizationId, deletedAt: null };
  if (p.scope === 'BUSINESS_UNIT' || p.scope === 'ASSIGNED') {
    if (r.unit) s.businessUnitId = p.businessUnitId || '00000000-0000-0000-0000-000000000000';
    if (key === 'business-units') s.id = p.businessUnitId || unavailableId;
    if (key === 'contacts') s.client = scopeFor('clients', p);
    if (key === 'follow-ups') s.lead = scopeFor('leads', p);
    if (key === 'spare-parts') s.maintenance = scopeFor('maintenance', p);
  }
  if (p.scope === 'ASSIGNED') {
    if (r.site) s.siteId = { in: p.siteIds };
    if (key === 'sites') {
      if (p.role === 'Operations Manager' && p.employeeId) s.managerId = p.employeeId;
      else s.id = { in: p.siteIds };
    }
    if (key === 'clients') s.site_client = { some: { id: { in: p.siteIds }, deletedAt: null } };
    if (key === 'contracts') s.site_contract = { some: { id: { in: p.siteIds }, deletedAt: null } };
    if (key === 'employees') {
      const now = new Date();
      s.OR = [
        ...(p.employeeId ? [{ id: p.employeeId }] : []),
        ...(p.role === 'Operations Manager' && p.employeeId ? [{ managerId: p.employeeId }] : []),
        { site_manager: { some: { id: { in: p.siteIds }, deletedAt: null } } },
        { site_supervisor: { some: { id: { in: p.siteIds }, deletedAt: null } } },
        {
          siteAssignment_employee: {
            some: {
              siteId: { in: p.siteIds },
              deletedAt: null,
              startDate: { lte: now },
              OR: [{ endDate: null }, { endDate: { gte: now } }],
            },
          },
        },
      ];
    }
    if (key === 'documents' && ['Operations Manager', 'Business Manager'].includes(p.role)) {
      delete s.siteId;
      s.OR = [
        { siteId: { in: p.siteIds } },
        { employee: scopeFor('employees', p) },
        { client: scopeFor('clients', p) },
      ];
    }
    if (p.role === 'Customer') {
      if (key === 'clients') s.id = p.clientId || '00000000-0000-0000-0000-000000000000';
      if (key === 'tickets') s.clientId = p.clientId || '00000000-0000-0000-0000-000000000000';
    }
    if (p.role === 'Worker') {
      if (key === 'employees') {
        delete s.OR;
        s.id = p.employeeId || unavailableId;
      }
      if (['attendance', 'assignments'].includes(key)) s.employeeId = p.employeeId || unavailableId;
      if (key === 'tasks') s.assigneeId = p.employeeId || unavailableId;
      if (key === 'waste') s.workerId = p.employeeId || unavailableId;
      if (key === 'tickets') s.createdBy = p.userId;
    }
  }
  if (key === 'notifications') s.userId = p.userId;
  return s;
}
