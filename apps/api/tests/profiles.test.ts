import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../src/app';
import { db } from '../src/lib/db';
import { digest, newToken } from '../src/modules/auth/service';

const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
const marker = randomUUID();
let org: string, foreignOrg: string, worker: string, stranger: string, client: string;
let adminCookie: string, managerCookie: string, customerCookie: string, outsiderCookie: string;
let photoId: string, proofId: string, documentId: string;
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZAAAAABJRU5ErkJggg==',
  'base64',
);
const path = () => `/api/profiles/employees/${worker}`;
const get = (url: string, cookie = adminCookie) => request(app).get(url).set('Cookie', cookie);
const patch = (url: string, body: unknown, cookie = adminCookie) =>
  request(app).patch(url).set('Origin', origin).set('Cookie', cookie).send(body);
const post = (url: string, cookie = adminCookie) =>
  request(app).post(url).set('Origin', origin).set('Cookie', cookie);

beforeAll(async () => {
  org = (
    await db.organization.create({ data: { name: 'Profile tests', slug: `profiles-${marker}` } })
  ).id;
  foreignOrg = (
    await db.organization.create({
      data: { name: 'Foreign profile tests', slug: `profiles-foreign-${marker}` },
    })
  ).id;
  const unit = await db.businessUnit.create({
    data: { organizationId: org, name: 'Unit', code: 'VIAGREEN' },
  });
  const createUser = async (
    name: string,
    scope: string,
    organizationId = org,
    clientId?: string,
  ) => {
    const role = await db.role.create({ data: { organizationId, name, scope } });
    for (const key of [
      'employees:read',
      'clients:read',
      ...(name === 'Super Admin' ? ['users:manage'] : []),
    ]) {
      const permission = await db.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: key },
      });
      await db.rolePermission.create({
        data: { organizationId, roleId: role.id, permissionId: permission.id },
      });
    }
    const user = await db.user.create({
      data: {
        organizationId,
        businessUnitId: organizationId === org ? unit.id : null,
        roleId: role.id,
        name,
        email: `${name.replaceAll(' ', '')}-${organizationId}@example.invalid`,
        passwordHash: 'unused-session-test',
        clientId,
      },
    });
    const token = newToken();
    await db.session.create({
      data: {
        organizationId,
        userId: user.id,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { user, cookie: `os_session=${token}` };
  };
  adminCookie = (await createUser('Super Admin', 'ORGANIZATION')).cookie;
  const managerUser = await createUser('Operations Manager', 'ASSIGNED');
  managerCookie = managerUser.cookie;
  const manager = await db.employee.create({
    data: {
      organizationId: org,
      businessUnitId: unit.id,
      name: 'Manager',
      employeeCode: 'M',
      position: 'MANAGER',
      userId: managerUser.user.id,
    },
  });
  worker = (
    await db.employee.create({
      data: {
        organizationId: org,
        businessUnitId: unit.id,
        name: 'Assigned Worker',
        employeeCode: 'W',
        managerId: manager.id,
      },
    })
  ).id;
  stranger = (
    await db.employee.create({
      data: {
        organizationId: org,
        businessUnitId: unit.id,
        name: 'Unassigned Worker',
        employeeCode: 'X',
      },
    })
  ).id;
  client = (
    await db.client.create({
      data: {
        organizationId: org,
        businessUnitId: unit.id,
        name: 'Customer',
        company: 'Customer Ltd',
        managerId: manager.id,
      },
    })
  ).id;
  const site = await db.site.create({
    data: {
      organizationId: org,
      businessUnitId: unit.id,
      clientId: client,
      managerId: manager.id,
      name: 'Customer site',
      address: 'Test',
    },
  });
  const shift = await db.shift.create({
    data: {
      organizationId: org,
      businessUnitId: unit.id,
      name: 'Day',
      startMinute: 480,
      endMinute: 1020,
    },
  });
  await db.siteAssignment.create({
    data: {
      organizationId: org,
      businessUnitId: unit.id,
      siteId: site.id,
      shiftId: shift.id,
      employeeId: worker,
      startDate: new Date('2020-01-01'),
    },
  });
  customerCookie = (await createUser('Customer', 'ASSIGNED', org, client)).cookie;
  outsiderCookie = (await createUser('Super Admin', 'ORGANIZATION', foreignOrg)).cookie;
});

