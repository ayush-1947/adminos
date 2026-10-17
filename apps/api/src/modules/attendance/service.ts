import { z } from 'zod';
import { db } from '../../lib/db';
import { assert } from '../../lib/errors';
import { digest } from '../auth/service';
import { attendanceFlags, shiftWindow } from './domain';
const tapSchema = z.strictObject({
  eventId: z.uuid(),
  cardId: z.string().min(4).max(200),
  action: z.enum(['CHECK_IN', 'CHECK_OUT']),
  timestamp: z.iso.datetime({ offset: true }),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export async function recordTap(deviceKey: string, body: unknown) {
  const data = tapSchema.parse(body);
  const at = new Date(data.timestamp);
  assert(
    Math.abs(Date.now() - at.getTime()) <= 5 * 60000,
    422,
    'Device timestamp must be within five minutes of server time',
  );
  const device = await db.attendanceDevice.findFirst({
    where: { keyHash: digest(deviceKey), status: 'ACTIVE', deletedAt: null },
  });
  assert(device, 401, 'Invalid attendance device');
  return db.$transaction(
    async (tx) => {
      const eventKey = `${device.id}:${data.eventId}`;
      const replay = await tx.attendanceTap.findUnique({ where: { eventKey } });
      if (replay) return { duplicate: true, eventId: data.eventId };
      const card = await tx.nfcCard.findFirst({
        where: {
          organizationId: device.organizationId,
          cardHash: digest(data.cardId),
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: { employee: true },
      });
      assert(
        card && card.employee.status === 'ACTIVE' && !card.employee.deletedAt,
        422,
        'Card is not assigned to an active employee',
      );
      const assignment = await tx.siteAssignment.findFirst({
        where: {
          organizationId: device.organizationId,
          employeeId: card.employeeId,
          siteId: device.siteId,
          deletedAt: null,
          startDate: { lte: at },
          OR: [{ endDate: null }, { endDate: { gte: at } }],
        },
        include: { shift: true },
        orderBy: { isPrimary: 'desc' },
      });
      assert(assignment, 403, 'Employee has no active assignment at this site');
      const recent = await tx.attendanceTap.findFirst({
        where: {
          employeeId: card.employeeId,
          organizationId: device.organizationId,
          timestamp: { gte: new Date(at.getTime() - 30000) },
        },
        orderBy: { timestamp: 'desc' },
      });
      if (recent) return { duplicate: true, eventId: data.eventId };
      const openAttendance =
        data.action === 'CHECK_OUT'
          ? await tx.attendance.findFirst({
              where: {
                organizationId: device.organizationId,
                employeeId: card.employeeId,
                siteId: device.siteId,
                checkOut: null,
                checkIn: { gte: new Date(at.getTime() - 36 * 3600000) },
                deletedAt: null,
              },
              include: { shift: true },
              orderBy: { checkIn: 'desc' },
            })
          : null;
      const workDate = openAttendance?.workDate || shiftWindow(at, assignment.shift).workDate;
      const previous = await tx.attendance.findUnique({
        where: {
          employeeId_siteId_workDate: {
            employeeId: card.employeeId,
            siteId: device.siteId,
            workDate,
          },
        },
      });
      let record;
      if (data.action === 'CHECK_IN') {
        assert(!previous, 409, 'Employee has already checked in for this shift');
        record = await tx.attendance.create({
          data: {
            organizationId: device.organizationId,
            businessUnitId: device.businessUnitId,
            employeeId: card.employeeId,
            siteId: device.siteId,
            shiftId: assignment.shiftId,
            deviceId: device.id,
            workDate,
            checkIn: at,
            source: 'NFC',
            latitude: data.latitude,
            longitude: data.longitude,
            ...attendanceFlags(at, null, assignment.shift),
          },
        });
      } else {
        assert(
          previous && previous.checkIn && !previous.checkOut,
          409,
          'No open check-in exists for this shift',
        );
        assert(!previous.manualOverrideBy, 409, 'Attendance has been reviewed by a manager');
        assert(
          !['ABSENT', 'HALF_DAY'].includes(previous.status),
          409,
          'Attendance has been marked manually for this day',
        );
        assert(at > previous.checkIn, 422, 'Check-out must follow check-in');
        record = await tx.attendance.update({
          where: { id: previous.id },
          data: {
            checkOut: at,
            ...attendanceFlags(previous.checkIn, at, openAttendance?.shift || assignment.shift),
          },
        });
      }
      await tx.attendanceTap.create({
        data: {
          organizationId: device.organizationId,
          employeeId: card.employeeId,
          deviceId: device.id,
          eventKey,
          timestamp: at,
          action: data.action,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: device.organizationId,
          businessUnitId: device.businessUnitId,
          siteId: device.siteId,
          action: data.action,
          entity: 'attendance',
          entityId: record.id,
          newValue: { source: 'NFC', deviceId: device.id, timestamp: at.toISOString() },
        },
      });
      return { duplicate: false, attendance: record };
    },
    { isolationLevel: 'Serializable' },
  );
}
