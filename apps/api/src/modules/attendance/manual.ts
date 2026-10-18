import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../lib/db';
import { assert } from '../../lib/errors';
import { requirePermission, type Principal } from '../auth/policy';
import { scopeFor } from '../resources/scope';

const dateSchema = z.iso.date();
const registerSchema = z.strictObject({ date: dateSchema, siteId: z.uuid().optional() });
const saveSchema = z.strictObject({
  date: dateSchema,
  siteId: z.uuid(),
  entries: z
    .array(
      z.strictObject({
        employeeId: z.uuid(),
        status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY']),
        notes: z.string().trim().max(1000).default(''),
        version: z.iso.datetime().nullable(),
      }),
    )
    .min(1)
    .max(200),
});
const isSupervisor = (p: Principal) => p.role === 'Site Supervisor';
function authorize(p: Principal, write = false) {
  requirePermission(p, write ? 'attendance:write' : 'attendance:read');
  assert(
    ['Super Admin', 'Business Manager', 'Operations Manager', 'Site Supervisor'].includes(p.role),
    403,
    'Only supervisors and managers can mark team attendance',
  );
  if (p.scope === 'ASSIGNED')
    assert(p.employeeId, 403, 'Link your account to an employee profile first');
}
function dateWindow(date: string) {
  const start = new Date(`${date}T00:00:00+05:30`);
  return {
    start,
    end: new Date(start.getTime() + 86400000 - 1),
    workDate: new Date(`${date}T00:00:00Z`),
  };
}