it('scopes organization charts and includes site teams without private profile data', async () => {
  const admin = await get('/api/org-chart');
  expect(admin.status).toBe(200);
  expect(admin.body.collapseManagers).toBe(true);
  expect(admin.body.people.some((p: any) => p.id === stranger)).toBe(true);
  for (const cookie of [managerCookie, customerCookie]) {
    const result = await get('/api/org-chart', cookie);
    expect(result.status).toBe(200);
    expect(result.body.people.some((p: any) => p.id === worker)).toBe(true);
    expect(result.body.people.some((p: any) => p.id === stranger)).toBe(false);
    expect(result.body.sites[0].client.id).toBe(client);
    expect(result.body.sites[0].assignments[0].employeeId).toBe(worker);
    expect(result.body.people[0]).not.toHaveProperty('monthlyPay');
    expect(result.body.people[0]).not.toHaveProperty('email');
  }
  const outsider = await get('/api/org-chart', outsiderCookie);
  expect(outsider.status).toBe(200);
  expect(outsider.body.people).toEqual([]);
  expect(outsider.body.sites).toEqual([]);
});

afterAll(async () => {
  if (!org) return;
  const organizationId = { in: [org, foreignOrg].filter(Boolean) };
  await db.personProfile.deleteMany({ where: { organizationId } });
  await db.user.updateMany({ where: { organizationId }, data: { clientId: null } });
  for (const model of [
    'auditLog',
    'siteAssignment',
    'site',
    'client',
    'employee',
    'shift',
    'session',
    'user',
    'rolePermission',
    'role',
    'businessUnit',
  ] as const) {
    await (db[model] as any).deleteMany({ where: { organizationId } });
  }
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.$disconnect();
});

