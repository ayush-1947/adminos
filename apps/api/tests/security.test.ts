import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { passwordSchema } from '../src/modules/auth/password';
import { scopeFor } from '../src/modules/resources/scope';
import type { Principal } from '../src/modules/auth/policy';

vi.mock('../src/lib/db', () => ({
  db: { $transaction: vi.fn(), role: { findFirst: vi.fn() }, employee: { findFirst: vi.fn() } },
}));
import { db } from '../src/lib/db';
import { createUser } from '../src/modules/auth/admin';
import { app } from '../src/app';

const principal: Principal = {
  userId: randomUUID(),
  organizationId: randomUUID(),
  businessUnitId: null,
  role: 'Worker',
  scope: 'ASSIGNED',
  permissions: [],
  employeeId: null,
  siteIds: [],
};

describe('Security regressions without a database', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enforces the bcrypt byte boundary for ASCII and multibyte credentials', () => {
    expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
    expect(passwordSchema.safeParse('अ'.repeat(24)).success).toBe(true);
    expect(passwordSchema.safeParse('अ'.repeat(25)).success).toBe(false);
    expect(passwordSchema.safeParse('short').success).toBe(false);
  });

  it.each([
    ['business-units', 'id'],
    ['employees', 'id'],
    ['attendance', 'employeeId'],
    ['assignments', 'employeeId'],
    ['tasks', 'assigneeId'],
    ['waste', 'workerId'],
  ])('uses an impossible UUID for an unlinked worker reading %s', (key, field) => {
    expect(scopeFor(key, principal)[field]).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('rejects malformed JSON with a safe client error and request ID', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"password":"sensitive",');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Malformed JSON request');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(JSON.stringify(response.body)).not.toContain('sensitive');
  });

  it('rejects oversized JSON before authentication or hashing', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ value: 'x'.repeat(262144) });
    expect(response.status).toBe(413);
    expect(response.body.requestId).toBeTruthy();
  });

  it('rejects the transaction when another request claims the employee first', async () => {
    const employeeId = randomUUID();
    const roleId = randomUUID();
    vi.mocked(db.role.findFirst).mockResolvedValue({
      id: roleId,
      name: 'Worker',
      scope: 'ASSIGNED',
    } as never);
    vi.mocked(db.employee.findFirst).mockResolvedValue({ id: employeeId } as never);
    const tx = {
      user: { create: vi.fn().mockResolvedValue({ id: randomUUID() }) },
      employee: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: vi.fn() },
    };
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => callback(tx));
    await expect(
      createUser(
        {
          name: 'Test worker',
          email: 'worker@example.invalid',
          password: 'test-password-1234',
          roleId,
          businessUnitId: null,
          employeeId,
        },
        { ...principal, scope: 'ORGANIZATION', permissions: ['users:manage'] },
        randomUUID(),
      ),
    ).rejects.toThrow();
    // Use a scoped unit so validation reaches the transactional claim.
    const businessUnitId = randomUUID();
    (db as any).businessUnit = { findFirst: vi.fn().mockResolvedValue({ id: businessUnitId }) };
    await expect(
      createUser(
        {
          name: 'Test worker',
          email: 'worker@example.invalid',
          password: 'test-password-1234',
          roleId,
          businessUnitId,
          employeeId,
        },
        { ...principal, scope: 'ORGANIZATION', permissions: ['users:manage'] },
        randomUUID(),
      ),
    ).rejects.toThrow('Employee is unavailable or already linked to a user');
    expect(tx.employee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: employeeId,
          userId: null,
          organizationId: principal.organizationId,
        }),
      }),
    );
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
