import { test, expect } from '@playwright/test';

test('super admin expands managers to reveal customer contacts and site workers', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://localhost:3000' },
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  });
  expect(login.status()).toBe(200);
  await page.route('**/api/org-chart', route => route.fulfill({ json: {
    collapseManagers: true,
    people: [
      { id: 'ceo', name: 'Company CEO', position: 'CEO', managerId: null, supervisorId: null },
      { id: 'manager', name: 'Site Manager', position: 'MANAGER', managerId: 'ceo', supervisorId: null },
      { id: 'supervisor', name: 'Site Supervisor', position: 'SUPERVISOR', managerId: null, supervisorId: null },
      { id: 'worker', name: 'Site Worker', position: 'WORKER', managerId: null, supervisorId: null },
    ],
    sites: [{ id: 'site', name: 'Central Site', address: 'Central Road', managerId: 'manager', supervisorId: 'supervisor',
      client: { id: 'client', name: 'Customer Company', contactPerson: 'Customer Contact', phone: '12345', email: null, contacts: [] },
      assignments: [{ employeeId: 'worker', supervisorId: 'supervisor' }] }],
  } }));
  await page.goto('/employees');
  const chart = page.getByRole('region', { name: 'Organization chart' });
  await expect(chart.getByText('Company CEO', { exact: true })).toBeVisible();
  const manager = chart.getByRole('button', { name: /Site Manager/ });
  await expect(manager).toHaveAttribute('aria-expanded', 'false');
  await expect(chart.getByText('Site Worker', { exact: true })).toHaveCount(0);
  await manager.click();
  await expect(chart.getByText('Customer Contact', { exact: true })).toBeVisible();
  await expect(chart.getByText('Site Worker', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => chart.evaluate(el => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
  expect(await chart.locator('.org-chart-scroll').evaluate(el => getComputedStyle(el).overflowX)).toBe('auto');
  await page.screenshot({ path: '.local/org-chart-mobile.png', fullPage: true });
  await manager.click();
  await expect(chart.getByText('Site Worker', { exact: true })).toHaveCount(0);
});
