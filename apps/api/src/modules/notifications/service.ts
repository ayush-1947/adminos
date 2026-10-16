import { db, repository, type Row } from '../../lib/db';
import { scopeFor } from '../resources/scope';
import type { Principal } from '../auth/policy';
export async function refreshNotifications(p: Principal) {
  const now = new Date(),
    soon = new Date(Date.now() + 30 * 86400000);
  const rules = [
    {
      key: 'contracts',
      model: 'contract',
      where: { endDate: { lte: soon }, renewalStatus: { not: 'RENEWED' } },
      kind: 'CONTRACT_EXPIRY',
      message: 'Contract expires within 30 days or has expired',
    },
    {
      key: 'documents',
      model: 'document',
      where: { expiresAt: { lte: soon } },
      kind: 'DOCUMENT_EXPIRY',
      message: 'Document expires within 30 days or has expired',
    },
    {
      key: 'machines',
      model: 'machine',
      where: { maintenanceDue: { lte: soon } },
      kind: 'MAINTENANCE_DUE',
      message: 'Machine maintenance is due within 30 days',
    },
    {
      key: 'machines',
      model: 'machine',
      where: { status: { in: ['OFFLINE', 'ERROR'] } },
      kind: 'MACHINE_OFFLINE',
      message: 'Machine requires operational attention',
    },
    {
      key: 'tickets',
      model: 'ticket',
      where: { dueAt: { lt: now }, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      kind: 'TICKET_OVERDUE',
      message: 'Ticket resolution SLA has passed',
    },
    {
      key: 'invoices',
      model: 'invoice',
      where: { dueAt: { lt: now }, status: { not: 'PAID' } },
      kind: 'PAYMENT_OVERDUE',
      message: 'Invoice payment is overdue',
    },
    {
      key: 'attendance',
      model: 'attendance',
      where: { checkOut: null, checkIn: { lt: new Date(Date.now() - 16 * 3600000) } },
      kind: 'MISSING_CHECKOUT',
      message: 'Attendance has been open for over 16 hours',
    },
  ];
  let count = 0;
  for (const rule of rules) {
    if (!p.permissions.includes(`${rule.key}:read`)) continue;
    const records: Row[] = await repository(rule.model).findMany({
      where: { AND: [scopeFor(rule.key, p), rule.where] },
      take: 500,
    });
    for (const record of records) {
      await db.notification.upsert({
        where: {
          dedupeKey: `${p.userId}:${rule.kind}:${record.id}:${now.toISOString().slice(0, 10)}`,
        },
        update: {},
        create: {
          organizationId: p.organizationId,
          businessUnitId: record.businessUnitId,
          siteId: record.siteId,
          userId: p.userId,
          name: record.name || 'Attendance anomaly',
          message: rule.message,
          kind: rule.kind,
          dedupeKey: `${p.userId}:${rule.kind}:${record.id}:${now.toISOString().slice(0, 10)}`,
          createdBy: p.userId,
        },
      });
      count++;
    }
  }
  return { evaluated: count };
}
