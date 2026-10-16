import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, repository, type Row } from '../../lib/db';
import { assert } from '../../lib/errors';
import { requirePermission, type Principal } from '../auth/policy';
import { scopeFor } from '../resources/scope';
import { catalog } from '../resources/catalog';

const types = z.enum(['employees', 'clients', 'users', 'contacts', 'vendors']);
const assetKinds = z.enum(['PHOTO', 'GOVERNMENT_ID', 'DOCUMENT', 'PAYSLIP']);
const assetSelect = {
  id: true,
  kind: true,
  name: true,
  mimeType: true,
  size: true,
  createdAt: true,
} as const;
const managerAccess = (p: Principal) =>
  (p.scope === 'ORGANIZATION' && p.permissions.includes('users:manage')) ||
  ['Operations Manager', 'Business Manager'].includes(p.role);

// Resolve user links first so an employee has one profile, regardless of where their name appears.
export async function profileOwner(
  type: string,
  id: string,
  p: Principal,
): Promise<{ type: string; row: Row }> {
  types.parse(type);
  z.uuid().parse(id);
  if (type === 'users') {
    assert(
      id === p.userId || (p.scope === 'ORGANIZATION' && p.permissions.includes('users:manage')),
      403,
      'User profile is outside your access',
    );
    const user = await db.user.findFirst({
      where: { id, organizationId: p.organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        clientId: true,
        role: { select: { name: true } },
      },
    });
    assert(user, 404, 'Profile not found');
    if (user.clientId) return profileOwner('clients', user.clientId, p);
    const employee = await db.employee.findFirst({
      where: { userId: id, organizationId: p.organizationId, deletedAt: null },
    });
    if (employee) return profileOwner('employees', employee.id, p);
    return {
      type,
      row: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        position: user.role.name,
      },
    };
  }
  requirePermission(p, `${type}:read`);
  const row = await repository(catalog[type].model).findFirst({
    where: { AND: [scopeFor(type, p), { id }] },
  });
  assert(row, 404, 'Profile not found');
  return { type, row };
}

function access(owner: { type: string; row: Row }, p: Principal) {
  const management = managerAccess(p);
  const selfCustomer =
    p.role === 'Customer' && owner.type === 'clients' && owner.row.id === p.clientId;
  const identity =
    management || (p.role === 'Customer' && (owner.type === 'employees' || selfCustomer));
  return {
    management,
    identity,
    canEdit: management || selfCustomer,
    canPay: management && ['employees', 'users'].includes(owner.type),
  };
}

const profileKey = (owner: { type: string; row: Row }, p: Principal) => ({
  organizationId: p.organizationId,
  subjectType: owner.type,
  subjectId: owner.row.id as string,
});
async function storedProfile(owner: { type: string; row: Row }, p: Principal) {
  return db.personProfile.findUnique({
    where: { organizationId_subjectType_subjectId: profileKey(owner, p) },
  });
}

