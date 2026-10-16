import { HttpError } from '../../lib/errors';
export type Principal = {
  userId: string;
  organizationId: string;
  businessUnitId: string | null;
  role: string;
  scope: string;
  permissions: string[];
  employeeId: string | null;
  clientId?: string | null;
  siteIds: string[];
};
export function requirePermission(p: Principal, permission: string) {
  if (!p.permissions.includes(permission))
    throw new HttpError(403, 'You do not have permission for this action');
}
export function tenantScope(p: Principal, unit = false, site = false): Record<string, unknown> {
  const scope: Record<string, unknown> = { organizationId: p.organizationId, deletedAt: null };
  if (p.scope === 'BUSINESS_UNIT')
    scope.businessUnitId = p.businessUnitId || '00000000-0000-0000-0000-000000000000';
  if (p.scope === 'ASSIGNED' && site) scope.siteId = { in: p.siteIds };
  if (p.scope === 'ASSIGNED' && unit && !site)
    scope.businessUnitId = p.businessUnitId || '00000000-0000-0000-0000-000000000000';
  return scope;
}
