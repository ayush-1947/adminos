import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID, createHmac } from 'node:crypto';
import { app } from '../src/app';
import { db } from '../src/lib/db';
import { digest, newToken } from '../src/modules/auth/service';
import { distanceMeters, istDate } from '../src/modules/attendance/staff';
import { validSignature, greeting, runFlowJobs } from '../src/modules/flowbridge/service';
const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
let org: string = randomUUID(),
  unit: string,
  site: string,
  manager: any,
  supervisor: any,
  accountant: any,
  customer: any,
  admin: any;
const photo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
  'base64',
);
const yesterday = new Date(new Date(istDate()).getTime() - 86400000).toISOString().slice(0, 10);
async function account(roleName: string, position?: string) {
  const role = await db.role.create({
    data: {
      organizationId: org,
      name: roleName,
      scope: roleName === 'Super Admin' || roleName === 'Accountant' ? 'ORGANIZATION' : 'ASSIGNED',
    },
  });
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
  const employee = position
    ? await db.employee.create({
        data: {
          organizationId: org,
          businessUnitId: unit,
          userId: user.id,
          name: roleName,
          employeeCode: position,
          position,
        },
      })
    : null;
  const token = newToken();
  await db.session.create({
    data: {
      organizationId: org,
      userId: user.id,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return { id: user.id, employeeId: employee?.id, cookie: `os_session=${token}` };
}
const post = (path: string, cookie: string, body: unknown) =>
  request(app).post(`/api${path}`).set('Cookie', cookie).set('Origin', origin).send(body);
function clock(action = 'START', extra: Record<string, string> = {}, withPhoto = true) {
  let r = request(app)
    .post('/api/staff-attendance/clock')
    .set('Cookie', supervisor.cookie)
    .set('Origin', origin);
  for (const [k, v] of Object.entries({
    action,
    siteId: site,
    latitude: '19.02',
    longitude: '72.82',
    accuracy: '10',
    capturedAt: new Date().toISOString(),
    ...extra,
  }))
    r = r.field(k, v);
  return withPhoto
    ? r.attach('photo', photo, { filename: 'self.png', contentType: 'image/png' })
    : r;
}
beforeAll(async () => {
  org = (
    await db.organization.create({
      data: { id: org, name: 'Staff and Flow tests', slug: `staff-${randomUUID()}` },
    })
  ).id;
  unit = (
    await db.businessUnit.create({ data: { organizationId: org, name: 'Unit', code: 'VIAGREEN' } })
  ).id;
  manager = await account('Operations Manager', 'MANAGER');
  supervisor = await account('Site Supervisor', 'SUPERVISOR');
  accountant = await account('Accountant');
  customer = await account('Customer');
  admin = await account('Super Admin');
  await db.employee.update({
    where: { id: supervisor.employeeId },
    data: { managerId: manager.employeeId },
  });
  const client = await db.client.create({
    data: { organizationId: org, businessUnitId: unit, name: 'Test', company: 'Test' },
  });
  site = (
    await db.site.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        clientId: client.id,
        name: 'Site',
        address: 'Test',
        latitude: 19.02,
        longitude: 72.82,
        managerId: manager.employeeId,
        supervisorId: supervisor.employeeId,
      },
    })
  ).id;
});
afterAll(async () => {
  if (!org || !(await db.organization.findUnique({ where: { id: org } }))) {
    await db.$disconnect();
    return;
  }
  for (const model of [
    'flowMessage',
    'flowContact',
    'flowEvent',
    'flowCampaign',
    'staffLeave',
    'staffDay',
    'notification',
    'auditLog',
    'lead',
    'site',
    'client',
    'employee',
    'session',
    'user',
    'role',
    'businessUnit',
  ] as const) {
    if (model === 'flowMessage')
      await db.flowMessage.deleteMany({ where: { contact: { organizationId: org } } });
    else await (db[model] as any).deleteMany({ where: { organizationId: org } });
  }
  await db.organization.delete({ where: { id: org } });
  await db.$disconnect();
});
describe('Staff attendance', () => {
  it('uses expected distance and verifies role isolation', async () => {
    expect(distanceMeters(19.02, 72.82, 19.02, 72.82)).toBe(0);
    expect(distanceMeters(19.02, 72.82, 20, 73)).toBeGreaterThan(300);
    expect(
      (await request(app).get('/api/staff-attendance').set('Cookie', customer.cookie)).status,
    ).toBe(403);
    expect(
      (await post('/staff-attendance/manual', supervisor.cookie, { status: 'PRESENT' })).status,
    ).toBe(403);
  });
  it('rejects missing photos, stale locations, poor GPS and off-site check-ins', async () => {
    expect((await clock('START', {}, false)).status).toBe(422);
    expect(
      (await clock('START', { capturedAt: new Date(Date.now() - 300000).toISOString() })).status,
    ).toBe(422);
    expect((await clock('START', { accuracy: '201' })).status).toBe(422);
    expect((await clock('START', { latitude: '20' })).status).toBe(422);
    expect((await clock('START', { siteId: randomUUID() })).status).toBe(404);
    expect(await db.staffDay.count({ where: { organizationId: org } })).toBe(0);
  });
  it('stores private photo and GPS evidence and rejects duplicate starts', async () => {
    expect((await clock()).status).toBe(200);
    expect((await clock()).status).toBe(409);
    const r = await db.staffDay.findFirstOrThrow({
      where: { organizationId: org, userId: supervisor.id },
    });
    expect(r.checkIn).not.toBeNull();
    expect(r.startLatitude).toBe(19.02);
    expect(Buffer.from(r.startPhoto!)).toEqual(photo);
    const overview = await request(app)
      .get('/api/staff-attendance')
      .set('Cookie', supervisor.cookie);
    expect(overview.body.records[0].startPhoto).toBeUndefined();
    expect(
      (
        await request(app)
          .get(`/api/staff-attendance/${r.id}/photo/start`)
          .set('Cookie', accountant.cookie)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(`/api/staff-attendance/${r.id}/photo/start`)
          .set('Cookie', manager.cookie)
      ).status,
    ).toBe(200);
  });
  it('requires a second photo and location on stop and records server time', async () => {
    expect((await clock('STOP', {}, false)).status).toBe(422);
    expect((await clock('STOP')).status).toBe(200);
    expect((await clock('STOP')).status).toBe(409);
    const r = await db.staffDay.findFirstOrThrow({
      where: { organizationId: org, userId: supervisor.id },
    });
    expect(r.checkOut!.getTime()).toBeGreaterThanOrEqual(r.checkIn!.getTime());
    expect(r.endPhoto).not.toBeNull();
  });
  it('lets managers and accountants mark manually without needing employee or site profiles', async () => {
    for (const person of [manager, accountant])
      expect(
        (
          await post('/staff-attendance/manual', person.cookie, {
            status: 'HALF_DAY',
            notes: 'Office',
          })
        ).status,
      ).toBe(200);
    const r = await db.staffDay.findFirstOrThrow({ where: { userId: accountant.id } });
    expect(r.source).toBe('MANUAL');
    expect(r.checkIn).toBeNull();
  });
  it('routes prior missed days to the manager and prevents self-review', async () => {
    expect(
      (
        await post('/staff-attendance/leaves', supervisor.cookie, {
          date: istDate(),
          reason: 'Missed check-in',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await post('/staff-attendance/leaves', supervisor.cookie, {
          date: yesterday,
          reason: 'Missed check-in',
        })
      ).status,
    ).toBe(201);
    const leave = await db.staffLeave.findFirstOrThrow({ where: { organizationId: org } });
    expect(leave.reviewerId).toBe(manager.id);
    expect(
      await db.notification.count({ where: { organizationId: org, userId: manager.id } }),
    ).toBe(1);
    expect(
      (
        await request(app)
          .patch(`/api/staff-attendance/leaves/${leave.id}`)
          .set('Cookie', supervisor.cookie)
          .set('Origin', origin)
          .send({ status: 'APPROVED' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/staff-attendance/leaves/${leave.id}`)
          .set('Cookie', manager.cookie)
          .set('Origin', origin)
          .send({ status: 'APPROVED', note: 'Reviewed' })
      ).status,
    ).toBe(200);
    expect(
      (
        await db.staffDay.findUniqueOrThrow({
          where: { userId_workDate: { userId: supervisor.id, workDate: new Date(yesterday) } },
        })
      ).status,
    ).toBe('LEAVE');
  });
});
describe('Integrated FlowBridge', () => {
  it('validates raw signatures and greeting triggers', () => {
    const raw = Buffer.from('{"test":1}');
    const signature = 'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    expect(validSignature(raw, signature, 'secret')).toBe(true);
    expect(validSignature(raw, signature, 'other')).toBe(false);
    expect(validSignature(raw, 'sha256=bad', 'secret')).toBe(false);
    expect(greeting(' Hello! ')).toBe(true);
    expect(greeting('Goodbye')).toBe(false);
  });
  it('restricts FlowBridge to super administrators', async () => {
    expect((await request(app).get('/api/flowbridge').set('Cookie', manager.cookie)).status).toBe(
      403,
    );
    expect((await request(app).get('/api/flowbridge').set('Cookie', admin.cookie)).status).toBe(
      200,
    );
  });
  it('deduplicates signed incoming form submissions and creates a CRM lead', async () => {
    process.env.META_APP_SECRET = 'test-meta-secret';
    process.env.META_VERIFY_TOKEN = 'verify-test';
    process.env.META_PHONE_NUMBER_ID = 'phone-test';
    process.env.FLOWBRIDGE_ORGANIZATION_ID = org;
    process.env.FLOWBRIDGE_BUSINESS_UNIT_ID = unit;
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-test' },
                messages: [
                  {
                    id: `message-${randomUUID()}`,
                    from: '919999999999',
                    type: 'interactive',
                    interactive: {
                      nfm_reply: {
                        response_json: JSON.stringify({
                          full_name: 'Test lead',
                          email: 'lead@example.com',
                          city: 'Mumbai',
                          service: 'consultation',
                        }),
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(payload),
      signature =
        'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(raw).digest('hex');
    const send = () =>
      request(app)
        .post('/api/flowbridge/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signature)
        .send(raw);
    expect((await send()).body.queued).toBe(1);
    expect((await send()).body.queued).toBe(0);
    await runFlowJobs();
    await runFlowJobs();
    expect(await db.lead.count({ where: { organizationId: org, source: 'WHATSAPP' } })).toBe(1);
    expect(await db.flowContact.count({ where: { organizationId: org } })).toBe(1);
    const bad = await request(app)
      .post('/api/flowbridge/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=' + '0'.repeat(64))
      .send(raw);
    expect(bad.status).toBe(403);
  });
  it('creates WhatsApp campaign links without sending unsolicited messages', async () => {
    const response = await post('/flowbridge/campaigns', admin.cookie, {
      name: 'Test campaign',
      phone: '919999999999',
      message: 'Hi',
    });
    expect(response.status).toBe(201);
    const overview = await request(app).get('/api/flowbridge').set('Cookie', admin.cookie);
    expect(overview.body.campaigns[0].url).toBe('https://wa.me/919999999999?text=Hi');
  });
});
