import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { catalog, permissionKeys } from '../../../apps/api/src/modules/resources/catalog';
const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash('sha256').update(`useless-development:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const organizationId = id('org'),
  adminId = id('admin');
const common = (key: string) => ({
  id: id(key),
  organizationId,
  createdBy: adminId,
  updatedBy: adminId,
});
const bu = (anth = false) => id(anth ? 'anthrasite' : 'viagreen');
const today = new Date(
  new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10) + 'T00:00:00+05:30',
);
const at = (days: number, hour = 8, minute = 0) =>
  new Date(today.getTime() + days * 86400000 + hour * 3600000 + minute * 60000);
const first = [
  'Aarav',
  'Ishaan',
  'Meera',
  'Kavya',
  'Vihaan',
  'Diya',
  'Arjun',
  'Anaya',
  'Rohan',
  'Sana',
  'Neel',
  'Tara',
  'Kabir',
  'Ira',
  'Dev',
  'Riya',
  'Yash',
  'Nisha',
  'Ayaan',
  'Mira',
];
const last = [
  'Kulkarni',
  'Deshmukh',
  'Patil',
  'Shinde',
  'Joshi',
  'Pawar',
  'Naik',
  'Sawant',
  'More',
  'Jadhav',
];
const districts = [
  'Andheri East',
  'Powai',
  'Bandra West',
  'Goregaon',
  'Lower Parel',
  'Worli',
  'BKC',
  'Chembur',
  'Mulund',
  'Vikhroli',
  'Malad',
  'Kandivali',
  'Dadar',
  'Thane',
  'Navi Mumbai',
  'Santacruz',
  'Taloja',
  'Bhiwandi',
  'Panvel',
  'Mahape',
];
const companies = [
  'Sahyadri Properties',
  'Harbour Business Parks',
  'Aaranya Communities',
  'Western Bay Hospitality',
  'Konkan Retail Spaces',
  'Cedar Learning Group',
  'Skyline Commercial',
  'Prakriti Residential',
  'Circular Resource Works',
  'Greenforge Industries',
];
async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Development seed is disabled in production');
  const email = process.env.SEED_ADMIN_EMAIL,
    password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 14)
    throw new Error('Set SEED_ADMIN_EMAIL and a 14+ character SEED_ADMIN_PASSWORD');
  const credentials = new Map<string, { email: string; passwordHash: string }>();
  for (const key of ['ADMIN', 'MANAGER', 'SUPERVISOR', 'CUSTOMER', 'ACCOUNTANT']) {
    const accountEmail = process.env[`SEED_${key}_EMAIL`]?.trim().toLowerCase();
    const accountPassword = process.env[`SEED_${key}_PASSWORD`];
    if (!accountEmail && !accountPassword && key !== 'ADMIN') continue;
    if (
      !accountEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail) ||
      !accountPassword ||
      accountPassword.length < 14 ||
      Buffer.byteLength(accountPassword, 'utf8') > 72
    )
      throw new Error(
        `Set SEED_${key}_EMAIL and a password of at least 14 characters and at most 72 UTF-8 bytes`,
      );
    if ([...credentials.values()].some((c) => c.email === accountEmail))
      throw new Error('Each seeded account must have a different email');
    credentials.set(key, { email: accountEmail, passwordHash: await hash(accountPassword, 12) });
  }
  if (process.argv.includes('--passwords-only')) {
    await db.$transaction(async (tx) => {
      for (const [key, credential] of credentials) {
        const userId = key === 'ADMIN' ? adminId : id(`demo:${key}`);
        await tx.user.update({
          where: { id: userId, organizationId },
          data: {
            ...credential,
            status: 'ACTIVE',
            deletedAt: null,
          },
        });
        await tx.session.deleteMany({ where: { userId, organizationId } });
      }
    });
    console.log(
      `Updated ${credentials.size} seeded accounts from .env and invalidated their old sessions.`,
    );
    return;
  }
  await db.organization.upsert({
    where: { id: organizationId },
    update: {},
    create: {
      id: organizationId,
      name: 'AN Usedless Paper Private Limited',
      slug: 'useless-private-limited',
      createdBy: adminId,
    },
  });
  await db.businessUnit.createMany({
    skipDuplicates: true,
    data: [
      { ...common('viagreen'), name: 'Viagreen', code: 'VIAGREEN' },
      { ...common('anthrasite'), name: 'Anthrasite', code: 'ANTHRASITE' },
    ],
  });
  await db.permission.createMany({
    skipDuplicates: true,
    data: permissionKeys.map((key) => ({
      id: id(`permission:${key}`),
      key,
      description: key.replace(':', ' '),
    })),
  });
  const permissionIds = new Map(
    (await db.permission.findMany({ where: { key: { in: permissionKeys } } })).map((p) => [
      p.key,
      p.id,
    ]),
  );
  const roles = [
    ['Super Admin', 'ORGANIZATION'],
    ['Business Manager', 'BUSINESS_UNIT'],
    ['Operations Manager', 'ASSIGNED'],
    ['Site Supervisor', 'ASSIGNED'],
    ['Worker', 'ASSIGNED'],
    ['Finance/Admin', 'BUSINESS_UNIT'],
    ['Customer', 'ASSIGNED'],
    ['Accountant', 'ORGANIZATION'],
  ];
  await db.role.createMany({
    skipDuplicates: true,
    data: roles.map(([name, scope]) => ({ ...common(`role:${name}`), name, scope })),
  });
  const operational = [
    'business-units',
    'departments',
    'clients',
    'contracts',
    'sites',
    'employees',
    'shifts',
    'assignments',
    'attendance',
    'waste-categories',
    'waste',
    'vendors',
    'vehicles',
    'disposals',
    'tasks',
    'tickets',
    'visits',
    'machines',
    'production',
    'maintenance',
    'spare-parts',
    'machine-events',
    'documents',
    'notifications',
  ];
  const supervisorWrite = ['attendance', 'waste', 'tasks', 'tickets', 'visits', 'production'];
  const finance = [
    'business-units',
    'clients',
    'contacts',
    'leads',
    'follow-ups',
    'contracts',
    'sites',
    'employees',
    'vendors',
    'invoices',
    'challans',
    'payments',
    'expenses',
    'documents',
    'notifications',
  ];
  for (const [role] of roles) {
    let keys: string[];
    if (role === 'Super Admin') keys = permissionKeys;
    else if (role === 'Customer')
      keys = [
        'dashboard:read',
        'business-units:read',
        'clients:read',
        'sites:read',
        'employees:read',
        'assignments:read',
        'tickets:read',
        'tickets:write',
      ];
    else if (role === 'Accountant')
      keys = [
        'dashboard:read',
        'reports:read',
        ...[
          'business-units',
          'clients',
          'contracts',
          'sites',
          'vendors',
          'invoices',
          'challans',
          'payments',
          'expenses',
        ].map((k) => `${k}:read`),
        ...['invoices', 'challans', 'payments', 'expenses'].map((k) => `${k}:write`),
      ];
    else if (role === 'Business Manager')
      keys = permissionKeys.filter(
        (k) =>
          ![
            'users:manage',
            'devices:manage',
            'audit:write',
            'business-units:write',
            'departments:write',
          ].includes(k),
      );
    else if (role === 'Operations Manager')
      keys = [
        'dashboard:read',
        'reports:read',
        ...operational.flatMap((k) => [
          `${k}:read`,
          ...(![
            'business-units',
            'departments',
            'clients',
            'contracts',
            'documents',
            'notifications',
            'machine-events',
          ].includes(k)
            ? [`${k}:write`]
            : []),
        ]),
      ];
    else if (role === 'Site Supervisor')
      keys = [
        'dashboard:read',
        'reports:read',
        ...operational.map((k) => `${k}:read`),
        ...supervisorWrite.map((k) => `${k}:write`),
      ];
    else if (role === 'Worker')
      keys = [
        'dashboard:read',
        ...[
          'business-units',
          'sites',
          'employees',
          'attendance',
          'assignments',
          'shifts',
          'tasks',
          'waste',
          'waste-categories',
          'tickets',
          'notifications',
        ].map((k) => `${k}:read`),
        ...['tasks', 'waste', 'tickets'].map((k) => `${k}:write`),
      ];
    else
      keys = [
        'dashboard:read',
        'reports:read',
        ...finance.flatMap((k) => [
          `${k}:read`,
          ...(!['business-units', 'sites', 'employees', 'notifications'].includes(k)
            ? [`${k}:write`]
            : []),
        ]),
      ];
    await db.rolePermission.createMany({
      skipDuplicates: true,
      data: keys.map((key) => ({
        ...common(`grant:${role}:${key}`),
        roleId: id(`role:${role}`),
        permissionId: permissionIds.get(key)!,
      })),
    });
  }
  await db.user.upsert({
    where: { id: adminId },
    update: { ...credentials.get('ADMIN')!, status: 'ACTIVE', deletedAt: null },
    create: {
      ...common('admin'),
      name: 'Workspace Administrator',
      ...credentials.get('ADMIN')!,
      roleId: id('role:Super Admin'),
    },
  });
  await db.department.createMany({
    skipDuplicates: true,
    data: [
      { ...common('department:v'), name: 'Field Operations', businessUnitId: bu() },
      { ...common('department:a'), name: 'Processing Operations', businessUnitId: bu(true) },
    ],
  });
  for (let i = 0; i < 5; i++)
    await db.employee.upsert({
      where: { id: id(`manager:${i}`) },
      update: {},
      create: {
        ...common(`manager:${i}`),
        name: `${first[i]} ${last[i]}`,
        employeeCode: `UPL-M${String(i + 1).padStart(3, '0')}`,
        businessUnitId: bu(i === 4),
        position: 'MANAGER',
        joiningDate: at(-450),
        departmentId: id(i === 4 ? 'department:a' : 'department:v'),
        email: `manager${i + 1}@example.invalid`,
      },
    });
  for (let i = 0; i < 15; i++)
    await db.employee.upsert({
      where: { id: id(`supervisor:${i}`) },
      update: {},
      create: {
        ...common(`supervisor:${i}`),
        name: `${first[(i + 5) % 20]} ${last[(i + 2) % 10]}`,
        employeeCode: `UPL-S${String(i + 1).padStart(3, '0')}`,
        businessUnitId: bu(i >= 12),
        position: 'SUPERVISOR',
        managerId: id(`manager:${i >= 12 ? 4 : i % 4}`),
        joiningDate: at(-250),
        departmentId: id(i >= 12 ? 'department:a' : 'department:v'),
      },
    });
  for (let i = 0; i < 80; i++)
    await db.employee.upsert({
      where: { id: id(`worker:${i}`) },
      update: {},
      create: {
        ...common(`worker:${i}`),
        name: `${first[i % 20]} ${last[Math.floor(i / 8)]}`,
        employeeCode: `UPL-W${String(i + 1).padStart(3, '0')}`,
        businessUnitId: bu(i >= 64),
        position: 'WORKER',
        managerId: id(`manager:${i >= 64 ? 4 : Math.floor(i / 4) % 4}`),
        supervisorId: id(
          `supervisor:${i >= 64 ? 12 + (Math.floor((i - 64) / 4) % 3) : Math.floor(i / 4) % 12}`,
        ),
        joiningDate: at(-180),
        departmentId: id(i >= 64 ? 'department:a' : 'department:v'),
      },
    });
  await db.client.createMany({
    skipDuplicates: true,
    data: companies.map((name, i) => ({
      ...common(`client:${i}`),
      name,
      company: `${name} Private Limited`,
      businessUnitId: bu(i >= 8),
      contactPerson: `Client liaison ${i + 1}`,
      email: `liaison${i + 1}@example.invalid`,
      address: `${districts[i]}, Mumbai Metropolitan Region`,
      managerId: id(`manager:${i >= 8 ? 4 : i % 4}`),
    })),
  });
  await db.contract.createMany({
    skipDuplicates: true,
    data: companies.map((name, i) => ({
      ...common(`contract:${i}`),
      name: `${name} service agreement`,
      contractNumber: `UPL-2026-${String(i + 1).padStart(3, '0')}`,
      businessUnitId: bu(i >= 8),
      clientId: id(`client:${i}`),
      startDate: at(-180),
      endDate: at(i < 2 ? 14 + i * 7 : 180),
      value: 840000 + i * 120000,
      services:
        i >= 8
          ? 'Wet waste processing and eco-coal production'
          : 'Collection, segregation, weighing and authorized disposal',
    })),
  });
  await db.site.createMany({
    skipDuplicates: true,
    data: districts.map((area, i) => ({
      ...common(`site:${i}`),
      name: `${area} ${i >= 16 ? 'Processing Hub' : i % 3 === 0 ? 'Business Park' : i % 3 === 1 ? 'Residences' : 'Commercial Centre'}`,
      businessUnitId: bu(i >= 16),
      clientId: id(`client:${Math.floor(i / 2)}`),
      contractId: id(`contract:${Math.floor(i / 2)}`),
      address: `Plot ${20 + i}, ${area}, Mumbai Metropolitan Region, Maharashtra`,
      latitude: 19.02 + i * 0.009,
      longitude: 72.82 + i * 0.006,
      managerId: id(`manager:${i >= 16 ? 4 : i % 4}`),
      supervisorId: id(`supervisor:${i >= 16 ? 12 + ((i - 16) % 3) : i % 12}`),
      expectedDailyWaste: i >= 16 ? 0 : 450 + (i % 5) * 120,
      wasteType: i >= 16 ? 'WET' : 'MIXED',
      startDate: at(-160),
    })),
  });
  await db.shift.createMany({
    skipDuplicates: true,
    data: [
      {
        ...common('shift:v'),
        businessUnitId: bu(),
        name: 'Morning operations · 08:00–17:00',
        startMinute: 480,
        endMinute: 1020,
        graceMinutes: 15,
      },
      {
        ...common('shift:a'),
        businessUnitId: bu(true),
        name: 'Processing · 08:00–17:00',
        startMinute: 480,
        endMinute: 1020,
        graceMinutes: 15,
      },
    ],
  });
  await db.siteAssignment.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 80 }, (_, i) => ({
      ...common(`assignment:${i}`),
      businessUnitId: bu(i >= 64),
      siteId: id(`site:${Math.floor(i / 4)}`),
      employeeId: id(`worker:${i}`),
      supervisorId: id(
        `supervisor:${i >= 64 ? 12 + (Math.floor((i - 64) / 4) % 3) : Math.floor(i / 4) % 12}`,
      ),
      shiftId: id(i >= 64 ? 'shift:a' : 'shift:v'),
      startDate: at(-150, 0),
      isPrimary: true,
    })),
  });
  await db.wasteCategory.createMany({
    skipDuplicates: true,
    data: ['Wet waste', 'Dry waste', 'Plastic', 'Paper', 'Metal', 'Glass', 'Other'].map(
      (name, i) => ({ ...common(`category:${i}`), name }),
    ),
  });
  await db.vendor.createMany({
    skipDuplicates: true,
    data: [
      'Mumbai Municipal Disposal Partner',
      'Sahyadri Recycling',
      'Harbour Scrap Services',
      'Konkan Green Transport',
      'Circular Paper Recovery',
      'Metro Glass Recycling',
      'Western Metals Recovery',
      'Eco Route Logistics',
      'Processing Equipment Supply',
      'Industrial Service Partners',
    ].map((name, i) => ({
      ...common(`vendor:${i}`),
      name,
      businessUnitId: bu(i >= 8),
      type: ['BMC', 'SCRAP', 'DISPOSAL', 'TRANSPORT', 'EQUIPMENT'][i % 5],
      services: 'Authorized collection, transport and recovery',
      rate: 1500 + i * 250,
      email: `vendor${i + 1}@example.invalid`,
    })),
  });
  await db.vehicle.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 4 }, (_, i) => ({
      ...common(`vehicle:${i}`),
      name: `Collection vehicle ${i + 1}`,
      businessUnitId: bu(),
      registration: `DEMO-MH-TR-${100 + i}`,
      capacity: 2500,
      vendorId: id(`vendor:${i}`),
    })),
  });
  await db.machine.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 10 }, (_, i) => ({
      ...common(`machine:${i}`),
      name: `EcoCarbon ${String(i + 1).padStart(2, '0')}`,
      machineCode: `ANT-M${String(i + 1).padStart(3, '0')}`,
      model: i % 2 ? 'AC-1000' : 'AC-500',
      businessUnitId: bu(true),
      siteId: id(`site:${16 + (i % 4)}`),
      installationDate: at(-130),
      status: i === 8 ? 'MAINTENANCE' : i === 9 ? 'OFFLINE' : 'RUNNING',
      capacity: i % 2 ? 1000 : 500,
      operatingHours: 850 + i * 120,
      maintenanceDue: at(i === 8 ? -2 : 10 + i * 4),
    })),
  });
  await db.machineEvent.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 10 }, (_, i) => ({
      ...common(`event:${i}`),
      name: 'Initial commissioned state',
      businessUnitId: bu(true),
      siteId: id(`site:${16 + (i % 4)}`),
      machineId: id(`machine:${i}`),
      kind: 'STATUS_CHANGE',
      state: i === 8 ? 'MAINTENANCE' : i === 9 ? 'OFFLINE' : 'RUNNING',
      recordedAt: at(-35),
      payload: { source: 'development_seed' },
    })),
  });
  for (let day = -29; day <= 0; day++) {
    await db.attendance.createMany({
      skipDuplicates: true,
      data: districts.map((_, siteIndex) => ({
        ...common(`attendance:supervisor:${day}:${siteIndex}`),
        businessUnitId: bu(siteIndex >= 16),
        siteId: id(`site:${siteIndex}`),
        employeeId: id(
          `supervisor:${siteIndex >= 16 ? 12 + ((siteIndex - 16) % 3) : siteIndex % 12}`,
        ),
        shiftId: id(siteIndex >= 16 ? 'shift:a' : 'shift:v'),
        workDate: new Date(new Date(at(day)).toISOString().slice(0, 10)),
        status:
          (day + 29 + siteIndex) % 11 === 0
            ? 'ABSENT'
            : (day + 29 + siteIndex) % 7 === 0
              ? 'HALF_DAY'
              : 'PRESENT',
        source: 'MANUAL',
        checkIn: null,
        checkOut: null,
        correctionReason: 'Development sample supervisor attendance',
      })),
    });
    await db.attendance.createMany({
      skipDuplicates: true,
      data: Array.from({ length: 80 }, (_, i) =>
        i % 13 === (day + 29) % 13
          ? null
          : {
              ...common(`attendance:${day}:${i}`),
              businessUnitId: bu(i >= 64),
              siteId: id(`site:${Math.floor(i / 4)}`),
              employeeId: id(`worker:${i}`),
              shiftId: id(i >= 64 ? 'shift:a' : 'shift:v'),
              workDate: new Date(new Date(at(day)).toISOString().slice(0, 10)),
              checkIn: at(day, 8, i % 9 === 0 ? 25 : 2),
              checkOut: day < 0 ? at(day, 17, i % 7 === 0 ? 45 : 5) : null,
              status: i % 9 === 0 ? 'LATE' : 'PRESENT',
              source: 'MANUAL',
              correctionReason: 'Development seed example',
              overtimeMinutes: day < 0 ? (i % 7 === 0 ? 45 : 5) : 0,
            },
      ).filter((x): x is NonNullable<typeof x> => !!x),
    });
    await db.wasteRecord.createMany({
      skipDuplicates: true,
      data: Array.from({ length: 16 * 4 }, (_, j) => {
        const site = Math.floor(j / 4),
          category = j % 4;
        return {
          ...common(`waste:${day}:${site}:${category}`),
          name: `${districts[site]} · ${['wet', 'dry', 'plastic', 'paper'][category]} collection`,
          businessUnitId: bu(),
          siteId: id(`site:${site}`),
          workerId: id(`worker:${site * 4}`),
          categoryId: id(`category:${category}`),
          recordedAt: at(day, 10 + (category % 3)),
          quantity: Math.round(
            (category === 0 ? 310 : category === 1 ? 150 : category === 2 ? 65 : 40) *
              (0.8 + ((site + day + 35) % 7) * 0.06),
          ),
          stage: day === 0 ? 'COLLECTED' : 'STORED',
          unit: 'KG',
        };
      }),
    });
    await db.productionBatch.createMany({
      skipDuplicates: true,
      data: Array.from({ length: 8 }, (_, i) => ({
        ...common(`batch:${day}:${i}`),
        name: `${districts[16 + (i % 4)]} eco-coal batch`,
        batchCode: `B-${new Date(at(day)).toISOString().slice(0, 10)}-${i + 1}`,
        businessUnitId: bu(true),
        siteId: id(`site:${16 + (i % 4)}`),
        machineId: id(`machine:${i}`),
        operatorId: id(`worker:${64 + (i % 4) * 4}`),
        inputKg: 400 + i * 35,
        outputKg: Math.round((400 + i * 35) * (0.25 + (i % 4) * 0.012)),
        startTime: at(day, 8),
        endTime: at(day, 14),
        qualityStatus: i === 7 && day === -3 ? 'FAILED' : 'PASSED',
      })),
    });
  }
  await db.ticket.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 14 }, (_, i) => ({
      ...common(`ticket:${i}`),
      name: [
        'Collection delayed',
        'PPE replacement needed',
        'Segregation quality review',
        'Client service follow-up',
      ][i % 4],
      businessUnitId: bu(i >= 12),
      siteId: id(`site:${i >= 12 ? 16 + (i % 4) : i}`),
      clientId: id(`client:${Math.floor((i >= 12 ? 16 + (i % 4) : i) / 2)}`),
      category: ['COLLECTION', 'SAFETY', 'WORKFORCE', 'CLIENT'][i % 4],
      priority: i % 4 === 0 ? 'HIGH' : 'MEDIUM',
      description:
        'Development example: supervisor to review the reported operational issue and coordinate corrective action.',
      status: i % 3 === 0 ? 'IN_PROGRESS' : 'OPEN',
      assigneeId: id(`supervisor:${i >= 12 ? 12 + (i % 3) : i % 12}`),
      dueAt: at(i % 3 === 0 ? -1 : 2, 17),
    })),
  });
  await db.task.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 20 }, (_, i) => ({
      ...common(`task:${i}`),
      name:
        i >= 16
          ? 'Inspect processing area and log output'
          : 'Complete segregation and daily weighing',
      businessUnitId: bu(i >= 16),
      siteId: id(`site:${i}`),
      assigneeId: id(`worker:${i * 4}`),
      priority: i % 4 === 0 ? 'HIGH' : 'MEDIUM',
      status: i % 3 === 0 ? 'IN_PROGRESS' : 'PENDING',
      dueAt: at(0, 17),
    })),
  });
  await db.siteVisit.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 20 }, (_, i) => ({
      ...common(`visit:${i}`),
      name: `${districts[i]} operational inspection`,
      businessUnitId: bu(i >= 16),
      siteId: id(`site:${i}`),
      managerId: id(`manager:${i >= 16 ? 4 : i % 4}`),
      visitedAt: at(-i % 7, 11),
      latitude: 19.02 + i * 0.009,
      longitude: 72.82 + i * 0.006,
      checklist: {
        'Workers present': true,
        'PPE compliance': i % 4 !== 0,
        'Waste collection': true,
        'Segregation quality': true,
        'Machine condition': true,
        'Site cleanliness': true,
        'Client complaints addressed': true,
        'Equipment condition': true,
      },
      notes: 'Routine operational review; all entries are synthetic development examples.',
    })),
  });
  await db.invoice.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 20 }, (_, i) => ({
      ...common(`invoice:${i}`),
      name: `${districts[i]} monthly services`,
      invoiceNumber: `UPL-INV-${today.getFullYear()}-${String(i + 1).padStart(4, '0')}`,
      businessUnitId: bu(i >= 16),
      siteId: id(`site:${i}`),
      clientId: id(`client:${Math.floor(i / 2)}`),
      contractId: id(`contract:${Math.floor(i / 2)}`),
      issuedAt: at(-10),
      dueAt: at(i % 4 === 0 ? -2 : 20),
      amount: 65000 + i * 4500,
      status: i % 3 === 0 ? 'PAID' : i % 3 === 1 ? 'PARTIAL' : 'ISSUED',
    })),
  });
  await db.payment.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 20 }, (_, i) =>
      i % 3 === 2
        ? null
        : {
            ...common(`payment:${i}`),
            name: `Receipt for site ${i + 1}`,
            businessUnitId: bu(i >= 16),
            siteId: id(`site:${i}`),
            invoiceId: id(`invoice:${i}`),
            amount: (65000 + i * 4500) * (i % 3 === 0 ? 1 : 0.5),
            paidAt: at(-3),
            reference: `DEMO-UTR-${String(i + 1).padStart(6, '0')}`,
            method: 'BANK_TRANSFER',
          },
    ).filter((x): x is NonNullable<typeof x> => !!x),
  });
  await db.expense.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 10 }, (_, i) => ({
      ...common(`expense:${i}`),
      name: 'Monthly site supplies and logistics',
      businessUnitId: bu(i >= 8),
      siteId: id(`site:${i >= 8 ? 16 + (i % 4) : i}`),
      vendorId: id(`vendor:${i}`),
      category: i % 2 ? 'TRANSPORT' : 'SUPPLIES',
      amount: 4500 + i * 750,
      incurredAt: at(-5),
      status: i % 2 ? 'PAID' : 'PENDING',
    })),
  });
  await db.maintenanceRecord.createMany({
    skipDuplicates: true,
    data: Array.from({ length: 4 }, (_, i) => ({
      ...common(`maintenance:${i}`),
      name: `Scheduled service · EcoCarbon ${i + 1}`,
      businessUnitId: bu(true),
      siteId: id(`site:${16 + (i % 4)}`),
      machineId: id(`machine:${i}`),
      type: 'PREVENTIVE',
      scheduledAt: at(5 + i),
      cost: 4500,
      downtimeMinutes: 0,
      status: 'SCHEDULED',
    })),
  });
  await db.lead.createMany({
    skipDuplicates: true,
    data: ['Eastern Bay Offices', 'Aaranya Tech Campus', 'Harbour Community Estates'].map(
      (name, i) => ({
        ...common(`lead:${i}`),
        name,
        company: name,
        source: i ? 'REFERRAL' : 'WEBSITE',
        businessUnitId: bu(),
        requirement: 'End-to-end waste management for a multi-building campus.',
        status: ['QUALIFIED', 'PROPOSAL', 'NEW'][i],
        salespersonId: id(`manager:${i}`),
      }),
    ),
  });
  for (const [key, role, name] of [
    ['MANAGER', 'Operations Manager', 'Demo Manager'],
    ['SUPERVISOR', 'Site Supervisor', 'Demo Supervisor'],
    ['CUSTOMER', 'Customer', 'Demo Customer'],
    ['ACCOUNTANT', 'Accountant', 'Demo Accountant'],
  ]) {
    const demoEmail = process.env[`SEED_${key}_EMAIL`];
    const demoPassword = process.env[`SEED_${key}_PASSWORD`];
    if (!demoEmail && !demoPassword) continue;
    if (!demoEmail || !demoPassword || demoPassword.length < 14)
      throw new Error(`Set SEED_${key}_EMAIL and a 14+ character SEED_${key}_PASSWORD`);
    const user = await db.user.upsert({
      where: { id: id(`demo:${key}`) },
      update: { ...credentials.get(key)!, status: 'ACTIVE', deletedAt: null },
      create: {
        ...common(`demo:${key}`),
        name,
        ...credentials.get(key)!,
        roleId: id(`role:${role}`),
        businessUnitId: key === 'ACCOUNTANT' ? null : bu(),
        clientId: key === 'CUSTOMER' ? id('client:0') : null,
      },
    });
    if (key === 'MANAGER')
      await db.employee.update({ where: { id: id('manager:0') }, data: { userId: user.id } });
    if (key === 'SUPERVISOR')
      await db.employee.update({ where: { id: id('supervisor:0') }, data: { userId: user.id } });
  }
  console.log(
    'Development seed ready: 2 business units, 10 clients, 20 sites, 100 employees, 10 vendors, 10 machines and 30 days of synthetic operational records.',
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
