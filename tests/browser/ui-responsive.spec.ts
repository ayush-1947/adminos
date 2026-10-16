import { test, expect } from '@playwright/test';

test('responsive organization controls retain the hierarchy in both layouts', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === '/api/auth/me'
        ? {
            user: { id: 'u', name: 'Workspace Admin', email: 'admin@example.test' },
            organization: { id: 'o', name: 'Operations' },
            businessUnits: [],
            principal: {
              role: 'Customer',
              scope: 'ALL',
              permissions: ['employees:read'],
              employeeId: null,
            },
          }
        : path === '/api/org-chart'
          ? {
              collapseManagers: true,
              people: [
                {
                  id: 'manager',
                  name: 'Team Manager',
                  position: 'MANAGER',
                  managerId: null,
                  supervisorId: null,
                },
                {
                  id: 'worker',
                  name: 'Team Member',
                  position: 'WORKER',
                  managerId: 'manager',
                  supervisorId: null,
                },
              ],
              sites: [],
            }
          : path === '/api/catalog'
            ? {}
            : [];
    await route.fulfill({ json });
  });
  await page.goto('/');
  const chart = page.getByRole('region', { name: 'Organization chart' });
  const manager = chart.getByRole('button', { name: /Team Manager/ });
  await expect(manager).toHaveAttribute('aria-expanded', 'false');
  await chart.getByRole('button', { name: 'Expand all' }).click();
  await expect(chart.getByText('Team Member', { exact: true })).toBeVisible();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await chart.getByRole('button', { name: 'Outline', exact: true }).click();
    await expect(chart.getByText('Team Member', { exact: true })).toBeVisible();
    await expect(chart.getByRole('button', { name: 'Outline', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.screenshot({ path: `.local/ui-${width}.png`, fullPage: true });
    await chart.getByRole('button', { name: 'Chart', exact: true }).click();
  }
  await chart.getByRole('button', { name: 'Collapse all' }).click();
  await expect(chart.getByText('Team Member', { exact: true })).toHaveCount(0);
});