describe('Private people profiles', () => {
  it('stores profile details and pay without exposing internal data to customers', async () => {
    const saved = await patch(
      path(),
      {
        phone: '+91 90000 00000',
        designation: 'Site Worker',
        address: 'Private home address',
        dateOfBirth: '1990-01-01',
        emergencyContact: 'Private contact',
        governmentIdType: 'Test ID',
        governmentIdNumber: 'SYNTHETIC-1234',
        monthlyPay: '25000.50',
        notes: 'Private internal note',
      },
      managerCookie,
    );
    expect(saved.status).toBe(200);
    expect(saved.body.monthlyPay).toBe('25000.5');
    const customer = await get(path(), customerCookie);
    expect(customer.status).toBe(200);
    expect(customer.body.governmentIdNumber).toBe('SYNTHETIC-1234');
    expect(customer.body.phone).toBe('+91 90000 00000');
    for (const key of [
      'monthlyPay',
      'payments',
      'documents',
      'notes',
      'address',
      'dateOfBirth',
      'emergencyContact',
    ])
      expect(customer.body).not.toHaveProperty(key);
    expect((await patch(path(), { phone: 'changed' }, customerCookie)).status).toBe(403);
    const audit = await db.auditLog.findFirst({
      where: { organizationId: org, action: 'UPDATE_PROFILE' },
    });
    expect(JSON.stringify(audit)).not.toContain('SYNTHETIC-1234');
  });
  it('protects the profile and files across site and organization boundaries', async () => {
    expect((await get(`/api/profiles/employees/${stranger}`, managerCookie)).status).toBe(404);
    expect((await get(`/api/profiles/employees/${stranger}`, customerCookie)).status).toBe(404);
    expect((await get(path(), outsiderCookie)).status).toBe(404);
    expect((await request(app).get(path())).status).toBe(401);
  });
  it('serves private photos and staff ID proofs to the assigned customer, but not payslips', async () => {
    for (const kind of ['PHOTO', 'GOVERNMENT_ID', 'PAYSLIP']) {
      const response = await post(`${path()}/assets`, managerCookie)
        .field('kind', kind)
        .attach('file', image, { filename: 'synthetic-test.png', contentType: 'image/png' });
      expect(response.status).toBe(201);
      expect(response.body).not.toHaveProperty('content');
      if (kind === 'PHOTO') photoId = response.body.id;
      if (kind === 'GOVERNMENT_ID') proofId = response.body.id;
      if (kind === 'PAYSLIP') documentId = response.body.id;
    }
    expect((await get(`${path()}/assets/${photoId}`, customerCookie)).status).toBe(200);
    const proof = await get(`${path()}/assets/${proofId}`, customerCookie);
    expect(proof.status).toBe(200);
    expect(proof.headers['cache-control']).toBe('no-store');
    expect((await get(`${path()}/assets/${documentId}`, customerCookie)).status).toBe(403);
    expect((await get(`${path()}/assets/${proofId}`, outsiderCookie)).status).toBe(404);
    const card = await get(path(), customerCookie);
    expect(card.body.assets.map((a: any) => a.kind).sort()).toEqual(['GOVERNMENT_ID', 'PHOTO']);
  });
  it('rejects invalid images and customer uploads against staff profiles', async () => {
    expect(
      (
        await post(`${path()}/assets`)
          .field('kind', 'PHOTO')
          .attach('file', Buffer.from('<script>bad</script>'), {
            filename: 'fake.png',
            contentType: 'image/png',
          })
      ).status,
    ).toBe(422);
    expect(
      (
        await post(`${path()}/assets`, customerCookie)
          .field('kind', 'GOVERNMENT_ID')
          .attach('file', image, { filename: 'test.png', contentType: 'image/png' })
      ).status,
    ).toBe(403);
  });
  it('allows customers to update their own ID proof, never pay or internal notes', async () => {
    const url = `/api/profiles/clients/${client}`;
    expect(
      (
        await patch(
          url,
          {
            governmentIdType: 'Test ID',
            governmentIdNumber: 'CUSTOMER-SYNTHETIC',
            phone: '9000000000',
          },
          customerCookie,
        )
      ).status,
    ).toBe(200);
    expect((await patch(url, { monthlyPay: '10.00' }, customerCookie)).status).toBe(403);
    expect((await patch(url, { notes: 'internal' }, customerCookie)).status).toBe(403);
    const upload = await post(`${url}/assets`, customerCookie)
      .field('kind', 'GOVERNMENT_ID')
      .attach('file', image, { filename: 'customer-proof.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    expect((await get(`${path()}/assets/${upload.body.id}`, managerCookie)).status).toBe(404);
  });
  it('records exact staff payments for managers and admins only', async () => {
    const payment = {
      amount: '1234.56',
      period: 'September 2026',
      paidAt: new Date(Date.now() - 3600000).toISOString(),
      method: 'BANK_TRANSFER',
      reference: 'TEST-REFERENCE',
    };
    expect((await post(`${path()}/payments`, customerCookie).send(payment)).status).toBe(403);
    expect((await post(`${path()}/payments`, managerCookie).send(payment)).status).toBe(201);
    expect(
      (await post(`${path()}/payments`, managerCookie).send({ ...payment, amount: '0' })).status,
    ).toBe(422);
    expect(
      (await post(`${path()}/payments`, managerCookie).send({ ...payment, amount: '1.001' }))
        .status,
    ).toBe(422);
    const profile = await get(path());
    expect(profile.body.paymentTotal).toBe('1234.56');
    expect(profile.body.payments).toHaveLength(1);
    expect((await get(path(), customerCookie)).body).not.toHaveProperty('paymentTotal');
  });
  it('revokes customer access to staff ID files after their site assignment ends', async () => {
    await db.siteAssignment.updateMany({
      where: { organizationId: org, employeeId: worker },
      data: { endDate: new Date('2020-01-02') },
    });
    expect((await get(path(), customerCookie)).status).toBe(404);
    expect((await get(`${path()}/assets/${proofId}`, customerCookie)).status).toBe(404);
    expect((await get(path(), managerCookie)).status).toBe(200);
  });
});
