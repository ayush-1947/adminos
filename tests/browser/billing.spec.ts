import { test, expect } from '@playwright/test';

test('bills and challans can be saved, downloaded and reopened', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://localhost:3000' },
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const me = await (await page.request.get('/api/auth/me')).json();
  const site = (await (await page.request.get('/api/resources/sites?limit=1')).json()).rows[0];
  const records: { key: string; id: string }[] = [];
  try {
    for (const key of ['invoices', 'challans']) {
      const reference = `BROWSER-PDF-${key}-${Date.now()}`;
      const body = {
        name: reference,
        businessUnitId: site.businessUnitId,
        siteId: site.id,
        clientId: site.clientId,
        issuedAt: new Date().toISOString(),
        ...(key === 'invoices'
          ? {
              invoiceNumber: reference,
              dueAt: new Date(Date.now() + 86400000).toISOString(),
              amount: 1180,
            }
          : {
              challanNumber: reference,
              kind: 'WASTE_COLLECTION',
              material: 'Segregated recyclable waste',
              quantity: 125.5,
              unit: 'KG',
              destination: 'Authorized receiving facility',
              vehicleNumber: 'TEST-VEHICLE',
            }),
      };
      const created = await page.request.post(`/api/resources/${key}`, {
        headers: { Origin: 'http://localhost:3000' },
        data: body,
      });
      expect(created.status()).toBe(201);
      const record = await created.json();
      records.push({ key, id: record.id });
      await page.goto(`/${key}?record=${record.id}`);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Optional PDF details' }).click();
      await dialog
        .getByLabel('Issuer address', { exact: true })
        .fill('Example Operations Centre, Mumbai, Maharashtra');
      await dialog.getByLabel('Bank name', { exact: true }).fill('Example Bank');
      await dialog
        .getByLabel('Terms', { exact: true })
        .fill('Please quote the document number when making payment or acknowledging delivery.');
      if (key === 'invoices') {
        await dialog.getByLabel('GST rate (%)', { exact: true }).fill('18');
        await dialog.getByLabel('GST type', { exact: true }).selectOption('CGST_SGST');
      }
      await dialog.getByRole('button', { name: 'Save PDF', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('PDF saved');
      const initial = await (
        await page.request.get(`/api/billing/${key}/${record.id}/pdfs`)
      ).json();
      expect(initial).toHaveLength(1);
      const downloadPromise = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Save & download PDF', exact: true }).click();
      const downloaded = await downloadPromise;
      expect(await downloaded.failure()).toBeNull();
      await downloaded.saveAs(`.local/${key}-preview.pdf`);
      await page.reload();
      await expect(
        dialog.getByRole('button', { name: `Download ${initial[0].filename}`, exact: true }),
      ).toBeVisible();
      const againPromise = page.waitForEvent('download');
      await dialog
        .getByRole('button', { name: `Download ${initial[0].filename}`, exact: true })
        .click();
      expect(await (await againPromise).failure()).toBeNull();
      expect(
        await (await page.request.get(`/api/billing/${key}/${record.id}/pdfs`)).json(),
      ).toHaveLength(1);
    }
  } finally {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    try {
      for (const record of records) {
        await db.savedPdf.deleteMany({
          where: { organizationId: me.organization.id, sourceId: record.id },
        });
        await db.auditLog.deleteMany({
          where: { organizationId: me.organization.id, entityId: record.id },
        });
        if (record.key === 'invoices')
          await db.invoice.deleteMany({
            where: { organizationId: me.organization.id, id: record.id },
          });
        else
          await db.challan.deleteMany({
            where: { organizationId: me.organization.id, id: record.id },
          });
      }
    } finally {
      await db.$disconnect();
    }
  }
});
