import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app';
import { db } from '../src/lib/db';
import { digest, newToken } from '../src/modules/auth/service';
import { attendanceCredit } from '../src/modules/attendance/domain';

const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
const date = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
let org: string,
  unit: string,
  site: string,
  outsideSite: string,
  supervisor: string,
  worker: string,
  otherWorker: string;
let supervisorCookie: string,
  managerCookie: string,
  workerCookie: string,
  adminCookie: string,
  otherSupervisorCookie: string,
  otherSupervisor: string;
let supervisorVersion: string, workerVersion: string;
const sheet = (cookie: string) =>
  request(app).get('/api/attendance/register').query({ date, siteId: site }).set('Cookie', cookie);
const save = (cookie: string, entries: unknown[], siteId = site, workDate = date) =>
  request(app)
    .post('/api/attendance/register')
    .set('Cookie', cookie)
    .set('Origin', origin)
    .send({ date: workDate, siteId, entries });

beforeAll(async () => {
  org = (
    await db.organization.create({
      data: { name: 'Manual attendance tests', slug: `manual-${randomUUID()}` },
    })
  ).id;
  unit = (
    await db.businessUnit.create({ data: { organizationId: org, name: 'Unit', code: 'VIAGREEN' } })
  ).id;
  async function account(roleName: string, position: string, scope = 'ASSIGNED') {
    const role = await db.role.create({ data: { organizationId: org, name: roleName, scope } });
    for (const key of ['attendance:read', 'attendance:write', 'dashboard:read']) {
      const permission = await db.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: key },
      });
      await db.rolePermission.create({
        data: { organizationId: org, roleId: role.id, permissionId: permission.id },
      });
    }
    const user = await db.user.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        roleId: role.id,
        name: roleName,
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'session-only-test',
      },
    });
    const employee = await db.employee.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        userId: user.id,
        name: roleName,
        employeeCode: position,
        position,
      },
    });
    const token = newToken();
    await db.session.create({
      data: {
        organizationId: org,
        userId: user.id,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { employee: employee.id, cookie: `os_session=${token}` };
  }
  const sup = await account('Site Supervisor', 'SUPERVISOR');
  supervisor = sup.employee;
  supervisorCookie = sup.cookie;
  const mgr = await account('Operations Manager', 'MANAGER');
  managerCookie = mgr.cookie;
  const wrk = await account('Worker', 'WORKER');
  worker = wrk.employee;
  workerCookie = wrk.cookie;
  adminCookie = (await account('Super Admin', 'ADMIN', 'ORGANIZATION')).cookie;
  const otherSup = await db.employee.create({
    data: {
      organizationId: org,
      businessUnitId: unit,
      employeeCode: 'OTHER-SUP',
      name: 'Other supervisor',
      position: 'SUPERVISOR',
    },
  });
  otherSupervisor = otherSup.id;
  const supervisorRole = await db.role.findFirstOrThrow({
    where: { organizationId: org, name: 'Site Supervisor' },
  });
  const otherUser = await db.user.create({
    data: {
      organizationId: org,
      businessUnitId: unit,
      roleId: supervisorRole.id,
      name: 'Other supervisor',
      email: `${randomUUID()}@example.invalid`,
      passwordHash: 'session-only-test',
    },
  });
  await db.employee.update({ where: { id: otherSup.id }, data: { userId: otherUser.id } });
  const otherToken = newToken();
  await db.session.create({
    data: {
      organizationId: org,
      userId: otherUser.id,
      tokenHash: digest(otherToken),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  otherSupervisorCookie = `os_session=${otherToken}`;
  otherWorker = (
    await db.employee.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        employeeCode: 'OTHER-WRK',
        name: 'Other worker',
        supervisorId: otherSup.id,
        position: 'WORKER',
      },
    })
  ).id;
  await db.employee.update({
    where: { id: worker },
    data: { supervisorId: supervisor, managerId: mgr.employee },
  });
  await db.employee.update({ where: { id: supervisor }, data: { managerId: mgr.employee } });
  const client = await db.client.create({
    data: { organizationId: org, businessUnitId: unit, name: 'Client', company: 'Client' },
  });
  site = (
    await db.site.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        clientId: client.id,
        name: 'Shared site',
        address: 'Test',
        managerId: mgr.employee,
        supervisorId: supervisor,
      },
    })
  ).id;
  outsideSite = (
    await db.site.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        clientId: client.id,
        name: 'Outside site',
        address: 'Test',
      },
    })
  ).id;
  const shift = await db.shift.create({
    data: {
      organizationId: org,
      businessUnitId: unit,
      name: 'Day',
      startMinute: 480,
      endMinute: 1020,
    },
  });
  for (const [employeeId, supervisorId] of [
    [worker, supervisor],
    [otherWorker, otherSup.id],
  ])
    await db.siteAssignment.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        siteId: site,
        employeeId,
        supervisorId,
        shiftId: shift.id,
        startDate: new Date('2026-01-01'),
        isPrimary: true,
      },
    });
});

