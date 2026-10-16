import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../lib/db';
import { assert } from '../../lib/errors';
import { requirePermission, type Principal } from '../auth/policy';
import { scopeFor } from '../resources/scope';
import { renderPdf, type PdfContent } from './pdf';

const optionalText = z.string().trim().max(2000).optional();
export const pdfOptions = z
  .strictObject({
    documentNumber: z.string().trim().max(100).optional(),
    issuerAddress: optionalText,
    issuerGstin: z.string().trim().max(30).optional(),
    recipientAddress: optionalText,
    recipientGstin: z.string().trim().max(30).optional(),
    bankName: optionalText,
    accountNumber: z.string().trim().max(60).optional(),
    ifsc: z.string().trim().max(30).optional(),
    upiId: z.string().trim().max(100).optional(),
    terms: optionalText,
    notes: optionalText,
    gstRate: z.number().min(0).max(100).optional(),
    gstMode: z.enum(['IGST', 'CGST_SGST']).optional(),
    logo: z.string().max(170000).optional(),
  })
  .refine((value) => !value.gstRate || !!value.gstMode, {
    message: 'Select a GST breakdown type',
    path: ['gstMode'],
  });

export const sourceSchema = z.enum(['invoices', 'challans']);
const metadata = { id: true, filename: true, size: true, createdAt: true } as const;
async function source(key: string, id: string, p: Principal) {
  sourceSchema.parse(key);
  z.uuid().parse(id);
  requirePermission(p, `${key}:read`);
  const where = { AND: [scopeFor(key, p), { id }] };
  const row =
    key === 'invoices'
      ? await db.invoice.findFirst({
          where,
          include: {
            organization: true,
            businessUnit: true,
            site: true,
            client: true,
            payment_invoice: { where: { deletedAt: null } },
          },
        })
      : await db.challan.findFirst({
          where,
          include: { organization: true, businessUnit: true, site: true, client: true },
        });
  assert(row, 404, 'Record not found');
  return row;
}
const date = (value: Date) =>
  value.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
