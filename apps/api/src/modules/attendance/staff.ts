import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../lib/db';
import { assert } from '../../lib/errors';
import type { Principal } from '../auth/policy';
import { scopeFor } from '../resources/scope';

export const staffRoles = [
  'Site Supervisor',
  'Operations Manager',
  'Business Manager',
  'Accountant',
  'Finance/Admin',
];
export const istDate = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const admin = (p: Principal) => p.role === 'Super Admin' && p.scope === 'ORGANIZATION';
function authorize(p: Principal) {
  assert(staffRoles.includes(p.role) || admin(p), 403, 'Staff attendance access required');
}
const summary = {
  id: true,
  userId: true,
  workDate: true,
  siteId: true,
  status: true,
  source: true,
  checkIn: true,
  checkOut: true,
  notes: true,
  updatedAt: true,
  startLatitude: true,
  startLongitude: true,
  startAccuracy: true,
  endLatitude: true,
  endLongitude: true,
  endAccuracy: true,
  user: { select: { name: true } },
} as const;
async function reviewer(p: Principal) {
  const employee = p.employeeId
    ? await db.employee.findFirst({
        where: { id: p.employeeId, organizationId: p.organizationId, deletedAt: null },
        include: { manager: true },
      })
    : null;
  if (employee?.manager?.userId) return employee.manager.userId;
  const site = p.employeeId
    ? await db.site.findFirst({
        where: {
          organizationId: p.organizationId,
          deletedAt: null,
          supervisorId: p.employeeId,
          manager: { userId: { not: null }, deletedAt: null },
        },
        include: { manager: true },
        orderBy: { id: 'asc' },
      })
    : null;
  if (site?.manager?.userId) return site.manager.userId;
  const owner = await db.user.findFirst({
    where: {
      organizationId: p.organizationId,
      status: 'ACTIVE',
      deletedAt: null,
      role: { name: 'Super Admin', deletedAt: null },
      id: { not: p.userId },
    },
    orderBy: { id: 'asc' },
  });
  assert(owner, 422, 'Ask your administrator to configure your reporting manager');
  return owner.id;
}
export async function staffOverview(p: Principal) {
  authorize(p);
  const [records, leaves, inbox, sites] = await Promise.all([
    db.staffDay.findMany({
      where: { organizationId: p.organizationId, userId: p.userId },
      select: summary,
      orderBy: { workDate: 'desc' },
      take: 60,
    }),
    db.staffLeave.findMany({
      where: { organizationId: p.organizationId, userId: p.userId },
      orderBy: { workDate: 'desc' },
      take: 60,
    }),
    db.staffLeave.findMany({
      where: { organizationId: p.organizationId, ...(admin(p) ? {} : { reviewerId: p.userId }) },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    p.role === 'Site Supervisor'
      ? db.site.findMany({
          where: { AND: [scopeFor('sites', p), { status: 'ACTIVE' }] },
          select: { id: true, name: true, latitude: true, longitude: true },
        })
      : [],
  ]);
  const team =
    admin(p) || ['Operations Manager', 'Business Manager'].includes(p.role)
      ? await db.staffDay.findMany({
          where: {
            organizationId: p.organizationId,
            ...(admin(p)
              ? {}
              : {
                  user: {
                    employee_user: {
                      some: {
                        managerId: p.employeeId || '00000000-0000-0000-0000-000000000000',
                        deletedAt: null,
                      },
                    },
                  },
                }),
          },
          select: summary,
          orderBy: { workDate: 'desc' },
          take: 100,
        })
      : [];
  return { today: istDate(), records, leaves, inbox, sites, team };
}
export const clockSchema = z.strictObject({
  action: z.enum(['START', 'STOP']),
  siteId: z.uuid(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy: z.coerce.number().min(0).max(200),
  capturedAt: z.iso.datetime(),
});
export function distanceMeters(lat: number, lng: number, lat2: number, lng2: number) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat) / 2) ** 2 +
    Math.cos(rad(lat)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export async function clockStaff(
  p: Principal,
  input: unknown,
  file: Express.Multer.File | undefined,
  requestId: string,
) {
  assert(p.role === 'Site Supervisor' && p.employeeId, 403, 'Supervisor access required');
  const b = clockSchema.parse(input);
  assert(
    Math.abs(Date.now() - new Date(b.capturedAt).getTime()) < 120000,
    422,
    'Refresh your current location and try again',
  );
  assert(
    file && file.size > 0 && file.size <= 2 * 1024 * 1024,
    422,
    'A photo up to 2 MB is required',
  );
  const jpeg = file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
  const png = file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert(
    (jpeg && file.mimetype === 'image/jpeg') || (png && file.mimetype === 'image/png'),
    422,
    'Upload a JPEG or PNG photo',
  );
  const site = await db.site.findFirst({
    where: { AND: [scopeFor('sites', p), { id: b.siteId, status: 'ACTIVE' }] },
  });
  assert(site, 404, 'Assigned site not found');
  assert(
    site.latitude !== null && site.longitude !== null,
    422,
    'Ask your manager to configure the site GPS coordinates',
  );
  assert(
    distanceMeters(b.latitude, b.longitude, site.latitude, site.longitude) <= 300,
    422,
    'You must be within 300 metres of your assigned site',
  );
  return db.$transaction(
    async (tx) => {
      const date = day(istDate());
      const existing = await tx.staffDay.findUnique({
        where: { userId_workDate: { userId: p.userId, workDate: date } },
      });
      const leave = await tx.staffLeave.findUnique({
        where: { userId_workDate: { userId: p.userId, workDate: date } },
      });
      assert(
        !leave || leave.status === 'REJECTED',
        409,
        'A leave request already exists for this date',
      );
      if (b.action === 'START') {
        assert(!existing, 409, 'Attendance has already started today');
        const open = await tx.staffDay.findFirst({
          where: { userId: p.userId, checkIn: { not: null }, checkOut: null, source: 'GPS_PHOTO' },
        });
        assert(
          !open,
          409,
          'A previous day is unfinished. Submit a leave/correction sheet for that date and ask your manager to review it',
        );
        await tx.staffDay.create({
          data: {
            organizationId: p.organizationId,
            userId: p.userId,
            workDate: date,
            siteId: site.id,
            source: 'GPS_PHOTO',
            checkIn: new Date(),
            startLatitude: b.latitude,
            startLongitude: b.longitude,
            startAccuracy: b.accuracy,
            startPhoto: new Uint8Array(file.buffer),
            startMime: file.mimetype,
          },
        });
      } else {
        assert(
          existing?.checkIn && !existing.checkOut && existing.siteId === site.id,
          409,
          'Start attendance at this site before stopping',
        );
        await tx.staffDay.update({
          where: { id: existing.id },
          data: {
            checkOut: new Date(),
            endLatitude: b.latitude,
            endLongitude: b.longitude,
            endAccuracy: b.accuracy,
            endPhoto: new Uint8Array(file.buffer),
            endMime: file.mimetype,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: p.organizationId,
          actorId: p.userId,
          entity: 'staff_attendance',
          entityId: p.userId,
          action: b.action,
          requestId,
          newValue: {
            date: istDate(),
            siteId: site.id,
            latitude: b.latitude,
            longitude: b.longitude,
          },
        },
      });
      return { ok: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
export async function manualStaff(p: Principal, input: unknown, requestId: string) {
  authorize(p);
  assert(p.role !== 'Site Supervisor', 403, 'Supervisors must use GPS and photo attendance');
  const b = z
    .strictObject({
      status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY']),
      notes: z.string().trim().max(1000).default(''),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const saved = await tx.staffDay.upsert({
      where: { userId_workDate: { userId: p.userId, workDate: day(istDate()) } },
      create: {
        organizationId: p.organizationId,
        userId: p.userId,
        workDate: day(istDate()),
        source: 'MANUAL',
        ...b,
      },
      update: b,
    });
    await tx.auditLog.create({
      data: {
        organizationId: p.organizationId,
        actorId: p.userId,
        entity: 'staff_attendance',
        entityId: saved.id,
        action: 'MANUAL',
        requestId,
        newValue: b,
      },
    });
    return { ok: true };
  });
}
export async function requestLeave(p: Principal, input: unknown) {
  authorize(p);
  const b = z
    .strictObject({ date: z.iso.date(), reason: z.string().trim().min(5).max(2000) })
    .parse(input);
  assert(b.date < istDate(), 422, 'Use the leave sheet for a previous missed or unfinished day');
  const reviewerId = await reviewer(p);
  return db.$transaction(async (tx) => {
    const attendance = await tx.staffDay.findUnique({
      where: { userId_workDate: { userId: p.userId, workDate: day(b.date) } },
    });
    assert(
      !attendance || (attendance.checkIn && !attendance.checkOut),
      409,
      'This day already has completed attendance',
    );
    const prior = await tx.staffLeave.findUnique({
      where: { userId_workDate: { userId: p.userId, workDate: day(b.date) } },
    });
    assert(
      !prior || prior.status === 'REJECTED',
      409,
      'A leave sheet already exists for this date',
    );
    const leave = prior
      ? await tx.staffLeave.update({
          where: { id: prior.id },
          data: {
            reviewerId,
            reason: b.reason,
            status: 'PENDING',
            reviewedAt: null,
            reviewNote: null,
          },
        })
      : await tx.staffLeave.create({
          data: {
            organizationId: p.organizationId,
            userId: p.userId,
            reviewerId,
            workDate: day(b.date),
            reason: b.reason,
          },
        });
    await tx.notification.create({
      data: {
        organizationId: p.organizationId,
        userId: reviewerId,
        name: 'Leave / missed attendance request',
        message: `${b.date}: ${b.reason}`,
        kind: 'STAFF_LEAVE',
        dedupeKey: `staff-leave:${leave.id}:${randomUUID()}`,
      },
    });
    return { ok: true };
  });
}
export async function reviewLeave(p: Principal, id: string, input: unknown, requestId: string) {
  authorize(p);
  z.uuid().parse(id);
  const b = z
    .strictObject({
      status: z.enum(['APPROVED', 'REJECTED']),
      note: z.string().trim().max(1000).default(''),
    })
    .parse(input);
  return db.$transaction(
    async (tx) => {
      const leave = await tx.staffLeave.findFirst({
        where: {
          id,
          organizationId: p.organizationId,
          ...(admin(p) ? {} : { reviewerId: p.userId }),
        },
      });
      assert(leave && leave.userId !== p.userId, 404, 'Review request not found');
      assert(leave.status === 'PENDING', 409, 'Request already reviewed');
      await tx.staffLeave.update({
        where: { id },
        data: { status: b.status, reviewNote: b.note, reviewedAt: new Date() },
      });
      if (b.status === 'APPROVED')
        await tx.staffDay.upsert({
          where: { userId_workDate: { userId: leave.userId, workDate: leave.workDate } },
          create: {
            organizationId: p.organizationId,
            userId: leave.userId,
            workDate: leave.workDate,
            status: 'LEAVE',
            source: 'APPROVED_LEAVE',
            notes: leave.reason,
          },
          update: { status: 'LEAVE', source: 'APPROVED_LEAVE', notes: leave.reason },
        });
      await tx.notification.create({
        data: {
          organizationId: p.organizationId,
          userId: leave.userId,
          name: `Leave ${b.status.toLowerCase()}`,
          message: `${leave.workDate.toISOString().slice(0, 10)}: ${b.note}`,
          kind: 'STAFF_LEAVE',
          dedupeKey: `staff-leave-reviewed:${id}:${randomUUID()}`,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: p.organizationId,
          actorId: p.userId,
          entity: 'staff_leave',
          entityId: id,
          action: b.status,
          requestId,
        },
      });
      return { ok: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
export async function staffPhoto(p: Principal, id: string, end: boolean) {
  authorize(p);
  z.uuid().parse(id);
  const record = await db.staffDay.findFirst({ where: { id, organizationId: p.organizationId } });
  assert(record, 404, 'Attendance not found');
  const employee = await db.employee.findFirst({
    where: {
      organizationId: p.organizationId,
      userId: record.userId,
      managerId: p.employeeId || '00000000-0000-0000-0000-000000000000',
      deletedAt: null,
    },
  });
  assert(
    record.userId === p.userId ||
      admin(p) ||
      (['Operations Manager', 'Business Manager'].includes(p.role) && employee),
    403,
    'Photo access denied',
  );
  const content = end ? record.endPhoto : record.startPhoto;
  assert(content, 404, 'Photo unavailable');
  return { content, mime: (end ? record.endMime : record.startMime) || 'image/jpeg' };
}
