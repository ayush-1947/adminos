import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, repository, type Row } from '../../lib/db';
import { assert, HttpError } from '../../lib/errors';
import { catalog } from './catalog';
import { inputSchema } from './validation';
import { scopeFor } from './scope';
import { requirePermission, type Principal } from '../auth/policy';
import { attendanceFlags } from '../attendance/domain';
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).default(''),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  status: z.string().max(40).optional(),
  businessUnitId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export function getResource(key: string) {
  const r = catalog[key];
  assert(r, 404, 'Module not found');
  return r;
}
export function listWhere(key: string, p: Principal, query: unknown) {
  const r = getResource(key);
  const q = querySchema.parse(query);
  const where: Row = { AND: [scopeFor(key, p)] };
  if (q.search && r.search.length)
    where.AND.push({
      OR: r.search.map((f) => ({ [f]: { contains: q.search, mode: 'insensitive' } })),
    });
  const statuses = r.statusFilters || r.fields.find((f) => f.key === 'status')?.options;
  if (q.status && statuses) {
    assert(statuses.includes(q.status), 422, 'Invalid status filter');
    where.AND.push({ status: q.status });
  }
  if (q.businessUnitId && r.unit) where.AND.push({ businessUnitId: q.businessUnitId });
  if (q.siteId && r.site) where.AND.push({ siteId: q.siteId });
  if (q.from || q.to)
    where.AND.push({
      [r.dateField || 'createdAt']: {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      },
    });
  const sort = [...r.columns, 'createdAt', 'updatedAt'].includes(q.sort) ? q.sort : 'createdAt';
  return { where, q, orderBy: { [sort]: q.order } };
}
export async function list(key: string, p: Principal, query: unknown) {
  requirePermission(p, `${key}:read`);
  const { where, q, orderBy } = listWhere(key, p, query);
  const repo = repository(getResource(key).model);
  const [rows, total] = await Promise.all([
    repo.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit }),
    repo.count({ where }),
  ]);
  return { rows, total, page: q.page, limit: q.limit };
}
export async function detail(key: string, id: string, p: Principal) {
  requirePermission(p, `${key}:read`);
  z.uuid().parse(id);
  const row = await repository(getResource(key).model).findFirst({
    where: { AND: [scopeFor(key, p), { id }] },
  });
  assert(row, 404, 'Record not found');
  return row;
}
async function checkRelationships(
  key: string,
  data: Row,
  p: Principal,
  tx: Prisma.TransactionClient,
) {
  const r = getResource(key);
  const related: Row = {};
  for (const f of r.fields.filter((f) => f.type === 'relation')) {
    if (!data[f.key]) continue;
    const linked = await repository(catalog[f.resource!].model, tx).findFirst({
      where: { AND: [scopeFor(f.resource!, p), { id: data[f.key] }] },
    });
    assert(linked, 422, `${f.label} is unavailable in your scope`);
    related[f.key] = linked;
    if (data.businessUnitId && linked.businessUnitId)
      assert(
        data.businessUnitId === linked.businessUnitId,
        422,
        `${f.label} belongs to another business unit`,
      );
    if (data.siteId && linked.siteId)
      assert(data.siteId === linked.siteId, 422, `${f.label} belongs to another site`);
  }
  if (related.siteId && data.clientId)
    assert(related.siteId.clientId === data.clientId, 422, 'Client must own the selected site');
  if (related.contractId && data.clientId)
    assert(
      related.contractId.clientId === data.clientId,
      422,
      'Contract must belong to the selected client',
    );
  if (data.startDate && data.endDate)
    assert(
      new Date(data.endDate) >= new Date(data.startDate),
      422,
      'End date must be after start date',
    );
  if (data.issuedAt && data.dueAt)
    assert(
      new Date(data.dueAt) >= new Date(data.issuedAt),
      422,
      'Invoice due date must follow issue date',
    );
  if (key === 'employees') {
    for (const field of ['supervisorId', 'managerId'])
      if (data[field]) {
        assert(data[field] !== data.id, 422, 'An employee cannot manage themselves');
        assert(
          related[field].position === (field === 'managerId' ? 'MANAGER' : 'SUPERVISOR'),
          422,
          'Hierarchy role does not match',
        );
        let cursor: Row | null = related[field];
        const visited = new Set<string>([data.id]);
        while (cursor) {
          assert(!visited.has(cursor.id), 422, 'Workforce hierarchy cannot contain a cycle');
          visited.add(cursor.id);
          cursor = cursor[field]
            ? await repository('employee', tx).findFirst({
                where: { id: cursor[field], organizationId: p.organizationId },
              })
            : null;
        }
      }
  }
  if (['waste', 'disposals'].includes(key)) {
    const bu = await tx.businessUnit.findFirst({
      where: { id: data.businessUnitId, organizationId: p.organizationId },
    });
    assert(bu?.code === 'VIAGREEN', 422, 'This workflow requires Viagreen');
  }
  if (['machines', 'production', 'maintenance'].includes(key)) {
    const bu = await tx.businessUnit.findFirst({
      where: { id: data.businessUnitId, organizationId: p.organizationId },
    });
    assert(bu?.code === 'ANTHRASITE', 422, 'This workflow requires Anthrasite');
  }
  if (['attendance', 'waste', 'production', 'tasks'].includes(key)) {
    const employeeId = data.employeeId || data.workerId || data.operatorId || data.assigneeId;
    const at = new Date(data.workDate || data.recordedAt || data.startTime || new Date());
    const assigned = await tx.siteAssignment.findFirst({
      where: {
        organizationId: p.organizationId,
        employeeId,
        siteId: data.siteId,
        deletedAt: null,
        startDate: { lte: at },
        OR: [{ endDate: null }, { endDate: { gte: at } }],
        ...(data.shiftId ? { shiftId: data.shiftId } : {}),
      },
    });
    assert(assigned, 422, 'Employee must have an active assignment at this site and shift');
  }
  if (key === 'assignments') {
    const overlaps = await tx.siteAssignment.findFirst({
      where: {
        organizationId: p.organizationId,
        employeeId: data.employeeId,
        deletedAt: null,
        id: { not: data.id || '00000000-0000-0000-0000-000000000000' },
        startDate: { lte: data.endDate || new Date('9999-01-01') },
        OR: [{ endDate: null }, { endDate: { gte: data.startDate } }],
        ...(data.isPrimary ? { isPrimary: true } : { siteId: data.siteId, shiftId: data.shiftId }),
      },
    });
    assert(!overlaps, 409, 'Overlapping assignment or primary site already exists');
  }
  if (key === 'production') {
    assert(Number(data.inputKg) > 0, 422, 'Input weight must be greater than zero');
    if (data.outputKg != null)
      assert(
        Number(data.outputKg) <= Number(data.inputKg),
        422,
        'Output cannot exceed input weight',
      );
    if (data.endTime) {
      assert(data.outputKg != null, 422, 'A completed batch needs an output weight');
      assert(
        new Date(data.endTime) > new Date(data.startTime),
        422,
        'Completion must follow batch start',
      );
    }
    if (!data.endTime) {
      assert(
        related.machineId.status === 'RUNNING',
        422,
        'Start batches only on a running machine',
      );
      const active = await tx.productionBatch.findFirst({
        where: {
          organizationId: p.organizationId,
          machineId: data.machineId,
          endTime: null,
          deletedAt: null,
          id: { not: data.id || '00000000-0000-0000-0000-000000000000' },
        },
      });
      assert(!active, 409, 'Machine already has an active batch');
    }
  }
  if (key === 'attendance') {
    assert(data.correctionReason?.trim(), 422, 'Manual attendance requires a reason');
    if (data.checkOut)
      assert(
        new Date(data.checkOut) > new Date(data.checkIn),
        422,
        'Check-out must follow check-in',
      );
    Object.assign(
      data,
      attendanceFlags(
        new Date(data.checkIn),
        data.checkOut ? new Date(data.checkOut) : null,
        related.shiftId,
      ),
    );
    data.source = 'MANUAL';
  }
  if (key === 'disposals') {
    assert(
      ['STORED', 'DISPOSED'].includes(related.wasteRecordId.stage),
      422,
      'Waste must reach storage before disposal',
    );
    const sum = await tx.disposal.aggregate({
      where: {
        wasteRecordId: data.wasteRecordId,
        organizationId: p.organizationId,
        deletedAt: null,
        id: { not: data.id || '00000000-0000-0000-0000-000000000000' },
      },
      _sum: { quantity: true },
    });
    assert(
      Number(sum._sum.quantity || 0) + Number(data.quantity) <=
        Number(related.wasteRecordId.quantity),
      422,
      'Disposal exceeds available waste',
    );
  }
  if (key === 'challans') {
    const quantity = new Prisma.Decimal(data.quantity);
    assert(
      quantity.decimalPlaces() <= 3 && quantity.lte('99999999999.999'),
      422,
      'Challan quantity supports up to 3 decimal places and must be below 100 billion',
    );
  }
  if (['waste', 'disposals', 'challans', 'invoices', 'payments', 'expenses'].includes(key))
    assert(
      Number(data.quantity ?? data.amount) > 0,
      422,
      'Quantity or amount must be greater than zero',
    );
  return related;
}
const clean = (data: Row) => JSON.parse(JSON.stringify(data));
export async function save(
  key: string,
  id: string | null,
  body: unknown,
  p: Principal,
  requestId: string,
) {
  requirePermission(p, `${key}:write`);
  assert(
    key !== 'attendance',
    422,
    'Use the daily attendance register to mark or correct attendance',
  );
  const r = getResource(key);
  assert(!r.readonly, 405, 'This resource uses a dedicated workflow');
  if (id) z.uuid().parse(id);
  if (p.role === 'Customer' && key === 'tickets') {
    assert(!id, 403, 'Customers can raise tickets; their manager handles resolution');
    const input = z
      .strictObject({
        name: z.string().trim().min(1).max(250),
        siteId: z.uuid(),
        category: z.enum(['COLLECTION', 'WORKFORCE', 'EQUIPMENT', 'SAFETY', 'CLIENT', 'OTHER']),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
        description: z.string().trim().min(1).max(5000),
      })
      .parse(body);
    const site = await db.site.findFirst({
      where: { AND: [scopeFor('sites', p), { id: input.siteId }] },
    });
    assert(
      site && p.clientId && site.clientId === p.clientId,
      403,
      'Site is outside your customer account',
    );
    body = {
      ...input,
      businessUnitId: site.businessUnitId,
      clientId: p.clientId,
      status: 'OPEN',
      dueAt: new Date(
        Date.now() +
          (input.priority === 'CRITICAL' ? 4 : input.priority === 'HIGH' ? 24 : 72) * 3600000,
      ).toISOString(),
    };
  }
  const parsed = inputSchema(r, !!id).parse(body);
  return db.$transaction(
    async (tx) => {
      const repo = repository(r.model, tx);
      const previous = id
        ? await repo.findFirst({ where: { AND: [scopeFor(key, p), { id }] } })
        : null;
      if (id) assert(previous, 404, 'Record not found');
      const merged: Row = { ...previous, ...parsed };
      if (previous)
        for (const field of r.fields.filter(
          (f) =>
            f.type === 'relation' &&
            !['supervisorId', 'managerId', 'assigneeId', 'technicianId', 'salespersonId'].includes(
              f.key,
            ),
        ))
          assert(
            merged[field.key] === previous[field.key],
            422,
            `${field.label} cannot be changed after creation; create a new record`,
          );
      if (p.role === 'Operations Manager' && key === 'employees') {
        assert(
          merged.position !== 'MANAGER' && (!previous || previous.id !== p.employeeId),
          403,
          'Managers manage supervisors and workers, not manager profiles',
        );
        assert(merged.managerId === p.employeeId, 403, 'Employees must remain in your team');
        if (merged.supervisorId)
          assert(
            await tx.employee.findFirst({
              where: {
                id: merged.supervisorId,
                organizationId: p.organizationId,
                managerId: p.employeeId,
                position: 'SUPERVISOR',
                deletedAt: null,
              },
            }),
            422,
            'Supervisor must belong to your team',
          );
      }
      if (p.role === 'Operations Manager' && key === 'sites') {
        assert(p.employeeId, 403, 'A linked manager profile is required to manage sites');
        assert(merged.managerId === p.employeeId, 403, 'Sites must remain assigned to you');
        if (merged.supervisorId)
          assert(
            await tx.employee.findFirst({
              where: {
                id: merged.supervisorId,
                organizationId: p.organizationId,
                managerId: p.employeeId,
                position: 'SUPERVISOR',
                deletedAt: null,
              },
            }),
            422,
            'Supervisor must belong to your team',
          );
      }
      const related = await checkRelationships(key, merged, p, tx);
      if (p.scope !== 'ORGANIZATION' && r.unit)
        assert(
          merged.businessUnitId === p.businessUnitId,
          403,
          'Business unit is outside your scope',
        );
      if (p.scope === 'ASSIGNED' && r.site)
        assert(p.siteIds.includes(merged.siteId), 403, 'Site is outside your assignments');
      if (p.role === 'Worker') {
        if (key === 'waste')
          assert(merged.workerId === p.employeeId, 403, 'Workers may only record their own work');
        if (key === 'tasks') {
          assert(previous?.assigneeId === p.employeeId, 403, 'Only assigned tasks may be updated');
          assert(
            Object.keys(parsed).every((k) => k === 'status'),
            403,
            'Workers may only update task status',
          );
        }
        if (key === 'tickets') {
          assert(!id, 403, 'Workers can report issues; supervisors manage resolution');
          merged.status = 'OPEN';
          merged.assigneeId = null;
        }
      }
      if (key === 'tickets') {
        const flow: Record<string, string[]> = {
          OPEN: ['OPEN', 'ASSIGNED'],
          ASSIGNED: ['ASSIGNED', 'IN_PROGRESS'],
          IN_PROGRESS: ['IN_PROGRESS', 'RESOLVED'],
          RESOLVED: ['RESOLVED', 'CLOSED', 'IN_PROGRESS'],
          CLOSED: ['CLOSED'],
        };
        if (previous)
          assert(
            flow[previous.status].includes(merged.status),
            422,
            'Invalid ticket status transition',
          );
        else assert(merged.status === 'OPEN', 422, 'New tickets must start open');
        if (['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'].includes(merged.status))
          assert(merged.assigneeId, 422, 'Assign an owner before progressing the ticket');
        merged.resolvedAt = ['RESOLVED', 'CLOSED'].includes(merged.status)
          ? previous?.resolvedAt || new Date()
          : null;
      }
      if (key === 'waste' && previous && merged.stage !== previous.stage) {
        const stages = ['COLLECTED', 'SEGREGATED', 'WEIGHED', 'STORED'];
        assert(
          stages.indexOf(merged.stage) === stages.indexOf(previous.stage) + 1,
          422,
          'Follow the collection → segregation → weighing → storage workflow',
        );
      }
      if (key === 'waste' && !previous)
        assert(merged.stage === 'COLLECTED', 422, 'New waste records start at collection');
      if (key === 'waste' && previous) {
        const disposed = await tx.disposal.aggregate({
          where: { wasteRecordId: previous.id, deletedAt: null },
          _sum: { quantity: true },
        });
        assert(
          Number(merged.quantity) >= Number(disposed._sum.quantity || 0),
          422,
          'Waste quantity cannot be below already disposed weight',
        );
      }
      if (key === 'payments') {
        assert(!id, 405, 'Payments are immutable; use a reviewed reversal process');
        const invoice = related.invoiceId;
        const paid = await tx.payment.aggregate({
          where: { invoiceId: invoice.id, organizationId: p.organizationId, deletedAt: null },
          _sum: { amount: true },
        });
        const newPaid = new Prisma.Decimal(paid._sum.amount || 0).plus(merged.amount);
        assert(newPaid.lte(invoice.amount), 422, 'Payment exceeds invoice balance');
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: newPaid.eq(invoice.amount) ? 'PAID' : 'PARTIAL', updatedBy: p.userId },
        });
      }
      if (key === 'invoices' && id) {
        const paid = await tx.payment.aggregate({
          where: { invoiceId: id, deletedAt: null },
          _sum: { amount: true },
        });
        assert(
          new Prisma.Decimal(merged.amount).gte(paid._sum.amount || 0),
          422,
          'Invoice amount cannot be below recorded payments',
        );
        merged.status = new Prisma.Decimal(merged.amount).eq(paid._sum.amount || 0)
          ? 'PAID'
          : Number(paid._sum.amount) > 0
            ? 'PARTIAL'
            : 'ISSUED';
      }
      const data: Row = Object.fromEntries(Object.keys(parsed).map((k) => [k, merged[k]]));
      for (const k of key === 'attendance'
        ? ['status', 'source', 'overtimeMinutes', 'earlyDeparture']
        : key === 'tickets'
          ? ['status', 'assigneeId', 'resolvedAt']
          : key === 'invoices' && id
            ? ['status']
            : [])
        data[k] = merged[k];
      const record = id
        ? await repo.update({ where: { id }, data: { ...data, updatedBy: p.userId } })
        : await repo.create({
            data: {
              ...data,
              organizationId: p.organizationId,
              createdBy: p.userId,
              updatedBy: p.userId,
            },
          });
      assert(
        await repo.findFirst({ where: { AND: [scopeFor(key, p), { id: record.id }] } }),
        403,
        'The resulting record would be outside your authorized scope',
      );
      if (key === 'machines' && previous?.status !== record.status)
        await tx.machineEvent.create({
          data: {
            organizationId: p.organizationId,
            businessUnitId: record.businessUnitId,
            siteId: record.siteId,
            machineId: record.id,
            name: `Status → ${record.status}`,
            kind: 'STATUS_CHANGE',
            state: record.status,
            createdBy: p.userId,
          },
        });
      if (key === 'disposals') {
        const disposed = await tx.disposal.aggregate({
          where: { wasteRecordId: record.wasteRecordId, deletedAt: null },
          _sum: { quantity: true },
        });
        if (Number(disposed._sum.quantity) >= Number(related.wasteRecordId.quantity))
          await tx.wasteRecord.update({
            where: { id: record.wasteRecordId },
            data: { stage: 'DISPOSED', updatedBy: p.userId },
          });
      }
      await tx.auditLog.create({
        data: {
          organizationId: p.organizationId,
          businessUnitId: record.businessUnitId,
          siteId: key === 'sites' ? record.id : record.siteId,
          actorId: p.userId,
          action: id ? 'UPDATE' : 'CREATE',
          entity: key,
          entityId: record.id,
          previousValue: previous ? clean(previous) : Prisma.JsonNull,
          newValue: clean(record),
          requestId,
          createdBy: p.userId,
        },
      });
      return record;
    },
    { isolationLevel: 'Serializable', timeout: 15000 },
  );
}