const money = (value: Prisma.Decimal) => `INR ${value.toFixed(2)}`;
export function taxBreakdown(total: Prisma.Decimal, rate: number, mode: 'IGST' | 'CGST_SGST') {
  const taxable = total
    .div(new Prisma.Decimal(1).plus(new Prisma.Decimal(rate).div(100)))
    .toDecimalPlaces(2);
  const tax = total.minus(taxable);
  if (mode === 'IGST')
    return [
      ['Taxable amount', money(taxable)],
      [`IGST (${rate}%)`, money(tax)],
    ] as [string, string][];
  const central = tax.div(2).toDecimalPlaces(2);
  return [
    ['Taxable amount', money(taxable)],
    [`CGST (${rate / 2}%)`, money(central)],
    [`SGST (${rate / 2}%)`, money(tax.minus(central))],
  ] as [string, string][];
}
export async function listPdfs(key: string, id: string, p: Principal) {
  await source(key, id, p);
  return db.savedPdf.findMany({
    where: { organizationId: p.organizationId, sourceKey: key, sourceId: id },
    select: metadata,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
export async function savePdf(
  key: string,
  id: string,
  body: unknown,
  p: Principal,
  requestId: string,
) {
  sourceSchema.parse(key);
  requirePermission(p, `${key}:write`);
  const options = pdfOptions.parse(body);
  const record = await source(key, id, p);
  assert(
    key === 'invoices' || options.gstRate == null,
    422,
    'GST breakdown is available on bills only',
  );
  let logo: Buffer | undefined;
  if (options.logo) {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(options.logo);
    assert(match, 422, 'Use a PNG or JPEG logo');
    logo = Buffer.from(match[2], 'base64');
    assert(
      logo.length <= 120000 &&
        (match[1] === 'png'
          ? logo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : logo[0] === 255 && logo[1] === 216),
      422,
      'Use a valid logo smaller than 120 KB',
    );
  }
  const billing = 'invoiceNumber' in record;
  const number = options.documentNumber || (billing ? record.invoiceNumber : record.challanNumber);
  const title = billing
    ? 'BILL / INVOICE'
    : {
        DELIVERY: 'DELIVERY CHALLAN',
        WASTE_COLLECTION: 'WASTE COLLECTION CHALLAN',
        WASTE_DISPOSAL: 'WASTE DISPOSAL CHALLAN',
      }[record.kind] || 'CHALLAN';
  const content: PdfContent = {
    organization: record.organization.name,
    title,
    number,
    logo,
    sections: [
      {
        title: 'Issuer',
        rows: [
          ['Business unit', record.businessUnit.name],
          ['Address', options.issuerAddress || ''],
          ['GSTIN', options.issuerGstin || ''],
        ],
      },
      {
        title: billing ? 'Bill to' : 'Client / consignee',
        rows: [
          ['Client', record.client.company || record.client.name],
          ['Contact', record.client.contactPerson || ''],
          ['Address', options.recipientAddress || record.client.address || ''],
          ['GSTIN', options.recipientGstin || record.client.gstNumber || ''],
          ['Site', record.site.name],
          ['Site address', record.site.address],
        ],
      },
      {
        title: 'Document details',
        rows: [
          ['Issued (IST)', date(record.issuedAt)],
          ['Source reference', billing ? record.invoiceNumber : record.challanNumber],
          ['Description', record.name],
        ],
      },
    ],
    note: billing
      ? 'Generated from the saved invoice record. Amounts and payment position are a snapshot at the time this PDF was saved.'
      : 'Operational movement / collection record. This document is not a government-issued e-way bill or regulatory authorization.',
  };
  if (billing) {
    const paid = record.payment_invoice.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    content.sections.push({
      title: 'Billing summary',
      rows: [
        ['Due date (IST)', date(record.dueAt)],
        ...(options.gstRate != null && options.gstMode
          ? taxBreakdown(record.amount, options.gstRate, options.gstMode)
          : []),
        ['Invoice total', money(record.amount)],
        ['Payments recorded', money(paid)],
        ['Outstanding', money(record.amount.minus(paid))],
        ['Payment status', record.status],
      ],
    });
  } else {
    content.sections.push({
      title: 'Material and transport',
      rows: [
        ['Material / waste', record.material],
        ['Quantity', `${record.quantity.toFixed(3)} ${record.unit}`],
        ['Destination', record.destination || ''],
        ['Vehicle', record.vehicleNumber || ''],
        ['Driver / collector', record.driverName || ''],
        ['Record notes', record.notes || ''],
      ],
    });
  }
  content.sections.push(
    {
      title: 'Payment instructions',
      rows: [
        ['Bank', options.bankName || ''],
        ['Account number', options.accountNumber || ''],
        ['IFSC', options.ifsc || ''],
        ['UPI', options.upiId || ''],
      ],
    },
    {
      title: 'Additional information',
      rows: [
        ['Terms', options.terms || ''],
        ['Notes', options.notes || ''],
      ],
    },
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ version: 2, content }))
    .digest('hex');
  const identity = { organizationId: p.organizationId, sourceKey: key, sourceId: id, fingerprint };
  const previous = await db.savedPdf.findUnique({
    where: { organizationId_sourceKey_sourceId_fingerprint: identity },
    select: metadata,
  });
  if (previous) return previous;
  let bytes: Buffer;
  try {
    bytes = await renderPdf(content);
  } catch {
    assert(false, 422, 'Unable to render PDF. Check the logo and document details.');
  }
  const filename = `${billing ? 'bill' : 'challan'}-${number.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)}.pdf`;
  return db.$transaction(async (tx) => {
    const saved = await tx.savedPdf.upsert({
      where: { organizationId_sourceKey_sourceId_fingerprint: identity },
      update: {},
      create: {
        ...identity,
        filename,
        content: new Uint8Array(bytes),
        size: bytes.length,
        createdBy: p.userId,
      },
      select: metadata,
    });
    await tx.auditLog.create({
      data: {
        organizationId: p.organizationId,
        businessUnitId: record.businessUnitId,
        siteId: record.siteId,
        actorId: p.userId,
        entity: key,
        entityId: id,
        action: 'SAVE_PDF',
        requestId,
        newValue: { pdfId: saved.id, filename },
      },
    });
    return saved;
  });
}
export async function downloadPdf(id: string, p: Principal) {
  z.uuid().parse(id);
  const saved = await db.savedPdf.findFirst({
    where: { id, organizationId: p.organizationId },
    select: { ...metadata, sourceKey: true, sourceId: true },
  });
  assert(saved, 404, 'PDF not found');
  await source(saved.sourceKey, saved.sourceId, p);
  const file = await db.savedPdf.findUniqueOrThrow({ where: { id }, select: { content: true } });
  return { filename: saved.filename, content: Buffer.from(file.content) };
}