afterAll(async () => {
  for (const model of [
    'auditLog',
    'attendance',
    'siteAssignment',
    'site',
    'client',
    'shift',
    'employee',
    'session',
    'user',
    'rolePermission',
    'role',
    'businessUnit',
  ] as const)
    await (db[model] as any).deleteMany({ where: { organizationId: org } });
  await db.organization.delete({ where: { id: org } });
  await db.$disconnect();
});

describe('Simple daily attendance and hierarchy enforcement', () => {
  it('shows supervisors themselves and only their own workers on a shared site', async () => {
    const response = await sheet(supervisorCookie);
    expect(response.status).toBe(200);
    expect(response.body.rows.map((r: any) => r.employeeId).sort()).toEqual(
      [supervisor, worker].sort(),
    );
    expect(response.body.rows.every((r: any) => r.status === null)).toBe(true);
  });
  it('recognizes a second supervisor linked through a worker assignment, without exposing the first team', async () => {
    const response = await sheet(otherSupervisorCookie);
    expect(response.status).toBe(200);
    expect(response.body.rows.map((r: any) => r.employeeId).sort()).toEqual(
      [otherSupervisor, otherWorker].sort(),
    );
  });
  it('does not grant site access through an expired supervisor assignment', async () => {
    const shift = await db.shift.findFirstOrThrow({ where: { organizationId: org } });
    await db.siteAssignment.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        siteId: outsideSite,
        employeeId: worker,
        supervisorId: supervisor,
        shiftId: shift.id,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      },
    });
    const response = await request(app)
      .get('/api/attendance/register')
      .query({ date, siteId: outsideSite })
      .set('Cookie', supervisorCookie);
    expect(response.status).toBe(404);
  });
  it('requires GPS for supervisor self-attendance and preserves manual half-day worker attendance', async () => {
    expect(
      (await save(supervisorCookie, [{ employeeId: supervisor, status: 'PRESENT', version: null }]))
        .status,
    ).toBe(403);
    await save(managerCookie, [{ employeeId: supervisor, status: 'PRESENT', version: null }]);
    const response = await save(supervisorCookie, [
      { employeeId: worker, status: 'HALF_DAY', notes: 'Left after lunch', version: null },
    ]);
    expect(response.status).toBe(200);
    supervisorVersion = response.body.rows.find((r: any) => r.employeeId === supervisor).version;
    workerVersion = response.body.rows.find((r: any) => r.employeeId === worker).version;
    const record = await db.attendance.findFirstOrThrow({
      where: { organizationId: org, employeeId: worker },
    });
    expect(record).toMatchObject({
      status: 'HALF_DAY',
      correctionReason: 'Left after lunch',
      checkIn: null,
      checkOut: null,
      manualOverrideBy: null,
    });
    expect(await db.auditLog.count({ where: { organizationId: org, entity: 'attendance' } })).toBe(
      2,
    );
  });
  it('rejects another supervisor’s worker and rejects the entire mixed batch', async () => {
    const response = await save(supervisorCookie, [
      { employeeId: supervisor, status: 'ABSENT', version: supervisorVersion },
      { employeeId: otherWorker, status: 'PRESENT', version: null },
    ]);
    expect(response.status).toBe(403);
    expect(
      (
        await db.attendance.findFirstOrThrow({
          where: { organizationId: org, employeeId: supervisor },
        })
      ).status,
    ).toBe('PRESENT');
  });
  it('lets supervisors correct their own unreviewed marks but rejects stale saves', async () => {
    const response = await save(supervisorCookie, [
      { employeeId: worker, status: 'PRESENT', notes: 'Correction', version: workerVersion },
    ]);
    expect(response.status).toBe(200);
    expect(
      (
        await save(supervisorCookie, [
          { employeeId: worker, status: 'ABSENT', version: workerVersion },
        ])
      ).status,
    ).toBe(409);
    workerVersion = response.body.rows.find((r: any) => r.employeeId === worker).version;
  });
  it('lets managers override supervisor and worker marks, then prevents supervisor reversal', async () => {
    const response = await save(managerCookie, [
      {
        employeeId: supervisor,
        status: 'ABSENT',
        notes: 'Manager correction',
        version: supervisorVersion,
      },
      { employeeId: worker, status: 'HALF_DAY', version: workerVersion },
    ]);
    expect(response.status).toBe(200);
    const supervisorSheet = await sheet(supervisorCookie);
    expect(supervisorSheet.body.rows.every((r: any) => r.locked)).toBe(true);
    const row = supervisorSheet.body.rows.find((r: any) => r.employeeId === supervisor);
    expect(
      (
        await save(supervisorCookie, [
          { employeeId: supervisor, status: 'PRESENT', version: row.version },
        ])
      ).status,
    ).toBe(403);
    expect(
      (
        await db.attendance.findFirstOrThrow({
          where: { organizationId: org, employeeId: supervisor },
        })
      ).status,
    ).toBe('ABSENT');
    expect(
      (
        await save(managerCookie, [
          { employeeId: supervisor, status: 'PRESENT', version: row.version },
        ])
      ).status,
    ).toBe(200);
  });
  it('rejects workers, outside sites, forged employees and generic attendance edits', async () => {
    expect((await sheet(workerCookie)).status).toBe(403);
    expect(
      (await save(workerCookie, [{ employeeId: worker, status: 'PRESENT', version: null }])).status,
    ).toBe(403);
    expect(
      (
        await save(
          managerCookie,
          [{ employeeId: worker, status: 'PRESENT', version: null }],
          outsideSite,
        )
      ).status,
    ).toBe(404);
    expect(
      (await save(adminCookie, [{ employeeId: randomUUID(), status: 'PRESENT', version: null }]))
        .status,
    ).toBe(403);
    const record = await db.attendance.findFirstOrThrow({ where: { organizationId: org } });
    expect(
      (
        await request(app)
          .patch(`/api/resources/attendance/${record.id}`)
          .set('Origin', origin)
          .set('Cookie', adminCookie)
          .send({ correctionReason: 'Bypass', status: 'PRESENT' })
      ).status,
    ).toBe(422);
  });
  it('rejects duplicate people, invalid dates, future marks and oversized notes', async () => {
    const entry = { employeeId: worker, status: 'PRESENT', version: null };
    expect((await save(managerCookie, [entry, entry])).status).toBe(422);
    expect((await save(managerCookie, [entry], site, '2026-02-30')).status).toBe(422);
    expect((await save(managerCookie, [entry], site, '2099-01-01')).status).toBe(422);
    expect((await save(managerCookie, [{ ...entry, notes: 'x'.repeat(1001) }])).status).toBe(422);
  });
  it('weights manual attendance correctly without treating absence as presence', () => {
    expect(['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT'].map(attendanceCredit)).toEqual([1, 1, 0.5, 0]);
  });
});
