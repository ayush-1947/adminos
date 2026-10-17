import { test, expect } from '@playwright/test';

test('login form signs in and logout revokes the session', async ({ page }) => {
  let healthRequests = 0;
  await page.route('**/api/health', async (route) => {
    healthRequests++;
    if (healthRequests === 1)
      return route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: '<html>Starting service</html>',
      });
    await route.continue();
  });
  await page.goto('/login');
  await page.getByLabel('Work email').fill(process.env.SEED_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
  expect(healthRequests).toBe(2);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/login');
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});

test('workspace recovers from gateway and HTML startup responses without manual refresh', async ({
  page,
}) => {
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://localhost:3000' },
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  });
  expect(login.status()).toBe(200);
  let attempts = 0;
  await page.route('**/api/auth/me', async (route) => {
    attempts++;
    if (attempts < 3)
      return route.fulfill({
        status: attempts === 1 ? 502 : 200,
        contentType: 'text/html',
        body: '<html>Starting service</html>',
      });
    await route.continue();
  });
  await page.goto('/');
  await expect(
    page.getByText('Connecting to the server… This can take about a minute after inactivity.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible({
    timeout: 15000,
  });
  expect(attempts).toBe(3);
  await expect(page.getByRole('heading', { name: 'We couldn’t load this view' })).toHaveCount(0);
});

for (const role of ['MANAGER', 'SUPERVISOR', 'CUSTOMER', 'ACCOUNTANT'] as const) {
  test(`${role} signs in with server-enforced finance and admin boundaries`, async ({ page }) => {
    const login = await page.request.post('/api/auth/login', {
      headers: { Origin: 'http://localhost:3000' },
      data: {
        email: process.env[`SEED_${role}_EMAIL`],
        password: process.env[`SEED_${role}_PASSWORD`],
      },
    });
    expect(login.status()).toBe(200);
    await page.goto('/');
    const heading =
      role === 'CUSTOMER'
        ? 'Your sites & team'
        : role === 'SUPERVISOR'
          ? 'Mark attendance'
          : 'Operations overview';
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    expect((await page.request.get('/api/resources/invoices')).status()).toBe(
      role === 'ACCOUNTANT' ? 200 : 403,
    );
    const identity = await (await page.request.get('/api/auth/me')).json();
    if (role === 'CUSTOMER') expect(identity.principal.clientId).toBeTruthy();
    if (role === 'MANAGER' || role === 'SUPERVISOR')
      expect(identity.principal.employeeId).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('supervisor saves and reloads a daily attendance note', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://localhost:3000' },
    data: {
      email: process.env.SEED_SUPERVISOR_EMAIL,
      password: process.env.SEED_SUPERVISOR_PASSWORD,
    },
  });
  expect(login.status()).toBe(200);
  await page.goto('/attendance');
  await expect(page.getByRole('heading', { name: 'Mark attendance' })).toBeVisible();
  const person = page.locator('.attendance-person').first();
  const note = person.getByRole('textbox');
  await expect(note).toBeEnabled();
  await note.fill('Synthetic browser audit attendance note');
  await page.getByRole('button', { name: 'Save attendance', exact: true }).click();
  await expect(page.getByText('Attendance saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.attendance-person').first().getByRole('textbox')).toHaveValue(
    'Synthetic browser audit attendance note',
  );
});