export async function getProfile(type: string, id: string, p: Principal) {
  const owner = await profileOwner(type, id, p);
  const a = access(owner, p);
  const profile = await storedProfile(owner, p);
  const allowedKinds = [
    'PHOTO',
    ...(a.identity ? ['GOVERNMENT_ID'] : []),
    ...(a.management ? ['DOCUMENT', 'PAYSLIP'] : []),
  ];
  const assets = profile
    ? await db.profileAsset.findMany({
        where: {
          profileId: profile.id,
          organizationId: p.organizationId,
          kind: { in: allowedKinds },
        },
        select: assetSelect,
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const row = owner.row;
  const details: Row = {
    type: owner.type,
    id: row.id,
    name: row.name,
    phone: profile?.phone ?? row.phone ?? null,
    email: row.email ?? null,
    designation:
      profile?.designation ??
      row.position ??
      (owner.type === 'clients' ? 'Customer' : owner.type === 'vendors' ? 'Vendor' : 'Contact'),
    status: row.status ?? 'ACTIVE',
    employeeCode: row.employeeCode ?? null,
    company: row.company ?? null,
    joiningDate: row.joiningDate ?? null,
  };
  if (a.management || (p.role === 'Customer' && owner.type === 'clients')) {
    details.address = profile?.address ?? row.address ?? null;
    details.dateOfBirth = profile?.dateOfBirth ?? null;
    details.emergencyContact = profile?.emergencyContact ?? null;
  }
  if (a.identity) {
    details.governmentIdType = profile?.governmentIdType ?? null;
    details.governmentIdNumber = profile?.governmentIdNumber ?? null;
  }
  if (a.management) {
    details.monthlyPay = a.canPay ? (profile?.monthlyPay ?? null) : null;
    details.notes = profile?.notes ?? null;
  }
  const relationships = [];
  for (const [field, label] of [
    ['managerId', 'Manager'],
    ['supervisorId', 'Supervisor'],
  ] as const) {
    if (!row[field] || !p.permissions.includes('employees:read')) continue;
    const person = await db.employee.findFirst({
      where: { AND: [scopeFor('employees', p), { id: row[field] }] },
      select: { id: true, name: true },
    });
    if (person) relationships.push({ ...person, type: 'employees', label });
  }
  const payments =
    a.canPay && profile
      ? await db.staffPayment.findMany({
          where: { profileId: profile.id, organizationId: p.organizationId },
          orderBy: { paidAt: 'desc' },
          take: 200,
        })
      : [];
  const paymentTotal =
    a.canPay && profile
      ? await db.staffPayment.aggregate({
          where: { profileId: profile.id, organizationId: p.organizationId },
          _sum: { amount: true },
          _count: true,
        })
      : null;
  const legacyParent: Record<string, string> = {
    employees: 'employeeId',
    clients: 'clientId',
    vendors: 'vendorId',
  };
  const documents =
    a.management && legacyParent[owner.type]
      ? await db.document.findMany({
          where: {
            organizationId: p.organizationId,
            deletedAt: null,
            [legacyParent[owner.type]]: row.id,
          },
          select: {
            id: true,
            name: true,
            documentType: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
  return {
    ...details,
    access: a,
    assets,
    relationships,
    ...(a.management ? { documents } : {}),
    ...(a.canPay
      ? {
          payments,
          paymentTotal: paymentTotal?._sum.amount ?? 0,
          paymentCount: paymentTotal?._count ?? 0,
        }
      : {}),
  };
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const profileSchema = z.strictObject({
  phone: optionalText(40),
  designation: optionalText(120),
  address: optionalText(1000),
  dateOfBirth: z.iso.date().nullable().optional(),
  emergencyContact: optionalText(250),
  governmentIdType: optionalText(100),
  governmentIdNumber: optionalText(100),
  monthlyPay: z
    .union([
      z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
      z.number().finite().nonnegative().max(999999999999.99),
    ])
    .nullable()
    .optional(),
  notes: optionalText(5000),
});

export async function updateProfile(
  type: string,
  id: string,
  body: unknown,
  p: Principal,
  requestId: string,
) {
  const owner = await profileOwner(type, id, p);
  const a = access(owner, p);
  assert(
    a.canEdit,
    403,
    'Only managers, administrators or the customer owning this profile can edit it',
  );
  const parsed = profileSchema.parse(body);
  if (!a.management)
    assert(
      parsed.monthlyPay === undefined && parsed.notes === undefined,
      403,
      'Pay and internal notes are restricted to managers and administrators',
    );
  if (!a.canPay)
    assert(parsed.monthlyPay === undefined, 422, 'Pay is available for staff profiles only');
  const data = {
    ...parsed,
    ...(parsed.dateOfBirth !== undefined
      ? { dateOfBirth: parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null }
      : {}),
    ...(parsed.monthlyPay != null ? { monthlyPay: new Prisma.Decimal(parsed.monthlyPay) } : {}),
  };
  if (data.monthlyPay != null)
    assert(
      new Prisma.Decimal(data.monthlyPay).decimalPlaces() <= 2,
      422,
      'Pay supports up to two decimal places',
    );
  if (data.dateOfBirth)
    assert(data.dateOfBirth <= new Date(), 422, 'Birth date cannot be in the future');
  await db.$transaction(async (tx) => {
    const key = profileKey(owner, p);
    await tx.personProfile.upsert({
      where: { organizationId_subjectType_subjectId: key },
      create: { ...key, ...data },
      update: data,
    });
    // Record changed field names, never government ID numbers or file contents in audit JSON.
    await tx.auditLog.create({
      data: {
        organizationId: p.organizationId,
        actorId: p.userId,
        action: 'UPDATE_PROFILE',
        entity: owner.type,
        entityId: owner.row.id,
        requestId,
        newValue: { fields: Object.keys(parsed) },
      },
    });
  });
  return getProfile(type, id, p);
}

export async function uploadAsset(
  type: string,
  id: string,
  body: unknown,
  file: Express.Multer.File | undefined,
  p: Principal,
  requestId: string,
) {
  const owner = await profileOwner(type, id, p);
  const a = access(owner, p);
  assert(a.canEdit, 403, 'You cannot upload files for this profile');
  const { kind } = z.strictObject({ kind: assetKinds }).parse(body);
  assert(
    a.management || ['PHOTO', 'GOVERNMENT_ID'].includes(kind),
    403,
    'Only your photo and ID proof can be uploaded',
  );
  assert(file && file.size > 0, 422, 'Choose a non-empty file');
  const image =
    (file.mimetype === 'image/png' &&
      file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.mimetype === 'image/jpeg' &&
      file.buffer[0] === 255 &&
      file.buffer[1] === 216 &&
      file.buffer[2] === 255);
  const pdf =
    file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-';
  assert(
    image || (kind !== 'PHOTO' && pdf),
    422,
    'Use a valid JPEG or PNG image, or a PDF for documents',
  );
  return db.$transaction(async (tx) => {
    const key = profileKey(owner, p);
    const profile = await tx.personProfile.upsert({
      where: { organizationId_subjectType_subjectId: key },
      create: key,
      update: {},
    });
    const asset = await tx.profileAsset.create({
      data: {
        organizationId: p.organizationId,
        profileId: profile.id,
        kind,
        name: file.originalname.replace(/[^\w. ()-]/g, '_').slice(0, 200),
        mimeType: file.mimetype,
        size: file.size,
        content: new Uint8Array(file.buffer),
        createdBy: p.userId,
      },
      select: assetSelect,
    });
    await tx.auditLog.create({
      data: {
        organizationId: p.organizationId,
        actorId: p.userId,
        action: 'UPLOAD_PROFILE_FILE',
        entity: 'profile-assets',
        entityId: asset.id,
        requestId,
        newValue: { kind, profileId: profile.id },
      },
    });
    return asset;
  });
}

export async function readAsset(
  type: string,
  id: string,
  assetId: string,
  p: Principal,
  requestId: string,
) {
  z.uuid().parse(assetId);
  const owner = await profileOwner(type, id, p);
  const a = access(owner, p);
  const asset = await db.profileAsset.findFirst({
    where: { id: assetId, organizationId: p.organizationId, profile: profileKey(owner, p) },
  });
  assert(asset, 404, 'File not found');
  assert(
    asset.kind === 'PHOTO' || (asset.kind === 'GOVERNMENT_ID' && a.identity) || a.management,
    403,
    'This file is private',
  );
  if (asset.kind !== 'PHOTO')
    await db.auditLog.create({
      data: {
        organizationId: p.organizationId,
        actorId: p.userId,
        action: 'VIEW_PROFILE_FILE',
        entity: 'profile-assets',
        entityId: asset.id,
        requestId,
      },
    });
  return asset;
}

export async function addPayment(
  type: string,
  id: string,
  body: unknown,
  p: Principal,
  requestId: string,
) {
  const owner = await profileOwner(type, id, p);
  assert(
    access(owner, p).canPay,
    403,
    'Only managers and administrators can record staff payments',
  );
  const data = z
    .strictObject({
      amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
      paidAt: z.iso.datetime({ offset: true }),
      period: z.string().trim().min(1).max(100),
      method: z.enum(['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE']),
      reference: optionalText(200),
      notes: optionalText(2000),
    })
    .parse(body);
  const amount = new Prisma.Decimal(data.amount);
  assert(amount.gt(0), 422, 'Payment must be greater than zero');
  assert(new Date(data.paidAt) <= new Date(), 422, 'Payment date cannot be in the future');
  return db.$transaction(async (tx) => {
    const key = profileKey(owner, p);
    const profile = await tx.personProfile.upsert({
      where: { organizationId_subjectType_subjectId: key },
      create: key,
      update: {},
    });
    const payment = await tx.staffPayment.create({
      data: {
        ...data,
        amount,
        paidAt: new Date(data.paidAt),
        organizationId: p.organizationId,
        profileId: profile.id,
        createdBy: p.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: p.organizationId,
        actorId: p.userId,
        action: 'RECORD_STAFF_PAYMENT',
        entity: 'staff-payments',
        entityId: payment.id,
        requestId,
        newValue: { profileId: profile.id, amount: amount.toFixed(2) },
      },
    });
    return payment;
  });
}