async function roster(
  p: Principal,
  date: string,
  siteId: string,
  tx: Prisma.TransactionClient = db,
) {
  const site = await tx.site.findFirst({
    where: { AND: [scopeFor('sites', p), { id: siteId, status: 'ACTIVE' }] },
    select: { id: true, businessUnitId: true, supervisorId: true, name: true },
  });
  assert(site, 404, 'Site is unavailable');
  const { start, end, workDate } = dateWindow(date);
  const assignments = await tx.siteAssignment.findMany({
    where: {
      organizationId: p.organizationId,
      siteId,
      deletedAt: null,
      startDate: { lte: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
      employee: { deletedAt: null, status: 'ACTIVE' },
    },
    include: { employee: true, shift: true },
    orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
  });
  const supervisorIds = new Set(
    [
      site.supervisorId,
      ...assignments.flatMap((a) => [
        a.supervisorId,
        a.employee.supervisorId,
        ...(a.employee.position === 'SUPERVISOR' ? [a.employeeId] : []),
      ]),
    ].filter((id): id is string => !!id),
  );
  const supervisors = await tx.employee.findMany({
    where: {
      organizationId: p.organizationId,
      businessUnitId: site.businessUnitId,
      id: { in: [...supervisorIds] },
      position: 'SUPERVISOR',
      status: 'ACTIVE',
      deletedAt: null,
    },
    orderBy: { name: 'asc' },
  });
  const rows = new Map<
    string,
    {
      employeeId: string;
      name: string;
      employeeCode: string;
      position: string;
      shiftId: string | null;
    }
  >();
  for (const person of supervisors) {
    if (isSupervisor(p) && person.id !== p.employeeId) continue;
    const assignment =
      assignments.find((a) => a.employeeId === person.id) ||
      assignments.find(
        (a) => (a.supervisorId || a.employee.supervisorId || site.supervisorId) === person.id,
      );
    rows.set(person.id, {
      employeeId: person.id,
      name: person.name,
      employeeCode: person.employeeCode,
      position: person.position,
      shiftId: assignment?.shiftId || null,
    });
  }
  for (const assignment of assignments) {
    const person = assignment.employee;
    if (person.position !== 'WORKER') continue;
    const supervisorId = assignment.supervisorId || person.supervisorId || site.supervisorId;
    if (isSupervisor(p) && supervisorId !== p.employeeId) continue;
    if (!rows.has(person.id))
      rows.set(person.id, {
        employeeId: person.id,
        name: person.name,
        employeeCode: person.employeeCode,
        position: person.position,
        shiftId: assignment.shiftId,
      });
  }
  // A supervisor without workers can still mark themselves using a configured unit shift.
  const fallbackShift = await tx.shift.findFirst({
    where: {
      organizationId: p.organizationId,
      businessUnitId: site.businessUnitId,
      deletedAt: null,
    },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  const records = await tx.attendance.findMany({
    where: {
      organizationId: p.organizationId,
      siteId,
      workDate,
      employeeId: { in: [...rows.keys()] },
      deletedAt: null,
    },
  });
  return {
    site,
    workDate,
    rows: [...rows.values()].map((person) => {
      const record = records.find((a) => a.employeeId === person.employeeId);
      const locked =
        isSupervisor(p) && (person.employeeId === p.employeeId || !!record?.manualOverrideBy);
      return {
        ...person,
        shiftId: person.shiftId || fallbackShift?.id || null,
        status: record?.status === 'LATE' ? 'PRESENT' : record?.status || null,
        notes: record?.correctionReason || '',
        version: record?.updatedAt.toISOString() || null,
        locked,
        source: record?.source || null,
        lockReason:
          isSupervisor(p) && person.employeeId === p.employeeId
            ? 'Use GPS and photo attendance above'
            : 'Reviewed by manager',
      };
    }),
  };
}

export async function attendanceRegister(p: Principal, query: unknown) {
  authorize(p);
  const q = registerSchema.parse(query);
  const sites = await db.site.findMany({
    where: { AND: [scopeFor('sites', p), { status: 'ACTIVE' }] },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const siteId = q.siteId || sites[0]?.id;
  if (!siteId)
    return {
      date: q.date,
      siteId: null,
      sites,
      rows: [],
      canWrite: p.permissions.includes('attendance:write'),
    };
  const register = await roster(p, q.date, siteId);
  return {
    date: q.date,
    siteId,
    sites,
    rows: register.rows,
    canWrite: p.permissions.includes('attendance:write'),
  };
}

export async function saveAttendanceRegister(p: Principal, body: unknown, requestId: string) {
  authorize(p, true);
  const input = saveSchema.parse(body);
  assert(
    !isSupervisor(p) || input.entries.every((e) => e.employeeId !== p.employeeId),
    403,
    'Use GPS and photo start/stop for your own staff attendance',
  );
  assert(
    new Set(input.entries.map((e) => e.employeeId)).size === input.entries.length,
    422,
    'Each person can appear only once',
  );
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  assert(input.date <= today, 422, 'Attendance cannot be marked for a future date');
  await db.$transaction(
    async (tx) => {
      const register = await roster(p, input.date, input.siteId, tx);
      // Validate the whole sheet before writing any marks.
      for (const entry of input.entries) {
        const person = register.rows.find((r) => r.employeeId === entry.employeeId);
        assert(
          person,
          403,
          'You can only mark yourself and workers in your team, or your managed supervisors and workers',
        );
        assert(
          !person.locked,
          403,
          'A manager has reviewed this mark. Ask your manager to change it',
        );
        assert(person.shiftId, 422, 'Configure a shift for this site before marking attendance');
        assert(
          person.version === entry.version,
          409,
          'Attendance changed since you opened it. Reload and check the latest marks',
        );
      }
      for (const entry of input.entries) {
        const person = register.rows.find((r) => r.employeeId === entry.employeeId)!;
        const where = {
          employeeId_siteId_workDate: {
            employeeId: entry.employeeId,
            siteId: input.siteId,
            workDate: register.workDate,
          },
        };
        const previous = await tx.attendance.findUnique({ where });
        const values = {
          status: entry.status,
          correctionReason: entry.notes || null,
          source: 'MANUAL',
          manualOverrideBy: isSupervisor(p) ? null : p.userId,
          updatedBy: p.userId,
          deletedAt: null,
        };
        const saved = previous
          ? await tx.attendance.update({ where, data: values })
          : await tx.attendance.create({
              data: {
                ...values,
                organizationId: p.organizationId,
                businessUnitId: register.site.businessUnitId,
                siteId: input.siteId,
                employeeId: entry.employeeId,
                shiftId: person.shiftId!,
                workDate: register.workDate,
                checkIn: null,
                createdBy: p.userId,
              },
            });
        await tx.auditLog.create({
          data: {
            organizationId: p.organizationId,
            businessUnitId: register.site.businessUnitId,
            siteId: input.siteId,
            actorId: p.userId,
            entity: 'attendance',
            entityId: saved.id,
            action: previous ? 'UPDATE' : 'CREATE',
            previousValue: previous ? JSON.parse(JSON.stringify(previous)) : undefined,
            newValue: JSON.parse(JSON.stringify(saved)),
            requestId,
          },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
  );
  return attendanceRegister(p, { date: input.date, siteId: input.siteId });
}
