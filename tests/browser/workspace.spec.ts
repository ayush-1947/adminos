import { test, expect } from '@playwright/test';

test('dark mode follows system preference and remembers an explicit choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Dark mode', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByText('20', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: '.local/dashboard-dark.png', fullPage: true });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await page.goto('/clients');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Add record' }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(24, 39, 31)');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto('/reports');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: '.local/reports-dark-mobile.png', fullPage: true });
  await page.goto('/login');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('report exports preserve the selected status and complete IST date range', async ({
  page,
}) => {
  await page.goto('/reports');
  await page.getByLabel('Report dataset').selectOption('invoices');
  await page.getByRole('button', { name: 'This month', exact: true }).click();
  await expect(page.getByLabel('From date')).not.toHaveValue('');
  await expect(page.getByLabel('To date')).not.toHaveValue('');
  await page.getByLabel('Record status').selectOption('ISSUED');
  const from = await page.getByLabel('From date').inputValue();
  const to = await page.getByLabel('To date').inputValue();
  const requestPromise = page.waitForRequest((request) =>
    request.url().includes('/api/reports/invoices/csv'),
  );
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const request = await requestPromise;
  const query = new URL(request.url()).searchParams;
  expect(query.get('status')).toBe('ISSUED');
  expect(query.get('from')).toBe(new Date(`${from}T00:00:00+05:30`).toISOString());
  expect(query.get('to')).toBe(new Date(`${to}T23:59:59.999+05:30`).toISOString());
  expect(await (await downloadPromise).failure()).toBeNull();
  await page.getByRole('button', { name: 'All dates', exact: true }).click();
  await expect(page.getByLabel('From date')).toHaveValue('');
  await expect(page.getByLabel('To date')).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test('sorting records returns to the first page and exposes the sort direction', async ({
  page,
}) => {
  await page.goto('/employees');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
  const heading = page
    .getByRole('columnheader')
    .filter({ has: page.getByRole('button', { name: 'Name', exact: true }) });
  await heading.getByRole('button').click();
  await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
  await expect(heading).toHaveAttribute('aria-sort', 'ascending');
  await heading.getByRole('button').click();
  await expect(heading).toHaveAttribute('aria-sort', 'descending');
});
test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://localhost:3000' },
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
});
test('dashboard uses seeded API data and is responsive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
  await expect(page.getByText('20', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('100', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: '.local/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Viagreen', exact: true }).click();
  await expect(page.getByText('16', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'All business units' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/dashboard-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Workforce', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('every permitted resource route resolves with a real data response', async ({ page }) => {
  const response = await page.request.get('/api/catalog');
  const catalog = await response.json();
  for (const [key, resource] of Object.entries(catalog) as [string, { label: string }][]) {
    await page.goto(`/${key}`);
    await expect(
      page.getByRole('heading', { name: resource.label, exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('We couldn’t load this view')).toHaveCount(0);
    const data = await page.request.get(`/api/resources/${key}?limit=1`);
    expect(data.status(), key).toBe(200);
  }
});
test('create, search and edit a client through the UI', async ({ page }) => {
  const name = `Browser test client ${Date.now()}`;
  const identity = await (await page.request.get('/api/auth/me')).json();
  try {
    await page.goto('/clients');
    await page.getByRole('button', { name: 'Add record' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: false }).first().fill(name);
    await dialog.getByLabel('Company', { exact: false }).fill('Synthetic test company');
    await dialog.getByRole('button', { name: 'Save record' }).click();
    await expect(dialog).toBeHidden();
    const search = page.getByRole('searchbox', { name: 'Search Clients' });
    await search.fill(name);
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Edit record' }).click();
    await dialog.getByLabel('Company', { exact: false }).fill('Updated synthetic test company');
    await dialog.getByRole('button', { name: 'Save record' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Updated synthetic test company', { exact: true })).toBeVisible();
    await search.fill(`${name} no match`);
    await page.getByLabel('Filter status').selectOption('ACTIVE');
    await expect(page.getByRole('heading', { name: 'No matching records' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByLabel('Filter status')).toHaveValue('');
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  } finally {
    // Clean up this test's tenant-scoped fixture even if a UI assertion fails.
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    try {
      const client = await db.client.findFirst({
        where: { name, organizationId: identity.organization.id },
      });
      if (client) {
        await db.$transaction(async (tx) => {
          await tx.auditLog.deleteMany({
            where: {
              organizationId: identity.organization.id,
              entity: 'clients',
              entityId: client.id,
            },
          });
          await tx.client.delete({ where: { id: client.id } });
        });
      }
    } finally {
      await db.$disconnect();
    }
  }
});
