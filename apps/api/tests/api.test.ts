import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { app } from '../src/app';
import { db } from '../src/lib/db';
import { digest, newToken } from '../src/modules/auth/service';
import { permissionKeys } from '../src/modules/resources/catalog';
const prefix = randomUUID();
const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
let org: string,
  otherOrg: string,
  unit: string,
  otherUnit: string,
  site: string,
  otherSite: string,
  client: string,
  worker: string,
  shift: string,
  admin: string,
  supervisor: string,
  deviceKey: string;
let adminCookie: string, workerCookie: string, supervisorCookie: string;
async function session(userId: string) {
  const token = newToken();
  await db.session.create({
    data: {
      organizationId: org,
      userId,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return `os_session=${token}`;
}
const post = (path: string, cookie = adminCookie) =>
  request(app).post(path).set('Origin', origin).set('Cookie', cookie);
const patch = (path: string) =>
  request(app).patch(path).set('Origin', origin).set('Cookie', adminCookie);
beforeAll(async () => {
  org = (
    await db.organization.create({ data: { name: 'Integration test', slug: `test-${prefix}` } })
  ).id;
  otherOrg = (
    await db.organization.create({ data: { name: 'Foreign test', slug: `foreign-${prefix}` } })
  ).id;
  unit = (
    await db.businessUnit.create({
      data: { organizationId: org, name: 'Viagreen', code: 'VIAGREEN' },
    })
  ).id;
  otherUnit = (
    await db.businessUnit.create({
      data: { organizationId: org, name: 'Anthrasite', code: 'ANTHRASITE' },
    })
  ).id;
  const role = await db.role.create({
    data: { organizationId: org, name: 'Super Admin', scope: 'ORGANIZATION' },
  });
  const workerRole = await db.role.create({
    data: { organizationId: org, name: 'Worker', scope: 'ASSIGNED' },
  });
  const supervisorRole = await db.role.create({
    data: { organizationId: org, name: 'Site Supervisor', scope: 'ASSIGNED' },
  });
  for (const key of permissionKeys) {
    const permission = await db.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key },
    });
    await db.rolePermission.create({
      data: { organizationId: org, roleId: role.id, permissionId: permission.id },
    });
    if (
      [
        'sites:read',
        'employees:read',
        'attendance:read',
        'waste:write',
        'waste:read',
        'tasks:read',
        'tasks:write',
        'tickets:write',
        'tickets:read',
        'dashboard:read',
      ].includes(key)
    )
      await db.rolePermission.createMany({
        data: [workerRole.id, supervisorRole.id].map((roleId) => ({
          organizationId: org,
          roleId,
          permissionId: permission.id,
        })),
      });
  }
  const passwordHash = await hash('test-only-random-' + prefix, 4);
  admin = (
    await db.user.create({
      data: {
        organizationId: org,
        name: 'Test Admin',
        email: `${prefix}@example.invalid`,
        passwordHash,
        roleId: role.id,
      },
    })
  ).id;
  const workerUser = await db.user.create({
    data: {
      organizationId: org,
      name: 'Test Worker',
      email: `worker-${prefix}@example.invalid`,
      passwordHash,
      roleId: workerRole.id,
      businessUnitId: unit,
    },
  });
  const supervisorUser = await db.user.create({
    data: {
      organizationId: org,
      name: 'Test Supervisor',
      email: `supervisor-${prefix}@example.invalid`,
      passwordHash,
      roleId: supervisorRole.id,
      businessUnitId: unit,
    },
  });
  supervisor = (
    await db.employee.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        userId: supervisorUser.id,
        name: 'Test Supervisor',
        employeeCode: 'SUP',
        position: 'SUPERVISOR',
      },
    })
  ).id;
  worker = (
    await db.employee.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        userId: workerUser.id,
        name: 'Test Worker',
        employeeCode: 'WRK',
        supervisorId: supervisor,
      },
    })
  ).id;
  client = (
    await db.client.create({
      data: { organizationId: org, businessUnitId: unit, name: 'Test Client', company: 'Test' },
    })
  ).id;
  site = (
    await db.site.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        clientId: client,
        name: 'Assigned site',
        address: 'Synthetic Mumbai address',
        supervisorId: supervisor,
      },
    })
  ).id;
  otherSite = (
    await db.site.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        clientId: client,
        name: 'Unassigned site',
        address: 'Synthetic other address',
      },
    })
  ).id;
  shift = (
    await db.shift.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        name: 'Morning',
        startMinute: 480,
        endMinute: 1020,
      },
    })
  ).id;
  await db.siteAssignment.create({
    data: {
      organizationId: org,
      businessUnitId: unit,
      siteId: site,
      employeeId: worker,
      shiftId: shift,
      startDate: new Date('2020-01-01'),
      isPrimary: true,
    },
  });
  deviceKey = newToken();
  await db.attendanceDevice.create({
    data: {
      organizationId: org,
      businessUnitId: unit,
      siteId: site,
      name: 'Test NFC',
      keyHash: digest(deviceKey),
    },
  });
  await db.nfcCard.create({
    data: {
      organizationId: org,
      employeeId: worker,
      name: 'Test card',
      cardHash: digest(`card-${prefix}`),
    },
  });
  adminCookie = await session(admin);
  workerCookie = await session(workerUser.id);
  supervisorCookie = await session(supervisorUser.id);
});
afterAll(async () => {
  await db.user.updateMany({
    where: { organizationId: { in: [org, otherOrg] } },
    data: { clientId: null },
  });
  // Delete only isolated test tenants, in FK dependency order.
  const models = [
    'savedPdf',
    'challan',
    'auditLog',
    'notification',
    'payment',
    'invoice',
    'attendanceTap',
    'attendance',
    'nfcCard',
    'attendanceDevice',
    'wasteRecord',
    'task',
    'ticket',
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
  ] as const;
  for (const model of models)
    await (db[model] as any).deleteMany({ where: { organizationId: { in: [org, otherOrg] } } });
  await db.organization.deleteMany({ where: { id: { in: [org, otherOrg] } } });
  await db.$disconnect();
});
describe('Authenticated APIs against PostgreSQL', () => {
  it('allows a manager multiple sites and team edits without accessing other managers', async () => {
    const role = await db.role.create({
      data: { organizationId: org, name: 'Operations Manager', scope: 'ASSIGNED' },
    });
    const permissions = await db.permission.findMany({
      where: { key: { in: ['sites:read', 'sites:write', 'employees:read', 'employees:write'] } },
    });
    await db.rolePermission.createMany({
      data: permissions.map((p) => ({ organizationId: org, roleId: role.id, permissionId: p.id })),
    });
    const user = await db.user.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        roleId: role.id,
        name: 'Manager',
        email: `manager-${prefix}@example.invalid`,
        passwordHash: await hash(prefix, 4),
      },
    });
    const manager = await db.employee.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        userId: user.id,
        employeeCode: 'MGR',
        name: 'Manager',
        position: 'MANAGER',
      },
    });
    await db.site.updateMany({
      where: { id: { in: [site, otherSite] } },
      data: { managerId: manager.id },
    });
    await db.employee.updateMany({
      where: { id: { in: [supervisor, worker] } },
      data: { managerId: manager.id },
    });
    const stranger = await db.employee.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        employeeCode: 'OTHER-MGR',
        name: 'Private manager',
        position: 'MANAGER',
      },
    });
    const cookie = await session(user.id);
    const location = { latitude: 19.1335208, longitude: 72.8540501 };
    const updated = await request(app)
      .patch(`/api/resources/sites/${site}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(location);
    expect(updated.status).toBe(200);
    expect(await db.site.findUnique({ where: { id: site } })).toMatchObject(location);
    expect(
      (
        await request(app)
          .patch(`/api/resources/sites/${site}`)
          .set('Origin', origin)
          .set('Cookie', supervisorCookie)
          .send({ latitude: 0, longitude: 0 })
      ).status,
    ).toBe(403);
    await db.site.update({ where: { id: otherSite }, data: { managerId: stranger.id } });
    expect(
      (
        await request(app)
          .patch(`/api/resources/sites/${otherSite}`)
          .set('Origin', origin)
          .set('Cookie', cookie)
          .send(location)
      ).status,
    ).toBe(404);
    await db.site.update({ where: { id: otherSite }, data: { managerId: manager.id } });
    expect((await request(app).get('/api/resources/sites').set('Cookie', cookie)).body.total).toBe(
      2,
    );
    expect(
      (await request(app).get(`/api/resources/employees/${supervisor}`).set('Cookie', cookie))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/resources/employees/${stranger.id}`).set('Cookie', cookie))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/resources/employees/${worker}`)
          .set('Origin', origin)
          .set('Cookie', cookie)
          .send({ name: 'Managed worker' })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch(`/api/resources/employees/${worker}`)
          .set('Origin', origin)
          .set('Cookie', cookie)
          .send({ managerId: stranger.id })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/resources/employees/${worker}`)
          .set('Origin', origin)
          .set('Cookie', cookie)
          .send({ position: 'MANAGER' })
      ).status,
    ).toBe(403);
  });

  it('isolates customer sites and teams, accepts complaints, and blocks resolution and finance', async () => {
    const role = await db.role.create({
      data: { organizationId: org, name: 'Customer', scope: 'ASSIGNED' },
    });
    const permissions = await db.permission.findMany({
      where: { key: { in: ['sites:read', 'employees:read', 'tickets:read', 'tickets:write'] } },
    });
    await db.rolePermission.createMany({
      data: permissions.map((p) => ({ organizationId: org, roleId: role.id, permissionId: p.id })),
    });
    const user = await db.user.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        clientId: client,
        roleId: role.id,
        name: 'Customer',
        email: `customer-${prefix}@example.invalid`,
        passwordHash: await hash(prefix, 4),
      },
    });
    const cookie = await session(user.id);
    const alien = await db.client.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        name: 'Another customer',
        company: 'Other',
      },
    });
    const alienSite = await db.site.create({
      data: {
        organizationId: org,
        businessUnitId: unit,
        clientId: alien.id,
        name: 'Private site',
        address: 'Private',
      },
    });
    const sites = await request(app).get('/api/resources/sites').set('Cookie', cookie);
    expect(sites.status).toBe(200);
    expect(sites.body.rows.map((s: any) => s.id).sort()).toEqual([site, otherSite].sort());
    expect(
      (await request(app).get(`/api/resources/sites/${alienSite.id}`).set('Cookie', cookie)).status,
    ).toBe(404);
    const team = await request(app).get('/api/customer/team').set('Cookie', cookie);
    expect(team.status).toBe(200);
    expect(team.body.find((s: any) => s.id === site).supervisor.id).toBe(supervisor);
    expect(team.body.find((s: any) => s.id === site).workers.map((w: any) => w.id)).toContain(
      worker,
    );
    const payload = {
      name: 'Customer complaint',
      siteId: site,
      category: 'CLIENT',
      priority: 'HIGH',
      description: 'Please review service quality.',
    };
    const ticket = await post('/api/resources/tickets', cookie).send(payload);
    expect(ticket.status).toBe(201);
    expect(ticket.body.clientId).toBe(client);
    expect(ticket.body.status).toBe('OPEN');
    expect(
      (await post('/api/resources/tickets', cookie).send({ ...payload, siteId: alienSite.id }))
        .status,
    ).toBe(403);
    expect(
      (await post('/api/resources/tickets', cookie).send({ ...payload, clientId: alien.id }))
        .status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .patch(`/api/resources/tickets/${ticket.body.id}`)
          .set('Origin', origin)
          .set('Cookie', cookie)
          .send({ status: 'CLOSED' })
      ).status,
    ).toBe(403);
    expect((await request(app).get('/api/resources/invoices').set('Cookie', cookie)).status).toBe(
      403,
    );
    await db.user.update({ where: { id: user.id }, data: { clientId: null } });
    expect((await request(app).get('/api/resources/sites').set('Cookie', cookie)).body.total).toBe(
      0,
    );
  });

  it('saves immutable billing PDFs and denies unauthorized downloads', async () => {
    const created = await post('/api/resources/invoices').send({
      name: 'PDF test invoice',
      invoiceNumber: `PDF-${prefix}`,
      businessUnitId: unit,
      siteId: site,
      clientId: client,
      issuedAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      amount: 118,
    });
    expect(created.status).toBe(201);
    const path = `/api/billing/invoices/${created.body.id}/pdfs`;
    const options = {
      issuerAddress: 'Example address',
      gstRate: 18,
      gstMode: 'CGST_SGST',
      bankName: 'Example bank',
      accountNumber: '000000',
      terms: 'Payment within 30 days.',
    };
    const saved = await post(path).send(options);
    expect(saved.status).toBe(201);
    expect(saved.body.filename).toContain('.pdf');
    expect(saved.body).not.toHaveProperty('content');
    expect((await post(path).send(options)).body.id).toBe(saved.body.id);
    const before = await db.savedPdf.findUniqueOrThrow({ where: { id: saved.body.id } });
    expect(Buffer.from(before.content).subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      (
        await patch(`/api/resources/invoices/${created.body.id}`).send({
          name: 'Changed description',
        })
      ).status,
    ).toBe(200);
    const revised = await post(path).send(options);
    expect(revised.status).toBe(201);
    expect(revised.body.id).not.toBe(saved.body.id);
    expect((await db.savedPdf.findUniqueOrThrow({ where: { id: saved.body.id } })).content).toEqual(
      before.content,
    );
    const url = `/api/saved-pdfs/${saved.body.id}/download`;
    expect(
      (await request(app).get(url).set('Cookie', adminCookie)).headers['content-type'],
    ).toContain('application/pdf');
    expect((await request(app).get(url).set('Cookie', workerCookie)).status).toBe(403);
    expect((await post(path, workerCookie).send({})).status).toBe(403);
    const foreign = await db.savedPdf.create({
      data: {
        organizationId: otherOrg,
        sourceKey: 'invoices',
        sourceId: created.body.id,
        fingerprint: prefix,
        filename: 'foreign.pdf',
        content: new Uint8Array([1]),
        size: 1,
        createdBy: admin,
      },
    });
    expect(
      (await request(app).get(`/api/saved-pdfs/${foreign.id}/download`).set('Cookie', adminCookie))
        .status,
    ).toBe(404);
  });
  it.each(['DELIVERY', 'WASTE_COLLECTION', 'WASTE_DISPOSAL'])(
    'creates and saves a %s challan with optional fields omitted',
    async (kind) => {
      const body = {
        name: 'Material movement',
        challanNumber: `${kind}-${prefix}`,
        kind,
        businessUnitId: unit,
        siteId: site,
        clientId: client,
        issuedAt: new Date().toISOString(),
        material: 'Segregated recyclable material',
        quantity: 12.5,
        unit: 'KG',
      };
      expect((await post('/api/resources/challans').send({ ...body, quantity: 0 })).status).toBe(
        422,
      );
      const created = await post('/api/resources/challans').send(body);
      expect(
        (await post('/api/resources/challans').send({ ...body, quantity: 0.0001 })).status,
      ).toBe(422);
      expect(created.status).toBe(201);
      const saved = await post(`/api/billing/challans/${created.body.id}/pdfs`).send({});
      expect(saved.status).toBe(201);
      const list = await request(app)
        .get(`/api/billing/challans/${created.body.id}/pdfs`)
        .set('Cookie', adminCookie);
      expect(list.body.map((row: { id: string }) => row.id)).toContain(saved.body.id);
    },
  );
  it('requires authentication', async () =>
    expect((await request(app).get('/api/resources/sites')).status).toBe(401));
  it('rejects CSRF mutations', async () =>
    expect(
      (await request(app).post('/api/resources/sites').set('Cookie', adminCookie).send({})).status,
    ).toBe(403));
  it('returns only worker-assigned sites, including detail checks', async () => {
    const r = await request(app).get('/api/resources/sites').set('Cookie', workerCookie);
    expect(r.status).toBe(200);
    expect(r.body.rows.map((s: any) => s.id)).toEqual([site]);
    expect(
      (await request(app).get(`/api/resources/sites/${otherSite}`).set('Cookie', workerCookie))
        .status,
    ).toBe(404);
  });
  it('denies finance data to workers', async () =>
    expect(
      (await request(app).get('/api/resources/invoices').set('Cookie', workerCookie)).status,
    ).toBe(403));
  it('rejects cross-tenant foreign keys at the database', async () => {
    await expect(
      db.client.create({
        data: {
          organizationId: otherOrg,
          businessUnitId: unit,
          name: 'Invalid',
          company: 'Invalid',
        },
      }),
    ).rejects.toThrow();
  });
  it('rejects business-unit mismatch', async () => {
    const r = await post('/api/resources/sites').send({
      name: 'Wrong BU',
      businessUnitId: otherUnit,
      clientId: client,
      address: 'Test',
      expectedDailyWaste: 100,
      startDate: new Date().toISOString(),
      status: 'ACTIVE',
      wasteType: 'MIXED',
    });
    expect(r.status).toBe(422);
  });
  it('validates and audits a site write', async () => {
    const before = await db.auditLog.count({
      where: { organizationId: org, entityId: site, action: 'UPDATE' },
    });
    const r = await patch(`/api/resources/sites/${site}`).send({ name: 'Updated assigned site' });
    expect(r.status).toBe(200);
    expect(
      await db.auditLog.count({ where: { organizationId: org, entityId: site, action: 'UPDATE' } }),
    ).toBe(before + 1);
  });
  it('paginates, filters, searches and sorts server-side', async () => {
    const r = await request(app)
      .get('/api/resources/sites?limit=1&page=1&search=assigned&status=ACTIVE&sort=name&order=asc')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(1);
    expect(r.body.total).toBe(2);
  });
  it('records NFC taps once with replay protection', async () => {
    const body = {
      eventId: randomUUID(),
      cardId: `card-${prefix}`,
      action: 'CHECK_IN',
      timestamp: new Date().toISOString(),
    };
    const r = await request(app)
      .post('/api/attendance/tap')
      .set('x-device-key', deviceKey)
      .send(body);
    expect(r.status).toBe(200);
    const replay = await request(app)
      .post('/api/attendance/tap')
      .set('x-device-key', deviceKey)
      .send(body);
    expect(replay.body.duplicate).toBe(true);
    const duplicate = await request(app)
      .post('/api/attendance/tap')
      .set('x-device-key', deviceKey)
      .send({ ...body, eventId: randomUUID() });
    expect(duplicate.body.duplicate).toBe(true);
    expect(await db.attendance.count({ where: { organizationId: org } })).toBe(1);
  });
  it('rejects stale hardware events', async () => {
    const r = await request(app)
      .post('/api/attendance/tap')
      .set('x-device-key', deviceKey)
      .send({
        eventId: randomUUID(),
        cardId: `card-${prefix}`,
        action: 'CHECK_OUT',
        timestamp: new Date(Date.now() - 600000).toISOString(),
      });
    expect(r.status).toBe(422);
  });
  it('requires a reason for manual attendance corrections', async () => {
    const a = await db.attendance.findFirstOrThrow({ where: { organizationId: org } });
    expect(
      (
        await patch(`/api/resources/attendance/${a.id}`).send({
          checkOut: new Date(Date.now() + 60000).toISOString(),
        })
      ).status,
    ).toBe(422);
  });
  it('prevents skipped ticket transitions', async () => {
    const ticket = await post('/api/resources/tickets').send({
      name: 'Test issue',
      businessUnitId: unit,
      siteId: site,
      clientId: client,
      category: 'SAFETY',
      priority: 'HIGH',
      description: 'Review PPE',
      status: 'OPEN',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(ticket.status).toBe(201);
    expect(
      (await patch(`/api/resources/tickets/${ticket.body.id}`).send({ status: 'CLOSED' })).status,
    ).toBe(422);
  });
  it('prevents overpayment and updates invoice balance atomically', async () => {
    const invoice = await post('/api/resources/invoices').send({
      name: 'Test invoice',
      invoiceNumber: `TEST-${prefix}`,
      businessUnitId: unit,
      siteId: site,
      clientId: client,
      issuedAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      amount: 100,
    });
    expect(invoice.status).toBe(201);
    const body = {
      name: 'Test receipt',
      businessUnitId: unit,
      siteId: site,
      invoiceId: invoice.body.id,
      amount: 101,
      paidAt: new Date().toISOString(),
      reference: `receipt-${prefix}`,
      method: 'BANK_TRANSFER',
    };
    expect((await post('/api/resources/payments').send(body)).status).toBe(422);
    expect((await post('/api/resources/payments').send({ ...body, amount: 100 })).status).toBe(201);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoice.body.id } })).status).toBe(
      'PAID',
    );
  });
  it('serves authorized CSV, Excel and PDF exports', async () => {
    for (const format of ['csv', 'xlsx', 'pdf']) {
      const r = await request(app).get(`/api/reports/sites/${format}`).set('Cookie', adminCookie);
      expect(r.status).toBe(200);
      expect(r.headers['content-disposition']).toContain(`.${format}`);
    }
  });
  it('computes dashboard metrics from scoped stored records', async () => {
    const q = new URLSearchParams({
      from: new Date(Date.now() - 86400000).toISOString(),
      to: new Date(Date.now() + 86400000).toISOString(),
    });
    const r = await request(app).get(`/api/dashboard?${q}`).set('Cookie', workerCookie);
    expect(r.status).toBe(200);
    expect(r.body.metrics.activeSites).toBe(1);
    expect(r.body.metrics.outstanding).toBe(0);
  });
});
