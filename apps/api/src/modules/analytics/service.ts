import { z } from 'zod';
import { db, repository, type Row } from '../../lib/db';
import { requirePermission, type Principal } from '../auth/policy';
import { scopeFor } from '../resources/scope';
import { HttpError } from '../../lib/errors';
import { attendanceCredit } from '../attendance/domain';
const range = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  businessUnitId: z.uuid().optional(),
});
export async function dashboard(p: Principal, query: unknown) {
  requirePermission(p, 'dashboard:read');
  const q = range.parse(query);
  const from = new Date(q.from),
    to = new Date(q.to);
  if (to < from || to.getTime() - from.getTime() > 366 * 86400000)
    throw new HttpError(422, 'Date range must be between 0 and 366 days');
  const scoped = (key: string) => ({
    AND: [scopeFor(key, p), ...(q.businessUnitId ? [{ businessUnitId: q.businessUnitId }] : [])],
  });
  const can = (key: string) => p.permissions.includes(`${key}:read`);
  const rows = (key: string, model: string, dateField?: string) =>
    can(key)
      ? repository(model).findMany({
          where: { ...scoped(key), ...(dateField ? { [dateField]: { gte: from, lte: to } } : {}) },
        })
      : Promise.resolve([] as Row[]);
  const [
    sites,
    employees,
    clients,
    waste,
    attendance,
    machines,
    batches,
    tickets,
    tasks,
    invoices,
    payments,
    visits,
    events,
    assignments,
  ] = await Promise.all([
    rows('sites', 'site'),
    rows('employees', 'employee'),
    rows('clients', 'client'),
    rows('waste', 'wasteRecord', 'recordedAt'),
    rows('attendance', 'attendance', 'workDate'),
    rows('machines', 'machine'),
    rows('production', 'productionBatch', 'startTime'),
    rows('tickets', 'ticket'),
    rows('tasks', 'task'),
    rows('invoices', 'invoice'),
    rows('payments', 'payment'),
    rows('visits', 'siteVisit', 'visitedAt'),
    rows('machine-events', 'machineEvent'),
    rows('assignments', 'siteAssignment'),
  ]);
  const sum = (items: Row[], key: string) => items.reduce((a, x) => a + Number(x[key] || 0), 0);
  const paidByInvoice = new Map<string, number>();
  for (const payment of payments)
    paidByInvoice.set(
      payment.invoiceId,
      (paidByInvoice.get(payment.invoiceId) || 0) + Number(payment.amount),
    );
  const outstanding = invoices.reduce(
    (a, i) => a + Math.max(0, Number(i.amount) - (paidByInvoice.get(i.id) || 0)),
    0,
  );
  const revenue = sum(
    invoices.filter((i) => i.issuedAt >= from && i.issuedAt <= to),
    'amount',
  );
  const current = new Date();
  const startToday = new Date(
    new Date(current.getTime() + 330 * 60000).toISOString().slice(0, 10) + 'T00:00:00+05:30',
  );
  const workers = employees.filter((e) => e.position === 'WORKER' && e.status === 'ACTIVE');
  const scheduled = new Set<string>();
  for (
    let day = new Date(new Date(from.getTime() + 330 * 60000).toISOString().slice(0, 10));
    day <= to && day <= current;
    day = new Date(day.getTime() + 86400000)
  ) {
    for (const a of assignments)
      if (a.startDate <= day && (!a.endDate || a.endDate >= day))
        scheduled.add(`${a.employeeId}:${a.siteId}:${day.toISOString().slice(0, 10)}`);
  }
  for (const a of attendance)
    scheduled.add(`${a.employeeId}:${a.siteId}:${a.workDate.toISOString().slice(0, 10)}`);
  const presentDays = attendance.reduce((total, a) => total + attendanceCredit(a.status), 0);
  const attended = attendance.filter((a) => a.status !== 'ABSENT');
  const attendancePercent = scheduled.size ? Math.round((presentDays / scheduled.size) * 100) : 0;
  const wasteByDay: Record<string, { date: string; waste: number; coal: number; present: number }> =
    {};
  for (let day = new Date(from); day <= to; day = new Date(day.getTime() + 86400000)) {
    const key = new Date(day.getTime() + 330 * 60000).toISOString().slice(0, 10);
    wasteByDay[key] = { date: key, waste: 0, coal: 0, present: 0 };
  }
  for (const w of waste) {
    const day = new Date(new Date(w.recordedAt).getTime() + 330 * 60000).toISOString().slice(0, 10);
    if (wasteByDay[day]) wasteByDay[day].waste += Number(w.quantity);
  }
  for (const b of batches) {
    const day = new Date(new Date(b.startTime).getTime() + 330 * 60000).toISOString().slice(0, 10);
    if (wasteByDay[day]) wasteByDay[day].coal += Number(b.outputKg || 0);
  }
  for (const a of attendance) {
    const day = new Date(a.workDate).toISOString().slice(0, 10);
    if (wasteByDay[day]) wasteByDay[day].present += attendanceCredit(a.status);
  }
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));
  const sitePerformance = sites
    .map((s) => {
      const kg = sum(
        waste.filter((w) => w.siteId === s.id),
        'quantity',
      );
      const expected = Number(s.expectedDailyWaste) * days;
      return {
        id: s.id,
        name: s.name,
        clientId: s.clientId,
        businessUnitId: s.businessUnitId,
        status: s.status,
        wasteKg: kg,
        expectedKg: expected,
        performance: expected ? Math.round((kg / expected) * 100) : 0,
        present: attendance
          .filter((a) => a.siteId === s.id)
          .reduce((total, a) => total + attendanceCredit(a.status), 0),
        tickets: tickets.filter(
          (t) => t.siteId === s.id && !['RESOLVED', 'CLOSED'].includes(t.status),
        ).length,
        visits: visits.filter((v) => v.siteId === s.id).length,
      };
    })
    .sort((a, b) => b.wasteKg - a.wasteKg);
  const clientPerformance = clients.map((c) => ({
    id: c.id,
    name: c.name,
    wasteKg: sitePerformance.filter((s) => s.clientId === c.id).reduce((a, s) => a + s.wasteKg, 0),
    revenue: sum(
      invoices.filter((i) => i.clientId === c.id && i.issuedAt >= from && i.issuedAt <= to),
      'amount',
    ),
    outstanding: invoices
      .filter((i) => i.clientId === c.id)
      .reduce((a, i) => a + Math.max(0, Number(i.amount) - (paidByInvoice.get(i.id) || 0)), 0),
  }));
  // Integrate state-change durations, never infer historical uptime from current status.
  const uptime = machines.map((m) => {
    const history = events
      .filter((e) => e.machineId === m.id && e.kind === 'STATUS_CHANGE' && e.recordedAt <= to)
      .sort((a, b) => a.recordedAt - b.recordedAt);
    let cursor = from.getTime(),
      state: string | null = null,
      runningMs = 0,
      knownMs = 0;
    for (const e of history) {
      const time = Math.max(from.getTime(), e.recordedAt.getTime());
      if (state) {
        knownMs += time - cursor;
        if (state === 'RUNNING') runningMs += time - cursor;
      }
      state = e.state;
      cursor = time;
    }
    if (state) {
      knownMs += to.getTime() - cursor;
      if (state === 'RUNNING') runningMs += to.getTime() - cursor;
    }
    return {
      name: m.name,
      uptime: knownMs ? Math.round((runningMs / knownMs) * 100) : null,
      coverage: Math.round((knownMs / Math.max(1, to.getTime() - from.getTime())) * 100),
    };
  });
  return {
    range: { from, to },
    metrics: {
      activeSites: sites.filter((s) => s.status === 'ACTIVE').length,
      employees: employees.filter((e) => e.status === 'ACTIVE').length,
      activeWorkers: new Set(
        attended
          .filter(
            (a) =>
              !a.checkOut &&
              (a.checkIn
                ? a.checkIn >= startToday
                : a.workDate.toISOString().slice(0, 10) ===
                  new Date(current.getTime() + 330 * 60000).toISOString().slice(0, 10)),
          )
          .map((a) => a.employeeId),
      ).size,
      workers: workers.length,
      supervisors: employees.filter((e) => e.position === 'SUPERVISOR').length,
      managers: employees.filter((e) => e.position === 'MANAGER').length,
      clients: clients.filter((c) => c.status === 'ACTIVE').length,
      wasteKg: sum(waste, 'quantity'),
      wetWasteKg: sum(batches, 'inputKg'),
      ecoCoalKg: sum(batches, 'outputKg'),
      yieldPercent: sum(batches, 'inputKg')
        ? +((sum(batches, 'outputKg') / sum(batches, 'inputKg')) * 100).toFixed(1)
        : 0,
      machinesRunning: machines.filter((m) => m.status === 'RUNNING').length,
      machinesOffline: machines.filter((m) => ['OFFLINE', 'ERROR'].includes(m.status)).length,
      attendancePercent: Math.min(100, attendancePercent),
      present: attended.filter((a) => a.status !== 'HALF_DAY').length,
      halfDay: attendance.filter((a) => a.status === 'HALF_DAY').length,
      absent: Math.max(0, scheduled.size - attended.length),
      late: attendance.filter((a) => a.status === 'LATE').length,
      earlyCheckout: attendance.filter((a) => a.earlyDeparture).length,
      openTickets: tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status)).length,
      pendingTasks: tasks.filter((t) => t.status !== 'COMPLETED').length,
      outstanding,
      revenue,
    },
    trend: Object.values(wasteByDay),
    sitePerformance,
    clientPerformance,
    uptime,
    categories: await (
      can('waste')
        ? db.wasteCategory.findMany({
            where: { organizationId: p.organizationId, deletedAt: null },
          })
        : Promise.resolve([])
    ).then((c) =>
      c.map((category) => ({
        name: category.name,
        quantity: sum(
          waste.filter((w) => w.categoryId === category.id),
          'quantity',
        ),
      })),
    ),
    alerts: [
      ...sitePerformance
        .filter((s) => s.expectedKg > 0 && s.performance < 60)
        .map((s) => ({
          name: s.name,
          message: `${s.performance}% of expected waste volume`,
          kind: 'SITE_PERFORMANCE',
        })),
      ...machines
        .filter((m) => ['OFFLINE', 'ERROR'].includes(m.status))
        .map((m) => ({
          name: m.name,
          message: `Machine ${m.status.toLowerCase()}`,
          kind: 'MACHINE_OFFLINE',
        })),
      ...tickets
        .filter((t) => t.dueAt < current && !['RESOLVED', 'CLOSED'].includes(t.status))
        .map((t) => ({ name: t.name, message: 'Resolution SLA overdue', kind: 'TICKET_OVERDUE' })),
    ].slice(0, 10),
    recentTickets: tickets.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
  };
}
