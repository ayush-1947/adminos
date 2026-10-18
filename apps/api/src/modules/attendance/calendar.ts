import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../lib/db';
import { assert } from '../../lib/errors';
import type { Principal } from '../auth/policy';
export const calendarToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const date = (s: string) => new Date(`${s}T00:00:00Z`);
const isAdmin = (p: Principal) => {
  assert(
    p.role === 'Super Admin' && p.scope === 'ORGANIZATION',
    403,
    'Super administrator access required',
  );
};
export function workingOn(
  value: string,
  weekdays: number[],
  exceptions: { date: Date; working: boolean }[],
) {
  return (
    exceptions.find((d) => iso(d.date) === value)?.working ??
    weekdays.includes(date(value).getUTCDay())
  );
}
export async function calendarState(p: Principal, tx: Prisma.TransactionClient = db) {
  const today = calendarToday();
  const [calendar, exceptions, user] = await Promise.all([
    tx.workCalendar.findUnique({ where: { organizationId: p.organizationId } }),
    tx.workCalendarDay.findMany({ where: { organizationId: p.organizationId } }),
    tx.user.findFirst({
      where: { id: p.userId, organizationId: p.organizationId },
      select: { createdAt: true },
    }),
  ]);
  const workingWeekdays = calendar?.workingWeekdays ?? [0, 1, 2, 3, 4, 5, 6];
  const from = [
    calendar
      ? iso(calendar.trackingFrom)
      : user
        ? new Date(user.createdAt.getTime() + 330 * 60000).toISOString().slice(0, 10)
        : today,
    user ? new Date(user.createdAt.getTime() + 330 * 60000).toISOString().slice(0, 10) : today,
  ]
    .sort()
    .at(-1)!;
  const [records, leaves] = await Promise.all([
    tx.staffDay.findMany({
      where: {
        organizationId: p.organizationId,
        userId: p.userId,
        workDate: { gte: date(from), lt: date(today) },
      },
      select: { workDate: true, source: true, checkIn: true, checkOut: true },
    }),
    tx.staffLeave.findMany({
      where: {
        organizationId: p.organizationId,
        userId: p.userId,
        workDate: { gte: date(from), lt: date(today) },
        status: { in: ['PENDING', 'APPROVED'] },
      },
      select: { workDate: true },
    }),
  ]);
  const accounted = new Set([
    ...records.filter((r) => r.source !== 'GPS_PHOTO' || !!r.checkOut).map((r) => iso(r.workDate)),
    ...leaves.map((r) => iso(r.workDate)),
  ]);
  const missedDays: string[] = [];
  for (let t = date(from).getTime(); t < date(today).getTime(); t += 86400000) {
    const value = iso(new Date(t));
    if (workingOn(value, workingWeekdays, exceptions) && !accounted.has(value))
      missedDays.push(value);
  }
  return {
    today,
    workingToday: workingOn(today, workingWeekdays, exceptions),
    missedDays,
    trackingFrom: from,
  };
}
export async function readCalendar(p: Principal, input: unknown) {
  isAdmin(p);
  const q = z
    .object({
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .default(calendarToday().slice(0, 7)),
    })
    .parse(input);
  const first = date(`${q.month}-01`),
    end = new Date(first);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const [calendar, days] = await Promise.all([
    db.workCalendar.findUnique({ where: { organizationId: p.organizationId } }),
    db.workCalendarDay.findMany({
      where: { organizationId: p.organizationId, date: { gte: first, lt: end } },
      orderBy: { date: 'asc' },
    }),
  ]);
  return {
    month: q.month,
    workingWeekdays: calendar?.workingWeekdays ?? [0, 1, 2, 3, 4, 5, 6],
    trackingFrom: calendar ? iso(calendar.trackingFrom) : calendarToday(),
    days,
  };
}
export async function saveCalendar(p: Principal, input: unknown, requestId: string) {
  isAdmin(p);
  const b = z
    .strictObject({
      workingWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
      trackingFrom: z.iso.date(),
    })
    .parse(input);
  assert(
    b.trackingFrom >= '2020-01-01' && b.trackingFrom <= calendarToday(),
    422,
    'Tracking start must be between 2020 and today',
  );
  const workingWeekdays = [...new Set(b.workingWeekdays)].sort();
  await db.$transaction(async (tx) => {
    await tx.workCalendar.upsert({
      where: { organizationId: p.organizationId },
      create: {
        organizationId: p.organizationId,
        workingWeekdays,
        trackingFrom: date(b.trackingFrom),
      },
      update: { workingWeekdays, trackingFrom: date(b.trackingFrom) },
    });
    await tx.auditLog.create({
      data: {
        organizationId: p.organizationId,
        actorId: p.userId,
        entity: 'work_calendar',
        entityId: p.organizationId,
        action: 'UPDATE',
        newValue: { workingWeekdays, trackingFrom: b.trackingFrom },
        requestId,
      },
    });
  });
  return { ok: true };
}
export async function saveCalendarDay(p: Principal, input: unknown, requestId: string) {
  isAdmin(p);
  const b = z
    .strictObject({
      date: z.iso.date(),
      working: z.boolean().nullable(),
      label: z.string().trim().max(160).default(''),
    })
    .parse(input);
  await db.$transaction(async (tx) => {
    if (b.working === null)
      await tx.workCalendarDay.deleteMany({
        where: { organizationId: p.organizationId, date: date(b.date) },
      });
    else
      await tx.workCalendarDay.upsert({
        where: { organizationId_date: { organizationId: p.organizationId, date: date(b.date) } },
        create: {
          organizationId: p.organizationId,
          date: date(b.date),
          working: b.working,
          label: b.label,
        },
        update: { working: b.working, label: b.label },
      });
    await tx.auditLog.create({
      data: {
        organizationId: p.organizationId,
        actorId: p.userId,
        entity: 'work_calendar_day',
        entityId: p.organizationId,
        action: 'UPDATE',
        newValue: b,
        requestId,
      },
    });
  });
  return { ok: true };
}
