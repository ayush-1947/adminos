import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config';
import { db, repository } from '../../lib/db';
import { assert } from '../../lib/errors';
import { requirePermission, type Principal } from '../auth/policy';
import { scopeFor } from '../resources/scope';
import { catalog } from '../resources/catalog';
const parents: Record<string, string> = {
  site: 'sites',
  employee: 'employees',
  client: 'clients',
  contract: 'contracts',
  vendor: 'vendors',
  machine: 'machines',
};
const metaSchema = z.strictObject({
  parentType: z.enum(['site', 'employee', 'client', 'contract', 'vendor', 'machine']),
  parentId: z.uuid(),
  businessUnitId: z.uuid(),
  documentType: z.string().min(1).max(100),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
function storage() {
  assert(
    config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY,
    503,
    'Configure private Supabase Storage to use documents',
  );
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }).storage.from(config.SUPABASE_STORAGE_BUCKET);
}
export async function upload(
  file: Express.Multer.File | undefined,
  body: unknown,
  p: Principal,
  requestId: string,
) {
  requirePermission(p, 'documents:write');
  const meta = metaSchema.parse(body);
  assert(file, 422, 'Select a file');
  const signatures: Record<string, (b: Buffer) => boolean> = {
    'application/pdf': (b) => b.subarray(0, 5).toString() === '%PDF-',
    'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) =>
      b[0] === 80 && b[1] === 75,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) =>
      b[0] === 80 && b[1] === 75,
  };
  assert(
    signatures[file.mimetype]?.(file.buffer),
    422,
    'Use PDF, PNG, JPEG, DOCX or XLSX files with valid content',
  );
  const key = parents[meta.parentType];
  const parent = await repository(catalog[key].model).findFirst({
    where: { AND: [scopeFor(key, p), { id: meta.parentId }] },
  });
  assert(
    parent && parent.businessUnitId === meta.businessUnitId,
    404,
    'Document owner not found in this business unit',
  );
  const objectKey = `${p.organizationId}/${randomUUID()}`;
  const bucket = storage();
  const { error } = await bucket.upload(objectKey, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  assert(!error, 502, 'Document storage upload failed');
  try {
    return await db.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          organizationId: p.organizationId,
          businessUnitId: meta.businessUnitId,
          [`${meta.parentType}Id`]: meta.parentId,
          ...(parent.siteId ? { siteId: parent.siteId } : {}),
          name: file.originalname.replace(/[^\w. ()-]/g, '_').slice(0, 200),
          objectKey,
          mimeType: file.mimetype,
          size: file.size,
          documentType: meta.documentType,
          expiresAt: meta.expiresAt ? new Date(meta.expiresAt) : null,
          createdBy: p.userId,
          updatedBy: p.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: p.organizationId,
          businessUnitId: meta.businessUnitId,
          siteId: document.siteId,
          actorId: p.userId,
          entity: 'documents',
          entityId: document.id,
          action: 'UPLOAD',
          requestId,
        },
      });
      return document;
    });
  } catch (error) {
    await bucket.remove([objectKey]);
    throw error;
  }
}
export async function download(id: string, p: Principal) {
  requirePermission(p, 'documents:read');
  z.uuid().parse(id);
  const document = await db.document.findFirst({
    where: { AND: [scopeFor('documents', p), { id }] },
  });
  assert(document, 404, 'Document not found');
  const { data, error } = await storage().createSignedUrl(document.objectKey, 60, {
    download: document.name,
  });
  assert(data && !error, 502, 'Unable to create a secure download');
  return { url: data.signedUrl };
}
