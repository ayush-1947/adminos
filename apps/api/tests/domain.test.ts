import { describe, it, expect } from 'vitest';
import { attendanceFlags, shiftWindow } from '../src/modules/attendance/domain';
import { scopeFor } from '../src/modules/resources/scope';
import { requirePermission, type Principal } from '../src/modules/auth/policy';
import { safeCell } from '../src/modules/reports/service';
import { inputSchema } from '../src/modules/resources/validation';
import { catalog } from '../src/modules/resources/catalog';
import { listWhere } from '../src/modules/resources/service';
import { taxBreakdown, pdfOptions } from '../src/modules/billing/service';
import { Prisma } from '@prisma/client';
const p: Principal = {
  userId: 'u',
  organizationId: 'o',
  businessUnitId: 'b',
  role: 'Worker',
  scope: 'ASSIGNED',
  permissions: ['sites:read'],
  employeeId: 'e',
  siteIds: ['s'],
};
describe('Security and operational domain', () => {
  it('keeps GST breakdown exact within the recorded total', () => {
    expect(taxBreakdown(new Prisma.Decimal('118'), 18, 'CGST_SGST')).toEqual([
      ['Taxable amount', 'INR 100.00'],
      ['CGST (9%)', 'INR 9.00'],
      ['SGST (9%)', 'INR 9.00'],
    ]);
    expect(pdfOptions.parse({})).toEqual({});
    expect(() => pdfOptions.parse({ gstRate: 18 })).toThrow();
  });
  it('filters invoices by payment status without making status editable', () => {
    expect(listWhere('invoices', p, { status: 'PARTIAL' }).where.AND).toContainEqual({
      status: 'PARTIAL',
    });
    expect(() => inputSchema(catalog.invoices).partial().parse({ status: 'PAID' })).toThrow();
  });
  it('rejects unknown invoice statuses', () => {
    expect(() => listWhere('invoices', p, { status: 'INVALID' })).toThrow('Invalid status filter');
  });
  it('denies absent granular permissions', () =>
    expect(() => requirePermission(p, 'invoices:write')).toThrow());
  it('limits worker attendance to self and assigned sites', () =>
    expect(scopeFor('attendance', p)).toMatchObject({
      organizationId: 'o',
      businessUnitId: 'b',
      siteId: { in: ['s'] },
      employeeId: 'e',
    }));
  it('scopes related contacts through their clients', () =>
    expect(scopeFor('contacts', p)).toHaveProperty('client.organizationId', 'o'));
  it('blocks mass-assignment of organizationId', () =>
    expect(() => inputSchema(catalog.clients).parse({ organizationId: 'other' })).toThrow());
  it('flags late check-in and early checkout in IST', () =>
    expect(
      attendanceFlags(
        new Date('2026-09-15T08:16:00+05:30'),
        new Date('2026-09-15T16:50:00+05:30'),
        { startMinute: 480, endMinute: 1020, graceMinutes: 15 },
      ),
    ).toEqual({ status: 'LATE', earlyDeparture: true, overtimeMinutes: 0 }));
  it('calculates overnight shift work date and overtime', () => {
    const shift = { startMinute: 1320, endMinute: 360, graceMinutes: 15 };
    expect(shiftWindow(new Date('2026-09-16T02:00:00+05:30'), shift).workDate.toISOString()).toBe(
      '2026-09-15T00:00:00.000Z',
    );
    expect(
      attendanceFlags(
        new Date('2026-09-15T22:00:00+05:30'),
        new Date('2026-09-16T06:45:00+05:30'),
        shift,
      ).overtimeMinutes,
    ).toBe(45);
  });
  it.each(['=HYPERLINK("evil")', '+SUM(1)', '-42', '@SUM(1)', '\t=cmd'])(
    'neutralizes spreadsheet formulas: %s',
    (value) => expect(safeCell(value)).toBe(`'${value}`),
  );
});
